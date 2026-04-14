"use client";

import { useEffect } from "react";
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
        className={`fixed inset-y-0 left-0 z-50 flex w-[85%] max-w-[340px] flex-col bg-background shadow-2xl transition-transform duration-300 ease-out ${
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
            <div className="space-y-4">
              {MODEL_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-engenius-gray/80">
                    {group.label}
                  </div>
                  <div className="space-y-1.5">
                    {group.models.map((m) => (
                      <RadioCard
                        key={m.id}
                        selected={props.provider === m.id}
                        onClick={() => props.onProviderChange(m.id)}
                        title={m.label}
                        subtitle={m.tier}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
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
        <div className="flex items-center justify-between border-t border-border/40 px-5 py-4 text-[11px] text-engenius-gray/70">
          <span>EnGenie · Demo</span>
          <span>Powered by EnGenius SpecHub</span>
        </div>
      </aside>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-2">
      <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-engenius-dark/60">
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
      className={`flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all ${
        selected
          ? "border-engenius-blue bg-engenius-blue/[0.06]"
          : "border-border/60 bg-white hover:border-engenius-blue/30 hover:bg-black/[0.015]"
      }`}
    >
      {icon && <span className="text-[18px] leading-none">{icon}</span>}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[14px] font-medium ${selected ? "text-engenius-dark" : "text-engenius-dark/90"}`}>
            {title}
          </span>
          {selected && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#03a9f4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
        {subtitle && (
          <div className="mt-0.5 text-[12px] leading-snug text-engenius-gray">
            {subtitle}
          </div>
        )}
      </div>
    </button>
  );
}
