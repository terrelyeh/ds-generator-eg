"use client";

import { useEffect, useState } from "react";

interface LocalTimeProps {
  iso: string;
  format: "date" | "time" | "datetime";
  className?: string;
}

export function LocalTime({ iso, format, className }: LocalTimeProps) {
  const [display, setDisplay] = useState("");

  useEffect(() => {
    const d = new Date(iso);
    if (format === "date") {
      setDisplay(
        d.toLocaleDateString(undefined, {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      );
    } else if (format === "time") {
      setDisplay(
        d.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      );
    } else {
      setDisplay(
        d.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      );
    }
  }, [iso, format]);

  return <span className={className}>{display}</span>;
}
