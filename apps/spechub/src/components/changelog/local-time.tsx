"use client";

import { useSyncExternalStore } from "react";

interface LocalTimeProps {
  iso: string;
  format: "date" | "time" | "datetime";
  className?: string;
}

const OPTIONS: Record<LocalTimeProps["format"], Intl.DateTimeFormatOptions> = {
  date: { month: "long", day: "numeric", year: "numeric" },
  time: { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false },
  datetime: {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  },
};

/** Whether we are running in the browser cannot change, so nothing subscribes. */
const subscribe = () => () => {};

/**
 * A timestamp in the reader's own timezone.
 *
 * The server does not know that timezone, so it must render nothing and let
 * the browser fill it in — otherwise every date hydration-mismatches.
 * `useSyncExternalStore` is the supported way to give the server and the
 * client different snapshots; the older shape (empty state, `setState` in an
 * effect) says the same thing but costs a second render pass and reads to
 * both React and the linter as an accident.
 */
export function LocalTime({ iso, format, className }: LocalTimeProps) {
  const onClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  return (
    <span className={className}>
      {onClient ? new Date(iso).toLocaleString(undefined, OPTIONS[format]) : ""}
    </span>
  );
}
