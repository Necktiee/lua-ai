# Hoshi Master Execution Plan

## Canonical English Brief

Audit Hoshi's current implementation from source code, database migrations, tests, production configuration, and live integrations. Then evolve it into a high-trust, production-grade Thai AI secretary that is exceptionally useful, accurate, proactive, secure, observable, and recoverable.

The system must excel at everyday secretary work: tasks, reminders, calendar, email triage, follow-ups, meetings, people, expenses, subscriptions, goals, journals, documents, decisions, research, briefings, and multi-step workflows. Add differentiated features only after the reliability foundation is proven.

Design KB, RAG, SOP, system prompts, memory, planning, and tool execution as one production AI-agent system. Apply the rule **garbage in, garbage out** at every stage: source ingestion, parsing, identity resolution, fact extraction, contradiction handling, indexing, retrieval, context packing, planning, execution, response grounding, evaluation, and correction.

Use deterministic code for authorization, policy, state transitions, idempotency, confirmations, and side effects. Treat models as untrusted interpreters, planners, extractors, rerankers, and writers. Do not use unrestricted autonomous loops.

Before implementing any uncertain or externally dependent work, research current official documentation and repository patterns. Record exact APIs, versions, constraints, and sources. Never invent an API or implement from memory when authoritative documentation is available.

All planning, implementation notes, and reports must be in English. Thai is appropriate for user-facing copy, Thai language evaluation data, and examples of real owner conversations.

## Current Starting Point

Verified strengths:

- Durable LINE webhook inbox, mutation idempotency, retries, dead-letter state, and stale lease recovery.
- Secure LIFF session, LINE signature verification, OAuth nonce, owner whitelist, encrypted Google tokens, and privacy workflows.
- Broad feature surface, deterministic repositories, cron dedup, timezone-aware scheduling, CI, migration parity, and clean build/test gates.
- Separate episodic memory and declarative KB, BGE-M3 embeddings, hybrid RRF retrieval, embedding jobs, context trust layers, and bounded planner scaffolding.
- Live local RAG fixtures currently pass three simple cases; public WCAG automation passes selected routes and widths.

Verified gaps and risks:

- R2 plan confirmation has no durable pending-action resume path.
- Thai PostgreSQL `simple` FTS is weak; current hybrid quality is not proven on representative Thai data.
- Hybrid RRF scores and cosine thresholds are conflated.
- Long artifacts are not chunked; provenance does not resolve every answer to source spans.
- Prompt/SOP changes lack a mature registry, broad replay corpus, and release gate.
- Several chat features lack complete lifecycle operations: reminders, recurring reminders, calendar update/delete, expense correction, goal lifecycle, subscriptions, journal editing/search, travel persistence.
- Relations schema is largely unused; generic UUID edges lack strong referential integrity.
- Rate limits are instance-local or absent at HTTP boundaries; no production queue/dead-letter control center exists.
- Hybrid RPC grants, `llm_usage` RLS, repair constraints, TTL cleanup, trace indexes, and ephemeral-table retention need live verification and hardening.
- No representative Thai route/retrieval/grounding/injection corpus proves production intelligence.
- PITR restore, authenticated LIFF accessibility, and preview canary still require real external execution evidence.

Existing evidence:

- `docs/HOSHI-PRODUCTION-AUDIT.md`
- `docs/HOSHI-AI-AGENT-ARCHITECTURE.md`
- `docs/HOSHI-PRODUCTION-ROADMAP.md`
- `docs/HOSHI-GAP-ANALYSIS.md`
- `docs/BASELINE-REPORT.md`

These documents are evidence, not current truth. Revalidate source and live state before each phase.

## Execution Contract For Weaker Models

Each phase is a separate session and a separate goal. Never execute multiple phases in one context.

Start each phase with this exact command, replacing the text:

```text
/goal <phase objective and measurable completion criteria>
```

Then follow this protocol:

