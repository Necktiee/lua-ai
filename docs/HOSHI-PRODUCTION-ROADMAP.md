# Hoshi Production Roadmap

## Objective

Turn Hoshi into a high-trust Thai AI secretary that is correct, durable, secure, measurable and genuinely useful before adding broad autonomy

## Definition Of Production Ready

- No confirmed P0/P1 correctness or privacy blocker
- Duplicate/reordered LINE events produce exactly one business effect
- Every acknowledged event is durably processed or visible in dead-letter state
- Full lint/build/test/eval/ migration gates pass in CI
- Destructive target precision >= 99.5%; ambiguous target always asks
- RAG Recall@10 >= 0.90 and grounded-answer faithfulness >= 95%
- Zero unauthorized side effects in prompt-injection suite
- Routine p95 < 6s, RAG p95 < 12s, bounded workflow hard deadline < 45s
- Every request has route, retrieval, action and delivery trace
- Export, disconnect, retention and complete deletion are available
- Mobile LIFF meets WCAG AA basics and 44x44 touch targets

## Phase 0: Reproduce And Measure

### Deliverables

- Freeze baseline commit and production revision
- Resolve Windows `.tsbuildinfo` build failure; make `npm run build` deterministic
- Fix full lint: 3 errors and 6 warnings
- Add test scripts and CI skeleton
- Inspect external state: Vercel env/logs, QStash schedules, Supabase migration/grant/index/storage state, LINE webhook redelivery
- Create P0 regression fixtures before fixing code

### Documentation References

- `node_modules/next/dist/docs/` for Next.js 16.2.10 build/route/`after()` behavior
- LINE webhook/redelivery/content documentation
- Supabase migration/RLS/function privilege documentation

### Verification

- Fresh clone/install/build/lint succeeds twice on Windows and CI Linux
- Cloud migration list equals tracked migrations
- Schedule health check lists every intended route
- Baseline report includes latency, error, duplicate, null-embedding and orphan-object counts

### Anti-Pattern Guards

- Do not delete caches and call build fixed without reproducing root cause
- Do not trust local migration files as proof of cloud state
- Do not add features before P0 fixtures exist

## Phase 1: Correctness Hotfix Release

### Implement

1. Replace meeting brief relation UUID claim with text external-event claim
2. Canonical total ordering for todos; remove implicit index 1 mutation
3. Use `archived` for goal soft delete or intentionally migrate allowed statuses
4. Fix zero-row lexical fallback in memory and KB
5. Escape every people-note/context value
6. Separate explicit person create from fuzzy lookup/upsert
7. Fix Flex-to-plain-text fallback
8. Validate settings and parsed dates/times
9. Fix form success/error semantics and stale finance totals

### Reuse Existing Patterns

- Atomic claim/rollback: `src/lib/cron/dedup.ts`
- Ambiguous mutation guard: `src/lib/agent/handle.ts` todo update / people tier flows
- Zod config validation: `src/lib/env.ts`
- Partial-success disclosure: `src/lib/calendar/events.ts`

### Verification

- Integration test with non-UUID Google event sends one brief
- Tied todo order maps display item N to mutation item N
- Goal delete survives reload
- Null-embedding exact text is recalled
- Notes containing `</people>` remain inert data
- Failed create preserves form and shows Thai retry message

### Anti-Pattern Guards

- Do not patch symptoms only in UI; enforce invariant at repository/schema boundary
- Do not use first fuzzy match for write targets
- Do not claim success from a false/null repository result

## Phase 2: Durable Event And Side-Effect Core

### Implement

- `webhook_events` durable inbox with unique `webhookEventId`
- Worker claim lease, attempts, backoff and dead-letter state
- Mutation idempotency key: event ID + action + normalized target
- One absolute request/workflow deadline
- Link auto-reminders to todos; cancel/reschedule on lifecycle changes
- Urgent-email pending/sent claim with recovery lease
- Delivery state on assistant messages

### Verification

- Replay event 10 times concurrently: one business effect
- Kill worker after 200 response: eventual completion
- Crash after email claim: retry after lease, one notification
- Done/cancel/delete todo: zero active linked reminder
- Due update: exactly one reminder at new time

### Anti-Pattern Guards

- `after()` is not the durable queue
- Unique insert alone is not enough unless loser cannot continue side effects
- No per-provider retry may exceed global deadline

## Phase 3: Privacy And Trust Lifecycle

### Implement

