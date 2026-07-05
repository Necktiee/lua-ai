-- Prevent duplicate cron pushes from concurrent workers (race on check-then-insert).

-- Cron dedup markers: one per user per kind per day
create unique index if not exists reminders_cron_dedup_uniq
  on reminders (user_id, message)
  where message like '__%__:%' and fired = true;

-- Meeting brief: one send per user per calendar event
create unique index if not exists relations_meeting_brief_uniq
  on relations (user_id, from_id)
  where relation = 'meeting_brief_sent' and from_type = 'calendar_event';
