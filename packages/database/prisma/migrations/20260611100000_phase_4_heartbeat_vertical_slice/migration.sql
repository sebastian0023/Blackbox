CREATE TABLE "telemetry_batches" (
    "batch_id" UUID NOT NULL,
    "environment_id" UUID NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_count" INTEGER NOT NULL,
    CONSTRAINT "telemetry_batches_pkey" PRIMARY KEY ("batch_id"),
    CONSTRAINT "telemetry_batches_event_count_bounded" CHECK ("event_count" BETWEEN 1 AND 100),
    CONSTRAINT "telemetry_batches_environment_id_fkey"
        FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE
);

CREATE INDEX "telemetry_batches_environment_id_processed_at_idx"
    ON "telemetry_batches"("environment_id", "processed_at" DESC);

CREATE TABLE "telemetry_event_ids" (
    "event_id" UUID NOT NULL,
    "event_type" VARCHAR(32) NOT NULL,
    "first_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telemetry_event_ids_pkey" PRIMARY KEY ("event_id"),
    CONSTRAINT "telemetry_event_ids_type_heartbeat" CHECK ("event_type" = 'heartbeat')
);

CREATE TABLE "heartbeat_events" (
    "event_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "environment_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_interval_ms" INTEGER NOT NULL,
    "uptime_ms" BIGINT NOT NULL,
    "service_name" VARCHAR(100) NOT NULL,
    "service_version" VARCHAR(100),
    CONSTRAINT "heartbeat_events_expected_interval_bounded"
        CHECK ("expected_interval_ms" BETWEEN 5000 AND 300000),
    CONSTRAINT "heartbeat_events_uptime_nonnegative" CHECK ("uptime_ms" >= 0),
    CONSTRAINT "heartbeat_events_batch_id_fkey"
        FOREIGN KEY ("batch_id") REFERENCES "telemetry_batches"("batch_id") ON DELETE CASCADE,
    CONSTRAINT "heartbeat_events_environment_id_fkey"
        FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE
) PARTITION BY RANGE ("occurred_at");

CREATE TABLE "heartbeat_events_default"
    PARTITION OF "heartbeat_events" DEFAULT;

CREATE UNIQUE INDEX "heartbeat_events_event_id_occurred_at_key"
    ON "heartbeat_events"("event_id", "occurred_at");
CREATE INDEX "heartbeat_events_environment_occurred_event_idx"
    ON "heartbeat_events"("environment_id", "occurred_at" DESC, "event_id" DESC);

CREATE TABLE "heartbeat_states" (
    "environment_id" UUID NOT NULL,
    "last_heartbeat_at" TIMESTAMPTZ(3) NOT NULL,
    "expected_interval_ms" INTEGER NOT NULL,
    "service_name" VARCHAR(100) NOT NULL,
    "service_version" VARCHAR(100),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "heartbeat_states_pkey" PRIMARY KEY ("environment_id"),
    CONSTRAINT "heartbeat_states_expected_interval_bounded"
        CHECK ("expected_interval_ms" BETWEEN 5000 AND 300000),
    CONSTRAINT "heartbeat_states_environment_id_fkey"
        FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE
);

CREATE INDEX "heartbeat_states_evaluation_idx"
    ON "heartbeat_states"("last_heartbeat_at", "expected_interval_ms");

CREATE TABLE "heartbeat_incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "environment_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(32) NOT NULL DEFAULT 'heartbeat_missing',
    "summary" VARCHAR(255) NOT NULL DEFAULT 'Heartbeat missing; downtime is inferred.',
    "last_observed_heartbeat_at" TIMESTAMPTZ(3) NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    CONSTRAINT "heartbeat_incidents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "heartbeat_incidents_status_valid" CHECK ("status" IN ('open', 'resolved')),
    CONSTRAINT "heartbeat_incidents_reason_valid" CHECK ("reason" = 'heartbeat_missing'),
    CONSTRAINT "heartbeat_incidents_resolution_valid"
        CHECK (("status" = 'open' AND "resolved_at" IS NULL) OR
               ("status" = 'resolved' AND "resolved_at" IS NOT NULL)),
    CONSTRAINT "heartbeat_incidents_environment_id_fkey"
        FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "heartbeat_incidents_one_open_per_environment_key"
    ON "heartbeat_incidents"("environment_id") WHERE "status" = 'open';
CREATE INDEX "heartbeat_incidents_environment_opened_idx"
    ON "heartbeat_incidents"("environment_id", "opened_at" DESC);
