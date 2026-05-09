import { cached } from "@/lib/cache";
import { normalizeAsterSymbol, toAsterRawSymbol } from "@/lib/symbols";
import type { HistoryInterval, HistoryPoint, Market } from "@/lib/types";
import { mapLimit, toNumber } from "@/lib/utils";

const ASTER_FAPI_URL = "https://fapi.asterdex.com/fapi/v1";
const OPEN_INTEREST_RETRY_DELAYS_MS = [250, 750];

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

type FetchAsterMarketsOptions = {
  includeInvalidForSnapshot?: boolean;
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${ASTER_FAPI_URL}${path}`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Aster API failed: ${response.status} ${path}`);
  }

  return (await response.json()) as T;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOpenInterest(
  rawSymbol: string,
  options: { retryInvalid?: boolean } = {}
): Promise<number | null> {
  const retryDelays = options.retryInvalid ? OPEN_INTEREST_RETRY_DELAYS_MS : [];
  let lastValue: number | null = null;

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      const data = await getJson<AsterOpenInterest>(
        `/openInterest?symbol=${encodeURIComponent(rawSymbol)}`
      );
      const value = toNumber(data.openInterest, Number.NaN);

      if (Number.isFinite(value)) {
        lastValue = value;

        if (value > 0 || !options.retryInvalid) {
          return value;
        }
      }
    } catch {
      lastValue = null;
    }

    const delay = retryDelays[attempt];
    if (delay) {
      await sleep(delay);
    }
  }

  return lastValue;
}

export async function fetchAsterMarkets(options: FetchAsterMarketsOptions = {}): Promise<Market[]> {
  const includeInvalidForSnapshot = Boolean(options.includeInvalidForSnapshot);
  const cacheKey = includeInvalidForSnapshot ? "aster:markets:snapshot" : "aster:markets";

  return cached(cacheKey, 60_000, async () => {
    const [tickers, premiumResponse] = await Promise.all([
      getJson<AsterTicker[]>("/ticker/24hr"),
      getJson<AsterPremiumIndex[] | AsterPremiumIndex>("/premiumIndex")
    ]);

    const premiums = Array.isArray(premiumResponse) ? premiumResponse : [premiumResponse];
    const premiumBySymbol = new Map(premiums.map((item) => [item.symbol, item]));
    const usdtTickers = tickers.filter((ticker) => ticker.symbol.endsWith("USDT"));

    const openInterestConcurrency = includeInvalidForSnapshot ? 16 : 48;
    const markets = await mapLimit(
      usdtTickers,
      openInterestConcurrency,
      async (ticker): Promise<Market | null> => {
        const rawSymbol = ticker.symbol;
        const premium = premiumBySymbol.get(rawSymbol);
        const markPrice = toNumber(premium?.markPrice, toNumber(ticker.lastPrice));
        const openInterestBase = await fetchOpenInterest(rawSymbol, {
          retryInvalid: includeInvalidForSnapshot
        });
        const oiBase = openInterestBase ?? 0;
        const volume24h = toNumber(ticker.quoteVolume);
        const oi = markPrice > 0 && oiBase > 0 ? oiBase * markPrice : 0;

        if (
          !includeInvalidForSnapshot &&
          (openInterestBase == null || oiBase <= 0 || markPrice <= 0)
        ) {
          return null;
        }

        return {
          protocol: "aster",
          symbol: normalizeAsterSymbol(rawSymbol),
          rawSymbol,
          markPrice,
          marketCap: null,
          fdv: null,
          change24hPct: toNumber(ticker.priceChangePercent),
          oiBase,
          oi,
          oiDelta1hPct: null,
          oiDelta4hPct: null,
          oiDelta8hPct: null,
          oiDelta12hPct: null,
          oiDelta24hPct: null,
          oiDelta7dPct: null,
          oiDelta1hUsd: null,
          oiDelta4hUsd: null,
          oiDelta8hUsd: null,
          oiDelta12hUsd: null,
          oiDelta24hUsd: null,
          oiDelta7dUsd: null,
          volume24h,
          volumeDelta1hPct: null,
          volumeDelta4hPct: null,
          volumeDelta8hPct: null,
          volumeDelta12hPct: null,
          volumeDelta24hPct: null,
          volumeDelta7dPct: null,
          volumeDelta1hUsd: null,
          volumeDelta4hUsd: null,
          volumeDelta8hUsd: null,
          volumeDelta12hUsd: null,
          volumeDelta24hUsd: null,
          volumeDelta7dUsd: null,
          fundingRate: toNumber(premium?.lastFundingRate)
        };
      }
    );

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
