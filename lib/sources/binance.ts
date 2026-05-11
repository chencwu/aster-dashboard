import { cached } from "@/lib/cache";
import { toBinanceRawSymbol } from "@/lib/symbols";
import type { HistoryInterval, HistoryPoint, OhlcPoint } from "@/lib/types";
import { toNumber } from "@/lib/utils";

const BINANCE_FUTURES_BASE = "https://fapi.binance.com/fapi/v1";
const BINANCE_FUTURES_DATA_BASE = "https://fapi.binance.com/futures/data";
const BINANCE_OI_PERIOD = "5m";
const BINANCE_OI_PERIOD_MS = 5 * 60_000;
const BINANCE_OI_LIMIT = 500;

type BinanceKline = [
  number,  // 0 open time
  string,  // 1 open
  string,  // 2 high
  string,  // 3 low
  string,  // 4 close
  string,  // 5 volume (base)
  number,  // 6 close time
  string,  // 7 quote volume (USD)
  ...unknown[]
];

type BinanceOpenInterestPoint = {
  symbol?: string;
  sumOpenInterest?: string;
  sumOpenInterestValue?: string;
  timestamp?: string | number;
};

export class BinanceSymbolNotFoundError extends Error {
  constructor(symbol: string) {
    super(`Binance has no perp listing for ${symbol}`);
    this.name = "BinanceSymbolNotFoundError";
  }
}

async function fetchBinanceKlines(rawSymbol: string, interval: HistoryInterval, limit: number) {
  const url = `${BINANCE_FUTURES_BASE}/klines?symbol=${encodeURIComponent(
    rawSymbol
  )}&interval=${interval}&limit=${limit}`;

  const response = await fetch(url, { cache: "no-store" });

  if (response.status === 400 || response.status === 404) {
    throw new BinanceSymbolNotFoundError(rawSymbol);
  }
  if (!response.ok) {
    throw new Error(`Binance API failed: ${response.status}`);
  }

  return (await response.json()) as BinanceKline[];
}

export async function fetchBinanceOhlcHistory(
  symbol: string,
  interval: HistoryInterval = "1h",
  limit = 168
): Promise<OhlcPoint[]> {
  const rawSymbol = toBinanceRawSymbol(symbol);
  const cacheKey = `binance:ohlc:${rawSymbol}:${interval}:${limit}`;

  return cached(cacheKey, 60_000, async () => {
    const klines = await fetchBinanceKlines(rawSymbol, interval, limit);

    return klines
      .slice(-limit)
      .map<OhlcPoint>((kline) => ({
        ts: kline[0],
        open: toNumber(kline[1]),
        high: toNumber(kline[2]),
        low: toNumber(kline[3]),
        close: toNumber(kline[4])
      }))
      .filter((point) => Number.isFinite(point.close));
  });
}

export async function fetchBinanceVolumeHistory(
  symbol: string,
  interval: HistoryInterval = "1h",
  limit = 168
): Promise<HistoryPoint[]> {
  const rawSymbol = toBinanceRawSymbol(symbol);
  const cacheKey = `binance:volume:${rawSymbol}:${interval}:${limit}`;

  return cached(cacheKey, 60_000, async () => {
    const klines = await fetchBinanceKlines(rawSymbol, interval, limit);

    return klines
      .slice(-limit)
      .map<HistoryPoint>((kline) => ({
        ts: kline[0],
        value: toNumber(kline[7])
      }))
      .filter((point) => Number.isFinite(point.value));
  });
}

async function fetchBinanceOiChunk(rawSymbol: string, startTime: number, endTime: number) {
  const params = new URLSearchParams({
    symbol: rawSymbol,
    period: BINANCE_OI_PERIOD,
    limit: String(BINANCE_OI_LIMIT),
    startTime: String(Math.floor(startTime)),
    endTime: String(Math.floor(endTime))
  });
  const response = await fetch(`${BINANCE_FUTURES_DATA_BASE}/openInterestHist?${params.toString()}`, {
    cache: "no-store"
  });

  if (response.status === 400 || response.status === 404) {
    throw new BinanceSymbolNotFoundError(rawSymbol);
  }
  if (!response.ok) {
    throw new Error(`Binance OI API failed: ${response.status}`);
  }

  return (await response.json()) as BinanceOpenInterestPoint[];
}

export async function fetchBinanceOiHistory(
  symbol: string,
  hours = 168
): Promise<HistoryPoint[]> {
  const rawSymbol = toBinanceRawSymbol(symbol);
  const safeHours = Math.max(1, Math.min(Math.floor(hours), 24 * 30));
  const cacheKey = `binance:oi:${rawSymbol}:${safeHours}h:${BINANCE_OI_PERIOD}`;

  return cached(cacheKey, 60_000, async () => {
    const endTime = Date.now();
    const startTime = endTime - safeHours * 60 * 60_000;
    const chunkSpan = BINANCE_OI_PERIOD_MS * BINANCE_OI_LIMIT;
    const byTs = new Map<number, HistoryPoint>();

    for (let cursor = startTime; cursor < endTime; cursor += chunkSpan) {
      const chunkEnd = Math.min(endTime, cursor + chunkSpan - 1);
      const rows = await fetchBinanceOiChunk(rawSymbol, cursor, chunkEnd);

      for (const row of rows) {
        const ts = toNumber(row.timestamp, Number.NaN);
        const baseValue = toNumber(row.sumOpenInterest, Number.NaN);
        const value = toNumber(row.sumOpenInterestValue, Number.NaN);

        if (!Number.isFinite(ts) || !Number.isFinite(value)) continue;

        byTs.set(ts, {
          ts,
          value,
          baseValue: Number.isFinite(baseValue) ? baseValue : null,
          markPrice: Number.isFinite(baseValue) && baseValue > 0 ? value / baseValue : null
        });
      }
    }

    return Array.from(byTs.values())
      .filter((point) => point.ts >= startTime && point.ts <= endTime)
      .sort((left, right) => left.ts - right.ts);
  });
}
