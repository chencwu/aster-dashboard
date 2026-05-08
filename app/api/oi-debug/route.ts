import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const protocol = url.searchParams.get("protocol") ?? "hyperliquid";
  const symbol = url.searchParams.get("symbol") ?? "DYDX";

  const sysInfo = await sql`SELECT NOW() AS pg_now, current_setting('TimeZone') AS tz`;

  const tableMax = await sql`
    SELECT MAX(ts) AS max_ts, COUNT(*)::int AS n
    FROM oi_snapshots
    WHERE protocol = ${protocol} AND symbol = ${symbol}
  `;

  const literal24h = await sql`
    SELECT MAX(ts) AS max_ts, COUNT(*)::int AS n
    FROM oi_snapshots
    WHERE protocol = ${protocol} AND symbol = ${symbol}
      AND ts >= NOW() - INTERVAL '24 hours'
  `;

  const literal72h = await sql`
    SELECT MAX(ts) AS max_ts, COUNT(*)::int AS n
    FROM oi_snapshots
    WHERE protocol = ${protocol} AND symbol = ${symbol}
      AND ts >= NOW() - INTERVAL '72 hours'
  `;

  const hours24 = 24;
  const hours72 = 72;

  const param24h = await sql`
    SELECT MAX(ts) AS max_ts, COUNT(*)::int AS n
    FROM oi_snapshots
    WHERE protocol = ${protocol} AND symbol = ${symbol}
      AND ts >= NOW() - (${hours24} * INTERVAL '1 hour')
  `;

  const param72h = await sql`
    SELECT MAX(ts) AS max_ts, COUNT(*)::int AS n
    FROM oi_snapshots
    WHERE protocol = ${protocol} AND symbol = ${symbol}
      AND ts >= NOW() - (${hours72} * INTERVAL '1 hour')
  `;

  const makeInterval24h = await sql`
    SELECT MAX(ts) AS max_ts, COUNT(*)::int AS n
    FROM oi_snapshots
    WHERE protocol = ${protocol} AND symbol = ${symbol}
      AND ts >= NOW() - make_interval(hours => ${hours24})
  `;

  const cast24h = await sql`
    SELECT MAX(ts) AS max_ts, COUNT(*)::int AS n
    FROM oi_snapshots
    WHERE protocol = ${protocol} AND symbol = ${symbol}
      AND ts >= NOW() - (${hours24}::int * INTERVAL '1 hour')
  `;

  const last3rows = await sql`
    SELECT ts, oi_usd::float AS value
    FROM oi_snapshots
    WHERE protocol = ${protocol} AND symbol = ${symbol}
    ORDER BY ts DESC
    LIMIT 3
  `;

  return NextResponse.json({
    sys: sysInfo.rows[0],
    tableMax: tableMax.rows[0],
    literal24h: literal24h.rows[0],
    literal72h: literal72h.rows[0],
    param24h: param24h.rows[0],
    param72h: param72h.rows[0],
    makeInterval24h: makeInterval24h.rows[0],
    cast24h: cast24h.rows[0],
    last3rows: last3rows.rows
  });
}
