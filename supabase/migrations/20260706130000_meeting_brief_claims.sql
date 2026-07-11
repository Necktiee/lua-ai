-- Meeting brief claim table — uses TEXT event IDs (not UUID).
-- Google Calendar event IDs are text strings like "abc123_20260711T100000Z",
-- which fail when inserted into the UUID `relations.from_id`/`to_id` columns.
-- This dedicated table accepts text IDs and provides the same atomic-claim
-- guarantee via a unique constraint.

create table if not exists meeting_brief_claims (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  google_event_id text not null,
  status text not null default 'claimed' check (status in ('claimed','sent','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One claim per user per Google event — atomic insert prevents duplicates.
create unique index if not exists meeting_brief_claim_uniq
  on meeting_brief_claims (user_id, google_event_id);

-- Trigger to keep updated_at fresh.
drop trigger if exists meeting_brief_claims_touch on meeting_brief_claims;
create trigger meeting_brief_claims_touch
  before update on meeting_brief_claims
  for each row execute function touch_updated_at();

-- RLS (defense-in-depth; app uses service_role).
alter table meeting_brief_claims enable row level security;

create policy meeting_brief_claims_sel on meeting_brief_claims for select
  using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy meeting_brief_claims_ins on meeting_brief_claims for insert
  with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy meeting_brief_claims_upd on meeting_brief_claims for update
  using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy meeting_brief_claims_del on meeting_brief_claims for delete
  using (user_id = nullif(current_setting('app.user_id', true), ''));
