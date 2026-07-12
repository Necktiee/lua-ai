create table decisions (
  id uuid primary key default gen_random_uuid(), user_id text not null references users(line_user_id) on delete cascade,
  title text not null, options jsonb not null default '[]'::jsonb, rationale text, assumptions jsonb not null default '[]'::jsonb,
  evidence_memory_id uuid references memory(id) on delete set null, review_at timestamptz, outcome text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'superseded')), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index decisions_user_review on decisions (user_id, status, review_at);
alter table decisions enable row level security;
create policy decisions_sel on decisions for select using (user_id = nullif(current_setting('app.user_id', true), ''));
create policy decisions_ins on decisions for insert with check (user_id = nullif(current_setting('app.user_id', true), ''));
create policy decisions_upd on decisions for update using (user_id = nullif(current_setting('app.user_id', true), '')) with check (user_id = nullif(current_setting('app.user_id', true), ''));
create trigger decisions_touch before update on decisions for each row execute function touch_updated_at();
