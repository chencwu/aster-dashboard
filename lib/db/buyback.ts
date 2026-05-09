import { sql } from "@vercel/postgres";
import { isPostgresConfigured } from "@/lib/db/oi-history";
import type { AssistanceFundBalance, AssistanceFundFill } from "@/lib/sources/hyperliquid-buyback";
import { toNumber } from "@/lib/utils";

export { isPostgresConfigured };

const FRESH_READ_QUERY_TEXT_TTL_MS = 60_000;

function freshReadMarker(domain: string) {
  const bucket = Math.floor(Date.now() / FRESH_READ_QUERY_TEXT_TTL_MS);
  return `/* ${domain}:fresh:${bucket} */`;
}

export async function ensureBuybackSchema() {
  if (!isPostgresConfigured()) return false;

  await sql`
    CREATE TABLE IF NOT EXISTS hl_buyback_fills (
      tid TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      ts TIMESTAMPTZ NOT NULL,
      px NUMERIC NOT NULL,
      sz NUMERIC NOT NULL,
      start_position NUMERIC
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_hl_buyback_fills_ts
      ON hl_buyback_fills (ts DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS hl_buyback_balance_snapshots (
      ts TIMESTAMPTZ PRIMARY KEY,
      hype_balance NUMERIC NOT NULL,
      entry_notional NUMERIC NOT NULL
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_hl_buyback_balance_ts
      ON hl_buyback_balance_snapshots (ts DESC)
  `;

  return true;
}

async function analyzeBuybackTables() {
  if (!isPostgresConfigured()) return;
  await sql`ANALYZE hl_buyback_fills`;
  await sql`ANALYZE hl_buyback_balance_snapshots`;
}

export async function getLatestFillTime(): Promise<number | null> {
  if (!isPostgresConfigured()) return null;

  const { rows } = await sql.query<{ ts: number | string | null }>(
    `
    ${freshReadMarker("buyback:latest-fill-time")}
    SELECT EXTRACT(EPOCH FROM MAX(ts)) * 1000 AS ts FROM hl_buyback_fills
  `
  );

  const value = rows[0]?.ts;
  return value == null ? null : toNumber(value);
}

export async function insertBuybackFills(fills: AssistanceFundFill[]) {
  if (!isPostgresConfigured() || !fills.length) return 0;

  const payload = JSON.stringify(
    fills.map((fill) => ({
      tid: fill.tid,
      hash: fill.hash,
      ts: new Date(fill.ts).toISOString(),
      px: fill.px,
      sz: fill.sz,
      start_position: fill.startPosition
    }))
  );

  await sql`
    INSERT INTO hl_buyback_fills (tid, hash, ts, px, sz, start_position)
    SELECT tid, hash, ts::timestamptz, px, sz, start_position
    FROM jsonb_to_recordset(${payload}::jsonb) AS item(
      tid TEXT,
      hash TEXT,
      ts TEXT,
      px NUMERIC,
      sz NUMERIC,
      start_position NUMERIC
    )
    ON CONFLICT (tid) DO NOTHING
  `;

  await analyzeBuybackTables();

  return fills.length;
}

export async function backfillBalanceFromFills() {
  if (!isPostgresConfigured()) return 0;

  const { rows } = await sql.query<{ inserted: number | string | null }>(
    `
    ${freshReadMarker("buyback:backfill-balance")}
    WITH ranked AS (
      SELECT
        ts,
        sz,
        px,
        start_position,
        SUM(sz * px) OVER (ORDER BY ts) AS cum_cost,
        ROW_NUMBER() OVER (
          PARTITION BY date_trunc('day', ts)
          ORDER BY ts DESC
        ) AS rn
      FROM hl_buyback_fills
      WHERE date_trunc('day', ts) < date_trunc('day', NOW())
    ),
    existing_days AS (
      SELECT DISTINCT date_trunc('day', ts) AS day
      FROM hl_buyback_balance_snapshots
    ),
    inserted AS (
      INSERT INTO hl_buyback_balance_snapshots (ts, hype_balance, entry_notional)
      SELECT
        date_trunc('day', r.ts) + INTERVAL '23 hours 59 minutes 59 seconds' AS snap_ts,
        (r.start_position + r.sz)::numeric AS hype_balance,
        r.cum_cost::numeric AS entry_notional
      FROM ranked r
      LEFT JOIN existing_days e ON e.day = date_trunc('day', r.ts)
      WHERE r.rn = 1 AND e.day IS NULL
      ON CONFLICT (ts) DO NOTHING
      RETURNING 1
    )
    SELECT COUNT(*) AS inserted FROM inserted
  `
  );

  return Math.max(0, toNumber(rows[0]?.inserted));
}

export async function insertBalanceSnapshot(balance: AssistanceFundBalance) {
  if (!isPostgresConfigured()) return false;

  const ts = new Date(balance.fetchedAt).toISOString();

  await sql`
    INSERT INTO hl_buyback_balance_snapshots (ts, hype_balance, entry_notional)
    VALUES (${ts}::timestamptz, ${balance.hypeBalance}, ${balance.entryNotional})
    ON CONFLICT (ts) DO UPDATE SET
      hype_balance = EXCLUDED.hype_balance,
      entry_notional = EXCLUDED.entry_notional
  `;

  await sql`ANALYZE hl_buyback_balance_snapshots`;

  return true;
}

