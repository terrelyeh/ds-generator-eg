"use client";

import { useEffect, useMemo, useState } from "react";
import { EngenieMark } from "./engenie-mark";
import { listConversations, deleteConversation, type DemoConversation } from "@/lib/demo/history";

interface Model {
  id: string;
  label: string;
  tier: string;
}

interface ModelGroup {
  label: string;
  models: Model[];
}

const MODEL_GROUPS: ModelGroup[] = [
  {
    label: "Gemini",
    models: [
      { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", tier: "Strongest" },
      { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", tier: "Fast" },
    ],
  },
  {
    label: "Claude",
    models: [
      { id: "claude-opus", label: "Claude Opus 4.8", tier: "Strongest" },
      { id: "claude-sonnet", label: "Claude Sonnet 4.6", tier: "Balanced" },
    ],
  },
  {
    label: "GPT",
    models: [
      { id: "gpt-5.5", label: "GPT-5.5", tier: "Strongest" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", tier: "Fast" },
    ],
  },
];

export function modelLabelOf(id: string): string {
  return MODEL_GROUPS.flatMap((g) => g.models).find((m) => m.id === id)?.label ?? id;
}

function fmtTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export interface PersonaOption {
  id: string;
  name: string;
  description: string;
  icon?: string;
}

export interface ProfileOption {
  id: string;
  label: string;
  description: string;
}

export interface EngenieDrawerProps {
  open: boolean;
  onClose: () => void;
  provider: string;
  onProviderChange: (id: string) => void;
  persona: string;
  onPersonaChange: (id: string) => void;
  personas: PersonaOption[];
  profile: string;
  onProfileChange: (id: string) => void;
  profiles: ProfileOption[];
  onLoadConversation: (c: DemoConversation) => void;
  currentConvId?: string | null;
  /** When false, the model/persona/profile selectors are locked (read-only). */
  allowSwitch?: boolean;
  /** Workspace slug — partitions history per workspace (undefined = demo). */
  workspace?: string;
  /** user_byok workspace: render a section for the user's own key. */
  userByok?: boolean;
  userKey?: string | null;
  byokFamily?: string;
  onSetUserKey?: (key: string) => void;
  onClearUserKey?: () => void;
}

export function EngenieDrawer(props: EngenieDrawerProps) {
  const { open, onClose } = props;
  const allowSwitch = props.allowSwitch !== false;
  const [modelExpanded, setModelExpanded] = useState(false);
  // Read history from localStorage on open / after a delete (no effect needed).
  const [tab, setTab] = useState<"settings" | "history">("settings");
  const [historyRefresh, setHistoryRefresh] = useState(0);
  // historyRefresh is a deliberate re-read trigger (after delete), not used in body.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const convs = useMemo(() => (open ? listConversations(props.workspace) : []), [open, historyRefresh, props.workspace]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const allModels = MODEL_GROUPS.flatMap((g) =>
    g.models.map((m) => ({ ...m, groupLabel: g.label })),
  );
  const currentModel = allModels.find((m) => m.id === props.provider);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[85%] max-w-[340px] flex-col bg-[#faf9f5] shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            <EngenieMark size={24} />
            <span className="font-heading text-[17px] font-bold tracking-tight text-engenius-dark">
              EnGenie
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-engenius-gray transition-colors hover:bg-black/[0.04] hover:text-engenius-dark"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {/* Tabs: 設定 / 歷史 */}
          <div className="mb-5 flex rounded-xl bg-black/[0.05] p-1 text-[13px] font-semibold">
            <button
              onClick={() => setTab("settings")}
              className={`flex-1 rounded-lg py-1.5 transition-colors ${tab === "settings" ? "bg-white text-engenius-dark shadow-sm" : "text-engenius-dark/50 hover:text-engenius-dark/70"}`}
            >
              設定
            </button>
            <button
              onClick={() => setTab("history")}
              className={`flex-1 rounded-lg py-1.5 transition-colors ${tab === "history" ? "bg-white text-engenius-dark shadow-sm" : "text-engenius-dark/50 hover:text-engenius-dark/70"}`}
            >
              歷史
            </button>
          </div>

          {tab === "settings" && props.userByok && (
            <UserKeySection
              byokFamily={props.byokFamily}
              hasKey={!!(props.userKey && props.userKey.trim())}
              onSave={(k) => props.onSetUserKey?.(k)}
              onClear={() => props.onClearUserKey?.()}
            />
          )}

          {tab === "settings" && allowSwitch && (
          <>
          <Section title="Model">
            <button
              onClick={() => setModelExpanded((v) => !v)}
              className="flex w-full items-center justify-between rounded-2xl border border-black/[0.08] bg-white px-3.5 py-3.5 text-left transition-all hover:border-engenius-blue/30"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold tracking-tight text-engenius-dark">
                  {currentModel?.label ?? "Select model"}
                </div>
                {currentModel && (
                  <div className="mt-0.5 text-[12.5px] font-medium text-engenius-dark/50">
                    {currentModel.groupLabel} · {currentModel.tier}
                  </div>
                )}
              </div>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`flex-shrink-0 text-engenius-gray transition-transform duration-200 ${
                  modelExpanded ? "rotate-180" : ""
                }`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {modelExpanded && (
              <div className="mt-2 space-y-4 rounded-2xl border border-black/[0.06] bg-white/60 p-3.5">
                {MODEL_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="mb-1.5 font-heading text-[10.5px] font-extrabold uppercase tracking-[0.18em] text-engenius-dark/55">
                      {group.label}
                    </div>
                    <div className="space-y-1">
                      {group.models.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => {
                            props.onProviderChange(m.id);
                            setModelExpanded(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors ${
                            props.provider === m.id
                              ? "bg-engenius-blue/10 text-engenius-dark"
                              : "hover:bg-black/[0.03]"
                          }`}
                        >
                          <div className="flex items-baseline gap-2">
                            <span className="text-[14px] font-semibold tracking-tight">{m.label}</span>
                            <span className="text-[11.5px] font-medium text-engenius-dark/45">{m.tier}</span>
                          </div>
                          {props.provider === m.id && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#03a9f4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <div className="my-6 h-px bg-border/60" />

          <Section title="Persona">
            <div className="space-y-1.5">
              {props.personas.map((p) => (
                <RadioCard
                  key={p.id}
                  selected={props.persona === p.id}
                  onClick={() => props.onPersonaChange(p.id)}
                  title={p.name}
                  subtitle={p.description}
                  icon={p.icon}
                />
              ))}
            </div>
          </Section>

          <div className="my-6 h-px bg-border/60" />

          <Section title="Profile">
            <div className="space-y-1.5">
              {props.profiles.map((p) => (
                <RadioCard
                  key={p.id}
                  selected={props.profile === p.id}
                  onClick={() => props.onProfileChange(p.id)}
                  title={p.label}
                  subtitle={p.description}
                />
              ))}
            </div>
          </Section>
          </>
          )}

          {tab === "settings" && !allowSwitch && (
            <LockedSettings
              modelLabel={currentModel?.label}
              personaLabel={props.personas.find((p) => p.id === props.persona)?.name}
              profileLabel={props.profiles.find((p) => p.id === props.profile)?.label}
            />
          )}

          {tab === "history" && (
          <Section title="History">
            {convs.length === 0 ? (
              <p className="text-[12.5px] font-medium text-engenius-dark/40">尚無對話紀錄</p>
            ) : (
              <div className="space-y-1.5">
                {convs.map((c) => (
                  <div
                    key={c.id}
                    className={`group flex items-center gap-2 rounded-2xl border px-3.5 py-3 transition-all ${
                      c.id === props.currentConvId
                        ? "border-engenius-blue/50 bg-engenius-blue/[0.06]"
                        : "border-black/[0.08] bg-white hover:border-engenius-blue/30"
                    }`}
                  >
                    <button onClick={() => props.onLoadConversation(c)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-[14px] font-medium text-engenius-dark">{c.title || "對話"}</div>
                      <div className="mt-0.5 text-[11.5px] font-medium text-engenius-dark/45">
                        {fmtTime(c.updatedAt)} · {c.messages.filter((m) => m.role === "user").length} 則
                      </div>
                    </button>
                    <button
                      onClick={() => { deleteConversation(c.id, props.workspace); setHistoryRefresh((r) => r + 1); }}
                      aria-label="刪除"
                      className="flex-shrink-0 text-engenius-dark/25 transition-colors hover:text-red-500"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a1 1 0 01-1 1H7a1 1 0 01-1-1L5 6" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-black/[0.06] px-5 py-4 font-heading text-[11.5px] font-semibold tracking-wide text-engenius-dark/45">
          <span>EnGenie · Demo</span>
          <span>Powered by SpecHub</span>
        </div>
      </aside>
    </>
  );
}

/** User-supplied LLM key entry for a user_byok workspace (kept in this browser). */
function UserKeySection({
  byokFamily,
  hasKey,
  onSave,
  onClear,
}: {
  byokFamily?: string;
  hasKey: boolean;
  onSave: (key: string) => void;
  onClear: () => void;
}) {
  const [val, setVal] = useState("");
  const [show, setShow] = useState(false);
  return (
    <Section title="你的 API key">
      <div className="rounded-2xl border border-black/[0.08] bg-white px-3.5 py-3.5">
        {hasKey && (
          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-emerald-600">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            已設定（存在此瀏覽器）
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type={show ? "text" : "password"}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder={hasKey ? "輸入新的 key 以更換" : `${byokFamily || ""} API key`}
            className="min-w-0 flex-1 rounded-lg border border-black/[0.1] bg-white px-3 py-2 font-mono text-[12px] text-engenius-dark outline-none focus:border-engenius-blue/50"
          />
          <button onClick={() => setShow((s) => !s)} className="flex-shrink-0 text-[11px] font-medium text-engenius-dark/45 hover:text-engenius-dark/70">
            {show ? "隱藏" : "顯示"}
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => { if (val.trim()) { onSave(val.trim()); setVal(""); } }}
            disabled={!val.trim()}
            className="flex-1 rounded-lg bg-engenius-dark px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-engenius-dark/90 disabled:opacity-40"
          >
            儲存
          </button>
          {hasKey && (
            <button onClick={onClear} className="rounded-lg border border-black/[0.1] px-3 py-2 text-[13px] font-medium text-engenius-dark/60 transition-colors hover:text-red-500">
              移除
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-engenius-dark/45">
          只存在你目前的瀏覽器，不會上傳保存；每次提問時會用來呼叫 {byokFamily || "LLM"}。
        </p>
      </div>
    </Section>
  );
}

/** Read-only summary shown when the workspace locks model/persona/profile. */
function LockedSettings({
  modelLabel,
  personaLabel,
  profileLabel,
}: {
  modelLabel?: string;
  personaLabel?: string;
  profileLabel?: string;
}) {
  const rows = [
    { label: "Model", value: modelLabel },
    { label: "Persona", value: personaLabel },
    { label: "Profile", value: profileLabel },
  ].filter((r) => r.value);
  return (
    <Section title="Settings">
      <div className="flex items-start gap-2 rounded-2xl border border-black/[0.08] bg-white px-3.5 py-3">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0 text-engenius-dark/40">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <p className="text-[12.5px] font-medium leading-snug text-engenius-dark/55">
          此工作區的模型／角色／對象已由管理員鎖定。
        </p>
      </div>
      {rows.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between rounded-xl bg-black/[0.03] px-3.5 py-2.5">
              <span className="font-heading text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-engenius-dark/50">{r.label}</span>
              <span className="text-[13.5px] font-semibold tracking-tight text-engenius-dark">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-2">
      <h3 className="mb-3 font-heading text-[11.5px] font-extrabold uppercase tracking-[0.16em] text-engenius-dark/75">
        {title}
      </h3>
      {children}
    </section>
  );
}

function RadioCard({
  selected,
  onClick,
  title,
  subtitle,
  icon,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  icon?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3.5 text-left transition-all ${
        selected
          ? "border-engenius-blue/50 bg-engenius-blue/[0.06]"
          : "border-black/[0.08] bg-white hover:border-engenius-blue/30"
      }`}
    >
      {icon && <span className="text-[19px] leading-none">{icon}</span>}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[15px] font-semibold tracking-tight text-engenius-dark">
            {title}
          </span>
          {selected && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#03a9f4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
        {subtitle && (
          <div className="mt-1 text-[12.5px] font-medium leading-snug text-engenius-dark/55">
            {subtitle}
          </div>
        )}
      </div>
    </button>
  );
}
