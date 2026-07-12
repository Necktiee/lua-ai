# Phase 10 Feature Ranking

## Decision

Implement the Commitment Ledger first, in read-only recommendation mode.

## Ranking

| Feature | Owner pain | Data readiness | Risk | Evaluation | Decision |
| --- | --- | --- | --- | --- | --- |
| Commitment Ledger | High | Existing follow-ups, people, memory, and reminders | Low | Clear: overdue commitments resolved or dismissed | First |
| Meeting Copilot | High | Calendar, meeting notes, people | Medium | Preparation usefulness | Next |
| Decision Journal | Medium | Memory supports tagged evidence | Low | Review completion | Later |
| Focus Defense | Medium | Calendar exists, preferences incomplete | Medium | Conflict avoidance | Later |
| Relationship Radar | Medium | People tiers and follow-ups exist | Medium | Owner acceptance of suggested check-ins | Later |
| Travel Packet / Document Inbox | Variable | Attachments exist; extraction provenance incomplete | Medium | Task completion | Deferred |

## Safety Boundary

The ledger may recommend a follow-up, but cannot send a message, create a task, schedule a reminder, or change a calendar event without an explicit owner confirmation.

## Existing Assets

- `follow_ups` provides status, counterparty, deadline, and nudge state.
- `people` provides owner-controlled relationship tiers.
- `memory` provides source references and tags.
- `reminders` provides delivery scheduling.

## Gap

No persistent entity records whether a promise belongs to the owner or another party, its evidence, review date, outcome, or owner disposition. The next implementation adds that model and read-only recommendations.
