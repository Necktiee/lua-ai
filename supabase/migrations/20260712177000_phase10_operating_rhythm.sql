-- Phase 10: Personal Operating Rhythm
-- Learned patterns of the owner's working hours, energy windows,
-- preferred briefing format, and recurring routines. Confidence
-- and observed_count let the dashboard surface only stable patterns.

create table if not exists public.operating_rhythm (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  pattern_type text not null check (pattern_type in (
    'working_hours','energy_peak','energy_low','briefing_format',
    'routine','preferred_channel','response_window','other'
  )),
  pattern_key text not null,
  pattern_value jsonb not null,
  confidence numeric(3,2) not null default 0.0 check (confidence between 0 and 1),
  observed_count int not null default 0 check (observed_count >= 0),
  last_observed_at timestamptz,
  superseded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operating_rhythm_unique unique (user_id, pattern_type, pattern_key)
);

create index if not exists operating_rhythm_user_type_idx
  on public.operating_rhythm (user_id, pattern_type, confidence desc);

alter table public.operating_rhythm enable row level security;

drop policy if exists operating_rhythm_owner_select on public.operating_rhythm;
create policy operating_rhythm_owner_select on public.operating_rhythm
  for select using (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists operating_rhythm_owner_modify on public.operating_rhythm;
create policy operating_rhythm_owner_modify on public.operating_rhythm
  for all using (user_id = nullif(current_setting('app.user_id', true), ''))
  with check (user_id = nullif(current_setting('app.user_id', true), ''));

drop trigger if exists operating_rhythm_touch on public.operating_rhythm;
create trigger operating_rhythm_touch before update on public.operating_rhythm for each row execute function touch_updated_at();

-- Atomic upsert + confidence accumulator. Each observation increments
-- observed_count and nudges confidence toward 1 using diminishing returns,
-- so a single bad day cannot unseat a stable pattern.
create or replace function public.upsert_operating_rhythm_observation(
  p_user_id text,
  p_pattern_type text,
  p_pattern_key text,
  p_pattern_value jsonb,
  p_observed_at timestamptz
)
returns public.operating_rhythm
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.operating_rhythm;
begin
  insert into public.operating_rhythm
    (user_id, pattern_type, pattern_key, pattern_value, confidence, observed_count, last_observed_at)
  values
    (p_user_id, p_pattern_type, p_pattern_key, p_pattern_value, 0.50, 1, p_observed_at)
  on conflict (user_id, pattern_type, pattern_key)
  do update set
    observed_count = public.operating_rhythm.observed_count + 1,
    last_observed_at = p_observed_at,
    pattern_value = coalesce(p_pattern_value, public.operating_rhythm.pattern_value),
    confidence = least(1.0,
      public.operating_rhythm.confidence
        + (1.0 - public.operating_rhythm.confidence) * 0.15)
  returning * into v_row;
  return v_row;
end;
$$;

grant execute on function public.upsert_operating_rhythm_observation(text, text, text, jsonb, timestamptz) to anon, authenticated;