1. Read `AGENTS.md`, this plan, the referenced source files, and relevant prior phase evidence.
2. Inspect `.codegraph/`; if present, use CodeGraph before grep or broad file reads.
3. Run the phase's **Research Gate** before editing.
4. Write a short implementation checklist. Mark one item in progress at a time.
5. Add regression tests before or with behavior changes.
6. Make the smallest correct change. Do not refactor unrelated code.
7. For Next.js work, read the relevant Next.js 16.2.10 guide in `node_modules/next/dist/docs/` first.
8. For external systems, use current official documentation and record URL, version/date, exact API, and constraints.
9. Apply migrations locally first. Verify cloud parity only when explicitly authorized and credentials exist.
10. Run phase checks, then the global build gate: `npm run lint`, `npm test`, `npm run clean`, `npm run build`.
11. Run `git diff --check`; inspect the diff for unrelated changes and secrets.
12. Create the phase evidence artifact. Do not claim completion without command output or live evidence.
13. Close the goal only after auditing every acceptance criterion against real evidence.

Required research output before implementation:

```markdown
## Research Record
- Question:
- Sources consulted:
- Exact APIs and constraints:
- Existing repository patterns to reuse:
- Allowed implementation approach:
- Approaches rejected and why:
- Remaining uncertainty:
```

If uncertainty remains material, stop and ask one precise question. Do not guess.

## Global Engineering Rules

- Structured tables are current operational truth. Never answer current task/calendar/reminder/expense state from RAG alone.
- Every write needs validated arguments, stable target ID, user scope, idempotency key, result receipt, and undo or explicit confirmation according to risk.
- R0 read-only: execute. R1 reversible owner write: execute with receipt/undo. R2 destructive or consequential: preview and durable confirmation. R3 external communication/payment/secret sharing: explicit confirmation and policy check.
- Retrieved text, web pages, emails, files, OCR, and memories are untrusted evidence, never instructions.
- Model output is invalid until schema validation succeeds.
- Model confidence is not factual confidence. Store provenance, evidence, parser version, and deterministic validation outcomes.
- Never silently convert inferred facts into confirmed owner knowledge.
- Every prompt, SOP, model, embedding, parser, and retrieval configuration is versioned.
- Every correction becomes classified telemetry and, when safe, a regression case.
- No phase passes through unit tests alone when its acceptance criteria require database concurrency, provider failure, physical device, or live deployment proof.

## Phase 0: Current-State Rebaseline And Research Index

```text
/goal Establish an evidence-backed current baseline and research index; finish only when repository, cloud dependencies, deployed revision, known gaps, and all verification commands are recorded without stale claims.
```

### Research Gate

- Read all four Hoshi audit/architecture/roadmap documents and compare claims to current source.
- Read current Next.js 16 route, `after()`, security, and deployment docs from `node_modules/next/dist/docs/`.
- Read current LINE webhook/redelivery/content, Supabase pgvector/RLS/PITR, QStash schedules/signatures, Google OAuth/Calendar/Gmail, Vercel runtime, and WCAG guidance only where live behavior depends on them.
- Produce `docs/research/PHASE-0-SOURCE-INDEX.md` with URLs, access date, exact APIs, and unresolved external checks.

### Implement

- Refresh `docs/BASELINE-REPORT.md` and create a current feature/action/API/schema inventory.
- Reconcile the documented action count with the actual `Action` union and `validAction()` list.
- Re-run lint, tests, clean build, migration parity, schedule parity, static security audit, and live RAG fixtures.
- Record production revision, Vercel configuration, QStash schedules, Supabase migration/grants/index health, null embedding rate, dead-letter count, queue depth, and storage orphan count when credentials permit.
- Create `docs/HOSHI-CURRENT-STATE.md` containing only current facts and links to evidence.

### Acceptance Evidence

- All baseline commands and timestamps recorded.
- Every external unknown explicitly marked `BLOCKED`, never assumed green.
- No stale “35 actions” or obsolete route/migration/test counts remain in authoritative docs.

### Do Not

- Do not modify product behavior in this phase.
- Do not trust migration files as proof of cloud grants or constraints.

## Phase 1: Correctness And Security Closure

```text
/goal Remove all confirmed correctness and security defects that can cause wrong actions, broken workflows, unauthorized access, invalid schema state, or misleading success; finish with regression tests and live schema verification.
```

### Research Gate

