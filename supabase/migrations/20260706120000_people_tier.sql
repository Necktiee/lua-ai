-- Contact tiers (P1-P4) on people.
-- Borrowed from secretary-agent (kylem148): tiers are user-mutable context the
-- LLM reasons with when prioritizing follow-ups, nudges, and meeting prep.
-- They are NOT hard rules — a high tier informs weighting the same way a human
-- assistant weighs "who is this person to the owner".
--
--   P1 = หลักสำคัญที่สุด (boss, board, key investors, family)
--   P2 = สัมพันธ์สำคัญ (key relationships, close collaborators)
--   P3 = ทั่วไป (standard internal / team)  — default when null
--   P4 = ภายนอก/เย็น (cold outreach, low-priority)
--
-- nullable: null is treated as P3 (standard) by the app layer.
alter table people
  add column if not exists tier int check (tier between 1 and 4);

-- tier-first then recency — powers the always-inject <people> context layer.
create index if not exists people_user_tier_seen
  on people (user_id, tier asc nulls last, last_seen desc nulls last);
