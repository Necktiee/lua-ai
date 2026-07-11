# Hoshi Rollback Runbook

## When to Rollback

Rollback when:
- Production is broken (LINE not responding, dashboard down, cron failing)
- A deployed change causes data corruption or privacy violation
- LLM provider outage makes all responses fail
- Supabase migration broke schema

## Rollback Steps

### 1. Code Rollback (Vercel)

```bash
# Find the last known-good commit
git log --oneline -10

# Redeploy previous commit via Vercel
vercel --prod --git-commit <previous-good-sha>

# OR push a revert commit
git revert <bad-commit-sha>
git push origin master
```

Vercel auto-deploys on push to master. The previous deployment is also
available in the Vercel dashboard under "Instant Rollback."

### 2. Supabase Migration Rollback

**WARNING:** Migration rollbacks are destructive. Only rollback if the
migration caused data corruption.

```bash
# Check applied migrations
npx supabase migration list --linked

# If a bad migration was applied, create a new migration that reverses it
# Example: if 20260706180000 added a bad column
# Create 20260706190000_rollback_bad_column.sql:
#   alter table X drop column if exists bad_column;
npx supabase db push --linked
```

Never use `supabase db reset` on production — it drops all data.

### 3. Environment Variable Rollback

If a bad env var was pushed:
```bash
vercel env add <NAME> production --value <previous-value> --yes --force
vercel --prod  # redeploy to pick up new env
```

### 4. QStash Schedule Recovery

If cron schedules are missing or broken:
```bash
# List current schedules
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://lua-ai-two.vercel.app/api/admin/setup-schedules

# Recreate all schedules
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://lua-ai-two.vercel.app/api/admin/setup-schedules
```

### 5. LINE Webhook Recovery

If LINE webhook is not responding:
1. Check Vercel deployment status
2. Verify `APP_BASE_URL` env var matches Vercel domain
3. Check LINE Developers Console webhook URL
4. Verify `LINE_CHANNEL_SECRET` and `LINE_CHANNEL_ACCESS_TOKEN` are set

### 6. LLM Provider Fallback

If primary LLM provider is down:
- The pool automatically falls back to next provider in `LLM_FALLBACK_ORDER`
- If all providers fail, check API key validity and quota
- Temporarily remove a broken provider from `LLM_FALLBACK_ORDER`

## Monitoring

- **Vercel Dashboard**: deployment status, function logs, analytics
- **Supabase Dashboard**: database health, RLS policies, storage usage
- **LINE Developers Console**: webhook delivery status, message API usage
- **QStash Dashboard**: schedule health, message queue
- **Dashboard /system page**: integration status, AI usage, provider health

## Incident Response

1. **Detect**: Vercel alert, user report, or dashboard check
2. **Assess**: Is it code, data, env, or external service?
3. **Rollback**: Use the appropriate rollback step above
4. **Communicate**: Notify owner via LINE push if bot is down
5. **Fix**: Create a fix commit, test locally, deploy
6. **Post-mortem**: Document what happened and how to prevent recurrence

## Backup Strategy

- **Database**: Supabase automatic daily backups + PITR (Point-in-Time Recovery)
- **Storage**: Supabase Storage objects (no automatic backup — manual sync needed)
- **Code**: Git history (all changes are committed and pushed)
- **Env vars**: Vercel environment variable dashboard (version controlled via `vercel env`)

## Contact

- Owner: LINE userId in `OWNER_LINE_USER_ID` env var
- GitHub: Necktiee/lua-ai
- Supabase: project `wepadghmipodyucqeulm`
- Vercel: lua-ai-two.vercel.app
