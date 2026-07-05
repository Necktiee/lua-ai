/** Bangkok timezone helpers — single source for day boundaries in crons/briefing. */
export const BANGKOK = "Asia/Bangkok";

/** YYYY-MM-DD in Bangkok for a given instant. */
export function bangkokDateStr(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: BANGKOK });
}

/** Start/end of calendar day in Bangkok, returned as UTC ISO strings for DB queries. */
export function bangkokDayBounds(d: Date = new Date()): { start: string; end: string } {
  const dateStr = bangkokDateStr(d);
  const start = new Date(`${dateStr}T00:00:00+07:00`);
  const end = new Date(`${dateStr}T23:59:59.999+07:00`);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** YYYY-MM-DD in a given IANA timezone. */
export function localDateStr(d: Date, timeZone: string): string {
  return d.toLocaleDateString("en-CA", { timeZone });
}

/** HH:MM in a given IANA timezone. */
export function localHHMM(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

/** Current HH:MM in Bangkok. */
export function bangkokHHMM(d: Date = new Date()): string {
  return localHHMM(d, BANGKOK);
}

/** Start/end of calendar day in an IANA timezone, returned as UTC ISO strings for DB queries. */
export function localDayBounds(d: Date, timeZone: string): { start: string; end: string } {
  if (timeZone === BANGKOK) return bangkokDayBounds(d);
  const dateStr = localDateStr(d, timeZone);
  const start = zonedWallClockToUtc(dateStr, 0, 0, 0, 0, timeZone);
  const end = zonedWallClockToUtc(dateStr, 23, 59, 59, 999, timeZone);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Convert wall-clock time in `timeZone` to a UTC Date (2-pass offset correction). */
function zonedWallClockToUtc(
  ymd: string,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone: string,
): Date {
  const [y, m, day] = ymd.split("-").map(Number);
  let utcMs = Date.UTC(y, m - 1, day, hour, minute, second, ms);
  for (let i = 0; i < 2; i++) {
    const offsetMin = tzOffsetMinutes(new Date(utcMs), timeZone);
    utcMs = Date.UTC(y, m - 1, day, hour, minute, second, ms) - offsetMin * 60_000;
  }
  return new Date(utcMs);
}

function tzOffsetMinutes(at: Date, timeZone: string): number {
  const utcH = at.getUTCHours() * 60 + at.getUTCMinutes();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const min = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const localH = h * 60 + min;
  let diff = localH - utcH;
  if (diff > 12 * 60) diff -= 24 * 60;
  if (diff < -12 * 60) diff += 24 * 60;
  return diff;
}

/** Current hour (0-23) in Bangkok. */
export function bangkokHour(d: Date = new Date()): number {
  const hhmm = bangkokHHMM(d);
  return parseInt(hhmm.split(":")[0], 10);
}

/** MM-DD suffix for birthday matching in Bangkok. */
export function bangkokMonthDay(d: Date = new Date()): string {
  return localMonthDay(d, BANGKOK);
}

/** -MM-DD suffix for birthday matching in an IANA timezone. */
export function localMonthDay(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `-${m}-${day}`;
}

/** Tomorrow's calendar day bounds in an IANA timezone. */
export function localTomorrowBounds(timeZone: string): { start: string; end: string } {
  if (timeZone === BANGKOK) return bangkokTomorrowBounds();
  const ymd = localDateStr(new Date(), timeZone);
  const noon = zonedWallClockToUtc(ymd, 12, 0, 0, 0, timeZone);
  const next = new Date(noon.getTime() + 86_400_000);
  return localDayBounds(next, timeZone);
}

/** Calendar year bounds in an IANA timezone as UTC ISO strings. */
export function localYearBounds(year: number, timeZone: string): { start: string; end: string } {
  const start = zonedWallClockToUtc(`${year}-01-01`, 0, 0, 0, 0, timeZone);
  const end = zonedWallClockToUtc(`${year}-12-31`, 23, 59, 59, 999, timeZone);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Calendar month bounds (1-based month) in an IANA timezone as UTC ISO strings. */
export function localMonthBoundsFor(y: number, m: number, timeZone: string): { start: string; end: string } {
  const start = zonedWallClockToUtc(`${y}-${String(m).padStart(2, "0")}-01`, 0, 0, 0, 0, timeZone);
  const nm = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const nextMonth = zonedWallClockToUtc(`${nm.y}-${String(nm.m).padStart(2, "0")}-01`, 0, 0, 0, 0, timeZone);
  const end = new Date(nextMonth.getTime() - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** First/last calendar date (YYYY-MM-DD) of current month in Bangkok. */
export function bangkokMonthBounds(d: Date = new Date()): { start: string; end: string } {
  const ymd = bangkokDateStr(d);
  const [y, m] = ymd.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const nm = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const lastDay = new Date(`${nm.y}-${String(nm.m).padStart(2, "0")}-01T12:00:00+07:00`);
  lastDay.setDate(lastDay.getDate() - 1);
  return { start, end: bangkokDateStr(lastDay) };
}

/** Start of week (Sunday 00:00 Bangkok) as UTC ISO for DB queries. */
export function bangkokWeekStartISO(d: Date = new Date()): string {
  return localWeekStartISO(d, BANGKOK);
}

/** First instant of calendar month in Bangkok as UTC ISO. */
export function bangkokMonthStartISO(d: Date = new Date()): string {
  return localMonthStartISO(d, BANGKOK);
}

/** Start of week (Sunday 00:00 in `timeZone`) as UTC ISO for DB queries. */
export function localWeekStartISO(d: Date, timeZone: string): string {
  if (timeZone === BANGKOK) {
    const ymd = bangkokDateStr(d);
    const noon = new Date(`${ymd}T12:00:00+07:00`);
    const dow = noon.getUTCDay();
    const weekStartNoon = new Date(noon.getTime() - dow * 86_400_000);
    return bangkokDayBounds(weekStartNoon).start;
  }
  const ymd = localDateStr(d, timeZone);
  const noon = zonedWallClockToUtc(ymd, 12, 0, 0, 0, timeZone);
  const dow = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" })
    .formatToParts(noon)
    .find((p) => p.type === "weekday")?.value;
  const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dow ?? "Sun");
  const weekStart = new Date(noon.getTime() - dayIndex * 86_400_000);
  return localDayBounds(weekStart, timeZone).start;
}

/** First instant of calendar month in `timeZone` as UTC ISO. */
export function localMonthStartISO(d: Date, timeZone: string): string {
  if (timeZone === BANGKOK) {
    const { start } = bangkokMonthBounds(d);
    return new Date(`${start}T00:00:00+07:00`).toISOString();
  }
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return zonedWallClockToUtc(`${y}-${m}-01`, 0, 0, 0, 0, timeZone).toISOString();
}

/** Day of week (0=Sun..6=Sat) in a given IANA timezone. */
export function localWeekday(d: Date, timeZone: string): number {
  const dow = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" })
    .formatToParts(d)
    .find((p) => p.type === "weekday")?.value;
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dow ?? "Sun");
}

/** Tomorrow's calendar day bounds in Bangkok. */
export function bangkokTomorrowBounds(): { start: string; end: string } {
  const ymd = bangkokDateStr(new Date());
  const noon = new Date(`${ymd}T12:00:00+07:00`);
  noon.setDate(noon.getDate() + 1);
  return bangkokDayBounds(noon);
}
