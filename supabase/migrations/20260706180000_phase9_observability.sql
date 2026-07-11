-- Phase 9: Observability — cost tracking + trace correlation

-- Add cost_usd to llm_usage for cost tracking
alter table llm_usage add column if not exists cost_usd numeric(10,6) default 0;
alter table llm_usage add column if not exists trace_id text;

-- Add trace_id to webhook_events for cross-stage correlation
alter table webhook_events add column if not exists trace_id text default gen_random_uuid();
create index if not exists webhook_events_trace on webhook_events (trace_id) where trace_id is not null;

-- Add trace_id to messages for delivery correlation
alter table messages add column if not exists trace_id text;