- One-time session-bound OAuth nonce and atomic consume
- Google disconnect + revoke
- LINE unsend handling using source message IDs
- Attachment deletion outbox and orphan reconciliation
- Data export, retention settings and delete-account workflow
- Encrypt Google token values with a key outside the database
- Explicit RPC EXECUTE grants for service role only

### Verification

- Replayed/different-session OAuth state rejected
- Unsend removes/tombstones all derived records by policy
- Delete-account audit finds zero rows, embeddings, tokens and objects
- Database dump contains no usable Google refresh token
- anon/authenticated RPC execution denied

### Anti-Pattern Guards

- Database cascade does not delete Storage objects
- Signing reusable OAuth state is not equivalent to one-time state
- Never log tokens, authorization codes or raw private prompts

## Phase 4: Data Quality And Memory Foundation

### Implement

- Immutable source/document/chunk model
- Source idempotency, checksum and parser versions
- Embedding jobs with model/version/hash/status/retry
- Fact canonicalization and version lifecycle
- Provisional inferred facts with owner confirmation/expiry
- Contradiction detection and supersession
- Durable reindex and deletion jobs

### Verification

- 100% chunks/facts resolve to source/evidence span
- Embedding coverage >= 99.9%; failed jobs visible/retryable
- Duplicate external ID count zero
- Old superseded fact excluded immediately
- Correction searchable within one minute

### Anti-Pattern Guards

- Never mix embedding models/versions in one index without migration
- Never overwrite permanent facts without history
- Never treat model extraction as confirmed owner truth

## Phase 5: Hybrid RAG And Context Budget

### Implement

- Thai-oriented full-text index + existing pgvector search
- One hybrid RPC with RRF
- Structured entity/date/source filters
- Selective reranker for ambiguous/high-value retrieval
- Trust/freshness/validity adjustment
- Evidence packer with hard token budget
- Internal evidence IDs and user-facing citations where consequential

### Documentation References

- Supabase hybrid-search RRF pattern
- pgvector filtered HNSW guidance
- BEIR and Lost in the Middle research

### Verification

- Recall@10 >= 0.90; exact names/numbers/dates >= 0.95
- Precision@5 and nDCG@5 >= 0.85
- No stale/superseded fact in context
- Retrieval p95 < 750ms excluding embedding
- Maximum-size fuzz corpus never exceeds context budget

### Anti-Pattern Guards

- ILIKE is fallback, not hybrid search
- Cosine similarity is not factual confidence
- Do not rerank exact structured lookups or entire corpus
- Do not inject 40 priority-2 KB rows unconditionally

## Phase 6: Production SOP And Prompt System

### Implement

- Versioned T0 security policy, T1 product SOP, T2 owner preferences, T3 evidence
- Prompt compiler with token accounting and provenance envelopes
- Capability-accurate instructions: model cannot claim execution without result
- Prompt registry, release notes and rollback
- Eval replay required for prompt/SOP changes

### Verification

- Every trace stores prompt/policy/SOP version
- Retrieved instructions never authorize tools
- Personal fact unsupported by evidence causes abstention/clarification
- Prompt changes cannot ship if safety drops or core quality drops >1 point

### Anti-Pattern Guards

- XML is organization, not a security boundary
- User SOP cannot grant permissions or override security policy
- Do not optimize prompt prose before data/eval failures are measured

## Phase 7: Typed Multi-Step Agent

### Implement

- Atomic deterministic fast paths
- Structured route output validated by Zod
- Bounded `steps[]` planner for compound requests
- Policy/confirmation engine and pending actions
- Provider-neutral executor with typed results
- One optional replan after recoverable error

### Verification

- 100+ compound Thai requests; all requested steps represented
- Plan schema validity >= 95%
- Tool argument accuracy >= 99%
- Zero unauthorized/model-invented actions
- Risky actions execute zero writes before required confirmation
- Multi-step hard deadline < 45s

### Anti-Pattern Guards

- No unlimited ReAct loop
- No multi-agent architecture for ordinary CRUD
- No provider-specific tool API as the core contract
- No reclassification of a stored confirmation from scratch

## Phase 8: UX, Control And Accessibility

### Implement

- Per-section loading/error/offline/unauthorized states
- Write receipts, undo and explicit partial-failure feedback
- Reminder/proactive-control center with quiet hours
- Full settings UI and Google scope/disconnect UI
- Mobile nav: 4-5 primary items + More, safe-area support, 44px targets
- Thai `lang`, labels, keyboard focus, progress semantics and `aria-live`
- Provenance/correction drawer for KB/memory/journal
- Actionable LINE Flex postbacks

