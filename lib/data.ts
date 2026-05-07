import { PROTOCOLS } from "@/lib/protocols";
import { fetchAsterMarkets, fetchAsterVolumeHistory } from "@/lib/sources/aster";
import {
  fetchHyperliquidMarkets,
  fetchHyperliquidVolumeHistory
} from "@/lib/sources/hyperliquid";
import type {
  DashboardStats,
  DeltaLeaderboardItem,
  DeltaPeriod,
  HistoryInterval,
  HistoryPoint,
  Market,
  Protocol,
  ProtocolSlug
} from "@/lib/types";
import {
  attachOiDeltas,
  getProtocolOiAtOrBefore,
  getProtocolOiSeries,
  isPostgresConfigured
} from "@/lib/db/oi-history";
import { cached } from "@/lib/cache";
import { mapLimit, pctChange, sum } from "@/lib/utils";

export async function getMarkets(protocol: ProtocolSlug): Promise<Market[]> {
  return protocol === "aster" ? fetchAsterMarkets() : fetchHyperliquidMarkets();
}

export async function getMarketsWithOiDeltas(protocol: ProtocolSlug) {
  const markets = await getMarkets(protocol);
  return attachOiDeltas(markets);
}

export async function getAllMarkets() {
  const [aster, hyperliquid] = await Promise.all([
    getMarkets("aster"),
    getMarkets("hyperliquid")
  ]);

  return { aster, hyperliquid };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const { aster, hyperliquid } = await getAllMarkets();
  const allMarkets = [...aster, ...hyperliquid];

  return {
    totalOi: sum(allMarkets.map((market) => market.oi)),
    totalVolume24h: sum(allMarkets.map((market) => market.volume24h)),
    protocolCount: 2
  };
}

export async function fetchVolumeHistory(
  protocol: ProtocolSlug,
  symbol: string,
  interval: HistoryInterval,
  limit: number
): Promise<HistoryPoint[]> {
  return protocol === "aster"
    ? fetchAsterVolumeHistory(symbol, interval, limit)
    : fetchHyperliquidVolumeHistory(symbol, interval, limit);
}

async function getProtocolVolumeSeries(
  protocol: ProtocolSlug,
  markets: Market[],
  days = 7
): Promise<HistoryPoint[]> {
  const cacheKey = `${protocol}:protocol-volume:${days}`;

  return cached(cacheKey, 5 * 60_000, async () => {
    const sampledMarkets = [...markets]
      .sort((left, right) => right.volume24h - left.volume24h)
      .slice(0, 80);

    const histories = await mapLimit(sampledMarkets, 10, async (market) => {
      try {
        return await fetchVolumeHistory(protocol, market.symbol, "1d", days);
      } catch {
        return [];
      }
    });

    const buckets = new Map<number, number>();
    histories.flat().forEach((point) => {
      const bucket = new Date(point.ts);
      bucket.setUTCHours(0, 0, 0, 0);
      const ts = bucket.getTime();
      buckets.set(ts, (buckets.get(ts) ?? 0) + point.value);
    });

    return Array.from(buckets.entries())
      .map(([ts, value]) => ({ ts, value }))
      .sort((left, right) => left.ts - right.ts)
      .slice(-days);
  });
}

export async function getProtocols(): Promise<Protocol[]> {
  const { aster, hyperliquid } = await getAllMarkets();

  return Promise.all(
    ([
      ["aster", aster],
      ["hyperliquid", hyperliquid]
    ] as const).map(async ([slug, markets]) => {
      const oi = sum(markets.map((market) => market.oi));
      const volume24h = sum(markets.map((market) => market.volume24h));
      const [oiSeries, oi24hAgo, volumeSeries] = await Promise.all([
        getProtocolOiSeries(slug),
        getProtocolOiAtOrBefore(slug, 24),
        getProtocolVolumeSeries(slug, markets)
      ]);
      const previousVolume = volumeSeries.at(-2)?.value ?? null;

      return {
        slug,
        name: PROTOCOLS[slug].name,
        logo: PROTOCOLS[slug].logo,
        url: PROTOCOLS[slug].url,
        oi,
        oi7d: oiSeries.map((point) => point.value),
        oiDelta24hPct: oi24hAgo == null ? null : pctChange(oi, oi24hAgo),
        volume24h,
        volume7d: volumeSeries.map((point) => point.value),
        volumeDelta24hPct:
          previousVolume == null ? null : pctChange(volume24h, previousVolume),
        symbolCount: markets.length
      };
    })
  );
}

function pickOiDelta(market: Market, period: DeltaPeriod) {
  if (period === "1h") return market.oiDelta1hPct;
  if (period === "24h") return market.oiDelta24hPct;
  return market.oiDelta7dPct;
}

export async function getOiDeltaLeaderboard(period: DeltaPeriod) {
  if (!isPostgresConfigured()) return [];

  const [aster, hyperliquid] = await Promise.all([
    getMarketsWithOiDeltas("aster"),
    getMarketsWithOiDeltas("hyperliquid")
  ]);

  return [...aster, ...hyperliquid]
    .map(
      (market): DeltaLeaderboardItem => ({
        protocol: market.protocol,
        symbol: market.symbol,
        rawSymbol: market.rawSymbol,
        value: market.oi,
        deltaPct: pickOiDelta(market, period),
        markPrice: market.markPrice
      })
    )
    .filter((item) => item.deltaPct != null)
    .sort((left, right) => (right.deltaPct ?? -Infinity) - (left.deltaPct ?? -Infinity))
    .slice(0, 30);
}

function splitWindow(points: HistoryPoint[], period: DeltaPeriod) {
  const sorted = [...points].sort((left, right) => left.ts - right.ts);
  if (period === "1h") {
    const last = sorted.at(-1)?.value ?? 0;
    const previous = sorted.at(-2)?.value ?? 0;
    return { current: last, previous };
  }

  const half = Math.floor(sorted.length / 2);
  return {
    previous: sum(sorted.slice(0, half).map((point) => point.value)),
    current: sum(sorted.slice(half).map((point) => point.value))
  };
}

async function volumeDeltaForMarket(
  market: Market,
  period: DeltaPeriod
): Promise<DeltaLeaderboardItem> {
  const interval: HistoryInterval = period === "7d" ? "1d" : "1h";
  const limit = period === "1h" ? 3 : period === "24h" ? 48 : 14;
  const history = await fetchVolumeHistory(market.protocol, market.symbol, interval, limit);
  const { current, previous } = splitWindow(history, period);

  return {
    protocol: market.protocol,
    symbol: market.symbol,
    rawSymbol: market.rawSymbol,
    value: current || market.volume24h,
    deltaPct: pctChange(current, previous),
    markPrice: market.markPrice
  };
}

export async function getVolumeDeltaLeaderboard(period: DeltaPeriod) {
  const { aster, hyperliquid } = await getAllMarkets();
  const markets = [...aster, ...hyperliquid].filter((market) => market.volume24h > 0);
  const items = await mapLimit(markets, 6, async (market) => {
    try {
      return volumeDeltaForMarket(market, period);
    } catch {
      return null;
    }
  });

  return items
    .filter((item): item is DeltaLeaderboardItem => item !== null && item.deltaPct != null)
    .sort((left, right) => (right.deltaPct ?? -Infinity) - (left.deltaPct ?? -Infinity))
    .slice(0, 30);
}
