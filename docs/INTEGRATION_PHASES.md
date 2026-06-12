# Blackbox Integration Phases

## How To Use This Roadmap

This roadmap divides Blackbox into small, verified integration slices. Work may
start only when the owner changes a phase status to `approved`. Once work starts,
its status becomes `in-progress`. A phase becomes `complete` only after all exit
criteria pass and the owner accepts the result.

Allowed statuses:

- `not-approved`: Defined but implementation may not start.
- `approved`: Owner has authorized implementation.
- `in-progress`: Authorized work is underway.
- `blocked`: Approved work cannot proceed; the reason is recorded.
- `complete`: Tests and exit criteria pass and the owner accepted the phase.

Agents may recommend status changes but may not approve a phase or accept its
completion on the owner's behalf. Later phases remain blocked by incomplete
prerequisites even if their status is accidentally changed.

## Global Rules

- Each phase must stay inside its listed deliverables and exclusions.
- Required tests must run in CI before a phase can be accepted.
- Architectural deviations require owner approval and a decision-log entry before
  implementation.
- A completed phase must leave the repository buildable, testable, documented, and
  usable as described by that phase.
- Discoveries that invalidate a later phase must update this roadmap before that
  later phase is approved.

## Phase 1: Documentation Approval

**Status:** `complete`

**Objective:** Establish and approve the project purpose, V1 boundary, architecture,
security posture, reliability guarantees, and gated implementation roadmap.

**Prerequisites:** None.

**Deliverables:**

- Human-readable project definition in `docs/PROJECT.md`.
- Compact agent contract in `AGENTS.md`.
- Reviewable integration roadmap in this document.
- Concise repository landing page in `README.md`.

**Exclusions:** Application code, workspace scaffolding, dependencies, CI, runtime
configuration, deployment files, and implementation migrations.

**Test requirements:**

- Manually verify links between all documentation files.
- Review terminology and decisions for consistency.
- Confirm every implementation phase includes all required fields and a gate.

**Exit criteria:**

- The owner understands and approves the scope, architecture, reliability rules,
  security rules, and phase roadmap.
- All review corrections are incorporated.
- The owner marks this phase `complete`.
- The owner separately marks Phase 2 `approved` before workspace work starts.

**Owner approval gate:** Documentation may be drafted without approval. No work
from Phase 2 or later may begin until this phase is `complete` and that phase is
explicitly `approved`.

## Phase 2: Workspace Foundation

**Status:** `complete`

**Objective:** Create a reproducible NestJS monorepo foundation and local
infrastructure without implementing product capabilities.

**Prerequisites:** Phase 1 is `complete`.

**Deliverables:**

- pnpm workspace with API, worker, example app, and planned shared packages.
- NestJS application entry points and module boundaries.
- TypeScript, linting, formatting, unit-test, integration-test, and build commands.
- CI quality gates and validated environment configuration.
- Local Docker Compose services for PostgreSQL and Redis.
- Initial Prisma setup and a documented path for reviewed SQL migrations.
- API liveness and dependency-readiness endpoints.

**Exclusions:** User authentication, domain entities, telemetry ingestion, SDK
collection, alerting, and notifications.

**Test requirements:**

- Clean install, lint, type-check, unit-test, and build pass in CI.
- API and worker start with valid local configuration.
- Invalid required server configuration fails fast.
- Readiness accurately reflects PostgreSQL and Redis availability.

**Exit criteria:**

- A new contributor can start the workspace from documented commands.
- CI and local checks pass from a clean checkout.
- Package boundaries match `docs/PROJECT.md`.
- The owner accepts the foundation and marks the phase `complete`.

**Owner approval gate:** The owner must set this phase to `approved` before any
workspace files or dependencies are added.

## Phase 3: Identity And Project Control Plane

**Status:** `complete`

**Objective:** Provide secure local identity, team isolation, project ownership,
environments, and revocable SDK credentials.

**Prerequisites:** Phase 2 is `complete`.

