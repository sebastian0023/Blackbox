# Phase 6 Checkpoint

Updated: 2026-06-13

## Current Gate

The owner accepted Phase 5 and approved the recommended security-first KISS
Phase 6 contract on 2026-06-13. Phase 5 is `complete` and Phase 6 is
`in-progress`.

The owner approved the monitor-only resolution on 2026-06-13:

- Node.js does not provide a passive `unhandledRejection` observer. Installing
  an `unhandledRejection` listener changes default host-process behavior and can
  prevent a process-fatal rejection from terminating the application.
- That conflicts with the approved requirement to observe unhandled rejections
  without changing host semantics.
- Recommended security-first KISS resolution: never install an
  `unhandledRejection` listener. Observe process-fatal unhandled rejections
  through `uncaughtExceptionMonitor` using its `origin` argument and classify
  origin `unhandledRejection` as `unhandled_rejection`. Applications that
  deliberately install their own non-fatal rejection handler must explicitly
  report those errors through the SDK logger/error API if desired.

### Runtime Evidence

Verified locally on 2026-06-13 with Node.js `v25.8.1`:

- A rejected promise with no listeners terminates with exit code `1`.
- Installing an `unhandledRejection` listener runs the listener, keeps the
  process alive, and exits with code `0`.
- Installing only an `uncaughtExceptionMonitor` listener observes the same
  rejection with origin `unhandledRejection` while preserving exit code `1`.

This proves that the originally proposed `unhandledRejection` observer would
change host behavior, while the recommended monitor-only design satisfies the
security and fail-open requirements.

The resolution is recorded in `docs/PROJECT.md` and the decision log.

## Current Implementation Checkpoint

- The approved contract and monitor-only deviation are recorded. Phase 6 is
  `in-progress`.
- Public log/error contracts, bounded metadata types, and independent query
  response contracts are implemented without changing ingestion version `1`.
- The SDK exposes explicit `BlackboxLogger`, `BlackboxRuntimeService`,
  `captureLog`, and `captureError` surfaces. It does not patch console or install
  an `unhandledRejection` listener.
- SDK normalization allowlists top-level metadata, recursively redacts
  case-insensitive mandatory and custom sensitive keys, omits unsupported and
  circular values, and bounds strings, arrays, keys, depth, event size, batch
  size, retries, and memory.
- Fatal uncaught exceptions and fatal unhandled rejections are observed only
  through `uncaughtExceptionMonitor`, classified by origin, and the observer is
  removed during shutdown.
- Server ingestion and worker jobs defensively revalidate exact event shapes,
  metadata bounds, default-sensitive redaction, timestamps, and 32-KiB event
  limits.
- Reviewed Phase 6 SQL creates separate monthly-partitioned log and error tables,
  purpose-specific indexes, and reversible global event-type idempotency.
- Typed bulk persistence and authenticated, team/project/environment-scoped,
  time-bounded, cursor-paginated log/error queries are implemented. Log queries
  support one exact level filter.
- The example app explicitly emits Phase 6 telemetry; its end-to-end privacy test
  proves configured plaintext secrets and non-allowlisted metadata do not reach
  storage or query responses.
- Formatting, lint, typecheck, build, Prisma generation/validation, all 32 unit
  tests, and all 30 dependency-backed integration tests pass.
- Frozen installation and the high-severity dependency audit pass with no known
  vulnerabilities.
- Source and built smoke tests pass. The source smoke startup window is ten
  seconds because API, worker, and example source transpilation run concurrently;
  invalid server configuration still must fail within three seconds.
- A clean isolated database applied all six migrations. The actual Phase 6
  rollback file then removed log/error storage, deleted existing log/error
  idempotency records, and restored the Phase 5 event-type constraint.
- Phase 5 regression gates remain green after Phase 6: 1,000/1,000 metrics at
  100 events per second with 37.680 ms ingestion p95 and 8.507 ms query p95; SDK
  overhead measured 0.286% CPU and 6,848,512 additional RSS bytes.
- The final requirement audit proves every Phase 6 deliverable, exclusion, test
  requirement, approved deviation, and implementation-controlled exit criterion.
