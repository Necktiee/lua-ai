create table recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  feature text not null,
  recommendation_key text not null,
  action text not null check (action in ('accepted', 'dismissed', 'corrected', 'opted_out')),
  minutes_saved integer check (minutes_saved is null or minutes_saved between 0 and 1440),
  note text,
  created_at timestamptz not null default now()
);

create unique index recommendation_feedback_once on recommendation_feedback (user_id, feature, recommendation_key, action);
create index recommendation_feedback_metrics on recommendation_feedback (user_id, feature, created_at desc);
alter table recommendation_feedback enable row level security;
create policy recommendation_feedback_sel on recommendation_feedback for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy recommendation_feedback_ins on recommendation_feedback for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));
