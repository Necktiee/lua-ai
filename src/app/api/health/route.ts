import { hasSupabase } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Public, side-effect-free probe for deployment and canary smoke checks. */
export async function GET() {
  return Response.json(
    {
      ok: true,
      service: "lua-ai",
      checks: { supabaseConfigured: hasSupabase() },
      now: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
