import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Smart auto-scroll for chat surfaces — mirrors ChatGPT/Claude behaviour.
 *
 * The naive `scrollTo(scrollHeight)` on every message change yanks the user
 * back to the bottom even while they're scrolling up to re-read history. This
 * hook only sticks to the bottom when the user is already there; the moment
 * they scroll up it lets go, and a "scroll to bottom" affordance (driven by
 * `isAtBottom`) brings them back on demand.
 *
 * Usage:
 *   const { ref, isAtBottom, scrollToBottom } = useStickToBottom([messages]);
 *   <div ref={ref} className="overflow-y-auto">…</div>
 *   {!isAtBottom && <button onClick={() => scrollToBottom()}>↓</button>}
 */
export function useStickToBottom<T extends HTMLElement = HTMLDivElement>(
  deps: unknown[],
) {
  const ref = useRef<T>(null);
  const atBottomRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // px from the bottom that still counts as "pinned to bottom".
  const THRESHOLD = 80;

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < THRESHOLD;
    atBottomRef.current = atBottom;
    setIsAtBottom((prev) => (prev === atBottom ? prev : atBottom));
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    atBottomRef.current = true;
    setIsAtBottom(true);
  }, []);

  // Track the user's scroll position.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    return () => el.removeEventListener("scroll", measure);
  }, [measure]);

  // On new content: only follow the bottom if the user was already there.
  // Instant (not smooth) so rapid streaming updates don't fight the animation.
  useEffect(() => {
    if (!atBottomRef.current) return;
    const el = ref.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, isAtBottom, scrollToBottom };
}
