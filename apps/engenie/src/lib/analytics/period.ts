import type { PeriodDays, PeriodRange } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Asia/Taipei is UTC+8 all year — no DST to account for. */
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function taipeiDayKey(d: Date): string {
  return new Date(d.getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}

export function parsePeriod(v: unknown): PeriodDays {
  const n = Number(v);
  return n === 7 || n === 90 ? n : 30;
}

/**
 * "近 7 天" is today plus the six Taiwan days before it — whole days, so a
 * chart's bars line up with dates. The previous window is the same number of
 * days just before; it is complete while today isn't yet, so a delta early
 * in the day leans low.
 */
export function periodRange(days: PeriodDays, now: Date = new Date()): PeriodRange {
  const startOfToday = Date.parse(`${taipeiDayKey(now)}T00:00:00+08:00`);
  const from = startOfToday - (days - 1) * DAY_MS;
  return {
    days,
    from: new Date(from).toISOString(),
    to: now.toISOString(),
    prevFrom: new Date(from - days * DAY_MS).toISOString(),
    prevTo: new Date(from).toISOString(),
    dayKeys: Array.from({ length: days }, (_, i) => taipeiDayKey(new Date(from + i * DAY_MS))),
  };
}
