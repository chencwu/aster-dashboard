import { cached } from "@/lib/cache";
import { normalizeAsterSymbol, toAsterRawSymbol } from "@/lib/symbols";
import type { HistoryInterval, HistoryPoint, Market } from "@/lib/types";
import { mapLimit, toNumber } from "@/lib/utils";

const ASTER_FAPI_URL = "https://fapi.asterdex.com/fapi/v1";

type AsterTicker = {
  symbol: string;
  lastPrice?: string;
  priceChangePercent?: string;
  quoteVolume?: string;
};

type AsterPremiumIndex = {
  symbol: string;
  markPrice?: string;
  lastFundingRate?: string;
};

type AsterOpenInterest = {
  symbol: string;
  openInterest?: string;
};

type AsterKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string
];

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${ASTER_FAPI_URL}${path}`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Aster API failed: ${response.status} ${path}`);
  }

  return (await response.json()) as T;
}

async function fetchOpenInterest(rawSymbol: string): Promise<number | null> {
  try {
    const data = await getJson<AsterOpenInterest>(
      `/openInterest?symbol=${encodeURIComponent(rawSymbol)}`
    );
    return toNumber(data.openInterest);
  } catch {
    return null;
  }
}

export async function fetchAsterMarkets(): Promise<Market[]> {
  return cached("aster:markets", 60_000, async () => {
    const [tickers, premiumResponse] = await Promise.all([
      getJson<AsterTicker[]>("/ticker/24hr"),
      getJson<AsterPremiumIndex[] | AsterPremiumIndex>("/premiumIndex")
    ]);

    const premiums = Array.isArray(premiumResponse) ? premiumResponse : [premiumResponse];
    const premiumBySymbol = new Map(premiums.map((item) => [item.symbol, item]));
    const usdtTickers = tickers
      .filter((ticker) => ticker.symbol.endsWith("USDT"))
      .filter((ticker) => toNumber(ticker.quoteVolume) > 0);

    const markets = await mapLimit(usdtTickers, 16, async (ticker): Promise<Market | null> => {
      const rawSymbol = ticker.symbol;
      const premium = premiumBySymbol.get(rawSymbol);
      const markPrice = toNumber(premium?.markPrice, toNumber(ticker.lastPrice));
      const openInterestBase = await fetchOpenInterest(rawSymbol);

      if (openInterestBase == null || markPrice <= 0) return null;

      return {
        protocol: "aster",
        symbol: normalizeAsterSymbol(rawSymbol),
        rawSymbol,
        markPrice,
        change24hPct: toNumber(ticker.priceChangePercent),
        oiBase: openInterestBase,
        oi: openInterestBase * markPrice,
        oiDelta1hPct: null,
        oiDelta24hPct: null,
        oiDelta7dPct: null,
        volume24h: toNumber(ticker.quoteVolume),
        volumeDelta24hPct: null,
        volumeDelta7dPct: null,
        fundingRate: toNumber(premium?.lastFundingRate)
      };
    });

    return markets
      .filter((market): market is Market => Boolean(market))
      .sort((left, right) => right.oi - left.oi);
  });
}

export async function fetchAsterVolumeHistory(
  symbol: string,
  interval: HistoryInterval = "1h",
  limit = 168
): Promise<HistoryPoint[]> {
  const rawSymbol = toAsterRawSymbol(symbol);
  const cacheKey = `aster:volume:${rawSymbol}:${interval}:${limit}`;

  return cached(cacheKey, 5 * 60_000, async () => {
    const klines = await getJson<AsterKline[]>(
      `/klines?symbol=${encodeURIComponent(rawSymbol)}&interval=${interval}&limit=${limit}`
    );

    return klines
      .slice(-limit)
      .map((kline) => ({
        ts: kline[0],
        value: toNumber(kline[7])
      }))
      .filter((point) => Number.isFinite(point.value));
  });
}
