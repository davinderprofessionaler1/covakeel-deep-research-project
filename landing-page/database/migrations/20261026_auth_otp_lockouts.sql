CREATE TABLE IF NOT EXISTS auth_otp_lockouts (
  email VARCHAR(200) PRIMARY KEY,
  failed_attempts SMALLINT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_otp_lockouts_expiry_idx
  ON auth_otp_lockouts (locked_until);