- Remaining work: owner acceptance only. Agents must not mark Phase 6 `complete`
  on the owner's behalf.

## Approved Security-First KISS Contract

### Logger Ergonomics

- Export one explicit `BlackboxLogger` implementing NestJS `LoggerService`.
- `BlackboxLogger` wraps and always forwards to a caller-provided host logger.
  Monitoring failures never change or block host logging behavior.
- Only calls made through this explicit wrapper are captured. Do not patch the
  global console, Nest internals, or unrelated loggers.
- Capture the Nest levels `log`, `warn`, `error`, `debug`, `verbose`, and `fatal`.
- SDK diagnostics never pass through the capture wrapper, preventing recursive
  diagnostic capture.

### Error Capture And Payloads

- Install only a bounded `uncaughtExceptionMonitor` observer and use its origin
  to classify fatal unhandled rejections. Do not install an
  `unhandledRejection` listener, replace host handlers, alter process exit
  behavior, or claim errors were handled.
- Normalize errors to only: stable event ID, occurrence time, error name,
  message, optional stack, source (`uncaught_exception` or
  `unhandled_rejection`), service name, optional service version, and filtered
  metadata.
- Normalize logs to only: stable event ID, occurrence time, level, message,
  optional context, service name, optional service version, and filtered
  metadata.
- Bound messages to 2 KiB, stacks to 16 KiB, context to 100 characters, metadata
  to 16 keys, strings to 2 KiB, arrays to 20 items, and recursive depth to 5.
- Reject individual log or error events whose serialized size exceeds 32 KiB.
  Keep the established version `1`, 100-event, 100-KiB batch contract.

### Metadata Allowlisting And Redaction

- Metadata collection is disabled unless `metadataAllowlist` explicitly names
  allowed top-level keys.
- `redactionKeys` is case-insensitive and defaults to conservative credential
  names: `authorization`, `cookie`, `password`, `secret`, `token`, and
  `x-blackbox-ingest-key`.
- Redaction recursively replaces matching values with `[REDACTED]` before events
  enter the SDK buffer.
- Unsupported values, symbols, functions, circular references, and keys outside
  the allowlist are omitted.
- The server defensively validates the already-filtered shape but remains a
  secondary privacy boundary.

### Storage And Queries

- Reuse the established mixed telemetry ingestion queue and global stable event
  ID idempotency.
- Store logs and errors in separate monthly range-partitioned PostgreSQL tables
  through reviewed SQL and typed repository methods.
- Add separate authenticated log and error query endpoints scoped by team,
  project, and environment.
- Queries default to one hour, allow at most 24 hours, return at most 100 records,
  and use deterministic cursor pagination.
- Log queries may optionally filter by one exact supported level. No full-text
  search, arbitrary metadata search, or error grouping is included.

### Explicit Exclusions

- No log-file tailing, request/body/header capture, console patching, tracing,
  source maps, external log integrations, full-text search, arbitrary metadata,
  or Phase 7 alert behavior.
- Add no dependency unless implementation proves the existing platform APIs are
  insufficient.

## Implementation Map After Approval

1. Record Phase 5 owner acceptance, mark it `complete`, record the approved Phase
   6 contract, and mark Phase 6 `in-progress`.
2. Add bounded normalization, allowlisting, recursive redaction, and explicit
   NestJS logger integration to the SDK with fail-open and recursion protection.
3. Add uncaught exception monitor and unhandled rejection observation without
   changing host process semantics.
4. Extend contracts, ingestion validation, worker validation, and typed
   persistence for log and error events.
5. Add reviewed monthly-partitioned SQL migration and rollback.
6. Add scoped, bounded, paginated log and error query APIs and OpenAPI contracts.
7. Add example integration, privacy end-to-end tests, focused unit/integration
   tests, and acceptance verification.
8. Leave Phase 6 `in-progress` awaiting owner acceptance.

## Resume

Read `AGENTS.md`, `docs/INTEGRATION_PHASES.md`, `docs/PROJECT.md`,
`.agents/PHASE_5_CHECKPOINT.md`, and this file. Confirm the owner explicitly
accepted Phase 5 and approved this Phase 6 contract before implementation.
