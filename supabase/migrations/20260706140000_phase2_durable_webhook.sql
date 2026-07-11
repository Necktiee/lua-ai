-- Phase 2: Durable webhook inbox + todo-reminder link + email claim lifecycle + message delivery state

-- =============================================================
-- webhook_events — durable inbox for LINE webhook idempotency
-- =============================================================
-- LINE may redeliver events. webhookEventId is unique per event.
-- Flow: insert (pending) before returning 200 → claim (processing) in
-- after() → mark done/failed after processing. Stale 'processing' rows
-- are picked up by the poll cron for retry.
create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  webhook_event_id text not null,
  user_id text,
  reply_token text,
  source_type text,
  message_type text,
  message_id text,
  text_content text,
  status text not null default 'pending' check (status in ('pending','processing','done','failed','dead_letter')),
  attempts int not null default 0,
  error text,
  claimed_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (webhook_event_id)
);
create index if not exists webhook_events_status on webhook_events (status, created_at);
create index if not exists webhook_events_user on webhook_events (user_id, created_at desc);

alter table webhook_events enable row level security;
drop policy if exists webhook_events_sel on webhook_events;
drop policy if exists webhook_events_ins on webhook_events;
drop policy if exists webhook_events_upd on webhook_events;
drop policy if exists webhook_events_del on webhook_events;
create policy webhook_events_sel on webhook_events for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy webhook_events_ins on webhook_events for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy webhook_events_upd on webhook_events for update using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy webhook_events_del on webhook_events for delete using (user_id = nullif(current_setting('app.user_id', true), ''));

-- =============================================================
-- todos.reminder_id — link auto-reminder to its todo
-- =============================================================
-- When todo_add creates an auto-reminder, store the reminder_id here.
-- done/cancel/delete/due-update cancels or reschedules the linked reminder.
alter table todos add column if not exists reminder_id uuid references reminders(id) on delete set null;
create index if not exists todos_reminder_idx on todos (reminder_id) where reminder_id is not null;

-- =============================================================
-- email_notified.status — claim lifecycle for urgent email
-- =============================================================
-- pending = claimed before classification (prevents concurrent re-scan)
-- sent = LINE push succeeded
-- skipped = classified as non-urgent (not re-scanned)
-- If push fails, the pending row is deleted so the next cron tick retries.
alter table email_notified add column if not exists status text not null default 'sent' check (status in ('pending','sent','skipped'));
create index if not exists email_notified_status on email_notified (user_id, status);

-- =============================================================
-- messages.delivered — distinguish failed delivery from successful
-- =============================================================
-- Assistant messages are logged before LINE delivery. If delivery fails,
-- delivered=false so the dashboard can show it differently and a retry
-- can update it later.
alter table messages add column if not exists delivered boolean default true;
