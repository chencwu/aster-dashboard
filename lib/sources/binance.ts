import { cached } from "@/lib/cache";
import { toAsterRawSymbol } from "@/lib/symbols";
import type { HistoryInterval, OhlcPoint } from "@/lib/types";
import { toNumber } from "@/lib/utils";

const BINANCE_FUTURES_BASE = "https://fapi.binance.com/fapi/v1";

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

export class BinanceSymbolNotFoundError extends Error {
  constructor(symbol: string) {
    super(`Binance has no perp listing for ${symbol}`);
    this.name = "BinanceSymbolNotFoundError";
  }
}

export async function fetchBinanceOhlcHistory(
  symbol: string,
  interval: HistoryInterval = "1h",
  limit = 168
): Promise<OhlcPoint[]> {
  const rawSymbol = toAsterRawSymbol(symbol);
  const cacheKey = `binance:ohlc:${rawSymbol}:${interval}:${limit}`;

  return cached(cacheKey, 60_000, async () => {
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

    const klines = (await response.json()) as BinanceKline[];

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
