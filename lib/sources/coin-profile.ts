import { cached } from "@/lib/cache";
import { coinGeckoConfig, marketDataSymbol } from "@/lib/sources/market-data";

const COIN_PROFILE_CACHE_TTL_MS = 24 * 60 * 60_000;
const MAX_DESCRIPTION_LENGTH = 360;

type CoinGeckoSearchCoin = {
  id?: string;
  name?: string;
  symbol?: string;
  market_cap_rank?: number | null;
  thumb?: string;
  large?: string;
};

type CoinGeckoSearchResponse = {
  coins?: CoinGeckoSearchCoin[];
};

type CoinGeckoCoinDetail = {
  id?: string;
  symbol?: string;
  name?: string;
  description?: {
    en?: string;
    zh?: string;
    "zh-tw"?: string;
  };
  image?: {
    thumb?: string;
    small?: string;
    large?: string;
  };
  links?: {
    homepage?: string[];
  };
  market_cap_rank?: number | null;
  categories?: string[];
  market_data?: {
    current_price?: Record<string, number | null>;
    market_cap?: Record<string, number | null>;
    fully_diluted_valuation?: Record<string, number | null>;
    circulating_supply?: number | null;
    total_supply?: number | null;
  };
};

export type CoinProfile = {
  id: string;
  symbol: string;
  name: string;
  description: string;
  imageUrl: string | null;
  homepage: string | null;
  marketCapRank: number | null;
  marketCap: number | null;
  fdv: number | null;
  totalSupply: number | null;
  categories: string[];
  source: "coingecko";
};

function coinGeckoHeaders() {
  const { apiKey, baseUrl } = coinGeckoConfig();
  const headers: HeadersInit = {};

  if (apiKey) {
    if (baseUrl.includes("pro-api")) {
      headers["x-cg-pro-api-key"] = apiKey;
    } else {
      headers["x-cg-demo-api-key"] = apiKey;
    }
  }

  return { headers, baseUrl };
}

async function fetchCoinGecko<T>(path: string) {
  const { headers, baseUrl } = coinGeckoHeaders();
  const response = await fetch(`${baseUrl}${path}`, {
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`CoinGecko API failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function cleanDescription(value: string | undefined) {
  if (!value) return "";

  const plain = decodeHtmlEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (plain.length <= MAX_DESCRIPTION_LENGTH) return plain;

  const sentenceEnd = plain.slice(0, MAX_DESCRIPTION_LENGTH).search(/[.!?。！？]\s/);
  if (sentenceEnd > 80) return plain.slice(0, sentenceEnd + 1);

  return `${plain.slice(0, MAX_DESCRIPTION_LENGTH).trim()}...`;
}

function finiteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pickSearchCoin(coins: CoinGeckoSearchCoin[], normalizedSymbol: string) {
  const exactMatches = coins.filter(
    (coin) => coin.symbol?.toLowerCase() === normalizedSymbol
  );
  const candidates = exactMatches.length ? exactMatches : coins;

  return [...candidates].sort((left, right) => {
    const leftRank = left.market_cap_rank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.market_cap_rank ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank;
  })[0];
}

async function fetchCoinProfileUncached(symbol: string): Promise<CoinProfile | null> {
  const normalizedSymbol = marketDataSymbol(symbol);
  if (!normalizedSymbol) return null;

  const searchParams = new URLSearchParams({ query: normalizedSymbol });
  const search = await fetchCoinGecko<CoinGeckoSearchResponse>(
    `/search?${searchParams.toString()}`
  );
  const match = pickSearchCoin(search.coins ?? [], normalizedSymbol);

  if (!match?.id) return null;

  const detailParams = new URLSearchParams({
    localization: "false",
    tickers: "false",
    market_data: "true",
    community_data: "false",
    developer_data: "false",
    sparkline: "false"
  });
  const detail = await fetchCoinGecko<CoinGeckoCoinDetail>(
    `/coins/${encodeURIComponent(match.id)}?${detailParams.toString()}`
  );
  const description = cleanDescription(
    detail.description?.zh || detail.description?.["zh-tw"] || detail.description?.en
  );

  if (!description) return null;

  const homepage = detail.links?.homepage?.find(Boolean) ?? null;
  const marketCap = finiteNumber(detail.market_data?.market_cap?.usd);
  const fdv = finiteNumber(detail.market_data?.fully_diluted_valuation?.usd);
  const totalSupply = finiteNumber(detail.market_data?.total_supply);

  return {
    id: detail.id ?? match.id,
    symbol: (detail.symbol ?? match.symbol ?? normalizedSymbol).toUpperCase(),
    name: detail.name ?? match.name ?? symbol.toUpperCase(),
    description,
    imageUrl: detail.image?.small ?? detail.image?.thumb ?? match.large ?? match.thumb ?? null,
    homepage,
    marketCapRank: detail.market_cap_rank ?? match.market_cap_rank ?? null,
    marketCap,
    fdv,
    totalSupply,
    categories: (detail.categories ?? []).filter(Boolean).slice(0, 3),
    source: "coingecko"
  };
}

export async function fetchCoinProfile(symbol: string) {
  const normalizedSymbol = marketDataSymbol(symbol);
  const cacheKey = `coin-profile:v3:${normalizedSymbol}`;

  return cached(cacheKey, COIN_PROFILE_CACHE_TTL_MS, () =>
    fetchCoinProfileUncached(symbol)
  );
}
