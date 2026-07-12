# PITR Restore Drill

Run this on a non-production restore target. It verifies recovery, not a normal deployment.

## Preconditions

- Supabase project has PITR enabled and an operator has dashboard access.
- Choose an incident timestamp and a temporary restore project; never restore over `wepadghmipodyucqeulm`.
- Record the source project, target project, UTC restore point, operator, and start time in the evidence section below.

## Drill

1. In Supabase Dashboard, open the production project's Database Backups/PITR page and restore to the chosen UTC point into a separate project.
2. Link the temporary project: `supabase link --project-ref <restore-ref>`.
3. Run `npm run check:migrations`; it must report parity for the restored point or document intentional historical differences.
4. Verify row counts for `users`, `memory`, `todos`, `messages`, `google_tokens`, and Storage `attachments/` against the timestamped baseline. Do not print token values.
5. With temporary credentials only, run `npm run baseline` and `npm run eval:rag`.
6. Confirm the restored application can read a known non-secret memory and that no LINE/QStash cron is pointed at the temporary project.
7. Record RPO (restore-point age) and RTO (start to successful checks), then delete the temporary project.

## Evidence Template

| Field | Value |
|---|---|
| Date / operator | |
| Source / restore project refs | |
| PITR UTC point | |
| RPO | |
| RTO | |
| Migration parity | |
| Row/storage comparison | |
| Baseline + live RAG eval | |
| Cleanup confirmed | |

Do not mark the drill complete until this table is filled with actual restore evidence.
