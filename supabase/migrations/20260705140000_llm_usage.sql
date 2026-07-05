-- goal.* Phase 4: track AI usage (provider/model/tokens) for the dashboard.
-- Fire-and-forget insert from src/lib/llm/pool.ts — never blocks a chat() call.

create table if not exists llm_usage (
  id bigserial primary key,
  provider text not null,
  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  elapsed_ms integer not null default 0,
  attempts smallint not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists llm_usage_created_at_idx on llm_usage (created_at desc);
create index if not exists llm_usage_provider_idx on llm_usage (provider, created_at desc);

alter table llm_usage enable row level security;

drop policy if exists service_role_all_llm_usage on llm_usage;
create policy service_role_all_llm_usage on llm_usage
  for all
  using (true)
  with check (true);
