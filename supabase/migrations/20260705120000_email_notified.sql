-- Gap #7: proactive urgent-email monitoring cron needs per-message dedup.
-- Gmail message IDs are hex strings (not uuid), so they can't reuse the
-- `relations` table (from_id is uuid). Small dedicated table instead.

create table if not exists email_notified (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  gmail_message_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, gmail_message_id)
);
create index if not exists email_notified_user on email_notified (user_id, created_at desc);

alter table email_notified enable row level security;

drop policy if exists email_notified_sel on email_notified;
drop policy if exists email_notified_ins on email_notified;
create policy email_notified_sel on email_notified for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy email_notified_ins on email_notified for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));
