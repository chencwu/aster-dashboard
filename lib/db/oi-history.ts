import { sql } from "@vercel/postgres";
import { DELTA_PERIODS, DELTA_PERIOD_HOURS, type HistoryPoint, type Market, type ProtocolSlug } from "@/lib/types";
import { pctChange, toNumber } from "@/lib/utils";

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
  await sql`
    CREATE INDEX IF NOT EXISTS idx_oi_snapshots_protocol_ts
      ON oi_snapshots (protocol, ts DESC)
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

const SNAPSHOT_DELTA_WINDOWS = [
  ...DELTA_PERIODS.map((period) => ({
    period,
    hours: DELTA_PERIOD_HOURS[period]
  })),
  { period: "7d" as const, hours: 168 }
] as const;

type SnapshotDeltaRow = {
  symbol: string;
  period: SnapshotDeltaPeriod;
  oi_value: number | string | null;
  volume_value: number | string | null;
};

type SnapshotDeltaPeriod = (typeof SNAPSHOT_DELTA_WINDOWS)[number]["period"];

type SnapshotDelta = {
  oi: Partial<Record<SnapshotDeltaPeriod, number | null>>;
  volume: Partial<Record<SnapshotDeltaPeriod, number | null>>;
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

const FRESH_READ_QUERY_TEXT_TTL_MS = 60_000;

function freshReadMarker(domain: string) {
  const bucket = Math.floor(Date.now() / FRESH_READ_QUERY_TEXT_TTL_MS);
  return `/* ${domain}:fresh:${bucket} */`;
}

function maxSnapshotStalenessHours(hoursAgo: number) {
  if (hoursAgo <= 1) return 1;
  if (hoursAgo <= 24) return 3;
  return 12;
}

function valueDelta(current: number, previous: number | null | undefined) {
  if (!Number.isFinite(current) || previous == null || !Number.isFinite(previous)) {
    return null;
  }

  return current - previous;
}

export async function getOiHistory(
  protocol: ProtocolSlug,
  symbol: string,
  hours = 168
): Promise<HistoryPoint[]> {
  if (!isPostgresConfigured()) return [];

  const { rows } = await sql.query<HistoryRow>(
    `
    ${freshReadMarker("oi:get-history")}
    SELECT
      EXTRACT(EPOCH FROM ts) * 1000 AS ts,
      oi_usd::float AS value,
      is_imputed,
      imputed_reason
    FROM oi_snapshots
    WHERE protocol = $1
      AND symbol = $2
      AND ts >= NOW() - ($3::int * INTERVAL '1 hour')
    ORDER BY ts ASC
  `,
    [protocol, symbol, hours]
  );

  return rows.map((row) => ({
    ts: toNumber(row.ts),
    value: toNumber(row.value),
    isImputed: Boolean(row.is_imputed),
    imputedReason: row.imputed_reason ?? null
  }));
}

export async function getCollectedHours(protocol: ProtocolSlug, symbol: string) {
  if (!isPostgresConfigured()) return 0;

  const { rows } = await sql.query<{ hours: number | string | null }>(
    `
    ${freshReadMarker("oi:collected-hours")}
    SELECT EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts))) / 3600 AS hours
    FROM oi_snapshots
    WHERE protocol = $1
      AND symbol = $2
  `,
    [protocol, symbol]
  );

  return Math.max(0, toNumber(rows[0]?.hours));
}

export async function getCollectionSummary(protocol: ProtocolSlug, symbol: string) {
  if (!isPostgresConfigured()) {
    return { collectedHours: 0, pointCount: 0, firstTs: null, lastTs: null };
  }

  const { rows } = await sql.query<{
    hours: number | string | null;
    point_count: number | string;
    first_ts: Date | string | null;
    last_ts: Date | string | null;
  }>(
    `
    ${freshReadMarker("oi:collection-summary")}
    SELECT
      EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts))) / 3600 AS hours,
      COUNT(*) AS point_count,
      MIN(ts) AS first_ts,
      MAX(ts) AS last_ts
    FROM oi_snapshots
    WHERE protocol = $1
      AND symbol = $2
  `,
    [protocol, symbol]
  );

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

  const maxAgeHours = hoursAgo + maxSnapshotStalenessHours(hoursAgo);
  const { rows } = await sql.query<{ value: number | string }>(
    `
    ${freshReadMarker("oi:at-or-before")}
    SELECT oi_usd::float AS value
    FROM oi_snapshots
    WHERE protocol = $1
      AND symbol = $2
      AND ts <= NOW() - ($3::int * INTERVAL '1 hour')
      AND ts >= NOW() - ($4::int * INTERVAL '1 hour')
    ORDER BY ts DESC
    LIMIT 1
  `,
    [protocol, symbol, hoursAgo, maxAgeHours]
  );

  return rows[0] ? toNumber(rows[0].value) : null;
}

async function getSnapshotDeltaMap(protocol: ProtocolSlug, symbols: string[]) {
  const uniqueSymbols = Array.from(new Set(symbols.filter(Boolean)));
  const empty = new Map<string, SnapshotDelta>();

  if (!isPostgresConfigured() || !uniqueSymbols.length) return empty;

  const payload = JSON.stringify(uniqueSymbols.map((symbol) => ({ symbol })));
  const windows = JSON.stringify(
    SNAPSHOT_DELTA_WINDOWS.map((window) => ({
      ...window,
      max_age: window.hours + maxSnapshotStalenessHours(window.hours)
    }))
  );
  const { rows } = await sql.query<SnapshotDeltaRow>(
    `
    ${freshReadMarker("oi:snapshot-delta-map")}
    WITH requested AS (
      SELECT symbol
      FROM jsonb_to_recordset($1::jsonb) AS item(symbol TEXT)
    ),
    windows AS (
      SELECT period, hours, max_age
      FROM jsonb_to_recordset($2::jsonb) AS item(
        period TEXT,
        hours INT,
        max_age INT
      )
    )
    SELECT
      requested.symbol,
      windows.period,
      snapshot.oi_value,
      snapshot.volume_value
    FROM requested
    CROSS JOIN windows
    LEFT JOIN LATERAL (
      SELECT
        oi_usd::float AS oi_value,
        volume24h_usd::float AS volume_value
      FROM oi_snapshots
      WHERE protocol = $3
        AND symbol = requested.symbol
        AND ts <= NOW() - (windows.hours * INTERVAL '1 hour')
        AND ts >= NOW() - (windows.max_age * INTERVAL '1 hour')
      ORDER BY ts DESC
      LIMIT 1
    ) snapshot ON TRUE
  `,
    [payload, windows, protocol]
  );

  const deltaMap = new Map<string, SnapshotDelta>();

  rows.forEach((row) => {
    const delta = deltaMap.get(row.symbol) ?? { oi: {}, volume: {} };
    delta.oi[row.period] = row.oi_value == null ? null : toNumber(row.oi_value);
    delta.volume[row.period] =
      row.volume_value == null ? null : toNumber(row.volume_value);
    deltaMap.set(row.symbol, delta);
  });

  return deltaMap;
}

export async function attachOiDeltas(markets: Market[]) {
  if (!isPostgresConfigured()) return markets;

  const grouped = markets.reduce((next, market) => {
    const items = next.get(market.protocol) ?? [];
    items.push(market.symbol);
    next.set(market.protocol, items);
    return next;
  }, new Map<ProtocolSlug, string[]>());
  const deltaMaps = new Map<ProtocolSlug, Awaited<ReturnType<typeof getSnapshotDeltaMap>>>();

  await Promise.all(
    Array.from(grouped.entries()).map(async ([protocol, symbols]) => {
      deltaMaps.set(protocol, await getSnapshotDeltaMap(protocol, symbols));
    })
  );

  return markets.map((market) => {
    const delta = deltaMaps.get(market.protocol)?.get(market.symbol);
    const oi = delta?.oi;
    const volume = delta?.volume;
    return {
      ...market,
      oiDelta1hPct: oi?.["1h"] == null ? null : pctChange(market.oi, oi["1h"]),
      oiDelta4hPct: oi?.["4h"] == null ? null : pctChange(market.oi, oi["4h"]),
      oiDelta8hPct: oi?.["8h"] == null ? null : pctChange(market.oi, oi["8h"]),
      oiDelta12hPct: oi?.["12h"] == null ? null : pctChange(market.oi, oi["12h"]),
      oiDelta24hPct: oi?.["24h"] == null ? null : pctChange(market.oi, oi["24h"]),
      oiDelta7dPct: oi?.["7d"] == null ? null : pctChange(market.oi, oi["7d"]),
      oiDelta1hUsd: valueDelta(market.oi, oi?.["1h"]),
      oiDelta4hUsd: valueDelta(market.oi, oi?.["4h"]),
      oiDelta8hUsd: valueDelta(market.oi, oi?.["8h"]),
      oiDelta12hUsd: valueDelta(market.oi, oi?.["12h"]),
      oiDelta24hUsd: valueDelta(market.oi, oi?.["24h"]),
      oiDelta7dUsd: valueDelta(market.oi, oi?.["7d"]),
      volumeDelta1hPct:
        volume?.["1h"] == null ? null : pctChange(market.volume24h, volume["1h"]),
      volumeDelta4hPct:
        volume?.["4h"] == null ? null : pctChange(market.volume24h, volume["4h"]),
      volumeDelta8hPct:
        volume?.["8h"] == null ? null : pctChange(market.volume24h, volume["8h"]),
      volumeDelta12hPct:
        volume?.["12h"] == null ? null : pctChange(market.volume24h, volume["12h"]),
      volumeDelta24hPct:
        volume?.["24h"] == null ? null : pctChange(market.volume24h, volume["24h"]),
      volumeDelta7dPct:
        volume?.["7d"] == null ? null : pctChange(market.volume24h, volume["7d"]),
      volumeDelta1hUsd: valueDelta(market.volume24h, volume?.["1h"]),
      volumeDelta4hUsd: valueDelta(market.volume24h, volume?.["4h"]),
      volumeDelta8hUsd: valueDelta(market.volume24h, volume?.["8h"]),
      volumeDelta12hUsd: valueDelta(market.volume24h, volume?.["12h"]),
      volumeDelta24hUsd: valueDelta(market.volume24h, volume?.["24h"]),
      volumeDelta7dUsd: valueDelta(market.volume24h, volume?.["7d"])
    };
  });
}

export async function getProtocolOiSeries(protocol: ProtocolSlug, hours = 168) {
  if (!isPostgresConfigured()) return [];

  const { rows } = await sql.query<HistoryRow>(
    `
    ${freshReadMarker("oi:protocol-series")}
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
      WHERE protocol = $1
        AND ts >= NOW() - ($2::int * INTERVAL '1 hour')
    )
    SELECT
      EXTRACT(EPOCH FROM bucket) * 1000 AS ts,
      SUM(oi_usd)::float AS value
    FROM hourly
    WHERE rn = 1
    GROUP BY bucket
    ORDER BY bucket ASC
  `,
    [protocol, hours]
  );

  return rows.map((row) => ({
    ts: toNumber(row.ts),
    value: toNumber(row.value)
  }));
}

export async function getProtocolVolume24hSeries(protocol: ProtocolSlug, hours = 168) {
  if (!isPostgresConfigured()) return [];

  const { rows } = await sql.query<HistoryRow>(
    `
    ${freshReadMarker("oi:protocol-volume-series")}
    WITH hourly AS (
      SELECT
        symbol,
        date_trunc('hour', ts) AS bucket,
        volume24h_usd,
        ROW_NUMBER() OVER (
          PARTITION BY symbol, date_trunc('hour', ts)
          ORDER BY ts DESC
        ) AS rn
      FROM oi_snapshots
      WHERE protocol = $1
        AND volume24h_usd IS NOT NULL
        AND ts >= NOW() - ($2::int * INTERVAL '1 hour')
    )
    SELECT
      EXTRACT(EPOCH FROM bucket) * 1000 AS ts,
      SUM(volume24h_usd)::float AS value
    FROM hourly
    WHERE rn = 1
    GROUP BY bucket
    ORDER BY bucket ASC
  `,
    [protocol, hours]
  );

  return rows.map((row) => ({
    ts: toNumber(row.ts),
    value: toNumber(row.value)
  }));
}

export async function getProtocolOiAtOrBefore(protocol: ProtocolSlug, hoursAgo: number) {
  if (!isPostgresConfigured()) return null;

  const maxAgeHours = hoursAgo + maxSnapshotStalenessHours(hoursAgo);
  const { rows } = await sql.query<{ value: number | string | null }>(
    `
    ${freshReadMarker("oi:protocol-at-or-before")}
    SELECT SUM(oi_usd)::float AS value
    FROM (
      SELECT DISTINCT ON (symbol)
        symbol,
        oi_usd
      FROM oi_snapshots
      WHERE protocol = $1
        AND ts <= NOW() - ($2::int * INTERVAL '1 hour')
        AND ts >= NOW() - ($3::int * INTERVAL '1 hour')
      ORDER BY symbol, ts DESC
    ) latest
  `,
    [protocol, hoursAgo, maxAgeHours]
  );

  return rows[0]?.value == null ? null : toNumber(rows[0].value);
}

function isPositiveFinite(value: number) {
  return Number.isFinite(value) && value > 0;
}

async function getLatestSnapshotMap(protocol: ProtocolSlug) {
  const { rows } = await sql.query<LatestSnapshotRow>(
    `
    ${freshReadMarker("oi:latest-snapshot-map")}
    SELECT DISTINCT ON (symbol)
      symbol,
      oi_base::float AS oi_base,
      oi_usd::float AS oi_usd,
      mark_price::float AS mark_price,
      funding_rate::float AS funding_rate,
      volume24h_usd::float AS volume24h_usd
    FROM oi_snapshots
    WHERE protocol = $1
    ORDER BY symbol, ts DESC
  `,
    [protocol]
  );

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

  await sql`ANALYZE oi_snapshots`;

  return rows.length;
}
