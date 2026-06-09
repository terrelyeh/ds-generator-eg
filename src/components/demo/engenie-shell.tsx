"use client";

import { useEffect, useState } from "react";
import { EngenieChat } from "./engenie-chat";
import { EngenieDrawer, modelLabelOf, type PersonaOption, type ProfileOption } from "./engenie-drawer";
import type { DemoConversation } from "@/lib/demo/history";
import type { ChatMessage } from "@/hooks/use-chat-stream";

export function EngenieShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [provider, setProvider] = useState("gemini-3.5-flash");
  const [persona, setPersona] = useState("default");
  const [profile, setProfile] = useState("default");
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [welcomeSubtitle, setWelcomeSubtitle] = useState<string | null>(null);
  const [welcomeDescription, setWelcomeDescription] = useState<string | null>(null);
  const [exampleQuestions, setExampleQuestions] = useState<string[] | undefined>(undefined);
  // Incrementing this remounts EngenieChat to reset messages + input state
  const [chatKey, setChatKey] = useState(0);
  // Resume support: when loading a saved conversation we seed the chat + remount
  const [initialMessages, setInitialMessages] = useState<ChatMessage[] | undefined>(undefined);
  const [initialConvId, setInitialConvId] = useState<string | null>(null);

  function newChat() {
    setInitialMessages(undefined);
    setInitialConvId(null);
    setChatKey((k) => k + 1);
  }

  function loadConversation(c: DemoConversation) {
    setProvider(c.provider);
    setPersona(c.persona);
    setProfile(c.profile);
    setInitialMessages(c.messages);
    setInitialConvId(c.id);
    setChatKey((k) => k + 1);
    setDrawerOpen(false);
  }

  useEffect(() => {
    fetch("/api/ask")
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) return;
        setPersonas(d.personas ?? []);
        setProfiles(d.profiles ?? []);
        if (d.welcome?.subtitle) setWelcomeSubtitle(d.welcome.subtitle);
        if (d.welcome?.description) setWelcomeDescription(d.welcome.description);
        if (Array.isArray(d.welcome?.example_questions)) {
          setExampleQuestions(d.welcome.example_questions);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex h-[100dvh] flex-col bg-[#faf9f5]">
      {/* Header — locked at top with warm paper backdrop blur */}
      <header
        className="relative z-20 flex flex-shrink-0 items-center justify-center bg-[#faf9f5]/85 px-4 pb-3 backdrop-blur-md"
        style={{ paddingTop: "max(env(safe-area-inset-top), 14px)" }}
      >
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-full text-engenius-dark/80 transition-colors hover:bg-black/[0.04] active:bg-black/[0.08]"
          style={{ top: "max(env(safe-area-inset-top), 10px)" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="font-heading text-[17px] font-bold tracking-tight text-engenius-dark">
          EnGenie
        </h1>
        <button
          onClick={newChat}
          aria-label="New chat"
          className="absolute right-3 flex h-10 w-10 items-center justify-center rounded-full text-engenius-dark/80 transition-colors hover:bg-black/[0.04] active:bg-black/[0.08]"
          style={{ top: "max(env(safe-area-inset-top), 10px)" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <line x1="12" y1="8" x2="12" y2="14" />
            <line x1="9" y1="11" x2="15" y2="11" />
          </svg>
        </button>
      </header>

      {/* Chat area */}
      <div className="min-h-0 flex-1">
        <EngenieChat
          key={chatKey}
          provider={provider}
          persona={persona}
          profile={profile}
          welcomeSubtitle={welcomeSubtitle}
          welcomeDescription={welcomeDescription}
          exampleQuestions={exampleQuestions}
          modelLabel={modelLabelOf(provider)}
          personaLabel={personas.find((p) => p.id === persona)?.name}
          profileLabel={profiles.find((p) => p.id === profile)?.label}
          onOpenSettings={() => setDrawerOpen(true)}
          initialMessages={initialMessages}
          initialConvId={initialConvId}
        />
      </div>

      <EngenieDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        provider={provider}
        onProviderChange={setProvider}
        persona={persona}
        onPersonaChange={setPersona}
        personas={personas}
        profile={profile}
        onProfileChange={setProfile}
        profiles={profiles}
        onLoadConversation={loadConversation}
        currentConvId={initialConvId}
      />
    </div>
  );
}
