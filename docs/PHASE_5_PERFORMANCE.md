# Phase 5 Performance Verification

Phase 5 uses small, repeatable local checks for its approved initial targets.
These are development baselines, not production capacity claims.

## Environment

- Node.js 22
- API, worker, PostgreSQL 16, and Redis 7 running locally
- Default API and worker concurrency
- Process metrics stored through the reviewed monthly-partitioned SQL table

## Ingestion And Query Load

Build the workspace, then execute:

```bash
pnpm test:load:phase5
```

The command starts the built API and worker, creates an isolated team, project,
environment, and ingest key, sends batches of 100 approved process-metric events
once per second for 10 seconds, then performs 20 bounded queries for 100 records.
It stops the app processes and fails if p95 ingestion acceptance or query latency
is 250 milliseconds or higher.

Set `BLACKBOX_LOAD_API_URL` to target a non-default local API or
`BLACKBOX_LOAD_DURATION_SECONDS` to run for up to 60 seconds.

## SDK Overhead

Build the workspace, then execute:

```bash
pnpm test:overhead:phase5
```

The command runs the built SDK over a real default 30-second sampling interval
with a local no-op transport. It fails unless a process metric is delivered, CPU
overhead is below 1%, and additional RSS is below 10 MiB.

## Latest Result

Measured locally on 2026-06-13:

- SDK overhead over 31 seconds at the default sampling interval: 0.291% CPU and
  3,751,936 bytes additional RSS. A process metric was delivered.
- Public API load over 10 seconds: 1,000 accepted and queryable metric events,
  35.141 ms p95 ingestion acceptance, and 6.914 ms p95 bounded query latency.
