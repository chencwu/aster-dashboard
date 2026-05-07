import { sql } from "@vercel/postgres";
import { isPostgresConfigured } from "@/lib/db/oi-history";

export type PrecomputedKey =
  | "stats"
  | "protocols"
  | "markets:aster"
  | "markets:hyperliquid"
  | "delta:oi:1h"
  | "delta:oi:24h"
  | "delta:oi:7d"
  | "delta:volume:1h"
  | "delta:volume:24h"
  | "delta:volume:7d";

type PrecomputedPayloadRow = {
  payload: unknown;
};

type PrecomputedWrite = {
  key: PrecomputedKey;
  payload: unknown;
};

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

declare global {
  // eslint-disable-next-line no-var
  var __precomputedPayloadCache: Map<PrecomputedKey, CacheEntry> | undefined;
}

let schemaReady = false;
const memoryCache =
  globalThis.__precomputedPayloadCache ?? new Map<PrecomputedKey, CacheEntry>();
globalThis.__precomputedPayloadCache = memoryCache;
const PRECOMPUTED_CACHE_TTL_MS = 30_000;

export async function ensurePrecomputedSchema() {
  if (!isPostgresConfigured()) return false;
  if (schemaReady) return true;

  await sql`
    CREATE TABLE IF NOT EXISTS precomputed_payloads (
      key TEXT PRIMARY KEY,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      payload JSONB NOT NULL
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_precomputed_payloads_generated_at
      ON precomputed_payloads (generated_at DESC)
  `;

  schemaReady = true;
  return true;
}

export async function getPrecomputedPayload<T>(key: PrecomputedKey): Promise<T | null> {
  if (!isPostgresConfigured()) return null;

  const now = Date.now();
  const hit = memoryCache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }

  await ensurePrecomputedSchema();

  const { rows } = await sql.query<PrecomputedPayloadRow>(
    `
      SELECT payload
      FROM precomputed_payloads
      WHERE key = $1
      LIMIT 1
    `,
    [key]
  );

  const payload = (rows[0]?.payload as T | undefined) ?? null;
  if (payload) {
    memoryCache.set(key, { expiresAt: now + PRECOMPUTED_CACHE_TTL_MS, value: payload });
  }

  return payload;
}

export async function setPrecomputedPayloads(payloads: PrecomputedWrite[]) {
  if (!isPostgresConfigured() || !payloads.length) return 0;

  await ensurePrecomputedSchema();

  const { rowCount } = await sql`
    WITH payload AS (
      SELECT *
      FROM jsonb_to_recordset(${JSON.stringify(payloads)}::jsonb) AS item(
        key TEXT,
        payload JSONB
      )
    )
    INSERT INTO precomputed_payloads (key, generated_at, payload)
    SELECT key, NOW(), payload
    FROM payload
    ON CONFLICT (key) DO UPDATE SET
      generated_at = EXCLUDED.generated_at,
      payload = EXCLUDED.payload
  `;

  payloads.forEach((item) => {
    memoryCache.set(item.key, {
      expiresAt: Date.now() + PRECOMPUTED_CACHE_TTL_MS,
      value: item.payload
    });
  });

  return rowCount ?? 0;
}
