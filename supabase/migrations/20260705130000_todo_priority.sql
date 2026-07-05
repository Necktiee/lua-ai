-- goal.tasks: add priority to todos so tasks can be ranked, not just due-date sorted.
-- 1 = urgent/ด่วน, 2 = normal (default), 3 = low/ไม่รีบ.

alter table todos add column if not exists priority smallint not null default 2
  check (priority between 1 and 3);

create index if not exists todos_priority_idx on todos (user_id, status, priority, due_at);
