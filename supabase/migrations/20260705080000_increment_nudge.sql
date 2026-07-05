-- Atomic increment for follow-up nudge count (fixes TOCTOU race in markNudged).
create or replace function increment_nudge(fu_id uuid)
returns void as $$
  update follow_ups
  set nudged_count = nudged_count + 1, status = 'nudged', updated_at = now()
  where id = fu_id;
$$ language sql;
