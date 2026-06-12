ALTER TABLE "heartbeat_events"
    DROP CONSTRAINT "heartbeat_events_uptime_nonnegative",
    ADD CONSTRAINT "heartbeat_events_uptime_bounded"
        CHECK ("uptime_ms" BETWEEN 0 AND 9007199254740991);
