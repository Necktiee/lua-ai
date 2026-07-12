-- Phase 1: Correctness and Security Closure
-- Fixes C3 (CHECK constraint), C4 (RPC grants), C5 (RLS), M6 (TTL cleanup + FKs)

-- =============================================================
-- C3: Add missing embedding_status CHECK constraints
-- =============================================================
-- The repair migration 20260711140000 added the column without CHECK.
-- This adds the constraint idempotently using DO blocks.

do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'memory_embedding_status_check'
  ) then
    alter table memory add constraint memory_embedding_status_check
      check (embedding_status in ('ok', 'failed', 'null', 'reindex'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'knowledge_embedding_status_check'
  ) then
    alter table knowledge add constraint knowledge_embedding_status_check
      check (embedding_status in ('ok', 'failed', 'null', 'reindex'));
  end if;
end $$;

-- =============================================================
-- C4: Revoke EXECUTE on hybrid search RPCs from public/anon/authenticated
-- =============================================================
-- phase3_privacy revoked match_memory, match_knowledge, increment_nudge
-- but missed the two hybrid search functions added in phase5.

revoke execute on function hybrid_memory_search(
  text, vector(1024), text, int, text, timestamptz, timestamptz, float, float, int
) from public, anon, authenticated;

revoke execute on function hybrid_knowledge_search(
  text, vector(1024), text, int, text, float, float, int
) from public, anon, authenticated;

-- =============================================================
-- C5: Tighten llm_usage RLS — deny anon/authenticated, allow service_role only
-- =============================================================
-- The original policy was USING(true) WITH CHECK(true) which let anyone
-- read/write all rows. Replace with explicit service_role-only policies.
-- (service_role bypasses RLS entirely, so these policies are defense-in-depth.)

drop policy if exists service_role_all_llm_usage on llm_usage;

-- No SELECT policy for anon/authenticated → they get nothing.
-- service_role bypasses RLS so it can still read/write freely.
create policy llm_usage_service_role_sel on llm_usage
  for select to service_role using (true);
create policy llm_usage_service_role_ins on llm_usage
  for insert to service_role with check (true);

-- =============================================================
-- M6: Add FKs for oauth_nonces and mutation_keys
-- =============================================================
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'oauth_nonces_user_fkey'
  ) then
    alter table oauth_nonces
      add constraint oauth_nonces_user_fkey
      foreign key (user_id) references users(line_user_id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'mutation_keys_user_fkey'
  ) then
    alter table mutation_keys
      add constraint mutation_keys_user_fkey
      foreign key (user_id) references users(line_user_id) on delete cascade;
  end if;
end $$;

-- =============================================================
-- M6: Add google_tokens updated_at trigger (was missing)
-- =============================================================
drop trigger if exists google_tokens_touch on google_tokens;
create trigger google_tokens_touch before update on google_tokens
  for each row execute function touch_updated_at();

-- =============================================================
-- M6: Add indexes for trace correlation queries
-- =============================================================
create index if not exists messages_trace_idx
  on messages (trace_id) where trace_id is not null;
create index if not exists llm_usage_trace_idx
  on llm_usage (trace_id) where trace_id is not null;

-- =============================================================
-- M6: Add cleanup function for ephemeral tables
-- =============================================================
-- Called by the daily cron to purge expired rows from:
-- oauth_nonces, mutation_keys, undo_tokens, webhook_events (done/dead_letter),
-- embedding_jobs (done/failed), cron dedup markers.
create or replace function cleanup_ephemeral_data(days_to_keep int default 7)
returns void
language sql
as $$
  -- OAuth nonces: delete consumed or expired
  delete from oauth_nonces
    where consumed_at is not null
      or expires_at < now() - (days_to_keep || ' days')::interval;

  -- Mutation keys: delete old entries
  delete from mutation_keys
    where created_at < now() - (days_to_keep || ' days')::interval;

  -- Undo tokens: delete consumed or expired
  delete from undo_tokens
    where consumed_at is not null
      or expires_at < now() - (days_to_keep || ' days')::interval;

  -- Webhook events: delete terminal-state events older than retention
  delete from webhook_events
    where status in ('done', 'dead_letter')
      and created_at < now() - (days_to_keep || ' days')::interval;

  -- Embedding jobs: delete terminal-state jobs older than retention
  delete from embedding_jobs
    where status in ('done', 'failed')
      and created_at < now() - (days_to_keep || ' days')::interval;

  -- Cron dedup markers: delete old fired markers
  delete from reminders
    where message like '\_\_%\_\_:%' ESCAPE '\'
      and fired = true
      and created_at < now() - (days_to_keep || ' days')::interval;
$$;

revoke execute on function cleanup_ephemeral_data(int) from public, anon, authenticated;

notify pgrst, 'reload schema';
