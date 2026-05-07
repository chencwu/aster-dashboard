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
  MarketsQuality,
  Protocol,
  ProtocolSlug
} from "@/lib/types";
import {
  attachOiDeltas,
  getProtocolOiAtOrBefore,
  getProtocolOiSeries,
  getProtocolVolume24hSeries,
  isPostgresConfigured
} from "@/lib/db/oi-history";
import { mapLimit, pctChange, sum } from "@/lib/utils";

type GetMarketsOptions = {
  includeInvalidForSnapshot?: boolean;
};

type MarketsByProtocol = Record<ProtocolSlug, Market[]>;

const protocolEntries: Array<[ProtocolSlug, (typeof PROTOCOLS)[ProtocolSlug]]> = [
  ["aster", PROTOCOLS.aster],
  ["hyperliquid", PROTOCOLS.hyperliquid]
];

export async function getMarkets(
  protocol: ProtocolSlug,
  options: GetMarketsOptions = {}
): Promise<Market[]> {
  return protocol === "aster" ? fetchAsterMarkets(options) : fetchHyperliquidMarkets();
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

export function getDashboardStatsFromMarkets(markets: Market[]): DashboardStats {
  return {
    totalOi: sum(markets.map((market) => market.oi)),
    totalVolume24h: sum(markets.map((market) => market.volume24h)),
    protocolCount: 2
  };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const { aster, hyperliquid } = await getAllMarkets();
  return getDashboardStatsFromMarkets([...aster, ...hyperliquid]);
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

function previousPointValue(points: HistoryPoint[], hoursAgo: number) {
  const targetTs = Date.now() - hoursAgo * 60 * 60 * 1000;
  return [...points].reverse().find((point) => point.ts <= targetTs)?.value ?? null;
}

export async function getProtocolsFromMarkets(marketsByProtocol: MarketsByProtocol): Promise<Protocol[]> {
  return Promise.all(
    protocolEntries.map(async ([slug, config]) => {
      const markets = marketsByProtocol[slug];
      const oi = sum(markets.map((market) => market.oi));
      const volume24h = sum(markets.map((market) => market.volume24h));
      const [oiSeries, oi24hAgo, volumeSeries] = await Promise.all([
        getProtocolOiSeries(slug),
        getProtocolOiAtOrBefore(slug, 24),
        getProtocolVolume24hSeries(slug)
      ]);
      const previousVolume = previousPointValue(volumeSeries, 24);

      return {
        slug,
        name: config.name,
        logo: config.logo,
        url: config.url,
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

export async function getProtocols(): Promise<Protocol[]> {
  return getProtocolsFromMarkets(await getAllMarkets());
}

function pickVolumeDelta(market: Market, period: DeltaPeriod) {
  if (period === "1h") return market.volumeDelta1hPct;
  if (period === "24h") return market.volumeDelta24hPct;
  return market.volumeDelta7dPct;
}

function pickOiDelta(market: Market, period: DeltaPeriod) {
  if (period === "1h") return market.oiDelta1hPct;
  if (period === "24h") return market.oiDelta24hPct;
  return market.oiDelta7dPct;
}

export function getOiDeltaLeaderboardFromMarkets(markets: Market[], period: DeltaPeriod) {
  return markets
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

export async function getOiDeltaLeaderboard(period: DeltaPeriod) {
  if (!isPostgresConfigured()) return [];

  const [aster, hyperliquid] = await Promise.all([
    getMarketsWithOiDeltas("aster"),
    getMarketsWithOiDeltas("hyperliquid")
  ]);

  return getOiDeltaLeaderboardFromMarkets([...aster, ...hyperliquid], period);
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

  if (isPostgresConfigured()) {
    const marketsWithDeltas = await attachOiDeltas(markets);
    return getVolumeDeltaLeaderboardFromMarkets(marketsWithDeltas, period);
  }

  const sampledMarkets = [...markets]
    .sort((left, right) => right.volume24h - left.volume24h)
    .slice(0, 80);
  const items = await mapLimit(sampledMarkets, 6, async (market) => {
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

export function getVolumeDeltaLeaderboardFromMarkets(markets: Market[], period: DeltaPeriod) {
  return markets
    .filter((market) => market.volume24h > 0)
    .map(
      (market): DeltaLeaderboardItem => ({
        protocol: market.protocol,
        symbol: market.symbol,
        rawSymbol: market.rawSymbol,
        value: market.volume24h,
        deltaPct: pickVolumeDelta(market, period),
        markPrice: market.markPrice
      })
    )
    .filter((item) => item.deltaPct != null)
    .sort((left, right) => (right.deltaPct ?? -Infinity) - (left.deltaPct ?? -Infinity))
    .slice(0, 30);
}

function countKnown(markets: Market[], pick: (market: Market) => number | null) {
  return markets.filter((market) => pick(market) != null).length;
}

export function getMarketsQuality(markets: Market[]): MarketsQuality {
  return {
    deltaSource: isPostgresConfigured() ? "postgres_snapshots" : "not_configured",
    marketCount: markets.length,
    maxSnapshotStalenessHours: {
      "1h": 1,
      "24h": 3,
      "7d": 12
    },
    oiDeltaCoverage: {
      "1h": countKnown(markets, (market) => market.oiDelta1hPct),
      "24h": countKnown(markets, (market) => market.oiDelta24hPct),
      "7d": countKnown(markets, (market) => market.oiDelta7dPct)
    },
    volumeDeltaCoverage: {
      "1h": countKnown(markets, (market) => market.volumeDelta1hPct),
      "24h": countKnown(markets, (market) => market.volumeDelta24hPct),
      "7d": countKnown(markets, (market) => market.volumeDelta7dPct)
    }
  };
}