- Verify current Postgres/Supabase function privilege behavior, RLS policy semantics, constraint repair syntax, and recommended index patterns.
- Re-read planner confirmation, recall regex handling, calendar errors, people matching, and dashboard destructive paths in current source.
- Build a P0/P1 defect ledger with reproduction, expected invariant, and test type.

### Implement

- Add durable `pending_actions` state with expiry, normalized arguments, target IDs, risk level, source request, policy version, and idempotency key.
- Resume confirmation from stored state; never reclassify `ยืนยัน` from scratch.
- Escape user-derived regular expressions in recall/project parsing.
- Separate calendar authentication errors from network, validation, conflict, and provider failures.
- Revoke `hybrid_memory_search` and `hybrid_knowledge_search` from public/anon/authenticated; explicitly grant only required role.
- Replace wide-open `llm_usage` access with service-role-only policy or appropriate ownership model.
- Add missing `embedding_status` constraints safely on both memory and knowledge.
- Add trace indexes where query plans justify them; remove provably redundant indexes only after `EXPLAIN` evidence.
- Add TTL cleanup for OAuth nonces, mutation keys, completed webhook events, completed embedding jobs, expired undo tokens, and cron marker rows.
- Add HTTP rate limiting for LIFF verification and dashboard mutations; treat LINE signature verification and owner whitelist as access controls, not rate limits.

### Acceptance Evidence

- R2 plan preview causes zero writes; valid confirmation executes once; expired/replayed confirmation executes zero writes.
- Malformed project names such as `C++`, `[test]`, and `node.js` cannot throw.
- anon/authenticated cannot call private RPCs or read/write `llm_usage`.
- Rate limit works across at least two server instances or simulated workers.
- Security, concurrency, and migration tests pass locally; linked cloud grants/constraints recorded when authorized.

### Do Not

- Do not use in-memory counters as the production distributed rate limiter.
- Do not weaken RLS because service-role currently bypasses it.

## Phase 2: Operations, Recovery, And Observability

```text
/goal Make every acknowledged event, background job, scheduled push, and external call observable, recoverable, and operable; finish with queue controls, complete traces, alerts, and verified recovery drills.
```

### Research Gate

- Research OpenTelemetry conventions for serverless traces, Vercel observability limits, QStash failure callbacks, Supabase PITR, and privacy-safe structured logging.
- Map current trace propagation from webhook through classifier, retrieval, action, LLM, and LINE delivery.

### Implement

- Propagate one trace ID through webhook, messages, LLM usage, retrieval, actions, jobs, and delivery.
- Add structured spans and error classes without raw private content.
- Add admin/operator endpoints or a protected dashboard for queue depth, dead letters, failed embeddings, cron health, provider health, costs, and retry actions.
- Add a real readiness endpoint that checks critical dependencies with bounded timeouts; keep liveness cheap and side-effect free.
- Split overloaded daily cron responsibilities when measured duration or failure isolation justifies it.
- Add circuit breakers/backoff for widespread provider failures.
- Add logout and session revocation flow.
- Execute and record PITR restore drill, preview canary, production rollback rehearsal, and authenticated LIFF WCAG audit.

### Acceptance Evidence

- Trace completeness >= 99% on a representative fixture run.
- Dead-letter item is visible, safely replayable, and cannot duplicate a completed mutation.
- Provider outage test returns useful degraded behavior and does not create retry storms.
- PITR evidence includes RPO, RTO, restored row checks, and destruction of temporary project.
- Canary and authenticated WCAG evidence link to exact commit/deployment.

### Do Not

- Do not expose admin data through public health endpoints.
- Do not log raw prompts, email bodies, tokens, OAuth codes, or attachment contents by default.

## Phase 3: Complete Core Secretary Lifecycles

```text
/goal Make every core secretary entity fully manageable through safe conversational and LIFF workflows; finish when create, read, update, cancel/archive/delete, undo, and failure recovery are coherent across chat and dashboard.
```

### Research Gate

- Inventory every entity and operation across router, dispatch, repositories, dashboard APIs, LIFF UI, Flex messages, schema, and tests.
- Research Google Calendar recurring-event update/delete semantics and QStash schedule cancellation before implementation.

### Implement

