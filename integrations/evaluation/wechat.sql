-- Reuses BeeEVAL users; does not change tiers of any existing account.
CREATE TABLE IF NOT EXISTS member_wechat_identities (
  app_id TEXT NOT NULL,
  open_id TEXT NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(app_id, open_id),
  UNIQUE(app_id, user_id)
);
