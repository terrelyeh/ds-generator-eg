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
      {/* Backdrop */}
      <div
        className={`fixed inset-0 top-14 z-40 bg-black/20 transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`fixed top-14 right-0 bottom-0 z-40 flex flex-col bg-background border-l shadow-xl transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: "min(460px, max(33.33vw, 400px))" }}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0">
          <h2 className="text-sm font-bold tracking-tight">Ask SpecHub</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Close panel"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Chat content */}
        <div className="flex-1 min-h-0">
          <AskChat compact />
        </div>
      </div>
    </>
  );
}
