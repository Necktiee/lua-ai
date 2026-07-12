/**
 * Canonical list of cron routes the product expects to be scheduled.
 * Used by setup-schedules admin route, schedule health check, and baseline docs.
 */
export interface CronRouteSpec {
  id: string;
  path: string;
  /** QStash cron expression (may differ from GitHub Actions tick) */
  cron: string;
  description: string;
}

export const CRON_ROUTES: CronRouteSpec[] = [
  {
    id: "lua-ai-poll",
    path: "/api/cron/poll",
    cron: "*/5 * * * *",
    description: "Reminder poll fallback + stale webhook recovery",
  },
  {
    id: "lua-ai-briefing",
    path: "/api/cron/briefing",
    cron: "*/10 * * * *",
    description: "Morning briefing (per-user local time window)",
  },
  {
    id: "lua-ai-evening",
    path: "/api/cron/evening",
    cron: "*/10 * * * *",
    description: "Evening review (per-user local time window)",
  },
  {
    id: "lua-ai-daily",
    path: "/api/cron/daily",
    cron: "*/10 * * * *",
    description: "Retention purge + ephemeral data cleanup",
  },
  {
    id: "lua-ai-journal",
    path: "/api/cron/journal",
    cron: "*/10 * * * *",
    description: "Auto-journal at user local 22:00",
  },
  {
    id: "lua-ai-nudge",
    path: "/api/cron/nudge",
    cron: "*/10 * * * *",
    description: "Follow-up + overdue todo nudges at user local 09:00",
  },
  {
    id: "lua-ai-meeting",
    path: "/api/cron/meeting",
    cron: "*/10 * * * *",
    description: "Pre-meeting brief (15–35 min before event)",
  },
  {
    id: "lua-ai-weekly",
    path: "/api/cron/weekly",
    cron: "0 * * * 0",
    description: "Weekly reflection (Sunday, per-user gated)",
  },
  {
    id: "lua-ai-email",
    path: "/api/cron/email",
    cron: "*/5 * * * *",
    description: "Urgent email check (bounded window)",
  },
  {
    id: "lua-ai-embed",
    path: "/api/cron/embed",
    cron: "*/10 * * * *",
    description: "Process embedding_jobs + reindex failed/null vectors",
  },
];

export const CRON_ROUTE_PATHS = CRON_ROUTES.map((r) => r.path);
