# Phase 5: Source, Artifact, And Knowledge Quality Foundation

**Date:** 2026-07-12T11:15 UTC
**Status:** ✅ Complete (core deliverables)

## Goal
Build a provenance-first ingestion and knowledge lifecycle so bad, stale, duplicate, inferred, or contradictory data cannot silently become trusted context.

## Deliverables

### 1. Knowledge Lifecycle Enforcement
All knowledge retrieval paths now filter `.is("superseded_by", null)`:
- `listAlwaysInject()` — always-on context injection
- `listByCategory()` — SOP/category queries
- `listKnowledge()` — dashboard/export list
- `recallTextFallback()` — ILIKE text fallback

**Migration `20260712100000_phase5_knowledge_lifecycle.sql`:**
- `match_knowledge` RPC: added `superseded_by IS NULL` to WHERE clause
- `hybrid_knowledge_search` RPC: added `superseded_by IS NULL` to both FTS and vector CTEs + final join
- Re-revoked EXECUTE privileges after `CREATE OR REPLACE`

**Impact:** Superseded facts can never surface in retrieval. Old fact supersession removes it from context immediately.

### 2. Contact Identity Resolution Safety
**Problem:** `upsertPerson` used fuzzy ILIKE `%name%` partial matching that could merge unrelated contacts ("John" → "Johnson", "Ann" → "Annabelle").

**Fix:** Removed partial matching entirely. Now uses:
1. Exact name match (case-insensitive ILIKE without wildcards)
2. Exact alias match (JS-side)
3. If no match → create new person

**Impact:** Passive people extraction from messages will create new contacts instead of silently merging into existing ones with similar names. Dashboard explicit-create was already safe (always used exact match).

### 3. Knowledge Upsert with Contradiction Surfacing
**Problem:** When a knowledge fact was updated, the old value was silently overwritten. Users had no way to know they changed something.

**Fix:** `upsertKnowledge` now returns `UpsertResult`:
```typescript
interface UpsertResult {
  knowledge: KnowledgeRecord;
  previousValue?: string;  // old value if this was an update
  created: boolean;        // true if new row, false if update
}
```

The kb_add handler now surfaces contradictions:
- New fact: "จำไว้แล้วครับ 🧠 [category] key: value"
- Updated fact: "อัปเดตแล้ว 🧠 [category] key: value (เดิม: oldValue)"

The dashboard knowledge route also returns `previousValue` in the response.

### 4. Knowledge Content Hash
`upsertKnowledge` now computes SHA-256 content hash on `userId:category:key:value` for provenance tracking and future dedup capabilities. Previously `content_hash` was always `null`.

## Gates (2026-07-12T11:15 UTC)

| Gate | Result |
|------|--------|
| lint | ✅ PASS (0 errors, 0 warnings) |
| test | ✅ 213/213 PASS (15 files) |
| build | ✅ PASS (42 routes) |
| security | ✅ 0 high, 1 medium (pre-existing) |
| migration parity | 29 local / 28 cloud (1 pending push) |

## Deferred (Future Phases)

- **Chunking for long content:** Content >8000 chars is truncated for embedding. Full chunking with overlap requires a new `memory_chunks` table and is deferred to Phase 6 (Thai-First Retrieval).
- **Sources table:** Immutable source graph for grouping related memories/knowledge. Deferred — current `source_type` + `source_id` + `content_hash` columns provide sufficient provenance for single-user scale.
- **Inferred fact lifecycle:** Provisional/active/disputed/expired status column for inferred facts. Deferred until inference engine exists.

## Files Created
- `supabase/migrations/20260712100000_phase5_knowledge_lifecycle.sql`
- `tests/phase5-knowledge-quality.test.ts`

## Files Modified
- `src/lib/kb/repo.ts` — `superseded_by IS NULL` filters, `UpsertResult` return type, content hash
- `src/lib/people/repo.ts` — removed fuzzy partial matching from `upsertPerson`
- `src/lib/agent/handle.ts` — kb_add surfaces contradiction when updating
- `src/app/api/dashboard/knowledge/route.ts` — returns `previousValue`
- `AGENTS.md` — updated test count (213), migration count (29)