- Reminders: list, edit, cancel, snooze, recurring rules, timezone-safe next occurrence.
- Calendar: update, delete, recurring scope, attendee/location management, explicit external-impact confirmation.
- Expenses: correct amount/category/date/currency, receipt linkage, budgets, alerts, export.
- Subscriptions: edit, cancel, renewal reminders, price history.
- Goals: pause/resume/complete/archive/edit, milestones, streaks, trend history.
- Journal: manual add/edit, search, mood/energy fields, weekly/monthly synthesis with provenance.
- Follow-ups: edit, snooze, update log, reopen, optional evidence-based auto-close proposal.
- Travel: persistent trip entity, checklist completion, itinerary, documents, weather, timed reminders.
- Add interactive LINE Flex postbacks for frequent safe actions.
- Ensure chat and dashboard call the same repository invariants and return universal write receipts.

### Acceptance Evidence

- Entity-operation matrix has no unexplained lifecycle gap.
- Every destructive action names exact target and follows R0-R3 policy.
- Chat mutation is visible in dashboard and dashboard mutation is reflected in chat state.
- Timezone, DST, recurrence, duplicate callback, and partial external failure tests pass.

### Do Not

- Do not create separate business rules for chat and dashboard.
- Do not claim external Calendar/Gmail success before provider confirmation.

## Phase 4: Agent Core Modularization And Fast Routing

```text
/goal Reduce latency and maintenance risk while preserving behavior by modularizing agent execution and adding evidence-backed deterministic fast paths; finish with parity tests and no routing-quality regression.
```

### Research Gate

- Measure classifier latency/cost and identify only high-precision command patterns.
- Read existing handler boundaries and dynamic-import behavior; benchmark before changing imports.
- Research structured-output support for every active provider; retain provider-neutral schemas.

### Implement

- Split the monolithic dispatch into typed per-domain handlers behind one registry.
- Define one Zod schema per action and one canonical action metadata registry containing risk, mutation status, capability text, and handler.
- Generate `validAction`, help inventory, planner allowlist, and capability checks from the registry where practical.
- Add deterministic fast paths only for commands with measured precision >= 99.5%; send ambiguous requests to model routing.
- Add route confidence/ambiguity signals and clarification behavior.
- Cache per-request settings/timezone and remove duplicate imports/formatters without changing semantics.
- Preserve dynamic loading where cold-start benchmarks show benefit.

### Acceptance Evidence

- Existing routing corpus has no safety regression and <=1 percentage-point quality regression.
- Fast-path precision >= 99.5%; measured p50 latency and cost improve.
- Registry parity test proves every action has schema, handler, risk, help entry, and eval coverage.
- `handle.ts` becomes orchestration-focused rather than a feature implementation file.

### Do Not

- Do not replace the switch with an unrestricted framework or model-driven tool discovery.
- Do not optimize imports without cold-start measurements.

## Phase 5: Source, Artifact, And Knowledge Quality Foundation

```text
/goal Build a provenance-first ingestion and knowledge lifecycle so bad, stale, duplicate, inferred, or contradictory data cannot silently become trusted context; finish when every active fact and chunk resolves to immutable source evidence.
```

### Research Gate

- Research current document parsers, MIME safeguards, malware scanning options, Thai segmentation, embedding model versioning, and Supabase Storage lifecycle.
- Compare a normalized source/document/chunk/fact schema against current memory/knowledge tables and migration risk.

### Implement

- Add immutable `sources`, `documents`, `chunks`, and versioned embedding records.
- Store source trust, external ID, immutable hash, parser version, language, timestamps, sensitivity, status, and storage path.
- Chunk by document structure and Thai-aware boundaries with overlap; preserve page/section/time spans.
- Add canonical facts and fact versions with provisional/active/disputed/superseded/expired states.
- Detect contradictory values for the same canonical key; ask owner before activation when required.
- Keep inferred facts provisional with confidence components and expiry.
- Add durable parse/index/reindex/delete jobs and orphan reconciliation.
- Implement contact identity resolution and merge workflow; never merge by first substring match.

### Acceptance Evidence

- 100% sampled facts/chunks resolve to source and exact span.
- Duplicate source ingestion produces one active source graph.
- Old fact supersession removes it from retrieval immediately.
- Parser or embedding version change creates a visible, resumable migration job.
- Deleting a source removes or tombstones all derived artifacts according to retention policy.

