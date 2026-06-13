import type {
  HeartbeatEvent,
  HeartbeatQueryItem,
  ErrorEvent,
  ErrorQueryItem,
  LogEvent,
  LogQueryItem,
  ProcessMetricEvent,
  ProcessMetricQueryItem,
} from '@blackbox/contracts';
import { Prisma, type PrismaClient } from '@blackbox/database';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../infrastructure/prisma.service';
import { HEARTBEAT_DELIVERY_TOLERANCE_MS } from './telemetry.constants';
import type { HeartbeatCursor, ProcessMetricCursor, TelemetryJob } from './telemetry.types';
import type { ErrorCursor, LogCursor } from './telemetry.types';

type Database = Prisma.TransactionClient | PrismaClient | PrismaService;

interface CountRow {
  readonly count: bigint;
}

interface HeartbeatRow {
  readonly eventId: string;
  readonly expectedIntervalMs: number;
  readonly occurredAt: Date;
  readonly receivedAt: Date;
  readonly serviceName: string;
  readonly serviceVersion: string | null;
  readonly uptimeMs: bigint;
}

interface ProcessMetricRow {
  readonly cpuPercent: number;
  readonly droppedEvents: bigint;
  readonly eventId: string;
  readonly eventLoopDelayP99Ms: number;
  readonly occurredAt: Date;
  readonly receivedAt: Date;
  readonly rssBytes: bigint;
  readonly serviceName: string;
  readonly serviceVersion: string | null;
  readonly uptimeMs: bigint;
}

interface LogRow {
  readonly context: string | null;
  readonly eventId: string;
  readonly level: LogEvent['level'];
  readonly message: string;
  readonly metadata: LogEvent['metadata'] | null;
  readonly occurredAt: Date;
  readonly receivedAt: Date;
  readonly serviceName: string;
  readonly serviceVersion: string | null;
}

interface ErrorRow {
  readonly eventId: string;
  readonly message: string;
  readonly metadata: ErrorEvent['metadata'] | null;
  readonly name: string;
  readonly occurredAt: Date;
  readonly receivedAt: Date;
  readonly serviceName: string;
  readonly serviceVersion: string | null;
  readonly source: ErrorEvent['source'];
  readonly stack: string | null;
}

