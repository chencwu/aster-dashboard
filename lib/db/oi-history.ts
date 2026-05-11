import { sql } from "@vercel/postgres";
import {
  DELTA_PERIODS,
  DELTA_PERIOD_HOURS,
  type AlertDirection,
  type AlertItem,
  type AlertSeverity,
  type AlertSignal,
  type HistoryPoint,
  type Market,
  type ProtocolSlug
} from "@/lib/types";
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
  await ensureAlertEventsSchema();

  return true;
}

type HistoryRow = {
  ts: number | string;
  value: number | string;
  base_value?: number | string | null;
  mark_price?: number | string | null;
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

type FiveMinuteAlertRow = {
  protocol: ProtocolSlug;
  symbol: string;
  ts: number | string;
  previous_ts: number | string;
  oi_usd: number | string;
  previous_oi_usd: number | string;
  mark_price: number | string | null;
  previous_mark_price: number | string | null;
  volume24h_usd: number | string | null;
  previous_volume24h_usd: number | string | null;
  gap_minutes: number | string;
};

type AlertEventRow = {
  id: string;
  protocol: ProtocolSlug;
  symbol: string;
  ts: number | string;
  previous_ts: number | string;
  signal: AlertSignal;
  severity: AlertSeverity;
  delta_usd: number | string;
  delta_pct: number | string;
  threshold_usd: number | string;
  current_value: number | string;
  previous_value: number | string;
  current_mark_price: number | string | null;
  previous_mark_price: number | string | null;
  price_delta_pct: number | string | null;
  direction: AlertDirection | string | null;
  snapshot_gap_minutes: number | string;
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

export async function ensureAlertEventsSchema() {
  if (!isPostgresConfigured()) return false;

  await sql`
    CREATE TABLE IF NOT EXISTS alert_events (
      id TEXT PRIMARY KEY,
      protocol TEXT NOT NULL,
      symbol TEXT NOT NULL,
      ts TIMESTAMPTZ NOT NULL,
      previous_ts TIMESTAMPTZ NOT NULL,
      signal TEXT NOT NULL,
      severity TEXT NOT NULL,
      delta_usd NUMERIC NOT NULL,
      delta_pct NUMERIC NOT NULL,
      threshold_usd NUMERIC NOT NULL,
      current_value NUMERIC NOT NULL,
      previous_value NUMERIC NOT NULL,
      current_mark_price NUMERIC,
      previous_mark_price NUMERIC,
      price_delta_pct NUMERIC,
      direction TEXT NOT NULL DEFAULT 'unclear',
      snapshot_gap_minutes NUMERIC NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE alert_events ADD COLUMN IF NOT EXISTS current_mark_price NUMERIC`;
  await sql`ALTER TABLE alert_events ADD COLUMN IF NOT EXISTS previous_mark_price NUMERIC`;
  await sql`ALTER TABLE alert_events ADD COLUMN IF NOT EXISTS price_delta_pct NUMERIC`;
  await sql`ALTER TABLE alert_events ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'unclear'`;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_alert_events_ts
      ON alert_events (ts DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_alert_events_symbol_ts
      ON alert_events (symbol, ts DESC)
  `;

  return true;
}

const ALERT_MIN_USD_THRESHOLD = 100_000;

function dynamicThreshold(previousValue: number, ratio: number) {
  if (!Number.isFinite(previousValue) || previousValue <= 0) {
    return ALERT_MIN_USD_THRESHOLD;
  }

  return Math.max(ALERT_MIN_USD_THRESHOLD, previousValue * ratio);
}

function passesPositiveAlert(
  deltaUsd: number,
  deltaPct: number | null,
  thresholdUsd: number,
  minPct: number
) {
  return deltaPct != null && deltaUsd >= thresholdUsd && deltaPct >= minPct;
}

function passesNegativeAlert(
  deltaUsd: number,
  deltaPct: number | null,
  thresholdUsd: number,
  minPct: number
) {
  return deltaPct != null && deltaUsd <= -thresholdUsd && deltaPct <= -minPct;
}

function alertSeverity(deltaUsd: number, deltaPct: number): AlertSeverity {
  const absolute = Math.abs(deltaUsd);
  const absolutePct = Math.abs(deltaPct);

  if (absolute >= 5_000_000 || absolutePct >= 15) return "high";
  if (absolute >= 1_000_000 || absolutePct >= 8) return "medium";
  return "low";
}

const ALERT_PRICE_DIRECTION_THRESHOLD_PCT = 0.2;

function alertDirection(signal: AlertSignal, priceDeltaPct: number | null): AlertDirection {
  if (priceDeltaPct == null || Math.abs(priceDeltaPct) < ALERT_PRICE_DIRECTION_THRESHOLD_PCT) {
    return "unclear";
  }

  if (signal === "oi_spike") {
    return priceDeltaPct > 0 ? "long_build" : "short_build";
  }

  if (signal === "oi_drop") {
    return priceDeltaPct > 0 ? "short_cover" : "long_unwind";
  }

  return "unclear";
}

function normalizeAlertDirection(value: AlertDirection | string | null): AlertDirection {
  if (
    value === "long_build" ||
    value === "short_build" ||
    value === "short_cover" ||
    value === "long_unwind"
  ) {
    return value;
  }

  return "unclear";
}

function buildAlertItem(
  row: FiveMinuteAlertRow,
  signal: AlertSignal,
  deltaUsd: number,
  deltaPct: number,
  thresholdUsd: number,
  currentValue: number,
  previousValue: number
): AlertItem {
  const ts = toNumber(row.ts);
  const currentMarkPrice = toNumber(row.mark_price, Number.NaN);
  const previousMarkPrice = toNumber(row.previous_mark_price, Number.NaN);
  const priceDeltaPct = pctChange(currentMarkPrice, previousMarkPrice);

  return {
    id: `${row.protocol}:${row.symbol}:${signal}:${ts}`,
    protocol: row.protocol,
    symbol: row.symbol,
    ts,
    previousTs: toNumber(row.previous_ts),
    signal,
    severity: alertSeverity(deltaUsd, deltaPct),
    deltaUsd,
    deltaPct,
    thresholdUsd,
    currentValue,
    previousValue,
    currentMarkPrice: Number.isFinite(currentMarkPrice) ? currentMarkPrice : null,
    previousMarkPrice: Number.isFinite(previousMarkPrice) ? previousMarkPrice : null,
    priceDeltaPct,
    direction: alertDirection(signal, priceDeltaPct),
    snapshotGapMinutes: toNumber(row.gap_minutes)
  };
}

export async function getFiveMinuteAlerts(limit = 100): Promise<AlertItem[]> {
  if (!isPostgresConfigured()) return [];

  const { rows } = await sql.query<FiveMinuteAlertRow>(
    `
    ${freshReadMarker("oi:five-minute-alerts")}
    WITH ranked AS (
      SELECT
        protocol,
        symbol,
        ts,
        oi_usd,
        mark_price,
        volume24h_usd,
        ROW_NUMBER() OVER (
          PARTITION BY protocol, symbol
          ORDER BY ts DESC
        ) AS rn
      FROM oi_snapshots
      WHERE protocol IN ('aster', 'hyperliquid')
        AND ts >= NOW() - INTERVAL '30 minutes'
        AND is_imputed = FALSE
    )
    SELECT
      latest.protocol,
      latest.symbol,
      EXTRACT(EPOCH FROM latest.ts) * 1000 AS ts,
      EXTRACT(EPOCH FROM previous.ts) * 1000 AS previous_ts,
      latest.oi_usd::float AS oi_usd,
      previous.oi_usd::float AS previous_oi_usd,
      latest.mark_price::float AS mark_price,
      previous.mark_price::float AS previous_mark_price,
      latest.volume24h_usd::float AS volume24h_usd,
      previous.volume24h_usd::float AS previous_volume24h_usd,
      EXTRACT(EPOCH FROM (latest.ts - previous.ts)) / 60 AS gap_minutes
    FROM ranked latest
    JOIN ranked previous
      ON previous.protocol = latest.protocol
      AND previous.symbol = latest.symbol
      AND previous.rn = 2
    WHERE latest.rn = 1
      AND latest.ts >= NOW() - INTERVAL '15 minutes'
      AND latest.ts - previous.ts <= INTERVAL '10 minutes'
    `,
    []
  );

  const alerts = rows.flatMap((row) => {
    const oi = toNumber(row.oi_usd);
    const previousOi = toNumber(row.previous_oi_usd);
    const volume = toNumber(row.volume24h_usd, Number.NaN);
    const previousVolume = toNumber(row.previous_volume24h_usd, Number.NaN);
    const oiDelta = oi - previousOi;
    const volumeDelta = volume - previousVolume;
    const oiDeltaPct = pctChange(oi, previousOi);
    const volumeDeltaPct = pctChange(volume, previousVolume);
    const oiThresholdUsd = dynamicThreshold(previousOi, 0.005);
    const volumeThresholdUsd = dynamicThreshold(previousVolume, 0.01);
    const items: AlertItem[] = [];

    if (passesPositiveAlert(oiDelta, oiDeltaPct, oiThresholdUsd, 2)) {
      items.push(buildAlertItem(row, "oi_spike", oiDelta, oiDeltaPct!, oiThresholdUsd, oi, previousOi));
    }
    if (passesNegativeAlert(oiDelta, oiDeltaPct, oiThresholdUsd, 2)) {
      items.push(buildAlertItem(row, "oi_drop", oiDelta, oiDeltaPct!, oiThresholdUsd, oi, previousOi));
    }
    if (
      Number.isFinite(volumeDelta) &&
      passesPositiveAlert(volumeDelta, volumeDeltaPct, volumeThresholdUsd, 5)
    ) {
      items.push(
        buildAlertItem(
          row,
          "volume_spike",
          volumeDelta,
          volumeDeltaPct!,
          volumeThresholdUsd,
          volume,
          previousVolume
        )
      );
    }

    return items;
  });

  return alerts
    .sort((left, right) => {
      if (right.ts !== left.ts) return right.ts - left.ts;
      return Math.abs(right.deltaUsd) - Math.abs(left.deltaUsd);
    })
    .slice(0, Math.max(1, Math.min(limit, 200)));
}

function alertEventRowToItem(row: AlertEventRow): AlertItem {
  const priceDeltaPct = row.price_delta_pct == null ? null : toNumber(row.price_delta_pct);
  const storedDirection = normalizeAlertDirection(row.direction);

  return {
    id: row.id,
    protocol: row.protocol,
    symbol: row.symbol,
    ts: toNumber(row.ts),
    previousTs: toNumber(row.previous_ts),
    signal: row.signal,
    severity: row.severity,
    deltaUsd: toNumber(row.delta_usd),
    deltaPct: toNumber(row.delta_pct),
    thresholdUsd: toNumber(row.threshold_usd),
    currentValue: toNumber(row.current_value),
    previousValue: toNumber(row.previous_value),
    currentMarkPrice: row.current_mark_price == null ? null : toNumber(row.current_mark_price),
    previousMarkPrice: row.previous_mark_price == null ? null : toNumber(row.previous_mark_price),
    priceDeltaPct,
    direction: storedDirection === "unclear" ? alertDirection(row.signal, priceDeltaPct) : storedDirection,
    snapshotGapMinutes: toNumber(row.snapshot_gap_minutes)
  };
}

export async function insertFiveMinuteAlertEvents(limit = 200) {
  if (!isPostgresConfigured()) return { inserted: 0, evaluated: 0 };

  await ensureAlertEventsSchema();

  const alerts = await getFiveMinuteAlerts(limit);
  if (!alerts.length) return { inserted: 0, evaluated: 0 };

  const payload = JSON.stringify(
    alerts.map((item) => ({
      id: item.id,
      protocol: item.protocol,
      symbol: item.symbol,
      ts: new Date(item.ts).toISOString(),
      previous_ts: new Date(item.previousTs).toISOString(),
      signal: item.signal,
      severity: item.severity,
      delta_usd: item.deltaUsd,
      delta_pct: item.deltaPct,
      threshold_usd: item.thresholdUsd,
      current_value: item.currentValue,
      previous_value: item.previousValue,
      current_mark_price: item.currentMarkPrice,
      previous_mark_price: item.previousMarkPrice,
      price_delta_pct: item.priceDeltaPct,
      direction: item.direction,
      snapshot_gap_minutes: item.snapshotGapMinutes
    }))
  );

  const { rows } = await sql.query<{ inserted: number | string }>(
    `
    WITH payload AS (
      SELECT *
      FROM jsonb_to_recordset($1::jsonb) AS item(
        id TEXT,
        protocol TEXT,
        symbol TEXT,
        ts TIMESTAMPTZ,
        previous_ts TIMESTAMPTZ,
        signal TEXT,
        severity TEXT,
        delta_usd NUMERIC,
        delta_pct NUMERIC,
        threshold_usd NUMERIC,
        current_value NUMERIC,
        previous_value NUMERIC,
        current_mark_price NUMERIC,
        previous_mark_price NUMERIC,
        price_delta_pct NUMERIC,
        direction TEXT,
        snapshot_gap_minutes NUMERIC
      )
    ),
    inserted AS (
      INSERT INTO alert_events (
        id,
        protocol,
        symbol,
        ts,
        previous_ts,
        signal,
        severity,
        delta_usd,
        delta_pct,
        threshold_usd,
        current_value,
        previous_value,
        current_mark_price,
        previous_mark_price,
        price_delta_pct,
        direction,
        snapshot_gap_minutes
      )
      SELECT
        id,
        protocol,
        symbol,
        ts,
        previous_ts,
        signal,
        severity,
        delta_usd,
        delta_pct,
        threshold_usd,
        current_value,
        previous_value,
        current_mark_price,
        previous_mark_price,
        price_delta_pct,
        direction,
        snapshot_gap_minutes
      FROM payload
      ON CONFLICT (id) DO UPDATE SET
        current_mark_price = EXCLUDED.current_mark_price,
        previous_mark_price = EXCLUDED.previous_mark_price,
        price_delta_pct = EXCLUDED.price_delta_pct,
        direction = EXCLUDED.direction
      RETURNING 1
    )
    SELECT COUNT(*) AS inserted
    FROM inserted
    `,
    [payload]
  );

  const inserted = Math.max(0, toNumber(rows[0]?.inserted));
  if (inserted > 0) {
    await sql`ANALYZE alert_events`;
  }

  return { inserted, evaluated: alerts.length };
}

export async function getRecentAlertEvents(
  hours: number | null = 24,
  limit: number | null = 200,
  symbol?: string | null
): Promise<AlertItem[]> {
  if (!isPostgresConfigured()) return [];

  await ensureAlertEventsSchema();

  const safeHours = hours == null ? null : Math.max(1, Math.min(Math.floor(hours), 24 * 30));
  const safeLimit = limit == null ? null : Math.max(1, Math.min(Math.floor(limit), 5000));
  const normalizedSymbol = symbol?.trim().toUpperCase() || null;
  const { rows } = await sql.query<AlertEventRow>(
    `
    ${freshReadMarker("alerts:recent-events")}
    WITH hydrated AS (
      SELECT
        events.id,
        events.protocol,
        events.symbol,
        events.ts,
        events.previous_ts,
        events.signal,
        events.severity,
        events.delta_usd,
        events.delta_pct,
        events.threshold_usd,
        events.current_value,
        events.previous_value,
        COALESCE(events.current_mark_price, current_snapshot.mark_price) AS current_mark_price,
        COALESCE(events.previous_mark_price, previous_snapshot.mark_price) AS previous_mark_price,
        events.price_delta_pct,
        events.direction,
        events.snapshot_gap_minutes
      FROM alert_events events
      LEFT JOIN oi_snapshots current_snapshot
        ON current_snapshot.protocol = events.protocol
        AND current_snapshot.symbol = events.symbol
        AND current_snapshot.ts = events.ts
      LEFT JOIN oi_snapshots previous_snapshot
        ON previous_snapshot.protocol = events.protocol
        AND previous_snapshot.symbol = events.symbol
        AND previous_snapshot.ts = events.previous_ts
      WHERE ($1::int IS NULL OR events.ts >= NOW() - ($1::int * INTERVAL '1 hour'))
        AND ($3::text IS NULL OR events.symbol = $3::text)
    )
    SELECT
      id,
      protocol,
      symbol,
      EXTRACT(EPOCH FROM ts) * 1000 AS ts,
      EXTRACT(EPOCH FROM previous_ts) * 1000 AS previous_ts,
      signal,
      severity,
      delta_usd::float AS delta_usd,
      delta_pct::float AS delta_pct,
      threshold_usd::float AS threshold_usd,
      current_value::float AS current_value,
      previous_value::float AS previous_value,
      current_mark_price::float AS current_mark_price,
      previous_mark_price::float AS previous_mark_price,
      COALESCE(
        price_delta_pct,
        CASE
          WHEN previous_mark_price > 0
            THEN ((current_mark_price - previous_mark_price) / previous_mark_price) * 100
          ELSE NULL
        END
      )::float AS price_delta_pct,
      direction,
      snapshot_gap_minutes::float AS snapshot_gap_minutes
    FROM hydrated
    ORDER BY ts DESC, ABS(delta_usd) DESC
    LIMIT $2
    `,
    [safeHours, safeLimit, normalizedSymbol]
  );

  return rows.map(alertEventRowToItem);
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
      COALESCE(oi_base::float, oi_usd::float / NULLIF(mark_price::float, 0)) AS base_value,
      mark_price::float AS mark_price,
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
    baseValue: row.base_value == null ? null : toNumber(row.base_value),
    markPrice: row.mark_price == null ? null : toNumber(row.mark_price),
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