**Deliverables:**

- Local email/password registration and authentication with secure sessions.
- Team memberships and `owner`, `admin`, `member`, and `viewer` authorization.
- Project and environment management APIs.
- One-time display, hashed storage, listing metadata, and revocation for ingest keys.
- Prisma migrations and OpenAPI contracts for this phase.

**Exclusions:** Team invitations, password recovery, telemetry acceptance, SDK
collection, rules, incidents, and notifications.

**Test requirements:**

- Unit tests for permission rules and credential lifecycle.
- Integration tests for authentication, sessions, and ingest-key hashing/revocation.
- End-to-end tests proving team data isolation and role enforcement.

**Exit criteria:**

- No API can access another team's data through identifier substitution.
- Plaintext passwords and ingest keys never persist or appear in logs.
- OpenAPI describes all delivered endpoints.
- The owner accepts the control plane and marks the phase `complete`.

**Owner approval gate:** The owner must approve the identity model, session model,
and endpoint contract before implementation starts.

## Phase 4: Heartbeat Vertical Slice

**Status:** `complete`

**Objective:** Deliver the first complete SDK-to-API-to-worker-to-storage-to-query
flow and infer missing-heartbeat incidents.

**Prerequisites:** Phase 3 is `complete`.

**Deliverables:**

- Minimal public SDK module configuration and heartbeat scheduling.
- Versioned, authenticated, validated, idempotent batch ingestion.
- Durable BullMQ processing and heartbeat persistence.
- Bounded heartbeat query API.
- Missing-heartbeat rule, incident opening, deduplication, and recovery resolution.
- SDK fail-open behavior, bounded in-memory buffering, and controlled diagnostics.

**Exclusions:** Process metrics, logs, error capture, user-configurable non-heartbeat
rules, and notification delivery.

**Test requirements:**

- SDK unit tests for scheduling, buffering, retries, shutdown, and fail-open behavior.
- Integration tests for batch validation, authentication, durable enqueue,
  idempotency, persistence, and query bounds.
- End-to-end tests for heartbeat receipt, missing-heartbeat incident creation,
  duplicate prevention, and automatic resolution.

**Exit criteria:**

- The example app reports heartbeats without monitoring failures affecting it.
- Duplicate deliveries cannot duplicate stored heartbeats or active incidents.
- Missing-heartbeat behavior is accurately described as inferred downtime.
- The owner accepts the vertical slice and marks the phase `complete`.

**Owner approval gate:** The owner must approve heartbeat timing, tolerance,
payload contract, and SDK configuration contract before implementation starts.

## Phase 5: Process Metrics Vertical Slice

**Status:** `not-approved`

**Objective:** Add reliable process health metrics from collection through bounded
querying.

**Prerequisites:** Phase 4 is `complete`.

**Deliverables:**

- SDK collection for process CPU, memory, uptime, and event-loop delay.
- Batching compatible with the established ingestion contract.
- Partitioned PostgreSQL metric storage using reviewed SQL.
- Time-bounded, paginated metric query APIs.
- Dropped-telemetry accounting when SDK buffer limits are reached.

**Exclusions:** Host metrics, charting UI, metric alert rules, anomaly detection,
logs, and errors.

**Test requirements:**

- Unit tests for metric collection, batching, redaction boundaries, and buffer limits.
- Integration tests for partitions, bulk insertion, duplicate delivery, indexes,
  and bounded queries.
- Load test against documented initial throughput and latency targets.

**Exit criteria:**

- Metrics flow from the example app to query responses.
- Storage and queries remain within approved load-test targets.
- SDK resource overhead and limits are measured and documented.
- The owner accepts the metrics slice and marks the phase `complete`.

**Owner approval gate:** The owner must approve sampling defaults, payload limits,
storage shape, and initial performance targets before implementation starts.

## Phase 6: Logs And Errors Vertical Slice

**Status:** `not-approved`

