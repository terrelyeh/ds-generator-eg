"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Renders a network/application topology diagram from a ```topology JSON block
 * the LLM emits, using EnGenius product icons (topology_icons catalog, side-iso
 * "b" view). Layout is tiered by role (internet → gateway → switch → edge), so
 * connectors run mostly vertical/parallel. Non-product nodes (internet, client,
 * server…) fall back to built-in line shapes until real icons are uploaded.
 */

interface TopoNode { id: string; model?: string; role?: string; label?: string }
interface TopoLink { from: string; to: string; label?: string }
interface TopoSpec { title?: string; nodes: TopoNode[]; links?: TopoLink[] }

interface CatalogIcon { key: string; url: string; role: string | null; label: string | null }

// role → vertical tier (lower = higher up in the diagram)
const ROLE_TIER: Record<string, number> = {
  internet: 0, isp: 0, cloud: 0, wan: 0,
  modem: 1, router: 1,
  gateway: 1, firewall: 1,
  switch: 2, extender: 2, bridge: 2, nvs: 2, pdu: 2,
  ap: 3, camera: 3, server: 3,
  client: 4, phone: 4, generic: 4, device: 4,
};
const tierOf = (role?: string) => ROLE_TIER[(role ?? "device").toLowerCase()] ?? 4;

/* ── catalog fetch (cached across all diagrams on the page) ── */
let catalogPromise: Promise<CatalogIcon[]> | null = null;
function loadCatalog(): Promise<CatalogIcon[]> {
  if (!catalogPromise) {
    catalogPromise = fetch("/api/topology-icons")
      .then((r) => r.json())
      .then((d) => (d.ok ? (d.icons as CatalogIcon[]) : []))
      .catch(() => []);
  }
  return catalogPromise;
}

/* ── geometry ── */
const NODE_W = 156;
const ICON_W = 96;
const ICON_H = 64;
const TIER_H = 156;
const PAD = 28;

/** Wrap text to <= maxLines lines of ~maxChars each (CJK hard-cuts; ellipsis if longer). */
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const t = (text || "").trim();
  if (!t) return [];
  const lines: string[] = [];
  let rest = t;
  while (rest.length && lines.length < maxLines) {
    if (rest.length <= maxChars) { lines.push(rest); rest = ""; break; }
    let cut = rest.lastIndexOf(" ", maxChars);
    if (cut <= 0) cut = maxChars;
    lines.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length && lines.length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/.$/, "…");
  }
  return lines;
}

/** Label as a bold model line + greyer wrapped description line(s). */
function nodeLabelLines(n: TopoNode): { t: string; b: boolean }[] {
  const label = n.label || n.model || n.role || n.id;
  if (n.model) {
    const desc =
      label === n.model
        ? ""
        : label.toUpperCase().startsWith(n.model.toUpperCase())
          ? label.slice(n.model.length).trim()
          : label;
    return [{ t: n.model, b: true }, ...wrapText(desc, 13, 2).map((t) => ({ t, b: false }))];
  }
  return wrapText(label, 13, 2).map((t, i) => ({ t, b: i === 0 }));
}

