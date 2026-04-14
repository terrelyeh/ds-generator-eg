"use client";

import { useEffect, useState } from "react";
import { EngenieMark } from "./engenie-mark";

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
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "Strongest" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "Fast" },
    ],
  },
  {
    label: "Claude",
    models: [
      { id: "claude-opus", label: "Claude Opus 4.6", tier: "Strongest" },
      { id: "claude-sonnet", label: "Claude Sonnet 4.6", tier: "Balanced" },
    ],
  },
  {
    label: "GPT",
    models: [
      { id: "gpt-4o", label: "GPT-4o", tier: "Strongest" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini", tier: "Fast" },
    ],
  },
];

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
}

export function EngenieDrawer(props: EngenieDrawerProps) {
  const { open, onClose } = props;
  const [modelExpanded, setModelExpanded] = useState(false);

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
