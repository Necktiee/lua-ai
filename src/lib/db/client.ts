/**
 * Supabase client (server-side, service role). บypass RLS.
 * เราใช้คนเดียวในบัญชีเดียว จึง map user_id = LINE userId ตรงๆ ไม่ต้อง auth.
 */
import { createClient } from "@supabase/supabase-js";
import { env, hasSupabase } from "@/lib/env";

export const supabase = hasSupabase()
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export function requireDb() {
  if (!supabase) throw new Error("Supabase not configured (SUPABASE_URL/KEY)");
  return supabase;
}

/** upsert user (touch last_seen) */
export async function touchUser(lineUserId: string, displayName?: string) {
  const db = requireDb();
  const { error } = await db.from("users").upsert(
    {
      line_user_id: lineUserId,
      display_name: displayName,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "line_user_id" },
  );
  if (error) console.warn("[db] touchUser", error.message);
}