**Objective:** Capture structured NestJS logs and application errors while proving
the conservative collection and redaction guarantees.

**Prerequisites:** Phase 5 is `complete`.

**Deliverables:**

- Documented NestJS logger integration.
- Capture of uncaught exceptions and unhandled promise rejections.
- SDK-side recursive redaction and metadata allowlisting.
- Partitioned storage and bounded query APIs for logs and errors.
- Protection against recursive SDK diagnostic capture.

**Exclusions:** Log-file tailing, request-body/header capture, tracing, source maps,
and external log-provider integrations.

**Test requirements:**

- Unit tests for logger compatibility, error normalization, recursion prevention,
  allowlisting, and recursive redaction.
- Integration tests for ingestion, persistence, query authorization, and malformed
  or oversized event rejection.
- End-to-end tests proving configured sensitive values do not leave the example app.

**Exit criteria:**

- Logs and errors flow end to end without breaking host logging behavior.
- Privacy tests prove prohibited and redacted data is not transmitted or persisted.
- Failure and shutdown behavior remains fail-open.
- The owner accepts the slice and marks the phase `complete`.

**Owner approval gate:** The owner must approve logger ergonomics, error payloads,
redaction semantics, and query contracts before implementation starts.

## Phase 7: Rules And Incidents

**Status:** `not-approved`

**Objective:** Add user-defined health rules and a reliable incident lifecycle for
all supported telemetry signals.

**Prerequisites:** Phase 6 is `complete`.

**Deliverables:**

- Management APIs for CPU, memory, event-loop, error-rate, log-match, and
  missing-heartbeat rules.
- Windowed evaluation, required violation duration, cooldowns, and enabled state.
- Incident APIs and `open`, `acknowledged`, and `resolved` transitions.
- Incident deduplication, repeated-violation updates, and recovery resolution.

**Exclusions:** Anomaly detection, compound rules, escalation policies, and
notification delivery.

**Test requirements:**

- Unit tests for every rule type, window edge, cooldown, and transition.
- Integration tests for concurrent evaluations and idempotent incident updates.
- End-to-end tests for sustained violations, brief spikes, acknowledgment, repeated
  violations, and recovery.

**Exit criteria:**

- Brief violations do not open incidents requiring sustained duration.
- Concurrent or duplicate evaluation cannot create duplicate active incidents.
- Recovery and acknowledgment behavior matches `docs/PROJECT.md`.
- The owner accepts the behavior and marks the phase `complete`.

**Owner approval gate:** The owner must approve rule schemas, timing semantics,
incident transitions, and API contracts before implementation starts.

## Phase 8: Notifications

**Status:** `not-approved`

**Objective:** Deliver reliable incident-transition notifications through email
and signed webhooks.

**Prerequisites:** Phase 7 is `complete`.

**Deliverables:**

- Notification destination management and authorization.
- Email delivery through configurable SMTP.
- Timestamped and signed webhook delivery with replay-verification guidance.
- Retry, delivery-attempt history, dead-letter state, and safe manual replay.

**Exclusions:** SMS, Slack-native integration, paging schedules, and escalation
policies.

**Test requirements:**

- Unit tests for event rendering, signatures, retry policy, and secret handling.
- Integration tests with fake SMTP and webhook receivers.
- End-to-end tests for incident-driven delivery, duplicate prevention, retries,
  dead-letter state, and replay.

**Exit criteria:**

- Notification failures never alter the correct incident state.
- Duplicate jobs do not create duplicate successful deliveries for one event.
- Secrets are protected and signatures are independently verifiable.
- The owner accepts delivery behavior and marks the phase `complete`.

**Owner approval gate:** The owner must approve event types, payloads, signing,
retry policy, and secret-storage design before implementation starts.

## Phase 9: Retention And Operational Hardening

**Status:** `not-approved`

**Objective:** Make the self-hosted control plane operable, recoverable, bounded,
and verified under expected load and dependency failures.

**Prerequisites:** Phase 8 is `complete`.

