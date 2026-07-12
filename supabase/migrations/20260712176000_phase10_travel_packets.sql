-- Phase 10: Travel Packet
-- Time-sensitive travel context: itinerary, documents, timezone shifts,
-- checklist, alerts. Read-only dashboard surface; no autonomous booking.

create table if not exists public.travel_packets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  title text not null,
  destination text not null,
  start_date date not null,
  end_date date not null,
  home_timezone text not null default 'Asia/Bangkok',
  dest_timezone text not null default 'Asia/Bangkok',
  itinerary jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  alerts jsonb not null default '[]'::jsonb,
  document_ids jsonb not null default '[]'::jsonb,
  status text not null default 'planned' check (status in ('planned','active','completed','cancelled')),
  source_memory_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists travel_packets_user_dates_idx
  on public.travel_packets (user_id, start_date desc, end_date);

alter table public.travel_packets enable row level security;

drop policy if exists travel_packets_owner_select on public.travel_packets;
create policy travel_packets_owner_select on public.travel_packets
  for select using (user_id = nullif(current_setting('app.user_id', true), ''));

drop policy if exists travel_packets_owner_modify on public.travel_packets;
create policy travel_packets_owner_modify on public.travel_packets
  for all using (user_id = nullif(current_setting('app.user_id', true), ''))
  with check (user_id = nullif(current_setting('app.user_id', true), ''));

drop trigger if exists travel_packets_touch on public.travel_packets;
create trigger travel_packets_touch before update on public.travel_packets for each row execute function touch_updated_at();
