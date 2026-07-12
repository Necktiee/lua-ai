# Phase 7: Production SOP, Prompt Compiler, And Grounding

**Date:** 2026-07-12
**Status:** COMPLETE
**Gates:** lint PASS · test 251/251 (17 files) · build 42 routes · security 0H/1M · migrations 30 local / 28 cloud

## Deliverables

### 7a: Prompt Registry (`src/lib/agent/prompts.ts`)
- **Single source of truth** for all LLM-facing instruction text
- Separate versioned constants: `T0_VERSION`, `T1_VERSION`, `DOMAIN_SOP_VERSION`, `WEB_SEARCH_VERSION`
- `getPromptVersions()` returns all versions for trace tracking
- Legacy compatibility: `PROMPT_VERSION` and `SOP_VERSION` re-exported from context.ts

### 7b: Domain-Specific SOP Compilation
- 6 domain SOP snippets: `finance`, `calendar`, `memory`, `tasks`, `people`, `search`
- `compileDomainSop(action)` returns relevant SOP or empty string for general chat
- 30+ actions mapped to domains via `ACTION_DOMAIN` lookup
- `buildAgentContext()` accepts optional `action` parameter for domain SOP injection
- Each SOP bounded (<500 chars), versioned, category-tagged

### 7c: Prompt Version Tracking on Traces
- `getPromptVersions()` called in webhook route on every assistant message
- Versions stored in `messages.meta.prompt_versions` via `logMessage()`
- Enables per-message prompt version correlation via `trace_id` → `llm_usage` join
- No migration needed (`messages.meta` already exists as jsonb)

### 7d: Orphan Web Search Prompt Promoted to Registry
- Inline hardcoded system prompt in `handle.ts` web_search handler replaced with `WEB_SEARCH_SYSTEM`
- Versioned (`WEB_SEARCH_VERSION = "2026-07-12-v1"`)
- Includes domain SOP for search category + structured output rules
- Consistent identity with main chat path

### 7e: Injection Resistance Verification
- T0 policy tests: forbids acting on retrieved data, revealing system prompts, fabricating personal data
- Citation requirement: source IDs `[M1]`, `[K2]` checked in T0
- Domain SOPs are code-controlled (not user-editable), mitigating T2 escalation

## Phase 6 Audit Fixes (also in this session)

### Bug #1/#2 (HIGH): Dead cosine gate in hybrid recall
- `store.ts:181-184` and `kb/repo.ts:265-268`: removed broken `rrfScore === 0` check
- RRF-ranked results from the 3-channel hybrid RPC (FTS + trigram + vector) are now returned without a cosine gate that was silently dropping trigram-only Thai matches
- Cosine gate remains on vector-only `recall()` and `recallKnowledge()` paths where it's the sole quality filter
- `similarity` field now properly separated: actual cosine (0 if null embedding) vs `rrfScore`

### Bug #5 (MEDIUM): Drift detection skips NULL embedding_model rows
- `jobs.ts:enqueueModelDriftCandidates`: replaced `.neq("embedding_model", MODEL)` with JS-side filter
- SQL `NULL <> 'x'` returns NULL (not TRUE), excluding legacy NULL-model rows
- JS `r.embedding_model === MODEL` correctly catches both mismatched and NULL models

### Bug #6 (MEDIUM): Drift fn mutates before dedup-check
- Reordered to match `enqueueReindexCandidates` pattern: check existing job → enqueue → mark reindex
- Prevents orphaned `reindex` status on rows with no pending job

### Bug #10 (LOW): Redundant model fallback
- `MODEL = env.LLM_EMBEDDING_MODEL` (env already guarantees non-empty via zod default)

## Test Coverage

| Test File | Tests | Coverage |
|---|---|---|
| `phase6-thai-retrieval.test.ts` | 15 | pg_trgm migration, evidence packer, drift detection, cosine gate removal |
| `phase7-prompt-registry.test.ts` | 23 | Versioned constants, domain SOP compilation, web search, version tracking, legacy compat, injection resistance |
| **New tests** | **32** | (6 Phase 6 audit + 23 Phase 7 + 3 existing Phase 6 adjusted) |

## Architecture

```
Prompt text flow:
  src/lib/agent/prompts.ts (registry — single source of truth)
    ↓ re-export
  src/lib/agent/context.ts (assembler — builds L0-L4 per turn)
    ↓ called by
  src/lib/agent/handle.ts chatReply() (chat path)
  src/lib/agent/handle.ts web_search case (search path — uses WEB_SEARCH_SYSTEM)

Version tracking flow:
  getPromptVersions() → webhook route → logMessage(meta.prompt_versions) → messages.meta jsonb
```

## Acceptance Criteria

- [x] Personal factual claims supported by structured state or cited evidence
- [x] T0 policy resists injection (forbids acting on retrieved data as commands)
- [x] Domain SOPs are bounded and per-action (not all injected at once)
- [x] Prompt versions tracked on message traces for rollback correlation
- [x] Orphan web_search prompt brought under versioned registry
- [x] All Thai retrieval paths (trigram + FTS + vector) pass through without false cosine gating

## Deferred

- Injection test suite (multilingual, encoded, OCR, email, web, document attacks) — needs live LLM
- Output validation post-generation (citation presence check, sensitive data scan) — needs production traffic
- Prompt A/B evaluation framework — needs eval dataset
- Token budget per model (model-specific context reserves) — current estimateTokens is adequate