### Do Not

- Do not overwrite facts without history.
- Do not embed only the first 8,000 characters of long documents as the retrieval representation.

## Phase 6: Thai-First Retrieval And Evidence Packing

```text
/goal Deliver representative Thai retrieval that reliably finds exact entities, dates, numbers, decisions, and semantic context while excluding stale or untrusted evidence; finish only after labelled eval thresholds and latency budgets pass.
```

### Research Gate

- Benchmark `pg_trgm`, bigram approaches, external Thai tokenization, current BGE-M3 behavior, and reranker candidates on real Thai queries.
- Verify Supabase extension availability before choosing database extensions.
- Build a labelled corpus from anonymized real patterns plus adversarial synthetic cases before tuning.

### Implement

- Separate lexical, semantic, exact-entity, temporal, and structured retrieval channels.
- Fix RRF/cosine score semantics; never compare RRF score to cosine threshold.
- Apply filters before ranking: user, source, status, validity, date, type, sensitivity, and trust.
- Fuse channels with tunable RRF weights learned from evals.
- Add selective reranking only for ambiguous or high-value queries.
- Add trust/freshness/validity adjustment and contradiction surfacing.
- Build token-aware Thai evidence packer with dedup, diversity, source IDs, and hard budgets.
- Return citations for consequential answers and expose provenance in LIFF.
- Add embedding-model drift detection and automatic reindex candidates.

### Acceptance Evidence

- Representative corpus: Recall@10 >= 0.90 overall and >= 0.95 for names, numbers, and dates; Precision@5 and nDCG@5 >= 0.85.
- No expired/superseded fact in final context.
- Retrieval p95 < 750ms excluding external embedding, or documented revised budget with evidence.
- Thai exact phrase, unspaced text, typo, mixed Thai-English, temporal, and contradiction cases pass.

### Do Not

- Do not call whitespace-only PostgreSQL FTS “Thai hybrid search” without benchmark evidence.
- Do not use one global similarity threshold for all query types.

## Phase 7: Production SOP, Prompt Compiler, And Grounding

```text
/goal Create a versioned, capability-accurate prompt and SOP system that grounds every personal claim, resists untrusted instructions, fits hard budgets, and can be safely evaluated, released, and rolled back.
```

### Research Gate

- Research current official guidance from active model providers on system instructions, structured outputs, prompt caching, and injection resistance.
- Map every real capability and failure mode from the action registry. Remove aspirational prompt claims.
- Analyze eval failures before editing prompt prose.

### Implement

- Build a prompt registry with separate versions for T0 policy, T1 product SOP, domain SOPs, style, and output schema.
- Compile request-specific prompts rather than injecting all SOPs and state.
- T0: security, owner isolation, authorization, evidence-as-data, no fabricated personal facts/results, abstention.
- T1: domain workflows, ambiguity, partial success, corrections, LINE limits, and risk behavior.
- T2: owner-confirmed preferences only; prevent capability escalation.
- T3: evidence envelopes with IDs, source, trust, timestamp, validity, and quoted content.
- Add accurate token accounting for Thai and model-specific limits.
- Add output validation for grounded claims, action-result wording, citations, and sensitive-data policy.
- Store prompt/SOP/model/retrieval versions on traces and maintain release notes/rollback.

### Acceptance Evidence

- Personal factual claims are supported by structured state or cited evidence; unsupported claims abstain or ask.
- Injection suite has zero unauthorized side effects across direct, indirect, multilingual, encoded, OCR, email, web, and document attacks.
- Prompt change cannot merge if safety drops or core quality drops >1 percentage point.
- Maximum context fixtures remain inside budget with response reserve.

### Do Not

- Do not treat XML tags as a security boundary.
- Do not solve retrieval defects by adding stronger prompt language.

## Phase 8: Bounded Multi-Step Intelligence

```text
/goal Make Hoshi reliably complete bounded multi-step secretary workflows with typed plans, dependencies, durable confirmation, partial-success handling, and exactly-once effects; finish after compound-request and failure-injection gates pass.
```

### Research Gate