**Deliverables:**

- Configurable telemetry retention with a 30-day default and partition dropping.
- Operational metrics, structured internal logs, readiness, and queue visibility.
- Dead-letter inspection and safe replay procedures.
- Documented PostgreSQL backup/restore and Redis durability expectations.
- Production deployment, TLS, secrets, sizing, and upgrade guidance.
- Approved load and failure-recovery test reports.

**Exclusions:** Hosted operations, automatic scaling, multi-region deployment, and
formal service-level agreements.

**Test requirements:**

- Integration tests for partition creation/removal and retention retry safety.
- Load tests for ingestion, workers, queries, and rule evaluation.
- Failure tests for API, worker, PostgreSQL, Redis, SMTP, and webhook outages.
- Restore rehearsal from a PostgreSQL backup.

**Exit criteria:**

- Retention cannot remove control-plane data or unexpired telemetry.
- Resource and queue limits prevent unbounded growth.
- Documented recovery procedures are successfully rehearsed.
- The owner accepts operational targets and marks the phase `complete`.

**Owner approval gate:** The owner must approve retention limits, performance
targets, recovery objectives, and production guidance before implementation starts.

## Phase 10: SDK Release Readiness

**Status:** `not-approved`

**Objective:** Prepare a trustworthy first public SDK and compatible self-hosted
control-plane release.

**Prerequisites:** Phase 9 is `complete`.

**Deliverables:**

- Final SDK installation, configuration, privacy, troubleshooting, and upgrade docs.
- Supported NestJS and Node.js compatibility matrix.
- Example application demonstrating supported V1 capabilities.
- Semantic-versioning and ingestion-API compatibility policy.
- Automated package validation and npm publishing workflow.
- Apache 2.0 license and required package/repository metadata.

**Exclusions:** Hosted SaaS release, dashboard frontend, host agent, and V2 features.

**Test requirements:**

- Package-install tests against every supported Node.js and NestJS version.
- End-to-end tests using the packed SDK artifact, not workspace-only imports.
- Upgrade and compatibility tests across supported SDK/API combinations.
- Release dry run verifying package contents, provenance, and documentation links.

**Exit criteria:**

- A new user can install the packed SDK and complete the documented integration.
- Supported compatibility combinations pass CI.
- Release artifacts contain no secrets, internal-only code, or unexpected files.
- The owner accepts release readiness and marks the phase `complete`.

**Owner approval gate:** The owner must approve package API, compatibility policy,
release workflow, and public documentation before publishing.

## Decision And Deviation Log

Record approved decisions or deviations here before implementation. Do not use this
log for ordinary implementation details that already match the approved documents.

| Date       | Phase | Decision or deviation                                                                           | Reason and consequence                                                                              | Owner approval      |
| ---------- | ----- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------- |
| 2026-06-09 | 1     | Adopt the documentation foundation defined by `docs/PROJECT.md`, `AGENTS.md`, and this roadmap. | Establishes review gates and project sources of truth before implementation.                        | Approved 2026-06-10 |
| 2026-06-11 | 3     | Approve Phase 3 with security prioritized over convenience.                                     | Authorizes identity and control-plane implementation using the approved Phase 3 security contract.  | Approved 2026-06-11 |
| 2026-06-11 | 3     | Accept Phase 3 after the security acceptance audit.                                             | All Phase 3 exit criteria and the Node.js 22 CI-equivalent acceptance suite passed.                 | Accepted 2026-06-11 |
| 2026-06-11 | 4     | Approve the minimal secure heartbeat vertical-slice contract.                                   | Authorizes Phase 4 with the approved timing, ingestion, SDK, query, and inferred-downtime contract. | Approved 2026-06-11 |
| 2026-06-12 | 4     | Accept Phase 4 after the security and reliability acceptance audit.                             | All Phase 4 exit criteria, clean migration/rollback checks, and Node.js 22 acceptance gates passed. | Accepted 2026-06-12 |
