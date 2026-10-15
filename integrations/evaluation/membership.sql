-- Apply on the existing BeeEVAL users database before deploying the router.
-- Existing account roles and memberships are intentionally not changed here.
ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_tier VARCHAR(16);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32);
CREATE TABLE IF NOT EXISTS member_verifications (
 recipient VARCHAR(254) NOT NULL, channel VARCHAR(8) NOT NULL,
 challenge VARCHAR(64) NOT NULL UNIQUE, code_hash VARCHAR(64) NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL, sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 attempts INTEGER NOT NULL DEFAULT 0, consumed BOOLEAN NOT NULL DEFAULT FALSE,
 PRIMARY KEY(recipient,channel)
);
CREATE TABLE IF NOT EXISTS member_verification_limits (
 bucket VARCHAR(300) PRIMARY KEY, hits INTEGER NOT NULL, window_start TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS user_report_entitlements (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 report_key VARCHAR(64) NOT NULL, granted_by INTEGER NOT NULL REFERENCES users(id),
 granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ,
 PRIMARY KEY(user_id,report_key)
);
