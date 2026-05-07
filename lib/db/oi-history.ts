import { sql } from "@vercel/postgres";
import type { HistoryPoint, Market, ProtocolSlug } from "@/lib/types";
import { mapLimit, pctChange, toNumber } from "@/lib/utils";

export function isPostgresConfigured() {
  return Boolean(
    process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL_NON_POOLING
  );
}

export async function ensureOiSchema() {
  if (!isPostgresConfigured()) return false;

  await sql`
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
    )
  `;

  await sql`ALTER TABLE oi_snapshots ADD COLUMN IF NOT EXISTS oi_base NUMERIC`;
  await sql`ALTER TABLE oi_snapshots ADD COLUMN IF NOT EXISTS mark_price NUMERIC`;
  await sql`ALTER TABLE oi_snapshots ADD COLUMN IF NOT EXISTS funding_rate NUMERIC`;
  await sql`ALTER TABLE oi_snapshots ADD COLUMN IF NOT EXISTS volume24h_usd NUMERIC`;
  await sql`ALTER TABLE oi_snapshots ADD COLUMN IF NOT EXISTS is_imputed BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE oi_snapshots ADD COLUMN IF NOT EXISTS imputed_reason TEXT`;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_oi_snapshots_lookup
      ON oi_snapshots (protocol, symbol, ts DESC)
  `;

  return true;
}

type HistoryRow = {
  ts: number | string;
  value: number | string;
  is_imputed?: boolean;
  imputed_reason?: string | null;
};

type LatestSnapshotRow = {
  symbol: string;
  oi_base: number | string | null;
  oi_usd: number | string | null;
  mark_price: number | string | null;
  funding_rate: number | string | null;
  volume24h_usd: number | string | null;
};

type SnapshotPayloadRow = {
  symbol: string;
  oi_base: number;
  oi_usd: number;
  mark_price: number;
  funding_rate: number;
  volume24h_usd: number;
  is_imputed: boolean;
  imputed_reason: string | null;
};

export async function getOiHistory(
  protocol: ProtocolSlug,
  symbol: string,
  hours = 168
): Promise<HistoryPoint[]> {
  if (!isPostgresConfigured()) return [];

  const { rows } = await sql<HistoryRow>`
    SELECT
      EXTRACT(EPOCH FROM ts) * 1000 AS ts,
      oi_usd::float AS value,
      is_imputed,
      imputed_reason
    FROM oi_snapshots
    WHERE protocol = ${protocol}
      AND symbol = ${symbol}
      AND ts >= NOW() - (${hours} * INTERVAL '1 hour')
    ORDER BY ts ASC
  `;

  return rows.map((row) => ({
    ts: toNumber(row.ts),
    value: toNumber(row.value),
    isImputed: Boolean(row.is_imputed),
    imputedReason: row.imputed_reason ?? null
  }));
}

export async function getCollectedHours(protocol: ProtocolSlug, symbol: string) {
  if (!isPostgresConfigured()) return 0;

  const { rows } = await sql<{ hours: number | string | null }>`
    SELECT EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts))) / 3600 AS hours
    FROM oi_snapshots
    WHERE protocol = ${protocol}
      AND symbol = ${symbol}
  `;

  return Math.max(0, toNumber(rows[0]?.hours));
}

export async function getCollectionSummary(protocol: ProtocolSlug, symbol: string) {
  if (!isPostgresConfigured()) {
    return { collectedHours: 0, pointCount: 0, firstTs: null, lastTs: null };
  }

  const { rows } = await sql<{
    hours: number | string | null;
    point_count: number | string;
    first_ts: Date | string | null;
    last_ts: Date | string | null;
  }>`
    SELECT
      EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts))) / 3600 AS hours,
      COUNT(*) AS point_count,
      MIN(ts) AS first_ts,
      MAX(ts) AS last_ts
    FROM oi_snapshots
    WHERE protocol = ${protocol}
      AND symbol = ${symbol}
  `;

  const row = rows[0];

  return {
    collectedHours: Math.max(0, toNumber(row?.hours)),
    pointCount: Math.max(0, toNumber(row?.point_count)),
    firstTs: row?.first_ts ? new Date(row.first_ts).getTime() : null,
    lastTs: row?.last_ts ? new Date(row.last_ts).getTime() : null
  };
}

export async function getOiAtOrBefore(
  protocol: ProtocolSlug,
  symbol: string,
  hoursAgo: number
) {
  if (!isPostgresConfigured()) return null;

  const { rows } = await sql<{ value: number | string }>`
    SELECT oi_usd::float AS value
    FROM oi_snapshots
    WHERE protocol = ${protocol}
      AND symbol = ${symbol}
      AND ts <= NOW() - (${hoursAgo} * INTERVAL '1 hour')
    ORDER BY ts DESC
    LIMIT 1
  `;

  return rows[0] ? toNumber(rows[0].value) : null;
}

export async function attachOiDeltas(markets: Market[]) {
  if (!isPostgresConfigured()) return markets;

  return mapLimit(markets, 8, async (market) => {
    const [oneHourAgo, oneDayAgo, sevenDaysAgo] = await Promise.all([
      getOiAtOrBefore(market.protocol, market.symbol, 1),
      getOiAtOrBefore(market.protocol, market.symbol, 24),
      getOiAtOrBefore(market.protocol, market.symbol, 24 * 7)
    ]);

    return {
      ...market,
      oiDelta1hPct: oneHourAgo == null ? null : pctChange(market.oi, oneHourAgo),
      oiDelta24hPct: oneDayAgo == null ? null : pctChange(market.oi, oneDayAgo),
      oiDelta7dPct: sevenDaysAgo == null ? null : pctChange(market.oi, sevenDaysAgo)
    };
  });
}

export async function getProtocolOiSeries(protocol: ProtocolSlug, hours = 168) {
  if (!isPostgresConfigured()) return [];

  const { rows } = await sql<HistoryRow>`
    WITH hourly AS (
      SELECT
        symbol,
        date_trunc('hour', ts) AS bucket,
        oi_usd,
        ROW_NUMBER() OVER (
          PARTITION BY symbol, date_trunc('hour', ts)
          ORDER BY ts DESC
        ) AS rn
      FROM oi_snapshots
      WHERE protocol = ${protocol}
        AND ts >= NOW() - (${hours} * INTERVAL '1 hour')
    )
    SELECT
      EXTRACT(EPOCH FROM bucket) * 1000 AS ts,
      SUM(oi_usd)::float AS value
    FROM hourly
    WHERE rn = 1
    GROUP BY bucket
    ORDER BY bucket ASC
  `;

  return rows.map((row) => ({
    ts: toNumber(row.ts),
    value: toNumber(row.value)
  }));
}

export async function getProtocolOiAtOrBefore(protocol: ProtocolSlug, hoursAgo: number) {
  if (!isPostgresConfigured()) return null;

  const { rows } = await sql<{ value: number | string | null }>`
    SELECT SUM(oi_usd)::float AS value
    FROM (
      SELECT DISTINCT ON (symbol)
        symbol,
        oi_usd
      FROM oi_snapshots
      WHERE protocol = ${protocol}
        AND ts <= NOW() - (${hoursAgo} * INTERVAL '1 hour')
      ORDER BY symbol, ts DESC
    ) latest
  `;

  return rows[0]?.value == null ? null : toNumber(rows[0].value);
}

function isPositiveFinite(value: number) {
  return Number.isFinite(value) && value > 0;
}

async function getLatestSnapshotMap(protocol: ProtocolSlug) {
  const { rows } = await sql<LatestSnapshotRow>`
    SELECT DISTINCT ON (symbol)
      symbol,
      oi_base::float AS oi_base,
      oi_usd::float AS oi_usd,
      mark_price::float AS mark_price,
      funding_rate::float AS funding_rate,
      volume24h_usd::float AS volume24h_usd
    FROM oi_snapshots
    WHERE protocol = ${protocol}
    ORDER BY symbol, ts DESC
  `;

  return new Map(
    rows.map((row) => [
      row.symbol,
      {
        oiBase: toNumber(row.oi_base),
        oi: toNumber(row.oi_usd),
        markPrice: toNumber(row.mark_price),
        fundingRate: toNumber(row.funding_rate),
        volume24h: toNumber(row.volume24h_usd)
      }
    ])
  );
}

function prepareSnapshotRows(
  markets: Market[],
  latestSnapshots: Awaited<ReturnType<typeof getLatestSnapshotMap>>
): SnapshotPayloadRow[] {
  return markets.flatMap((market) => {
    const previous = latestSnapshots.get(market.symbol);
    const invalidOi =
      !isPositiveFinite(market.oi) ||
      !isPositiveFinite(market.oiBase) ||
      !isPositiveFinite(market.markPrice);
    const reasons: string[] = [];

    if (invalidOi) {
      if (
        !previous ||
        !isPositiveFinite(previous.oi) ||
        !isPositiveFinite(previous.oiBase) ||
        !isPositiveFinite(previous.markPrice)
      ) {
        return [];
      }

      reasons.push("oi_or_mark_price_invalid");
    }

    return [
      {
        symbol: market.symbol,
        oi_base: invalidOi ? previous!.oiBase : market.oiBase,
        oi_usd: invalidOi ? previous!.oi : market.oi,
        mark_price: invalidOi ? previous!.markPrice : market.markPrice,
        funding_rate: Number.isFinite(market.fundingRate)
          ? market.fundingRate
          : previous?.fundingRate ?? 0,
        volume24h_usd: Number.isFinite(market.volume24h) ? market.volume24h : 0,
        is_imputed: reasons.length > 0,
        imputed_reason: reasons.length ? reasons.join(",") : null
      }
    ];
  });
}

export async function insertOiSnapshots(protocol: ProtocolSlug, markets: Market[]) {
  if (!isPostgresConfigured()) return 0;

  await ensureOiSchema();

  const latestSnapshots = await getLatestSnapshotMap(protocol);
  const rows = prepareSnapshotRows(markets, latestSnapshots);

  if (!rows.length) return 0;

  await sql`
    WITH payload AS (
      SELECT *
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS item(
        symbol TEXT,
        oi_base NUMERIC,
        oi_usd NUMERIC,
        mark_price NUMERIC,
        funding_rate NUMERIC,
        volume24h_usd NUMERIC,
        is_imputed BOOLEAN,
        imputed_reason TEXT
      )
    ),
    snapshot AS (
      SELECT to_timestamp(floor(extract(epoch from NOW()) / 300) * 300) AS ts
    )
    INSERT INTO oi_snapshots (
      protocol,
      symbol,
      ts,
      oi_base,
      oi_usd,
      mark_price,
      funding_rate,
      volume24h_usd,
      is_imputed,
      imputed_reason
    )
    SELECT
      ${protocol},
      payload.symbol,
      snapshot.ts,
      payload.oi_base,
      payload.oi_usd,
      payload.mark_price,
      payload.funding_rate,
      payload.volume24h_usd,
      payload.is_imputed,
      payload.imputed_reason
    FROM payload
    CROSS JOIN snapshot
    ON CONFLICT (protocol, symbol, ts) DO UPDATE SET
      oi_base = EXCLUDED.oi_base,
      oi_usd = EXCLUDED.oi_usd,
      mark_price = EXCLUDED.mark_price,
      funding_rate = EXCLUDED.funding_rate,
      volume24h_usd = EXCLUDED.volume24h_usd,
      is_imputed = EXCLUDED.is_imputed,
      imputed_reason = EXCLUDED.imputed_reason
  `;

  return rows.length;
}
