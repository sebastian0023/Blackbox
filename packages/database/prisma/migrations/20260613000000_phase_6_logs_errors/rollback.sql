DROP TABLE IF EXISTS "error_events";
DROP TABLE IF EXISTS "log_events";

DELETE FROM "telemetry_event_ids" WHERE "event_type" IN ('log', 'error');

ALTER TABLE "telemetry_event_ids"
    DROP CONSTRAINT "telemetry_event_ids_type_valid";

ALTER TABLE "telemetry_event_ids"
    ADD CONSTRAINT "telemetry_event_ids_type_valid"
        CHECK ("event_type" IN ('heartbeat', 'process_metric'));
