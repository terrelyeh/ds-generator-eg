"use client";

import { useEffect, useCallback } from "react";
import { AskChat } from "./ask-chat";

interface AskPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AskPanel({ isOpen, onClose }: AskPanelProps) {
  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Prevent body scroll when panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop — covers everything including navbar */}
      <div
        className={`fixed inset-0 z-50 bg-black/30 transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — overlays navbar */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 flex flex-col bg-background border-l shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: "min(600px, max(42vw, 520px))" }}
      >
        {/* Panel header — brand title bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-engenius-blue" viewBox="0 0 56 56" fill="none">
              <path d="M28 8 L31 22 L45 25 L31 28 L28 42 L25 28 L11 25 L25 22 Z" fill="currentColor" opacity="0.85" />
              <circle cx="28" cy="25" r="3" fill="white" opacity="0.9" />
            </svg>
            <h2 className="text-sm font-bold tracking-tight">Ask SpecHub</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Close"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Chat content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <AskChat compact />
        </div>
      </div>
    </>
  );
}
