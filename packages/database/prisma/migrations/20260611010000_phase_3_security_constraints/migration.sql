ALTER TABLE "users"
    ADD CONSTRAINT "users_password_hash_argon2id"
    CHECK ("password_hash" LIKE '$argon2id$%');

ALTER TABLE "sessions"
    ADD CONSTRAINT "sessions_token_hash_sha256"
    CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "sessions_csrf_token_hash_sha256"
    CHECK ("csrf_token_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "ingest_keys"
    ADD CONSTRAINT "ingest_keys_secret_hash_sha256"
    CHECK ("secret_hash" ~ '^[0-9a-f]{64}$');
