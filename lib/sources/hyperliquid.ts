import { cached } from "@/lib/cache";
import type { HistoryInterval, HistoryPoint, Market } from "@/lib/types";
import { intervalToMs, toNumber } from "@/lib/utils";
import { normalizeHyperliquidSymbol, toHyperliquidRawSymbol } from "@/lib/symbols";

const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";

type HyperliquidUniverseAsset = {
  name: string;
  isDelisted?: boolean;
};

type HyperliquidAssetCtx = {
  dayNtlVlm?: string;
  funding?: string;
  markPx?: string;
  openInterest?: string;
  prevDayPx?: string;
};

type HyperliquidMetaAndCtxs = [
  { universe: HyperliquidUniverseAsset[] },
  HyperliquidAssetCtx[]
];

type HyperliquidCandle = {
  t: number;
  c: string;
  v: string;
};

async function postInfo<T>(body: object): Promise<T> {
  const response = await fetch(HYPERLIQUID_INFO_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Hyperliquid API failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchHyperliquidMarkets(): Promise<Market[]> {
  return cached("hyperliquid:markets", 60_000, async () => {
    const [meta, contexts] = await postInfo<HyperliquidMetaAndCtxs>({
      type: "metaAndAssetCtxs"
    });

    return meta.universe
      .map((asset, index): Market | null => {
        if (asset.isDelisted) return null;

        const ctx = contexts[index];
        if (!ctx) return null;

        const markPrice = toNumber(ctx.markPx);
        const prevDayPx = toNumber(ctx.prevDayPx);
        const openInterestBase = toNumber(ctx.openInterest);
        const volume24h = toNumber(ctx.dayNtlVlm);
        const fundingRate = toNumber(ctx.funding);
        const oi = openInterestBase * markPrice;

        return {
          protocol: "hyperliquid",
          symbol: normalizeHyperliquidSymbol(asset.name),
          rawSymbol: asset.name,
          markPrice,
          marketCap: null,
          fdv: null,
          change24hPct: prevDayPx > 0 ? ((markPrice - prevDayPx) / prevDayPx) * 100 : 0,
          oiBase: openInterestBase,
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
          fundingRate
        };
      })
      .filter((market): market is Market => Boolean(market))
      .sort((left, right) => right.oi - left.oi);
  });
}

export async function fetchHyperliquidVolumeHistory(
  symbol: string,
  interval: HistoryInterval = "1h",
  limit = 168
): Promise<HistoryPoint[]> {
  const rawSymbol = toHyperliquidRawSymbol(symbol);
  const endTime = Date.now();
  const startTime = endTime - intervalToMs(interval) * limit;
  const cacheKey = `hyperliquid:volume:${rawSymbol}:${interval}:${limit}`;

  return cached(cacheKey, 5 * 60_000, async () => {
    const candles = await postInfo<HyperliquidCandle[]>({
      type: "candleSnapshot",
      req: {
        coin: rawSymbol,
        interval,
        startTime,
        endTime
      }
    });

    return candles
      .map((candle) => {
        const close = toNumber(candle.c);
        const baseVolume = toNumber(candle.v);
        return {
          ts: candle.t,
          value: close * baseVolume
        };
      })
      .filter((point) => Number.isFinite(point.value));
  });
}
