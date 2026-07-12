-- Phase 2 hardening: mutation idempotency + retry backoff

create table if not exists mutation_keys (
  id uuid primary key default gen_random_uuid(),
  mutation_key text not null unique,
  user_id text not null,
  webhook_event_id text,
  action text not null,
  target text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists mutation_keys_user on mutation_keys (user_id, created_at desc);
create index if not exists mutation_keys_event on mutation_keys (webhook_event_id);

alter table mutation_keys enable row level security;
drop policy if exists mutation_keys_sel on mutation_keys;
drop policy if exists mutation_keys_ins on mutation_keys;
create policy mutation_keys_sel on mutation_keys for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy mutation_keys_ins on mutation_keys for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));

-- Exponential backoff for failed webhook retries
alter table webhook_events
  add column if not exists next_retry_at timestamptz;

create index if not exists webhook_events_retry
  on webhook_events (status, next_retry_at)
  where status = 'failed';
