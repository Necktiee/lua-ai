# Canary Rollout

Use a Vercel preview deployment as the canary. Do not merge/promote to production until the smoke gate and owner checks pass.

1. Push the candidate branch and wait for Vercel to create its preview URL.
2. Run the GitHub Actions **Canary smoke** workflow with that URL, or run locally:

   ```bash
   CANARY_URL=https://candidate.example.vercel.app npm run smoke:canary
   ```

3. Confirm `/`, `/liff`, and `/api/health` return 2xx. The smoke is read-only and never invokes LINE, cron, or mutation endpoints.
4. In the preview LIFF, owner manually tests LINE login, one todo write/undo, one reminder, Google disconnect/reconnect, and mobile navigation.
5. Run the authenticated dashboard WCAG command from `docs/WCAG-AUDIT.md` with a non-committed storage state.
6. Promote by merging to `master`; Vercel production deploys automatically. Watch Vercel function errors, LINE webhook delivery, QStash, and `/api/health` for 15 minutes.
7. If any gate fails, use `docs/ROLLBACK-RUNBOOK.md`; do not retry mutations from the canary.

Record preview URL, commit SHA, smoke result, owner check, production start/end, and rollback decision with the release ticket.
