ALTER TABLE "ingest_keys"
    DROP CONSTRAINT IF EXISTS "ingest_keys_secret_hash_sha256";

ALTER TABLE "sessions"
    DROP CONSTRAINT IF EXISTS "sessions_csrf_token_hash_sha256",
    DROP CONSTRAINT IF EXISTS "sessions_token_hash_sha256";

ALTER TABLE "users"
    DROP CONSTRAINT IF EXISTS "users_password_hash_argon2id";
