-- Phase 8: quiet hours + undo receipts

alter table user_settings
  add column if not exists quiet_hours_start time,
  add column if not exists quiet_hours_end time,
  add column if not exists quiet_hours_enabled boolean not null default false;

comment on column user_settings.quiet_hours_enabled is
  'When true, proactive pushes (briefing/evening/nudge) are suppressed in [start,end) local time';

create table if not exists undo_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  kind text not null,
  label text not null,
  payload jsonb not null default '{}',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists undo_tokens_user on undo_tokens (user_id, expires_at desc);

alter table undo_tokens enable row level security;
drop policy if exists undo_sel on undo_tokens;
drop policy if exists undo_ins on undo_tokens;
drop policy if exists undo_upd on undo_tokens;
create policy undo_sel on undo_tokens for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy undo_ins on undo_tokens for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy undo_upd on undo_tokens for update using (user_id = nullif(current_setting('app.user_id', true), ''));
