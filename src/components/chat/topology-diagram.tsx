"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Renders a network/application topology from a ```topology JSON block the LLM
 * emits, using EnGenius product icons (topology_icons, side-iso "b" view).
 * Tiered by role so connectors run parallel. Supports zones (dashed group
 * boxes) and per-link colour by speed/interface (1G/2.5G/10G/SFP/WiFi) with a
 * legend. Non-product nodes fall back to built-in line shapes.
 */

interface TopoNode { id: string; model?: string; role?: string; label?: string }
interface TopoLink { from: string; to: string; speed?: string; type?: string }
interface TopoZone { label?: string; nodes: string[] }
interface TopoSpec { title?: string; nodes: TopoNode[]; links?: TopoLink[]; zones?: TopoZone[] }
interface CatalogIcon { key: string; url: string; role: string | null; label: string | null }

const ROLE_TIER: Record<string, number> = {
  internet: 0, isp: 0, cloud: 0, wan: 0,
  modem: 1, router: 1, gateway: 1, firewall: 1,
  switch: 2, extender: 2, bridge: 2, nvs: 2, pdu: 2,
  ap: 3, camera: 3, server: 3,
  client: 4, phone: 4, generic: 4, device: 4,
};
const tierOf = (role?: string) => ROLE_TIER[(role ?? "device").toLowerCase()] ?? 4;

/* link colour by speed / interface */
const LINK_STYLES: { test: RegExp; color: string; dash?: string; label: string }[] = [
  { test: /wifi|wireless|無線/i, color: "#94a3b8", dash: "5 4", label: "WiFi" },
  { test: /sfp|fib(er|re)|光纖/i, color: "#059669", label: "SFP / Fiber" },
  { test: /10\s*g/i, color: "#7c3aed", label: "10G" },
  { test: /2\.5\s*g/i, color: "#0288d1", label: "2.5G" },
  { test: /(^|[^0-9.])5\s*g(?!hz)/i, color: "#db2777", label: "5G" },
  { test: /(1\s*g|gigabit|1gbe)/i, color: "#64748b", label: "1G" },
];
function linkStyle(l: TopoLink): { color: string; dash?: string; label: string } {
  const s = `${l.speed ?? ""} ${l.type ?? ""}`;
  for (const st of LINK_STYLES) if (st.test.test(s)) return st;
  return { color: "#cbd1da", label: "" };
}

/* catalog fetch (cached) */
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

/* geometry (compact) */
const NODE_W = 150;
const ICON_W = 88;
const ICON_H = 56;
const TIER_H = 150;
const PAD = 24;
const ZONE_PAD = 14;
const LABEL_TOP = 14;   // first label line below icon
const LINE_H = 13;

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
  if (rest.length && lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/.$/, "…");
  return lines;
}
function nodeLabelLines(n: TopoNode): { t: string; b: boolean }[] {
  const label = n.label || n.model || n.role || n.id;
  if (n.model) {
    const desc = label === n.model
      ? ""
      : label.toUpperCase().startsWith(n.model.toUpperCase()) ? label.slice(n.model.length).trim() : label;
    return [{ t: n.model, b: true }, ...wrapText(desc, 14, 2).map((t) => ({ t, b: false }))];
  }
  return wrapText(label, 14, 2).map((t, i) => ({ t, b: i === 0 }));
}

