/**
 * Calendar module — wrapper รอบ googleapis.
 * Token per-user เก็บในตาราง google_tokens.
 */
import { google } from "googleapis";
import { requireDb } from "@/lib/db/client";
import { env } from "@/lib/env";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export function oauth2Client() {
  const { OAuth2 } = google.auth;
  return new OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
}

export function getAuthUrl(state: string) {
  return oauth2Client().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

export async function exchangeCode(code: string) {
  const c = oauth2Client();
  const { tokens } = await c.getToken(code);
  return tokens;
}

/** Shape of Google OAuth token response (subset we use) */
export interface GoogleTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string | null;
  token_type?: string | null;
}

export async function saveTokens(userId: string, tokens: GoogleTokens) {
  const db = requireDb();
  if (!tokens.access_token) throw new Error("saveTokens: missing access_token");

  const { data: existing } = await db
    .from("google_tokens")
    .select("refresh_token, expiry, scope")
    .eq("user_id", userId)
    .maybeSingle();

  const refreshToken =
    tokens.refresh_token ?? existing?.refresh_token ?? null;
  const expiry = tokens.expiry_date
    ? new Date(tokens.expiry_date).toISOString()
    : existing?.expiry ?? null;
  const scope = tokens.scope ?? existing?.scope ?? null;

  const { error } = await db.from("google_tokens").upsert({
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: refreshToken,
    expiry,
    scope,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`saveTokens: ${error.message}`);
}

export async function getAuthedClient(userId: string) {
  const db = requireDb();
  const { data, error } = await db
    .from("google_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getTokens: ${error.message}`);
  if (!data) throw new Error("Google Calendar ยังไม่ได้เชื่อม — พิมพ์ 'เชื่อม calendar'");
  const c = oauth2Client();
  c.setCredentials({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: data.expiry ? new Date(data.expiry).getTime() : undefined,
  });
  // persist refreshed tokens back to DB so we don't refresh every request
  c.on("tokens", (newTokens: GoogleTokens) => {
    void saveTokens(userId, newTokens).catch((e) =>
      console.warn("[calendar] token refresh save failed", (e as Error).message),
    );
  });
  return c;
}

export async function createEvent(args: {
  userId: string;
  summary: string;
  startIso: string;
  endIso?: string;
  location?: string;
  timeZone?: string;
}) {
  const auth = await getAuthedClient(args.userId);
  const calendar = google.calendar({ version: "v3", auth });
  const start = args.startIso;
  const end = args.endIso ?? addOneHour(start);
  const tz = args.timeZone ?? "Asia/Bangkok";
  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: args.summary,
      location: args.location,
      start: { dateTime: start, timeZone: tz },
      end: { dateTime: end, timeZone: tz },
    },
  });
  // mirror ลง DB — retry once before giving up (Gap #2: don't silently drop the
  // mirror row just because of a transient DB hiccup; the Google event already
  // exists so we can't roll that back, but we can make sure the local mirror
  // used by meeting-prep/briefing fallback actually reflects it).
  const db = requireDb();
  const mirrorRow = {
    user_id: args.userId,
    google_event_id: res.data.id,
    summary: args.summary,
    start_at: start,
    end_at: end,
    location: args.location ?? null,
  };
  let dbErr = (await db.from("calendar_events").insert(mirrorRow)).error;
  if (dbErr) {
    await new Promise((r) => setTimeout(r, 500));
    dbErr = (await db.from("calendar_events").insert(mirrorRow)).error;
  }
  if (dbErr) {
    // Still failed after retry — notify the user directly instead of a silent
    // console.warn, since the event is real in Google Calendar but our local
    // mirror (used by briefing/meeting-prep DB fallback) is now out of sync.
    console.error("[calendar] mirror insert failed after retry", dbErr.message);
    try {
      const { pushText } = await import("@/lib/line");
      await pushText(
        args.userId,
        `⚠️ นัด "${args.summary}" ถูกสร้างใน Google Calendar แล้ว แต่บันทึกสำรองในระบบล้มเหลว — ถ้า brief ก่อนประชุมไม่มา ให้เช็คใน Google Calendar โดยตรง`,
      );
    } catch (e) {
      console.warn("[calendar] mirror-failure notify also failed", (e as Error).message);
    }
  }
  return res.data;
}

export async function listEvents(userId: string, withinDays = 7) {
  const auth = await getAuthedClient(userId);
  const calendar = google.calendar({ version: "v3", auth });
  const now = new Date();
  const max = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: max.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });
  return res.data.items ?? [];
}

/** Upcoming events within N minutes — used by meeting prep cron (reads Google, not DB mirror). */
export async function listEventsWithinMinutes(userId: string, withinMinutes: number) {
  const auth = await getAuthedClient(userId);
  const calendar = google.calendar({ version: "v3", auth });
  const now = new Date();
  const max = new Date(now.getTime() + withinMinutes * 60_000);
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: max.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });
  return res.data.items ?? [];
}

function addOneHour(iso: string) {
  const d = new Date(iso);
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}
