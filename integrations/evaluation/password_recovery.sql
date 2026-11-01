-- Separate proof of password recovery from registration challenges.
CREATE TABLE IF NOT EXISTS member_password_resets (
 recipient VARCHAR(254) PRIMARY KEY,
 user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
 challenge VARCHAR(64) UNIQUE NOT NULL,
 code_hash VARCHAR(64) NOT NULL,
 sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 consumed BOOLEAN NOT NULL DEFAULT FALSE
);