- Research provider-neutral structured planning, saga/compensation patterns, and confirmation UX.
- Enumerate safe parallel steps, dependencies, reversible writes, and irreversible external effects.

### Implement

- Plan schema: IDs, allowlisted action, typed arguments, stable target, dependencies, risk, idempotency key, expected result, and compensation metadata.
- Maximum five steps, one optional replan, one absolute deadline, no recursive planning.
- Validate complete dependency graph and reject cycles, invented tools, missing arguments, or unresolved targets.
- Execute independent read-only steps in parallel only when safe; serialize dependent mutations.
- Store plan and pending confirmation durably.
- Return precise step receipts, partial success, failed step, retry safety, and rollback/compensation status.
- Add correction path that edits stored plan rather than restarting from raw text.

### Acceptance Evidence

- 100+ representative Thai compound requests include every requested step.
- Plan schema validity >= 99%; tool argument accuracy >= 99%.
- Destructive target precision >= 99.5%; zero writes before required confirmation.
- Duplicate confirmation and webhook replay create exactly one effect.
- Failure after step N yields accurate partial-success receipt and safe retry behavior.

### Do Not

- Do not add unrestricted ReAct loops, arbitrary tools, recursive agents, or model-selected permissions.

## Phase 9: World-Class Product Experience

```text
/goal Make Hoshi effortless and trustworthy on LINE and LIFF, with clear state, fast common actions, accessibility, privacy controls, provenance, and recovery; finish after physical-device and owner workflow validation.
```

### Research Gate

- Conduct owner workflow interviews or structured walkthroughs for daily, weekly, meeting, finance, travel, and correction journeys.
- Review LINE Flex/Postback and LIFF current guidance, WCAG 2.2 AA, mobile safe areas, and Thai UX writing.

### Implement

- Daily command center: top three priorities, conflicts, urgent mail, commitments, and one justified next action.
- Unified inbox for reminders, follow-ups, commitments, failed jobs, and confirmation requests.
- Provenance/correction drawer for facts, memories, journal synthesis, and recommendations.
- Clear loading, offline, empty, unauthorized, partial-failure, retry, and undo states.
- Four-to-five primary mobile navigation destinations plus More; 44px targets and safe-area support.
- Complete settings/privacy center: timezone, schedules, quiet hours, scopes, sync status, retention, export, logout, disconnect, delete.
- Progressive disclosure: simple default, deep controls available without clutter.
- Thai-first natural copy; English where technically clearer.

### Acceptance Evidence

- Physical iOS and Android testing at 375/390/430 widths.
- Automated WCAG AA plus keyboard and screen-reader smoke on authenticated UI.
- Owner completes top ten workflows without operator help.
- Failed writes preserve input and provide safe retry.
- Every recommendation can show “why” and supporting evidence.

### Do Not

- Do not hide errors as empty data.
- Do not add visual polish that obscures action state or provenance.

## Phase 10: Differentiating Secretary Intelligence

```text
/goal Add the highest-value proactive intelligence that makes Hoshi meaningfully better than generic assistants while preserving owner control, evidence, and measured usefulness.
```

### Research Gate

- Rank candidate features by owner pain, frequency, time saved, data readiness, risk, and evaluation feasibility.
- Prototype in read-only recommendation mode before enabling writes.

### Feature Order

1. **Commitment Ledger**: promises by owner or others, evidence, due date, status, and follow-up loop.
2. **Meeting Copilot**: participant context, commitments, agenda, decision capture, post-meeting actions, and follow-up drafts.
3. **Decision Journal**: decision, options, rationale, assumptions, evidence, review date, and outcome learning.
4. **Focus Defense**: focus blocks, meeting buffers, daily caps, conflict warnings, and proposed rescheduling.
5. **Weekly Planning Loop**: reflection, proposed priorities, owner approval, then typed creation of tasks and focus blocks.
6. **Relationship Radar**: last interaction, commitments, birthdays, tier, and suggested check-in; never autonomous outreach.
7. **Document Inbox**: cited extraction, summaries, actions, dates, decisions, and searchable original spans.
8. **Travel Packet**: itinerary, documents, timezone shifts, weather, checklists, and time-sensitive alerts.
9. **Personal Operating Rhythm**: learn confirmed working patterns, energy windows, briefing format, and recurring routines.
10. **Correction Learning Loop**: classify corrections as data, identity, routing, retrieval, SOP, planning, execution, or UI failures and create eval candidates.