@Injectable()
export class TelemetryRepository {
  async persistTelemetryBatch(database: Database, job: TelemetryJob): Promise<boolean> {
    const insertedBatch = await database.$queryRaw<Array<{ batchId: string }>>(Prisma.sql`
      INSERT INTO "telemetry_batches" ("batch_id", "environment_id", "event_count")
      VALUES (${job.batch.batchId}::uuid, ${job.environmentId}::uuid, ${job.batch.events.length})
      ON CONFLICT ("batch_id") DO NOTHING
      RETURNING "batch_id" AS "batchId"
    `);
    if (insertedBatch.length === 0) {
      return false;
    }

    const heartbeats = job.batch.events.filter(
      (event): event is HeartbeatEvent => event.type === 'heartbeat',
    );
    for (const event of heartbeats) {
      const insertedEvent = await database.$queryRaw<Array<{ eventId: string }>>(Prisma.sql`
        INSERT INTO "telemetry_event_ids" ("event_id", "event_type")
        VALUES (${event.eventId}::uuid, 'heartbeat')
        ON CONFLICT ("event_id") DO NOTHING
        RETURNING "event_id" AS "eventId"
      `);
      if (insertedEvent.length === 0) {
        continue;
      }

      await database.$executeRaw(Prisma.sql`
        INSERT INTO "heartbeat_events" (
          "event_id", "batch_id", "environment_id", "occurred_at", "expected_interval_ms",
          "uptime_ms", "service_name", "service_version"
        )
        VALUES (
          ${event.eventId}::uuid, ${job.batch.batchId}::uuid, ${job.environmentId}::uuid,
          ${event.occurredAt}::timestamptz, ${event.expectedIntervalMs}, ${event.uptimeMs},
          ${event.serviceName}, ${event.serviceVersion ?? null}
        )
      `);
      await database.$executeRaw(Prisma.sql`
        INSERT INTO "heartbeat_states" (
          "environment_id", "last_heartbeat_at", "expected_interval_ms",
          "service_name", "service_version"
        )
        VALUES (
          ${job.environmentId}::uuid, ${event.occurredAt}::timestamptz,
          ${event.expectedIntervalMs}, ${event.serviceName}, ${event.serviceVersion ?? null}
        )
        ON CONFLICT ("environment_id") DO UPDATE SET
          "last_heartbeat_at" = EXCLUDED."last_heartbeat_at",
          "expected_interval_ms" = EXCLUDED."expected_interval_ms",
          "service_name" = EXCLUDED."service_name",
          "service_version" = EXCLUDED."service_version",
          "updated_at" = CURRENT_TIMESTAMP
        WHERE EXCLUDED."last_heartbeat_at" > "heartbeat_states"."last_heartbeat_at"
      `);
      await database.$executeRaw(Prisma.sql`
        UPDATE "heartbeat_incidents"
        SET "status" = 'resolved', "resolved_at" = CURRENT_TIMESTAMP
        WHERE "environment_id" = ${job.environmentId}::uuid
          AND "status" = 'open'
          AND ${event.occurredAt}::timestamptz > "last_observed_heartbeat_at"
      `);
    }

    const processMetrics = job.batch.events.filter(
      (event): event is ProcessMetricEvent => event.type === 'process_metric',
    );
    if (processMetrics.length > 0) {
      await database.$executeRaw(Prisma.sql`
        WITH raw_metric_input AS (
          SELECT
            (metric->>'eventId')::uuid AS "event_id",
            (metric->>'occurredAt')::timestamptz AS "occurred_at",
            (metric->>'cpuPercent')::double precision AS "cpu_percent",
            (metric->>'rssBytes')::bigint AS "rss_bytes",
            (metric->>'uptimeMs')::bigint AS "uptime_ms",
            (metric->>'eventLoopDelayP99Ms')::double precision AS "event_loop_delay_p99_ms",
            (metric->>'droppedEvents')::bigint AS "dropped_events",
            metric->>'serviceName' AS "service_name",
            metric->>'serviceVersion' AS "service_version",
            ordinal
          FROM jsonb_array_elements(${JSON.stringify(processMetrics)}::jsonb)
            WITH ORDINALITY AS input(metric, ordinal)
        ),
        metric_input AS (
          SELECT DISTINCT ON ("event_id")
            "event_id", "occurred_at", "cpu_percent", "rss_bytes", "uptime_ms",
            "event_loop_delay_p99_ms", "dropped_events", "service_name", "service_version"
          FROM raw_metric_input
          ORDER BY "event_id", ordinal
        ),
        inserted_ids AS (
          INSERT INTO "telemetry_event_ids" ("event_id", "event_type")
          SELECT "event_id", 'process_metric' FROM metric_input
          ON CONFLICT ("event_id") DO NOTHING
          RETURNING "event_id"
        )
        INSERT INTO "process_metric_events" (
          "event_id", "batch_id", "environment_id", "occurred_at", "cpu_percent",
          "rss_bytes", "uptime_ms", "event_loop_delay_p99_ms", "dropped_events",
          "service_name", "service_version"
        )
        SELECT
          metric_input."event_id", ${job.batch.batchId}::uuid, ${job.environmentId}::uuid,
          metric_input."occurred_at", metric_input."cpu_percent", metric_input."rss_bytes",
          metric_input."uptime_ms", metric_input."event_loop_delay_p99_ms",
          metric_input."dropped_events", metric_input."service_name", metric_input."service_version"
        FROM metric_input
        INNER JOIN inserted_ids USING ("event_id")
      `);
    }

    const logs = job.batch.events.filter((event): event is LogEvent => event.type === 'log');
    if (logs.length > 0) {
      await database.$executeRaw(Prisma.sql`
        WITH raw_input AS (
          SELECT
            (event->>'eventId')::uuid AS "event_id", (event->>'occurredAt')::timestamptz AS "occurred_at",
            event->>'level' AS "level", event->>'message' AS "message", event->>'context' AS "context",
            event->'metadata' AS "metadata", event->>'serviceName' AS "service_name",
            event->>'serviceVersion' AS "service_version", ordinal
          FROM jsonb_array_elements(${JSON.stringify(logs)}::jsonb) WITH ORDINALITY AS input(event, ordinal)
        ),
        input AS (
          SELECT DISTINCT ON ("event_id") "event_id", "occurred_at", "level", "message", "context",
            "metadata", "service_name", "service_version"
          FROM raw_input ORDER BY "event_id", ordinal
        ),
        inserted_ids AS (
          INSERT INTO "telemetry_event_ids" ("event_id", "event_type")
          SELECT "event_id", 'log' FROM input ON CONFLICT ("event_id") DO NOTHING RETURNING "event_id"
        )
        INSERT INTO "log_events" (
          "event_id", "batch_id", "environment_id", "occurred_at", "level", "message", "context",
          "metadata", "service_name", "service_version"
        )
        SELECT input."event_id", ${job.batch.batchId}::uuid, ${job.environmentId}::uuid,
          input."occurred_at", input."level", input."message", input."context", input."metadata",
          input."service_name", input."service_version"
        FROM input INNER JOIN inserted_ids USING ("event_id")
      `);
    }

    const errors = job.batch.events.filter((event): event is ErrorEvent => event.type === 'error');
    if (errors.length > 0) {
      await database.$executeRaw(Prisma.sql`
        WITH raw_input AS (
          SELECT
            (event->>'eventId')::uuid AS "event_id", (event->>'occurredAt')::timestamptz AS "occurred_at",
            event->>'name' AS "name", event->>'message' AS "message", event->>'stack' AS "stack",
            event->>'source' AS "source", event->'metadata' AS "metadata",
            event->>'serviceName' AS "service_name", event->>'serviceVersion' AS "service_version", ordinal
          FROM jsonb_array_elements(${JSON.stringify(errors)}::jsonb) WITH ORDINALITY AS input(event, ordinal)
        ),
        input AS (
          SELECT DISTINCT ON ("event_id") "event_id", "occurred_at", "name", "message", "stack",
            "source", "metadata", "service_name", "service_version"
          FROM raw_input ORDER BY "event_id", ordinal
        ),
        inserted_ids AS (
          INSERT INTO "telemetry_event_ids" ("event_id", "event_type")
          SELECT "event_id", 'error' FROM input ON CONFLICT ("event_id") DO NOTHING RETURNING "event_id"
        )
        INSERT INTO "error_events" (
          "event_id", "batch_id", "environment_id", "occurred_at", "name", "message", "stack",
          "source", "metadata", "service_name", "service_version"
        )
        SELECT input."event_id", ${job.batch.batchId}::uuid, ${job.environmentId}::uuid,
          input."occurred_at", input."name", input."message", input."stack", input."source",
          input."metadata", input."service_name", input."service_version"
        FROM input INNER JOIN inserted_ids USING ("event_id")
      `);
    }

    await database.$executeRaw(Prisma.sql`
      UPDATE "ingest_keys"
      SET "last_used_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${job.ingestKeyId}::uuid
        AND "environment_id" = ${job.environmentId}::uuid
    `);
    return true;
  }

