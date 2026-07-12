-- Phase 1 C1: Durable pending_actions for R2 plan confirmation
-- Stores a validated plan requiring confirmation so "ยืนยัน" can resume
-- from stored state rather than re-entering the classifier.

create table if not exists pending_actions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  kind text not null default 'plan_confirmation',
  payload jsonb not null,
  risk_level text not null default 'R2',
  policy_version text,
  source_event_id text,
  idempotency_key text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'expired', 'consumed')),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

create index if not exists pending_actions_user_status
  on pending_actions (user_id, status, expires_at desc);
create index if not exists pending_actions_event
  on pending_actions (source_event_id) where source_event_id is not null;

alter table pending_actions enable row level security;

drop policy if exists pending_actions_sel on pending_actions;
drop policy if exists pending_actions_ins on pending_actions;
drop policy if exists pending_actions_upd on pending_actions;
drop policy if exists pending_actions_del on pending_actions;
create policy pending_actions_sel on pending_actions for select
  using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy pending_actions_ins on pending_actions for insert
  with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy pending_actions_upd on pending_actions for update
  using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy pending_actions_del on pending_actions for delete
  using (user_id = nullif(current_setting('app.user_id', true), ''));

revoke execute on function cleanup_ephemeral_data(int) from public, anon, authenticated;

notify pgrst, 'reload schema';
