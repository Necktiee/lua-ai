/**
 * Quiet hours — suppress proactive pushes in local [start, end) window.
 * Window may wrap midnight (e.g. 22:00–07:00).
 */
import { localHHMM } from "@/lib/tz";

export function isWithinQuietHours(args: {
  now: Date;
  timeZone: string;
  enabled: boolean;
  start: string | null | undefined;
  end: string | null | undefined;
}): boolean {
  if (!args.enabled) return false;
  const start = (args.start ?? "").slice(0, 5);
  const end = (args.end ?? "").slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return false;
  if (start === end) return false;

  const now = localHHMM(args.now, args.timeZone);
  if (start < end) {
    return now >= start && now < end;
  }
  // wraps midnight
  return now >= start || now < end;
}