export type BuybackDailyRow = {
  date: string;
  hypeBought: number;
  usdcSpent: number;
  fillCount: number;
};

export async function getDailyBuyback(days: number): Promise<BuybackDailyRow[]> {
  if (!isPostgresConfigured()) return [];

  const { rows } = await sql.query<{
    date: Date | string;
    hype_bought: number | string;
    usdc_spent: number | string;
    fill_count: number | string;
  }>(
    `
    ${freshReadMarker("buyback:daily")}
    SELECT
      date_trunc('day', ts) AS date,
      SUM(sz)::float AS hype_bought,
      SUM(sz * px)::float AS usdc_spent,
      COUNT(*) AS fill_count
    FROM hl_buyback_fills
    WHERE ts >= NOW() - ($1::int * INTERVAL '1 day')
    GROUP BY date_trunc('day', ts)
    ORDER BY date ASC
  `,
    [days]
  );

  return rows.map((row) => ({
    date: new Date(row.date).toISOString().slice(0, 10),
    hypeBought: toNumber(row.hype_bought),
    usdcSpent: toNumber(row.usdc_spent),
    fillCount: Math.max(0, toNumber(row.fill_count))
  }));
}

export type BuybackTotals = {
  hypeBought: number;
  usdcSpent: number;
  fillCount: number;
  firstFillAt: number | null;
  lastFillAt: number | null;
};

export async function getBuybackTotals(): Promise<BuybackTotals> {
  if (!isPostgresConfigured()) {
    return { hypeBought: 0, usdcSpent: 0, fillCount: 0, firstFillAt: null, lastFillAt: null };
  }

  const { rows } = await sql.query<{
    hype_bought: number | string | null;
    usdc_spent: number | string | null;
    fill_count: number | string;
    first_ts: Date | string | null;
    last_ts: Date | string | null;
  }>(
    `
    ${freshReadMarker("buyback:totals")}
    SELECT
      SUM(sz)::float AS hype_bought,
      SUM(sz * px)::float AS usdc_spent,
      COUNT(*) AS fill_count,
      MIN(ts) AS first_ts,
      MAX(ts) AS last_ts
    FROM hl_buyback_fills
  `
  );

  const row = rows[0];

  return {
    hypeBought: toNumber(row?.hype_bought),
    usdcSpent: toNumber(row?.usdc_spent),
    fillCount: Math.max(0, toNumber(row?.fill_count)),
    firstFillAt: row?.first_ts ? new Date(row.first_ts).getTime() : null,
    lastFillAt: row?.last_ts ? new Date(row.last_ts).getTime() : null
  };
}

export type WindowBuyback = {
  hypeBought: number;
  usdcSpent: number;
};

export async function getWindowBuyback(hours: number): Promise<WindowBuyback> {
  if (!isPostgresConfigured()) return { hypeBought: 0, usdcSpent: 0 };

  const { rows } = await sql.query<{
    hype_bought: number | string | null;
    usdc_spent: number | string | null;
  }>(
    `
    ${freshReadMarker("buyback:window")}
    SELECT
      SUM(sz)::float AS hype_bought,
      SUM(sz * px)::float AS usdc_spent
    FROM hl_buyback_fills
    WHERE ts >= NOW() - ($1::int * INTERVAL '1 hour')
  `,
    [hours]
  );

  return {
    hypeBought: toNumber(rows[0]?.hype_bought),
    usdcSpent: toNumber(rows[0]?.usdc_spent)
  };
}

export type BalanceSeriesPoint = {
  ts: number;
  hypeBalance: number;
  entryNotional: number;
};

export async function getDailyBalanceSeries(days: number): Promise<BalanceSeriesPoint[]> {
  if (!isPostgresConfigured()) return [];

  const { rows } = await sql.query<{
    bucket: Date | string;
    hype_balance: number | string;
    entry_notional: number | string;
  }>(
    `
    ${freshReadMarker("buyback:balance-series")}
    SELECT
      date_trunc('day', ts) AS bucket,
      (ARRAY_AGG(hype_balance ORDER BY ts DESC))[1]::float AS hype_balance,
      (ARRAY_AGG(entry_notional ORDER BY ts DESC))[1]::float AS entry_notional
    FROM hl_buyback_balance_snapshots
    WHERE ts >= NOW() - ($1::int * INTERVAL '1 day')
    GROUP BY bucket
    ORDER BY bucket ASC
  `,
    [days]
  );

  return rows.map((row) => ({
    ts: new Date(row.bucket).getTime(),
    hypeBalance: toNumber(row.hype_balance),
    entryNotional: toNumber(row.entry_notional)
  }));
}

export async function getLatestBalanceSnapshot(): Promise<BalanceSeriesPoint | null> {
  if (!isPostgresConfigured()) return null;

  const { rows } = await sql.query<{
    ts: Date | string;
    hype_balance: number | string;
    entry_notional: number | string;
  }>(
    `
    ${freshReadMarker("buyback:latest-balance")}
    SELECT ts, hype_balance::float AS hype_balance, entry_notional::float AS entry_notional
    FROM hl_buyback_balance_snapshots
    ORDER BY ts DESC
    LIMIT 1
  `
  );

  const row = rows[0];
  if (!row) return null;

  return {
    ts: new Date(row.ts).getTime(),
    hypeBalance: toNumber(row.hype_balance),
    entryNotional: toNumber(row.entry_notional)
  };
}