export function TopologyDiagram({ source }: { source: string }) {
  const [catalog, setCatalog] = useState<CatalogIcon[] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => { loadCatalog().then(setCatalog); }, []);

  const spec = useMemo<TopoSpec | null>(() => {
    try {
      const s = JSON.parse(source);
      if (!s || !Array.isArray(s.nodes)) return null;
      return s as TopoSpec;
    } catch {
      return null;
    }
  }, [source]);

  const maps = useMemo(() => {
    const byKey = new Map<string, CatalogIcon>();
    const byRole = new Map<string, string>();
    for (const i of catalog ?? []) {
      byKey.set(i.key.toUpperCase(), i);
      if (i.role && !byRole.has(i.role)) byRole.set(i.role, i.url);
    }
    return { byKey, byRole };
  }, [catalog]);

  if (!spec) {
    return (
      <pre className="chat-pre my-4 overflow-x-auto rounded-lg border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-800">
        ⚠ topology 區塊解析失敗（JSON 格式錯誤）
      </pre>
    );
  }
  const sp = spec; // narrowed; closures (download) need a const, not flow-narrowing

  // Resolve icon url for a node (null → built-in fallback shape).
  function urlFor(n: TopoNode): string | null {
    if (n.model) {
      const hit = maps.byKey.get(n.model.toUpperCase());
      if (hit) return hit.url;
    }
    if (n.role && maps.byRole.has(n.role)) return maps.byRole.get(n.role)!;
    return null;
  }

  // Tiered layout.
  const tiers = new Map<number, TopoNode[]>();
  for (const n of sp.nodes) {
    const t = tierOf(n.role);
    if (!tiers.has(t)) tiers.set(t, []);
    tiers.get(t)!.push(n);
  }
  const tierKeys = [...tiers.keys()].sort((a, b) => a - b);
  const maxRow = Math.max(1, ...tierKeys.map((t) => tiers.get(t)!.length));
  const width = PAD * 2 + maxRow * NODE_W;
  const height = PAD * 2 + tierKeys.length * TIER_H;

  const pos = new Map<string, { x: number; y: number }>();
  tierKeys.forEach((t, ti) => {
    const row = tiers.get(t)!;
    const rowW = row.length * NODE_W;
    const startX = (width - rowW) / 2;
    const y = PAD + ti * TIER_H + TIER_H / 2 - 6;
    row.forEach((n, i) => pos.set(n.id, { x: startX + i * NODE_W + NODE_W / 2, y }));
  });

  function download() {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(sp.title || "topology").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="chat-topology my-4 overflow-hidden rounded-xl border border-black/10 bg-white">
      <div className="flex items-center justify-between border-b border-black/[0.06] bg-black/[0.015] px-3 py-1.5">
        <span className="text-[12px] font-semibold text-engenius-dark/70">
          {sp.title || "Network Topology"}
        </span>
        <button
          onClick={download}
          className="inline-flex items-center gap-1 text-[11px] text-engenius-blue hover:text-engenius-blue-dark transition-colors"
          title="Download SVG"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          SVG
        </button>
      </div>
      <div className="overflow-x-auto p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          style={{ maxWidth: "100%", height: "auto" }}
          xmlns="http://www.w3.org/2000/svg"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        >
          {/* connectors first (behind icons) — orthogonal elbows: drop below
              the parent's label, jog horizontally at the midpoint, drop to the
              child icon top. Sibling jogs share a midY → a clean bus. */}
          {(sp.links ?? []).map((l, i) => {
            const a = pos.get(l.from);
            const b = pos.get(l.to);
            if (!a || !b) return null;
            const [up, dn] = a.y <= b.y ? [a, b] : [b, a];
            const sy = up.y + ICON_H / 2 + 44; // below the upper node's label+role
            const ey = dn.y - ICON_H / 2 - 2;  // top of the lower icon
            const my = Math.round((sy + ey) / 2);
            const d = up.x === dn.x
              ? `M ${up.x} ${sy} L ${dn.x} ${ey}`
              : `M ${up.x} ${sy} L ${up.x} ${my} L ${dn.x} ${my} L ${dn.x} ${ey}`;
            return (
              <path key={`l${i}`} d={d} fill="none" stroke="#cbd1da"
                strokeWidth={1.5} strokeLinejoin="round" />
            );
          })}
          {/* nodes */}
          {sp.nodes.map((n) => {
            const p = pos.get(n.id);
            if (!p) return null;
            const url = urlFor(n);
            const lines = nodeLabelLines(n);
            const baseY = p.y + ICON_H / 2 + 16;
            return (
              <g key={n.id}>
                {url ? (
                  <image href={url} x={p.x - ICON_W / 2} y={p.y - ICON_H / 2}
                    width={ICON_W} height={ICON_H} preserveAspectRatio="xMidYMid meet" />
                ) : (
                  <FallbackShape role={n.role} cx={p.x} cy={p.y} />
                )}
                {lines.map((ln, i) => (
                  <text key={i} x={p.x} y={baseY + i * 13} textAnchor="middle"
                    fontSize={ln.b ? 11.5 : 10} fontWeight={ln.b ? 600 : 400}
                    fill={ln.b ? "#2C3345" : "#8a93a3"}>{ln.t}</text>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* Built-in line shapes for nodes with no product icon yet. */
function FallbackShape({ role, cx, cy }: { role?: string; cx: number; cy: number }) {
  const r = (role ?? "device").toLowerCase();
  const stroke = "#6f6f6f";
  const common = { fill: "none", stroke, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (["internet", "isp", "cloud", "wan"].includes(r)) {
    return (
      <path transform={`translate(${cx - 26},${cy - 16})`} {...common}
        d="M14 30 a10 10 0 01.5 -20 a13 13 0 0124 4 a8 8 0 01-2 16 z" />
    );
  }
  if (["client", "phone", "generic", "device"].includes(r)) {
    return (
      <g transform={`translate(${cx - 22},${cy - 16})`} {...common}>
        <rect x="0" y="0" width="44" height="28" rx="2" />
        <line x1="14" y1="34" x2="30" y2="34" />
        <line x1="22" y1="28" x2="22" y2="34" />
      </g>
    );
  }
  if (["server", "modem", "router"].includes(r)) {
    return (
      <g transform={`translate(${cx - 20},${cy - 18})`} {...common}>
        <rect x="0" y="0" width="40" height="14" rx="2" />
        <rect x="0" y="20" width="40" height="14" rx="2" />
        <circle cx="7" cy="7" r="1.5" fill={stroke} />
        <circle cx="7" cy="27" r="1.5" fill={stroke} />
      </g>
    );
  }
  // generic box with role initial
  return (
    <g transform={`translate(${cx - 20},${cy - 16})`} {...common}>
      <rect x="0" y="0" width="40" height="32" rx="4" />
    </g>
  );
}
