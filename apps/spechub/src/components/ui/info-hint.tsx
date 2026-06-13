"use client";

/** Shared explanations for the Persona / Profile concepts (used across the
 *  chat surfaces and the workspace admin so the wording stays consistent). */
export const PERSONA_HINT = "AI 用什麼角色與語氣回答（例如產品專家、業務助理、技術支援）——「答題的人是誰」。";
export const PROFILE_HINT = "AI 把你當成誰在對話，據此調整深淺與用語（例如同事、業務/通路、終端客戶）——「聽的人是誰」。";

/**
 * Small "(i)" info icon with a hover / tap tooltip. Tap works on touch because
 * the tooltip also shows on :focus-within (tapping focuses the button).
 * Tooltip is dark-on-white so it reads in any surface; `align` flips it to the
 * right edge when the icon sits near the right of its container.
 */
export function InfoHint({ text, align = "left" }: { text: string; align?: "left" | "right" }) {
  return (
    <span className="group relative inline-flex align-middle leading-none">
      <button
        type="button"
        aria-label="說明"
        onClick={(e) => e.preventDefault()}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[9px] font-bold leading-none opacity-50 normal-case transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none"
      >
        i
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-[22px] z-[60] w-56 rounded-lg bg-engenius-dark px-3 py-2 text-[11px] font-medium normal-case leading-snug tracking-normal text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${align === "right" ? "right-0" : "left-0"}`}
      >
        {text}
      </span>
    </span>
  );
}
