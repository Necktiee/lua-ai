# Phase 6: Thai-First Retrieval And Evidence Packing — Evidence Report

**Date:** 2026-07-12T11:30 UTC
**Phase:** 6
**Status:** COMPLETE (code-complete; cloud migrations pending push)

## Phase 5 Audit + Bug Fixes

Before starting Phase 6, audited Phase 5 implementation for correctness.

### Bugs Found and Fixed

| # | Severity | File | Issue | Fix |
|---|----------|------|-------|-----|
| 2.1 | medium (doc) | `people/repo.ts:87` | Stale comment claimed "then partial" matching — Phase 5 removed this | Updated to "exact alias match" |
| 2.2 | medium (doc) | `people/repo.ts:9-17` | `createPerson` JSDoc claimed `upsertPerson` does "fuzzy partial matching" — now false | Updated to "exact name + exact alias matching" |
| 1.2 | high (logic) | `kb/repo.ts:255` | `recallKnowledgeHybrid` put `rrf_score` into `similarity`, then filtered by 0.3 — always failed (RRF scores ~0.005-0.04) | Separated `rrfScore` from `similarity` like memory's Phase 1 H1 fix |
| 1.6 | trivial | `kb/repo.ts:62` | Dead branch `oldRow.key !== args.key` always false (matched by unique constraint) | Simplified to value-only check |

## Phase 6 Implementation

### 6a: pg_trgm Trigram Index for Thai Lexical Search

**Migration:** `supabase/migrations/20260712120000_phase6_thai_retrieval.sql`

The existing `'simple'` FTS config splits on whitespace only — useless for Thai (scriptio continua, no inter-word spaces). Added `pg_trgm` extension as a third retrieval channel:

- `CREATE EXTENSION IF NOT EXISTS pg_trgm`
- GIN trigram indexes: `memory_trgm_idx`, `knowledge_key_trgm_idx`, `knowledge_value_trgm_idx`
- Updated `hybrid_memory_search` and `hybrid_knowledge_search` RPCs to add `trgm_results` CTE (3rd RRF channel)
- Trigram channel uses `similarity()` function + `%` operator for substring matching that works on Thai text
- Both RPCs DROP + CREATE (signature unchanged but body updated)
- EXECUTE privileges re-revoked after function recreation

**3-channel RRF fusion:** FTS (English/number/entity) + trigram (Thai substring) + vector (semantic)

### 6b: Thai Evidence Packer

**File:** `src/lib/agent/context.ts`

- Evidence items now carry source IDs: `[M1]`, `[M2]` for memory; `[K1]`, `[K2]` for knowledge
- Content-based dedup in `formatMemory` — catches near-duplicate memories with different IDs but overlapping content (first-100-char prefix check)
- Token budgets remain: `MAX_KB_ALWAYS_TOKENS=800`, `MAX_MEMORY_TOKENS=1500`
- Per-entry cap at 40% of budget (prevents single oversized SOP from crowding out all other knowledge)

### 6c: Embedding Model Drift Detection

**File:** `src/lib/embedding/jobs.ts`

- New `enqueueModelDriftCandidates(limit)`: scans for rows where `embedding_status='ok'` but `embedding_model` ≠ current `MODEL`
- Marks them `reindex` and enqueues embedding jobs
- Wired into `/api/cron/embed` route — runs BEFORE `processEmbeddingJobs` so drift candidates are picked up in the same tick
- Returns `driftDetected` count in response

### 6d: Citation Support in T0 Policy

- T0 security policy now instructs the LLM to cite source IDs when making factual claims about the owner
- `PROMPT_VERSION` bumped to `2026-07-12-v4`
- `evals/prompt-replay.json` updated to match

### 6e: Tests

**File:** `tests/phase6-thai-retrieval.test.ts` (9 tests)

- Migration file contains pg_trgm, gin_trgm_ops, trigram CTE, similarity function, revoke
- T0 policy mentions source IDs
- PROMPT_VERSION is `2026-07-12-v4`
- Drift detection function exists and is callable
- KB recallKnowledgeHybrid and recallKnowledge exist
- People repo comments no longer claim partial matching

## Verification Gates

| Gate | Result |
|------|--------|
| lint | PASS (0 errors, 0 warnings) |
| test | 222/222 PASS (16 files) |
| build | PASS (42 routes) |
| security | 0 high, 1 medium (pre-existing liff/page.tsx) |
| migration parity | 30 local / 28 cloud (2 pending push) |

## Files Created

- `supabase/migrations/20260712120000_phase6_thai_retrieval.sql`
- `tests/phase6-thai-retrieval.test.ts`
- `docs/evidence/PHASE-6-REPORT.md` (this file)

## Files Modified

- `src/lib/agent/context.ts` — source IDs, content dedup, T0 citation policy, PROMPT_VERSION bump
- `src/lib/kb/repo.ts` — rrfScore separation, dead branch fix
- `src/lib/people/repo.ts` — stale comments fixed
- `src/lib/embedding/jobs.ts` — model drift detection
- `src/app/api/cron/embed/route.ts` — drift detection wired in
- `evals/prompt-replay.json` — version update
- `AGENTS.md` — updated counts, architecture notes

## BLOCKED (external)

- `supabase db push` for 2 pending migrations (Phase 5 knowledge lifecycle + Phase 6 Thai retrieval)
- Live Thai retrieval benchmarks with representative corpus (needs seeded data on cloud DB)
