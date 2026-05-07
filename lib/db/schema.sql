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
