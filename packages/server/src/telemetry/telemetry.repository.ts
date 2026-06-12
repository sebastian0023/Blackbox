import type { HeartbeatQueryItem } from '@blackbox/contracts';
import { Prisma, type PrismaClient } from '@blackbox/database';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../infrastructure/prisma.service';
import { HEARTBEAT_DELIVERY_TOLERANCE_MS } from './telemetry.constants';
import type { HeartbeatCursor, HeartbeatJob } from './telemetry.types';

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

@Injectable()
export class TelemetryRepository {
  async persistHeartbeatBatch(database: Database, job: HeartbeatJob): Promise<boolean> {
    const insertedBatch = await database.$queryRaw<Array<{ batchId: string }>>(Prisma.sql`
      INSERT INTO "telemetry_batches" ("batch_id", "environment_id", "event_count")
      VALUES (${job.batch.batchId}::uuid, ${job.environmentId}::uuid, ${job.batch.events.length})
      ON CONFLICT ("batch_id") DO NOTHING
      RETURNING "batch_id" AS "batchId"
    `);
    if (insertedBatch.length === 0) {
      return false;
    }

    for (const event of job.batch.events) {
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
}
