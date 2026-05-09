import { cached } from "@/lib/cache";
import type { Market } from "@/lib/types";
import { mapLimit, toNumber } from "@/lib/utils";

const COINGECKO_PUBLIC_API_URL = "https://api.coingecko.com/api/v3";
const COINGECKO_PRO_API_URL = "https://pro-api.coingecko.com/api/v3";
const MARKET_DATA_CACHE_TTL_MS = 30 * 60_000;
const SYMBOL_CHUNK_SIZE = 120;

type CoinGeckoMarket = {
  symbol?: string;
  market_cap?: number | null;
  fully_diluted_valuation?: number | null;
};

type MarketData = {
  marketCap: number | null;
  fdv: number | null;
};

export function marketDataSymbol(symbol: string) {
  const normalized = symbol.trim().toUpperCase();
  const withoutMultiplier = normalized.replace(/^(1000000|100000|10000|1000)/, "");

  if (/^K[A-Z0-9]+$/.test(withoutMultiplier) && withoutMultiplier.length > 2) {
    return withoutMultiplier.slice(1).toLowerCase();
  }

  return withoutMultiplier.toLowerCase();
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

export function coinGeckoConfig() {
  const apiKey = process.env.COINGECKO_API_KEY ?? process.env.CG_API_KEY ?? "";
  const baseUrl =
    process.env.COINGECKO_API_BASE_URL ?? (apiKey ? COINGECKO_PRO_API_URL : COINGECKO_PUBLIC_API_URL);

  return { apiKey, baseUrl };
}

async function fetchCoinGeckoMarkets(symbols: string[]) {
  const { apiKey, baseUrl } = coinGeckoConfig();
  const params = new URLSearchParams({
    vs_currency: "usd",
    symbols: symbols.join(","),
    include_tokens: "top",
    order: "market_cap_desc",
    per_page: "250",
    page: "1",
    sparkline: "false",
    price_change_percentage: "24h",
    locale: "en"
  });
  const headers: HeadersInit = {};

  if (apiKey) {
    if (baseUrl.includes("pro-api")) {
      headers["x-cg-pro-api-key"] = apiKey;
    } else {
      headers["x-cg-demo-api-key"] = apiKey;
    }
  }

  const response = await fetch(`${baseUrl}/coins/markets?${params.toString()}`, {
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`CoinGecko API failed: ${response.status}`);
  }

  return (await response.json()) as CoinGeckoMarket[];
}

export async function fetchMarketDataMap(symbols: string[]) {
  const normalizedSymbols = Array.from(new Set(symbols.map(marketDataSymbol).filter(Boolean))).sort();
  const cacheKey = `market-data:${normalizedSymbols.join(",")}`;

  return cached(cacheKey, MARKET_DATA_CACHE_TTL_MS, async () => {
    const result = new Map<string, MarketData>();

    if (!normalizedSymbols.length) return result;

    try {
      const responses = await mapLimit(
        chunk(normalizedSymbols, SYMBOL_CHUNK_SIZE),
        2,
        fetchCoinGeckoMarkets
      );

      responses.flat().forEach((item) => {
        const symbol = item.symbol?.toLowerCase();
        if (!symbol || result.has(symbol)) return;

        const marketCap = toNumber(item.market_cap, Number.NaN);
        const fdv = toNumber(item.fully_diluted_valuation, Number.NaN);

        result.set(symbol, {
          marketCap: Number.isFinite(marketCap) ? marketCap : null,
          fdv: Number.isFinite(fdv) ? fdv : null
        });
      });
    } catch {
      return result;
    }

    return result;
  });
}

export async function attachMarketData(markets: Market[]) {
  const dataBySymbol = await fetchMarketDataMap(markets.map((market) => market.symbol));

  return markets.map((market) => {
    const data = dataBySymbol.get(marketDataSymbol(market.symbol));

    return {
      ...market,
      marketCap: data?.marketCap ?? null,
      fdv: data?.fdv ?? null
    };
  });
}