/** Build a CJK-safe indented tree from the same spec (for the text view). */
function buildTextTree(sp: TopoSpec): string {
  const byId = new Map(sp.nodes.map((n) => [n.id, n]));
  const kids = new Map<string, { id: string; speed?: string }[]>();
  const hasParent = new Set<string>();
  for (const l of sp.links ?? []) {
    if (!byId.has(l.from) || !byId.has(l.to)) continue;
    (kids.get(l.from) ?? kids.set(l.from, []).get(l.from)!).push({ id: l.to, speed: l.speed });
    hasParent.add(l.to);
  }
  const labelOf = (n: TopoNode) => `${n.model ? n.model + " " : ""}${n.label || n.role || n.id}`;
  const visited = new Set<string>();
  const lines: string[] = [];
  const walk = (id: string, prefix: string, isLast: boolean, isRoot: boolean, speed?: string) => {
    const n = byId.get(id);
    if (!n) return;
    lines.push(prefix + (isRoot ? "" : isLast ? "└─ " : "├─ ") + (speed ? `[${speed}] ` : "") + labelOf(n));
    if (visited.has(id)) return;
    visited.add(id);
    const cs = kids.get(id) ?? [];
    const cp = isRoot ? "" : prefix + (isLast ? "   " : "│  ");
    cs.forEach((c, i) => walk(c.id, cp, i === cs.length - 1, false, c.speed));
  };
  const roots = sp.nodes.filter((n) => !hasParent.has(n.id));
  (roots.length ? roots : sp.nodes.slice(0, 1)).forEach((r, i, a) => walk(r.id, "", i === a.length - 1, true));
  const orphans = sp.nodes.filter((n) => !visited.has(n.id));
  orphans.forEach((n, i, a) => walk(n.id, "", i === a.length - 1, true));
  return lines.join("\n");
}