  async openMissingHeartbeatIncidents(database: Database, now: Date): Promise<number> {
    const rows = await database.$queryRaw<CountRow[]>(Prisma.sql`
      WITH inserted AS (
        INSERT INTO "heartbeat_incidents" (
          "environment_id", "status", "last_observed_heartbeat_at"
        )
        SELECT "environment_id", 'open', "last_heartbeat_at"
        FROM "heartbeat_states"
        WHERE "last_heartbeat_at"
          + ("expected_interval_ms" + ${HEARTBEAT_DELIVERY_TOLERANCE_MS})
            * INTERVAL '1 millisecond' <= ${now}::timestamptz
        ON CONFLICT ("environment_id") WHERE "status" = 'open' DO NOTHING
        RETURNING 1
      )
      SELECT count(*)::bigint AS "count" FROM inserted
    `);
    return Number(rows[0]?.count ?? 0);
  }

  async requireEnvironmentAccess(
    database: Database,
    userId: string,
    teamId: string,
    projectId: string,
    environmentId: string,
  ): Promise<void> {
    const rows = await database.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT e."id"
      FROM "environments" e
      INNER JOIN "projects" p ON p."id" = e."project_id"
      INNER JOIN "team_memberships" tm ON tm."team_id" = p."team_id"
      WHERE e."id" = ${environmentId}::uuid
        AND p."id" = ${projectId}::uuid
        AND p."team_id" = ${teamId}::uuid
        AND tm."user_id" = ${userId}::uuid
      LIMIT 1
    `);
    if (rows.length === 0) {
      throw new NotFoundException('Environment not found');
    }
  }

  async listHeartbeats(
    database: Database,
    environmentId: string,
    from: Date,
    to: Date,
    limit: number,
    cursor?: HeartbeatCursor,
  ): Promise<HeartbeatQueryItem[]> {
    const cursorClause = cursor
      ? Prisma.sql`AND (
          h."occurred_at" < ${cursor.occurredAt}::timestamptz OR
          (h."occurred_at" = ${cursor.occurredAt}::timestamptz AND h."event_id" < ${cursor.eventId}::uuid)
        )`
      : Prisma.empty;
    const rows = await database.$queryRaw<HeartbeatRow[]>(Prisma.sql`
      SELECT
        h."event_id" AS "eventId",
        h."expected_interval_ms" AS "expectedIntervalMs",
        h."occurred_at" AS "occurredAt",
        h."received_at" AS "receivedAt",
        h."service_name" AS "serviceName",
        h."service_version" AS "serviceVersion",
        h."uptime_ms" AS "uptimeMs"
      FROM "heartbeat_events" h
      WHERE h."environment_id" = ${environmentId}::uuid
        AND h."occurred_at" >= ${from}::timestamptz
        AND h."occurred_at" <= ${to}::timestamptz
        ${cursorClause}
      ORDER BY h."occurred_at" DESC, h."event_id" DESC
      LIMIT ${limit}
    `);

    return rows.map((row) => ({
      eventId: row.eventId,
      expectedIntervalMs: row.expectedIntervalMs,
      occurredAt: row.occurredAt.toISOString(),
      receivedAt: row.receivedAt.toISOString(),
      serviceName: row.serviceName,
      serviceVersion: row.serviceVersion,
      uptimeMs: Number(row.uptimeMs),
    }));
  }

  async listProcessMetrics(
    database: Database,
    environmentId: string,
    from: Date,
    to: Date,
    limit: number,
    cursor?: ProcessMetricCursor,
  ): Promise<ProcessMetricQueryItem[]> {
    const cursorClause = cursor
      ? Prisma.sql`AND (
          m."occurred_at" < ${cursor.occurredAt}::timestamptz OR
          (m."occurred_at" = ${cursor.occurredAt}::timestamptz AND m."event_id" < ${cursor.eventId}::uuid)
        )`
      : Prisma.empty;
    const rows = await database.$queryRaw<ProcessMetricRow[]>(Prisma.sql`
      SELECT
        m."event_id" AS "eventId",
        m."occurred_at" AS "occurredAt",
        m."received_at" AS "receivedAt",
        m."cpu_percent" AS "cpuPercent",
        m."rss_bytes" AS "rssBytes",
        m."uptime_ms" AS "uptimeMs",
        m."event_loop_delay_p99_ms" AS "eventLoopDelayP99Ms",
        m."dropped_events" AS "droppedEvents",
        m."service_name" AS "serviceName",
        m."service_version" AS "serviceVersion"
      FROM "process_metric_events" m
      WHERE m."environment_id" = ${environmentId}::uuid
        AND m."occurred_at" >= ${from}::timestamptz
        AND m."occurred_at" <= ${to}::timestamptz
        ${cursorClause}
      ORDER BY m."occurred_at" DESC, m."event_id" DESC
      LIMIT ${limit}
    `);

    return rows.map((row) => ({
      cpuPercent: row.cpuPercent,
      droppedEvents: Number(row.droppedEvents),
      eventId: row.eventId,
      eventLoopDelayP99Ms: row.eventLoopDelayP99Ms,
      occurredAt: row.occurredAt.toISOString(),
      receivedAt: row.receivedAt.toISOString(),
      rssBytes: Number(row.rssBytes),
      serviceName: row.serviceName,
      serviceVersion: row.serviceVersion,
      uptimeMs: Number(row.uptimeMs),
    }));
  }

  async listLogs(
    database: Database,
    environmentId: string,
    from: Date,
    to: Date,
    limit: number,
    cursor?: LogCursor,
    level?: LogEvent['level'],
  ): Promise<LogQueryItem[]> {
    const cursorClause = telemetryCursorClause('l', cursor);
    const levelClause = level ? Prisma.sql`AND l."level" = ${level}` : Prisma.empty;
    const rows = await database.$queryRaw<LogRow[]>(Prisma.sql`
      SELECT l."event_id" AS "eventId", l."occurred_at" AS "occurredAt",
        l."received_at" AS "receivedAt", l."level", l."message", l."context", l."metadata",
        l."service_name" AS "serviceName", l."service_version" AS "serviceVersion"
      FROM "log_events" l
      WHERE l."environment_id" = ${environmentId}::uuid
        AND l."occurred_at" >= ${from}::timestamptz AND l."occurred_at" <= ${to}::timestamptz
        ${levelClause} ${cursorClause}
      ORDER BY l."occurred_at" DESC, l."event_id" DESC LIMIT ${limit}
    `);
    return rows.map((row) => ({
      ...(row.context ? { context: row.context } : {}),
      eventId: row.eventId,
      level: row.level,
      message: row.message,
      ...(row.metadata ? { metadata: row.metadata } : {}),
      occurredAt: row.occurredAt.toISOString(),
      receivedAt: row.receivedAt.toISOString(),
      serviceName: row.serviceName,
      serviceVersion: row.serviceVersion ?? undefined,
    }));
  }

  async listErrors(
    database: Database,
    environmentId: string,
    from: Date,
    to: Date,
    limit: number,
    cursor?: ErrorCursor,
  ): Promise<ErrorQueryItem[]> {
    const cursorClause = telemetryCursorClause('e', cursor);
    const rows = await database.$queryRaw<ErrorRow[]>(Prisma.sql`
      SELECT e."event_id" AS "eventId", e."occurred_at" AS "occurredAt",
        e."received_at" AS "receivedAt", e."name", e."message", e."stack", e."source", e."metadata",
        e."service_name" AS "serviceName", e."service_version" AS "serviceVersion"
      FROM "error_events" e
      WHERE e."environment_id" = ${environmentId}::uuid
        AND e."occurred_at" >= ${from}::timestamptz AND e."occurred_at" <= ${to}::timestamptz
        ${cursorClause}
      ORDER BY e."occurred_at" DESC, e."event_id" DESC LIMIT ${limit}
    `);
    return rows.map((row) => ({
      eventId: row.eventId,
      message: row.message,
      ...(row.metadata ? { metadata: row.metadata } : {}),
      name: row.name,
      occurredAt: row.occurredAt.toISOString(),
      receivedAt: row.receivedAt.toISOString(),
      serviceName: row.serviceName,
      serviceVersion: row.serviceVersion ?? undefined,
      source: row.source,
      ...(row.stack ? { stack: row.stack } : {}),
    }));
  }
}

function telemetryCursorClause(alias: 'e' | 'l', cursor?: HeartbeatCursor): Prisma.Sql {
  if (!cursor) {
    return Prisma.empty;
  }
  return alias === 'e'
    ? Prisma.sql`AND (
        e."occurred_at" < ${cursor.occurredAt}::timestamptz OR
        (e."occurred_at" = ${cursor.occurredAt}::timestamptz AND e."event_id" < ${cursor.eventId}::uuid)
      )`
    : Prisma.sql`AND (
        l."occurred_at" < ${cursor.occurredAt}::timestamptz OR
        (l."occurred_at" = ${cursor.occurredAt}::timestamptz AND l."event_id" < ${cursor.eventId}::uuid)
      )`;
}
