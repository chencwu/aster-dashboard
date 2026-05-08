CREATE TABLE IF NOT EXISTS oi_snapshots (
  protocol TEXT NOT NULL,
  symbol TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  oi_base NUMERIC,
  oi_usd NUMERIC NOT NULL,
  mark_price NUMERIC,
  funding_rate NUMERIC,
  volume24h_usd NUMERIC,
  is_imputed BOOLEAN NOT NULL DEFAULT FALSE,
  imputed_reason TEXT,
  PRIMARY KEY (protocol, symbol, ts)
);

CREATE INDEX IF NOT EXISTS idx_oi_snapshots_lookup
  ON oi_snapshots (protocol, symbol, ts DESC);

CREATE INDEX IF NOT EXISTS idx_oi_snapshots_protocol_ts
  ON oi_snapshots (protocol, ts DESC);

CREATE TABLE IF NOT EXISTS precomputed_payloads (
  key TEXT PRIMARY KEY,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_precomputed_payloads_generated_at
  ON precomputed_payloads (generated_at DESC);

CREATE TABLE IF NOT EXISTS hl_buyback_fills (
  tid TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  px NUMERIC NOT NULL,
  sz NUMERIC NOT NULL,
  start_position NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_hl_buyback_fills_ts
  ON hl_buyback_fills (ts DESC);

CREATE TABLE IF NOT EXISTS hl_buyback_balance_snapshots (
  ts TIMESTAMPTZ PRIMARY KEY,
  hype_balance NUMERIC NOT NULL,
  entry_notional NUMERIC NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hl_buyback_balance_ts
  ON hl_buyback_balance_snapshots (ts DESC);
