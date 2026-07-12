create table commitments (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(line_user_id) on delete cascade,
  title text not null,
  responsible_party text not null check (responsible_party in ('owner', 'other')),
  counterparty text,
  due_at timestamptz,
  review_at timestamptz,
  status text not null default 'open' check (status in ('open', 'fulfilled', 'cancelled')),
  evidence_memory_id uuid references memory(id) on delete set null,
  outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index commitments_user_status_due on commitments (user_id, status, due_at);
alter table commitments enable row level security;

create policy commitments_sel on commitments for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy commitments_ins on commitments for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy commitments_upd on commitments for update using (user_id = nullif(current_setting('app.user_id', true), '')) with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy commitments_del on commitments for delete using (user_id = nullif(current_setting('app.user_id', true), ''));

create trigger commitments_touch before update on commitments for each row execute function touch_updated_at();
