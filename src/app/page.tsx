import { env, hasLine, hasSupabase, hasQStash, hasGoogleCalendar, hasWebSearch, hasLiff } from "@/lib/env";
import { CheckCircle, Circle, Robot } from "@phosphor-icons/react/dist/ssr";

export const dynamic = "force-dynamic";

export default async function Home() {
  const providers = [env.LLM_PRIMARY_PROVIDER, ...env.LLM_FALLBACK_ORDER].filter(
    (v, i, a) => v && a.indexOf(v) === i,
  );

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-8 font-sans">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 p-8 space-y-6">
        <div className="flex items-center gap-2.5">
          <Robot weight="fill" className="w-6 h-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight">
            โฮชิ <span className="text-zinc-400 dark:text-zinc-500 text-sm font-normal">— Personal LINE AI Secretary</span>
          </h1>
        </div>

        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Status</h2>
          <div className="grid grid-cols-2 gap-1.5">
            <Row ok={hasLine()} label="LINE" />
            <Row ok={hasSupabase()} label="Supabase" />
            <Row ok={hasQStash()} label="QStash" />
            <Row ok={hasGoogleCalendar()} label="Google Calendar" />
            <Row ok={hasWebSearch()} label="Web search" />
            <Row ok={hasLiff()} label="LIFF dashboard" />
          </div>
        </section>

        <section className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-4">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">LLM pool</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{providers.join(" → ")}</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">
            gemini:{env.GEMINI_API_KEYS.length} mistral:{env.MISTRAL_API_KEYS.length} thaillm:{env.THAILLM_API_KEYS.length}
          </p>
        </section>

        <p className="text-xs text-zinc-400 dark:text-zinc-500 border-t border-zinc-100 dark:border-zinc-800 pt-4">
          Webhook: <code className="font-mono text-zinc-600 dark:text-zinc-400">POST /api/line</code>
        </p>
      </div>
    </main>
  );
}

function Row({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      {ok ? (
        <CheckCircle weight="fill" className="w-4 h-4 text-emerald-500 flex-shrink-0" />
      ) : (
        <Circle weight="regular" className="w-4 h-4 text-zinc-300 dark:text-zinc-600 flex-shrink-0" />
      )}
      <span className={ok ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-400 dark:text-zinc-600"}>
        {label}
      </span>
    </div>
  );
}
