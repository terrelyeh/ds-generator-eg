"use client";

import { useEffect, useRef } from "react";
import { leavesPage, UNSAVED_MESSAGE } from "./unsaved-changes";

/**
 * Ask before leaving a page that holds unsaved work.
 *
 *   useUnsavedChanges(dirty);
 *
 * Every editor that keeps edits until a Save (or a Submit) calls this with
 * whether it currently holds something the server does not. While any of
 * them is dirty, closing or reloading the tab gets the browser's own "leave
 * site?" dialog, and clicking a link that would leave the page asks first —
 * cancel and nothing happens. What it cannot catch, and why, is in
 * `unsaved-changes.ts`.
 *
 * One page can hold many editors at once (every Battlecard cell is one), so
 * they share a single pair of listeners and a single question: two dirty
 * editors must not ask twice for the same click.
 */
const dirtyEditors = new Set<symbol>();
let listening = false;
/**
 * Set for a moment after someone answers "leave": a full-page navigation will
 * fire beforeunload next, and asking a second time is just noise. Not a reset
 * of the editors — on a client-side move to the same page (only the query
 * changed) they stay mounted and still unsaved, and must keep asking.
 */
let leaveApproved = false;

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (leaveApproved) return;
  e.preventDefault();
  // Chrome still wants returnValue set; the text itself is ignored by every
  // current browser, which shows its own wording.
  e.returnValue = "";
}

function onClickCapture(e: MouseEvent) {
  const anchor = (e.target as Element | null)?.closest?.("a");
  if (!anchor) return;
  const leaving = leavesPage(
    {
      href: anchor.getAttribute("href") === null ? null : anchor.href,
      target: anchor.getAttribute("target"),
      download: anchor.hasAttribute("download"),
      button: e.button,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      defaultPrevented: e.defaultPrevented,
    },
    window.location.href,
  );
  if (!leaving) return;
  if (window.confirm(UNSAVED_MESSAGE)) {
    leaveApproved = true;
    setTimeout(() => {
      leaveApproved = false;
    }, 1500);
    return;
  }
  // Capture phase on WINDOW is the first stop on the event's path — ahead of
  // React, whose listeners sit on the root container (the document itself in
  // the App Router). Stopping here means next/link's onClick never runs.
  e.preventDefault();
  e.stopPropagation();
}

function startListening() {
  if (listening) return;
  window.addEventListener("beforeunload", onBeforeUnload);
  window.addEventListener("click", onClickCapture, true);
  listening = true;
}

function stopListening() {
  if (!listening) return;
  window.removeEventListener("beforeunload", onBeforeUnload);
  window.removeEventListener("click", onClickCapture, true);
  listening = false;
}

export function useUnsavedChanges(dirty: boolean): void {
  const id = useRef<symbol | null>(null);
  if (id.current === null) id.current = Symbol("editor");

  useEffect(() => {
    const me = id.current!;
    if (!dirty) return;
    dirtyEditors.add(me);
    startListening();
    return () => {
      dirtyEditors.delete(me);
      if (dirtyEditors.size === 0) stopListening();
    };
  }, [dirty]);
}
