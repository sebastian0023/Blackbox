# Phase 5 Checkpoint

Updated: 2026-06-13

## Current Gate

The owner approved the contract below on 2026-06-12. Phase 5 is `in-progress`.

## Current Implementation Checkpoint

- Approved contract and `in-progress` status are recorded.
- Mixed version `1` heartbeat/process-metric contracts and the fail-open shared
  SDK buffer are implemented.
- Process CPU, RSS, uptime, event-loop p99 delay, and cumulative dropped-event
  accounting are implemented with conservative allowlist-only payloads.
- Mixed ingestion validation, durable jobs, idempotent heartbeat persistence, and
  bulk process-metric persistence are implemented.
- Reviewed monthly-partitioned process-metric SQL migration and rollback are
  implemented.
- Authenticated, scoped, time-bounded, cursor-paginated process-metric queries
  and OpenAPI contracts are implemented.
- The example application flow and focused unit/integration coverage are
  implemented.
- The self-contained approved load gate passed at 100 events per second: all
  1,000 events became queryable, with 35.141 ms p95 ingestion acceptance and
  6.914 ms p95 bounded query latency.
- The approved SDK overhead target passed: 0.291% CPU and 3,751,936 bytes
  additional RSS over a real default sampling interval.
- Clean installation, data-bearing rollback, source/built smoke, dependency-backed
  integration, audit, and the complete CI-equivalent acceptance suite pass.
- A final hardening audit replaced single-batch recovery/shutdown flushing with a
  bounded shared-buffer drain. It sends no more than the configured buffer's
  batches plus the active batch, stops on the first failed delivery, and
  saturates the cumulative dropped-event count at the validated safe-integer
  limit.
- The final requirement audit proves every Phase 5 deliverable, exclusion, test
  requirement, and implementation-controlled exit criterion.
- Remaining work: owner acceptance only. Agents must not mark Phase 5 `complete`
  on the owner's behalf.

## Final Acceptance Evidence

- Frozen pnpm installation and `pnpm audit --audit-level high` pass with no known
  vulnerabilities. A pnpm override pins patched `esbuild` 0.28.1.
- Formatting, lint, typecheck, Prisma generation/validation, build, source smoke,
  and built smoke pass.
- All 21 unit tests pass, including a 205-event bounded multi-batch recovery
  drain.
- All 29 dependency-backed integration tests pass, including conservative metric
  validation, mixed batches, duplicate delivery and duplicate IDs within one
  batch, monthly partition use, indexes, bulk insertion, team isolation, bounded
  pagination, OpenAPI, and the example application flow.
- A clean isolated database applied all five migrations. The actual Phase 5
  rollback file then removed metric storage and restored the Phase 4 event-type
  constraint while a process-metric idempotency record existed.
- The CI-wired load gate persisted and queried all 1,000 events at 100 events per
  second, with 35.141 ms p95 ingestion acceptance and 6.914 ms p95 query latency.
- The CI-wired SDK overhead gate delivered a default-interval process metric at
  0.291% CPU and 3,751,936 bytes additional RSS.

## Approved Security-First KISS Contract

- Sample process metrics every 30 seconds by default, configurable from 5 seconds
  to 5 minutes.
- Collect only process CPU percentage, RSS memory bytes, process uptime,
  event-loop p99 delay, and the cumulative number of telemetry events dropped
  because the SDK buffer was full.
- Reuse ingestion contract version `1`, with at most 100 events and 100 KiB per
  batch. A batch may contain heartbeat and process-metric events.
- Keep one shared, oldest-first SDK buffer, defaulting to 100 events and capped at
  1,000. Collection and delivery remain fail-open.
- Store process metrics in a monthly range-partitioned PostgreSQL table using a
  reviewed SQL migration and typed repository methods.
- Require authenticated team/project/environment scope for metric queries.
  Queries default to one hour, allow at most 24 hours, return at most 100 records,
  and use deterministic cursor pagination.
- Initial load target: sustain 100 metric events per second, with p95 ingestion
  acceptance and bounded metric queries below 250 ms in the documented local
  load-test environment.
- SDK overhead target at default sampling: below 1% CPU and below 10 MiB
  additional RSS in the documented local measurement.
- Add no dependencies and collect no host metrics, arbitrary metadata, request
  data, headers, or environment variables.

## Implementation Map After Approval

1. Record the approved contract in `docs/PROJECT.md`, add an approval decision-log
   entry, and mark Phase 5 `in-progress`.
2. Extend public contracts and SDK options; generalize the heartbeat runtime into
   a small mixed-telemetry runtime with bounded batching and dropped-event
   accounting.
3. Extend ingestion DTO validation, job validation, queue naming, and worker
   processing for mixed heartbeat/metric batches.
4. Add reviewed SQL migration and rollback for partitioned process metrics and
   purpose-specific indexes; bulk-persist metrics through the typed telemetry
   repository.
5. Add bounded, authorized process-metric query API and OpenAPI models.
6. Update the example application and add focused unit, integration, end-to-end,
   load, and overhead verification.
7. Run all acceptance gates and leave Phase 5 awaiting owner acceptance.

## Baseline Evidence

- Phase 4 is marked `complete`.
- Worktree was clean at checkpoint creation.
- No Phase 5 implementation or migration exists.
- `npm run build` passed on 2026-06-12.
- `npm run typecheck` passed on 2026-06-12.
- `npm run lint` passed on 2026-06-12.
- `npm test` passed all 16 unit tests on 2026-06-12.
- `npm run format:check` passed on 2026-06-12.
- `npm run db:validate` passed on 2026-06-12.
- `npm run db:migrate` confirmed all four completed migrations were applied on
  2026-06-12.
- The dependency-backed `npm run test:integration` passed all 27 integration
  tests on 2026-06-12.

## Resume

Read `AGENTS.md`, `docs/INTEGRATION_PHASES.md`, `docs/PROJECT.md`, and this file.
Continue the first incomplete implementation-map item and keep this checkpoint
current.