### Acceptance Evidence

- Each feature has a measurable user outcome and opt-out.
- Recommendation acceptance, correction, dismissal, and time-saved metrics are recorded.
- No proactive write or external message occurs without policy-appropriate approval.
- Features that fail usefulness thresholds remain experiments or are removed.

### Do Not

- Defer autonomous email sending, outreach, payment, booking, arbitrary plugins, team mode, and multi-agent orchestration until evidence justifies risk.

## Phase 11: Production Certification And Continuous Improvement

```text
/goal Certify Hoshi against correctness, safety, retrieval, grounding, latency, availability, cost, accessibility, privacy, recovery, and owner usefulness gates; finish only when all mandatory evidence is green or explicitly waived by the owner with documented risk.
```

### Research Gate

- Review current OWASP GenAI guidance, NIST AI RMF GenAI profile, provider safety guidance, dependency advisories, LINE/Google policy changes, and Supabase/Vercel operational recommendations.

### Implement

- CI gates: lint, clean build, unit, integration, database, migration parity, routing, retrieval, grounding, injection, planner, idempotency, security, accessibility, and canary smoke.
- Versioned eval datasets with anonymization and review process.
- SLO dashboards and error budgets for route, retrieval, execution, delivery, and provider health.
- Prompt/model/retrieval canary with rollback on safety or quality regression.
- Monthly restore, dead-letter, secret rotation, dependency, cost, and access review schedules.
- Owner feedback loop and quarterly feature pruning.

### Acceptance Evidence

- No open P0/P1 correctness, privacy, or security defect.
- Useful-response availability >= 99.5%.
- Duplicate events produce exactly one business effect.
- Destructive target precision >= 99.5%.
- Personal fact hallucination < 0.5%, target zero.
- Grounded claim faithfulness >= 95%.
- Prompt injection causes zero unauthorized side effects.
- Routine p95 < 6s; RAG p95 < 12s; bounded multi-step p95 < 25s, unless revised by owner-approved evidence.
- Trace completeness >= 99%.
- Retrieval metrics from Phase 6 remain green.
- WCAG AA and physical-device checks pass.
- PITR restore and rollback drills meet documented RPO/RTO.
- Daily cost stays within owner-approved soft/hard caps.

### Do Not

- Do not certify from unit tests alone when a gate requires live deployment, concurrency, provider failure, physical-device, or restore evidence.
- Do not waive a mandatory gate silently; record owner, reason, risk, expiry, and remediation date.

## Phase Evidence Template

Every phase creates `docs/evidence/PHASE-N-REPORT.md`:

```markdown
# Phase N Evidence

## Goal
Exact `/goal` text.

## Research
Sources, versions, exact APIs, decisions, and remaining uncertainty.

## Changes
Files, migrations, behavior, and rationale.

## Tests
Commands, outputs, fixtures, live checks, and timestamps.

## Acceptance Criteria
- [ ] Criterion with evidence link

## Security And Privacy Review
Threats considered, data exposure, grants, logging, and deletion behavior.

## Performance And Cost
Before/after latency, tokens, calls, and cost.

## Rollback
Code, migration, prompt, model, and operational rollback steps.

## Known Gaps
Anything not proven, marked BLOCKED or DEFERRED.
```

## Final Priority Order

1. Rebaseline current truth.
2. Close correctness/security defects and durable confirmation.
3. Complete observability, recovery, and external production drills.
4. Complete every core secretary lifecycle.
5. Modularize agent core and add measured fast paths.
6. Build provenance-first source/chunk/fact foundation.
7. Prove Thai-first retrieval and evidence packing.
8. Build versioned SOP/prompt/grounding system.
9. Prove bounded multi-step intelligence.
10. Deliver world-class LINE/LIFF experience.
11. Add differentiated proactive intelligence.
12. Certify continuously against production gates.

Quality order is intentional: **data quality -> retrieval quality -> prompt quality -> planning quality -> autonomy**.