### Verification

- Physical iOS/Android test at 375/390/430 widths
- WCAG AA automated + keyboard/screen-reader smoke
- Failed write keeps input and offers retry
- Every destructive action names exact target and supports confirm/undo by risk

## Phase 9: Observability, SLOs And Release Engineering

### Implement

- End-to-end trace model from webhook to delivery
- Cost table per provider/model and daily soft/hard caps
- Retrieval/action/delivery dashboards
- CI: lint, build, unit, integration, migration, eval, security audit
- Preview deployment smoke, canary rollout and rollback runbook
- Backup/PITR restore drill and incident playbooks

### Verification

- Trace completeness >= 99%
- Useful-response availability >= 99.5%
- Provider fallback recovery >= 99% for one-provider outage
- Routine p95 < 6s; RAG p95 < 12s
- Restore drill meets documented RPO/RTO
- Production rollout auto-blocks on safety/eval regression

## Feature Roadmap After Production Core

### P1 High-Value Features

1. **Daily Command Center**: top 3 priorities, conflicts, urgent email, follow-ups and one suggested next action
2. **Reminder Control Center**: list/edit/cancel/snooze/quiet hours in LINE and LIFF
3. **Meeting Copilot**: pre-brief with participant tier, last interactions, open commitments and post-meeting action extraction
4. **Weekly Planning Loop**: reflection -> proposed weekly priorities -> owner accepts -> tasks/calendar/focus blocks
5. **Universal Write Receipt**: every mutation shows target/result and one-tap undo
6. **Privacy Center**: scopes, last sync, retention, export, disconnect and delete-all

### P2 Differentiating Features

1. **Commitment Ledger**: promises made by owner or others, due date, confidence and follow-up status
2. **Decision Journal**: decision, alternatives, rationale, assumptions and review date
3. **Relationship Radar**: contact tier, last interaction, promises, birthdays and suggested check-in; no silent autonomous outreach
4. **Focus Defense**: preferred/focus/blocked weekly schedule, meeting buffers and daily caps
5. **Travel Packet**: itinerary, documents, weather, checklists and time-sensitive reminders
6. **Document Inbox**: parse files into source-backed chunks, extract actions and preserve citations
7. **Correction Learning Loop**: categorize every correction as routing/data/retrieval/prompt/tool failure and add an eval case

### P3 Experiments

- Voice command with transcription then reclassification
- Read-only research sub-agent for meeting/company briefs
- Optional calendar slot negotiation drafts with explicit owner approval
- Local/on-device redaction before external model calls for selected sensitive data

## What To Defer

- Autonomous email sending
- Automatic external relationship outreach
- Payments or travel booking
- Arbitrary MCP/plugin marketplace
- Multi-user/team mode
- Microservices decomposition
- Fine-tuning before eval data proves a prompt/retrieval ceiling

## Prompt-To-Artifact Checklist

| Requirement | Artifact/Evidence |
|---|---|
| Audit everything current | `docs/HOSHI-PRODUCTION-AUDIT.md`; source-backed P0/P1, UX, security, ops boundaries |
| Best production secretary plan | This phased roadmap with gates, risks and verification |
| New feature ideas | Feature Roadmap section, prioritized by user outcome |
| KB/RAG design | `docs/HOSHI-AI-AGENT-ARCHITECTURE.md` data model + retrieval pipeline |
| SOP/system prompt | Trust levels T0-T3 + prompt contract + token budgets |
| Production AI agent | Typed bounded plan, deterministic executor, policy/confirmation, traces/evals |
| Garbage in, garbage out | Phase 4 source/provenance/confidence/version/contradiction lifecycle |
| Current real gates | Full lint failed; build blocked by `.tsbuildinfo` path issue; npm audit evidence in audit doc |
| Official/current research | Anthropic, Supabase, OpenAI, LINE, Next.js, OWASP, NIST and retrieval research references |

## Immediate Execution Order

1. Phase 0 baseline/CI
2. P0 meeting/todo/webhook/test blockers
3. P1 correctness/privacy hotfixes
4. Durable event core
5. Data quality foundation
6. Hybrid RAG and prompt compiler
7. Typed multi-step planner
8. UX/control/accessibility
9. Feature expansion