export function TopologyDiagram({ source }: { source: string }) {
  const [catalog, setCatalog] = useState<CatalogIcon[] | null>(null);
  const [view, setView] = useState<"diagram" | "text">("diagram");
  const [copied, setCopied] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => { loadCatalog().then(setCatalog); }, []);

  const spec = useMemo<TopoSpec | null>(() => {
    try {
      let t = (source ?? "").trim();
      // tolerate stray prose / code fences around the JSON, and trailing commas
      const first = t.indexOf("{");
      const last = t.lastIndexOf("}");
      if (first >= 0 && last > first) t = t.slice(first, last + 1);
      t = t.replace(/,\s*([}\]])/g, "$1");
      const s = JSON.parse(t);
      return s && Array.isArray(s.nodes) ? (s as TopoSpec) : null;
    } catch { return null; }
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
  const sp = spec;
  const textTree = buildTextTree(sp);

  async function copyText() {
    try { await navigator.clipboard.writeText(textTree); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* ignore */ }
  }

  function urlFor(n: TopoNode): string | null {
    if (n.model) {
      const hit = maps.byKey.get(n.model.toUpperCase());
      if (hit) return hit.url;
    }
    if (n.role && maps.byRole.has(n.role)) return maps.byRole.get(n.role)!;
    return null;
  }

  // tiered layout
  const tiers = new Map<number, TopoNode[]>();
  for (const n of sp.nodes) {
    const t = tierOf(n.role);
    (tiers.get(t) ?? tiers.set(t, []).get(t)!).push(n);
  }
  const tierKeys = [...tiers.keys()].sort((a, b) => a - b);

  // Zone-aware ordering: cluster same-zone nodes within each tier (and add a
  // gap between zone groups) so zone boxes form separate columns and don't
  // overlap each other / their connectors.
  const ZONE_GAP = 30;
  const zoneOrder = new Map<string, number>();
  (sp.zones ?? []).forEach((z, zi) => (z.nodes ?? []).forEach((id) => {
    if (!zoneOrder.has(id)) zoneOrder.set(id, zi);
  }));
  for (const row of tiers.values()) {
    row.sort((a, b) => (zoneOrder.get(a.id) ?? 999) - (zoneOrder.get(b.id) ?? 999));
  }
  const rowWidth = (row: TopoNode[]) => {
    let w = 0; let prev: number | undefined;
    row.forEach((n, i) => {
      const z = zoneOrder.get(n.id);
      if (i > 0 && z !== prev) w += ZONE_GAP;
      w += NODE_W;
      prev = z;
    });
    return w;
  };
  const tierWidths = new Map(tierKeys.map((t) => [t, rowWidth(tiers.get(t)!)]));
  const contentW = Math.max(NODE_W, ...tierWidths.values());
  const width = PAD * 2 + contentW;

  const pos = new Map<string, { x: number; y: number }>();
  tierKeys.forEach((t, ti) => {
    const row = tiers.get(t)!;
    const y = PAD + ti * TIER_H + ICON_H / 2 + 4;
    let x = PAD + (contentW - tierWidths.get(t)!) / 2;
    let prev: number | undefined;
    row.forEach((n, i) => {
      const z = zoneOrder.get(n.id);
      if (i > 0 && z !== prev) x += ZONE_GAP;
      pos.set(n.id, { x: x + NODE_W / 2, y });
      x += NODE_W;
      prev = z;
    });
  });

  // legend entries actually used
  const usedLegend = new Map<string, { color: string; dash?: string }>();
  for (const l of sp.links ?? []) {
    const st = linkStyle(l);
    if (st.label) usedLegend.set(st.label, { color: st.color, dash: st.dash });
  }
  const legendH = usedLegend.size ? 26 : 0;
  const height = PAD * 2 + tierKeys.length * TIER_H + legendH;

  // zone boxes (computed from member positions)
  const zoneRects = (sp.zones ?? []).map((z) => {
    const pts = (z.nodes ?? []).map((id) => pos.get(id)).filter(Boolean) as { x: number; y: number }[];
    if (!pts.length) return null;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return {
      label: z.label,
      x: Math.min(...xs) - ICON_W / 2 - ZONE_PAD,
      y: Math.min(...ys) - ICON_H / 2 - 10,
      w: Math.max(...xs) - Math.min(...xs) + ICON_W + ZONE_PAD * 2,
      h: Math.max(...ys) - Math.min(...ys) + ICON_H + 3 * LINE_H + ZONE_PAD + 10,
    };
  }).filter(Boolean) as { label?: string; x: number; y: number; w: number; h: number }[];

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
      <div className="flex items-center justify-between gap-2 border-b border-black/[0.06] bg-black/[0.015] px-3 py-1.5">
        <span className="min-w-0 truncate text-[12px] font-semibold text-engenius-dark/70">{sp.title || "Network Topology"}</span>
        <div className="flex flex-shrink-0 items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-black/10 text-[11px]">
            <button onClick={() => setView("diagram")}
              className={`px-2 py-0.5 transition-colors ${view === "diagram" ? "bg-engenius-blue text-white" : "text-muted-foreground hover:bg-muted"}`}>圖</button>
            <button onClick={() => setView("text")}
              className={`px-2 py-0.5 transition-colors ${view === "text" ? "bg-engenius-blue text-white" : "text-muted-foreground hover:bg-muted"}`}>文字</button>
          </div>
          {view === "diagram" ? (
            <button onClick={download}
              className="inline-flex items-center gap-1 text-[11px] text-engenius-blue hover:text-engenius-blue-dark transition-colors" title="Download SVG">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              SVG
            </button>
          ) : (
            <button onClick={copyText}
              className="inline-flex items-center gap-1 text-[11px] text-engenius-blue hover:text-engenius-blue-dark transition-colors" title="Copy">
              {copied ? "已複製" : "複製"}
            </button>
          )}
        </div>
      </div>
      {view === "text" ? (
        <pre className="m-2 overflow-x-auto rounded-lg bg-[#0d1117] p-3 text-[12px] leading-[1.6] text-slate-100">{textTree}</pre>
      ) : (
      <div className="overflow-x-auto p-2">
        <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} width={width} height={height}
          style={{ maxWidth: "100%", height: "auto" }} xmlns="http://www.w3.org/2000/svg"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">

          {/* zones (background) */}
          {zoneRects.map((z, i) => (
            <g key={`z${i}`}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={12}
                fill="#03a9f4" fillOpacity={0.03} stroke="#03a9f4" strokeOpacity={0.35}
                strokeWidth={1.2} strokeDasharray="6 4" />
              {z.label && (
                <>
                  <rect x={z.x + 6} y={z.y - 14} width={z.label.length * 8 + 10} height={15} rx={3}
                    fill="#ffffff" fillOpacity={0.95} stroke="#03a9f4" strokeOpacity={0.25} />
                  <text x={z.x + 11} y={z.y - 3} fontSize={10.5} fontWeight={700} fill="#0288d1">{z.label}</text>
                </>
              )}
            </g>
          ))}

          {/* connectors (orthogonal, coloured by speed) */}
          {(sp.links ?? []).map((l, i) => {
            const a = pos.get(l.from), b = pos.get(l.to);
            if (!a || !b) return null;
            const [up, dn] = a.y <= b.y ? [a, b] : [b, a];
            const sy = up.y + ICON_H / 2 + 3 * LINE_H + 6;
            const ey = dn.y - ICON_H / 2 - 2;
            // jog right below the parent so the horizontal trunk stays ABOVE the
            // zone boxes; only the vertical drops enter the zones.
            const jogY = sy + 12;
            const d = up.x === dn.x
              ? `M ${up.x} ${sy} L ${dn.x} ${ey}`
              : `M ${up.x} ${sy} L ${up.x} ${jogY} L ${dn.x} ${jogY} L ${dn.x} ${ey}`;
            const st = linkStyle(l);
            return <path key={`l${i}`} d={d} fill="none" stroke={st.color} strokeWidth={1.8}
              strokeDasharray={st.dash} strokeLinejoin="round" />;
          })}

          {/* nodes */}
          {sp.nodes.map((n) => {
            const p = pos.get(n.id);
            if (!p) return null;
            const url = urlFor(n);
            const lines = nodeLabelLines(n);
            const baseY = p.y + ICON_H / 2 + LABEL_TOP;
            return (
              <g key={n.id}>
                {url ? (
                  <image href={url} x={p.x - ICON_W / 2} y={p.y - ICON_H / 2} width={ICON_W} height={ICON_H} preserveAspectRatio="xMidYMid meet" />
                ) : (
                  <FallbackShape role={n.role} cx={p.x} cy={p.y} />
                )}
                {lines.map((ln, i) => (
                  <text key={i} x={p.x} y={baseY + i * LINE_H} textAnchor="middle"
                    fontSize={ln.b ? 11 : 9.5} fontWeight={ln.b ? 600 : 400} fill={ln.b ? "#2C3345" : "#8a93a3"}>{ln.t}</text>
                ))}
              </g>
            );
          })}

          {/* legend */}
          {usedLegend.size > 0 && (() => {
            const items = [...usedLegend.entries()];
            const gap = 96;
            const totalW = items.length * gap;
            let lx = (width - totalW) / 2 + 8;
            const ly = height - 12;
            return items.map(([label, st]) => {
              const x = lx; lx += gap;
              return (
                <g key={label}>
                  <line x1={x} y1={ly} x2={x + 22} y2={ly} stroke={st.color} strokeWidth={2.2} strokeDasharray={st.dash} />
                  <text x={x + 28} y={ly + 3.5} fontSize={10} fill="#6f6f6f">{label}</text>
                </g>
              );
            });
          })()}
        </svg>
      </div>
      )}
    </div>
  );
}

