import { env, hasLine, hasSupabase, hasQStash, hasGoogleCalendar, hasWebSearch, hasLiff } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function Home() {
  const providers = [env.LLM_PRIMARY_PROVIDER, ...env.LLM_FALLBACK_ORDER].filter(
    (v, i, a) => v && a.indexOf(v) === i,
  );

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-black p-8 font-sans">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-8 space-y-4">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          โฮชิ <span className="text-zinc-400 text-sm">— Personal LINE AI Secretary</span>
        </h1>

        <section className="space-y-1 text-sm">
          <h2 className="font-semibold text-zinc-700 dark:text-zinc-300">Status</h2>
          <Row ok={hasLine()} label="LINE" />
          <Row ok={hasSupabase()} label="Supabase" />
          <Row ok={hasQStash()} label="QStash" />
          <Row ok={hasGoogleCalendar()} label="Google Calendar" />
          <Row ok={hasWebSearch()} label="Web search (Tavily)" />
          <Row ok={hasLiff()} label="LIFF dashboard" />
        </section>

        <section className="space-y-1 text-sm">
          <h2 className="font-semibold text-zinc-700 dark:text-zinc-300">LLM pool</h2>
          <div className="text-zinc-600 dark:text-zinc-400">
            providers: {providers.join(", ")}
          </div>
          <div className="text-zinc-600 dark:text-zinc-400">
            gemini keys: {env.GEMINI_API_KEYS.length} · mistral:{" "}
            {env.MISTRAL_API_KEYS.length} · thaillm: {env.THAILLM_API_KEYS.length}
          </div>
        </section>

        <p className="text-xs text-zinc-500">
          Webhook: <code className="font-mono">POST /api/line</code>
        </p>
      </div>
    </main>
  );
}

function Row({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={ok ? "text-emerald-500" : "text-zinc-400"}>
        {ok ? "●" : "○"}
      </span>
      <span className={ok ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-400"}>
        {label}
      </span>
    </div>
  );
}
