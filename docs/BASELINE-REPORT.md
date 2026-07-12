# Hoshi Baseline Report

Generated: 2026-07-12T06:07:47.231Z

## Freeze

| Field | Value |
|-------|-------|
| Branch | `master` |
| HEAD | `4eaa1041934ad4f37a4b07fea0f9755e41050091` |
| Message | 4eaa104 Phase 9: observability — cost tracking, trace IDs, rollback runbook |
| Local migrations | 34 |
| Intended cron routes | 10 |

## Phase-complete commit range (roadmap scaffolding)

- Phase 0 start: `7ca2a04`
- Phase 9 end: `4eaa104`
- Phase 3 retention migration: `20260711100000_phase3_retention.sql`

## DB metrics

| Metric | Count |
|--------|------:|
| users | 3 |
| memory_total | 6 |
| memory_null_embedding | 0 |
| webhook_events | 0 |
| webhook_dead_letter | 0 |
| webhook_failed | 0 |
| reminders_pending | 1 |
| google_token_rows | 0 |

## Latency / duplicate / orphan (manual or future probes)

| Signal | Status | How to measure |
|--------|--------|----------------|
| p95 routine reply latency | Not measured | Sample LINE→reply timestamps from `messages` + logs |
| Duplicate webhook effects | Partial | `webhook_events` unique on `webhook_event_id`; check dead_letter |
| Null embeddings | See `memory_null_embedding` above | `embedding IS NULL` |
| Orphan Storage objects | Not measured | List `attachments/` vs `memory.storage_path` |

## External state checklist

- [ ] BLOCKED: Vercel deployment = this SHA (or later)
- [ ] BLOCKED until verified: `npx tsx scripts/check-migration-parity.ts` → PARITY OK
- [ ] BLOCKED until verified: `npx tsx scripts/check-schedule-health.ts` → HEALTH OK
- [ ] BLOCKED: LINE webhook URL = `APP_BASE_URL/api/line`
- [ ] BLOCKED: QStash and GitHub Actions coverage for 10 intended cron routes

## Cron routes

- `/api/cron/poll` (`*/5 * * * *`) — Reminder poll fallback + stale webhook recovery
- `/api/cron/briefing` (`*/10 * * * *`) — Morning briefing (per-user local time window)
- `/api/cron/evening` (`*/10 * * * *`) — Evening review (per-user local time window)
- `/api/cron/daily` (`*/10 * * * *`) — Retention purge + ephemeral data cleanup
- `/api/cron/journal` (`*/10 * * * *`) — Auto-journal at user local 22:00
- `/api/cron/nudge` (`*/10 * * * *`) — Follow-up + overdue todo nudges at user local 09:00
- `/api/cron/meeting` (`*/10 * * * *`) — Pre-meeting brief (15–35 min before event)
- `/api/cron/weekly` (`0 * * * 0`) — Weekly reflection (Sunday, per-user gated)
- `/api/cron/email` (`*/5 * * * *`) — Urgent email check (bounded window)
- `/api/cron/embed` (`*/10 * * * *`) — Process embedding_jobs + reindex failed/null vectors