/* Built-in line shapes for nodes with no product icon yet. */
function FallbackShape({ role, cx, cy }: { role?: string; cx: number; cy: number }) {
  const r = (role ?? "device").toLowerCase();
  const stroke = "#6f6f6f";
  const common = { fill: "none", stroke, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (["internet", "isp", "cloud", "wan"].includes(r)) {
    return <path transform={`translate(${cx - 24},${cy - 14})`} {...common} d="M13 28 a9 9 0 01.5 -18 a12 12 0 0122 4 a7 7 0 01-2 14 z" />;
  }
  if (["client", "phone", "generic", "device"].includes(r)) {
    return (
      <g transform={`translate(${cx - 20},${cy - 14})`} {...common}>
        <rect x="0" y="0" width="40" height="26" rx="2" />
        <line x1="13" y1="31" x2="27" y2="31" /><line x1="20" y1="26" x2="20" y2="31" />
      </g>
    );
  }
  if (["server", "modem", "router"].includes(r)) {
    return (
      <g transform={`translate(${cx - 18},${cy - 16})`} {...common}>
        <rect x="0" y="0" width="36" height="12" rx="2" /><rect x="0" y="18" width="36" height="12" rx="2" />
        <circle cx="6" cy="6" r="1.4" fill={stroke} /><circle cx="6" cy="24" r="1.4" fill={stroke} />
      </g>
    );
  }
  return <g transform={`translate(${cx - 18},${cy - 14})`} {...common}><rect x="0" y="0" width="36" height="28" rx="4" /></g>;
}
