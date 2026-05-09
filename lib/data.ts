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
  DeltaScope,
  DeltaSortMode,
  HistoryInterval,
  HistoryPoint,
  Market,
  MarketsQuality,
  Protocol,
  ProtocolSlug
} from "@/lib/types";
import { DELTA_PERIODS, DELTA_PERIOD_HOURS } from "@/lib/types";
import { attachMarketData } from "@/lib/sources/market-data";
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
  return attachOiDeltas(await attachMarketData(markets));
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
  if (period === "4h") return market.volumeDelta4hPct;
  if (period === "8h") return market.volumeDelta8hPct;
  if (period === "12h") return market.volumeDelta12hPct;
  if (period === "24h") return market.volumeDelta24hPct;
  return null;
}

function pickOiDelta(market: Market, period: DeltaPeriod) {
  if (period === "1h") return market.oiDelta1hPct;
  if (period === "4h") return market.oiDelta4hPct;
  if (period === "8h") return market.oiDelta8hPct;
  if (period === "12h") return market.oiDelta12hPct;
  if (period === "24h") return market.oiDelta24hPct;
  return null;
}

function pickVolumeDeltaUsd(market: Market, period: DeltaPeriod) {
  if (period === "1h") return market.volumeDelta1hUsd;
  if (period === "4h") return market.volumeDelta4hUsd;
  if (period === "8h") return market.volumeDelta8hUsd;
  if (period === "12h") return market.volumeDelta12hUsd;
  if (period === "24h") return market.volumeDelta24hUsd;
  return null;
}

function pickOiDeltaUsd(market: Market, period: DeltaPeriod) {
  if (period === "1h") return market.oiDelta1hUsd;
  if (period === "4h") return market.oiDelta4hUsd;
  if (period === "8h") return market.oiDelta8hUsd;
  if (period === "12h") return market.oiDelta12hUsd;
  if (period === "24h") return market.oiDelta24hUsd;
  return null;
}

function sortDeltaItems(items: DeltaLeaderboardItem[], mode: DeltaSortMode) {
  const pick = mode === "amount"
    ? (item: DeltaLeaderboardItem) => item.deltaUsd
    : (item: DeltaLeaderboardItem) => item.deltaPct;

  return items
    .filter((item) => pick(item) != null)
    .sort((left, right) => (pick(right) ?? -Infinity) - (pick(left) ?? -Infinity))
    .slice(0, 30);
}

function filterMarketsByScope(markets: Market[], scope: DeltaScope) {
  if (scope === "all") return markets;
  return markets.filter((market) => market.protocol === scope);
}

export function getOiDeltaLeaderboardFromMarkets(
  markets: Market[],
  period: DeltaPeriod,
  mode: DeltaSortMode = "pct",
  scope: DeltaScope = "all"
) {
  const items = filterMarketsByScope(markets, scope).map(
    (market): DeltaLeaderboardItem => ({
      protocol: market.protocol,
      symbol: market.symbol,
      rawSymbol: market.rawSymbol,
      value: market.oi,
      deltaPct: pickOiDelta(market, period),
      deltaUsd: pickOiDeltaUsd(market, period),
      priceChange24hPct: market.change24hPct,
      markPrice: market.markPrice
    })
  );

  return sortDeltaItems(items, mode);
}

export async function getOiDeltaLeaderboard(
  period: DeltaPeriod,
  mode: DeltaSortMode = "pct",
  scope: DeltaScope = "all"
) {
  if (!isPostgresConfigured()) return [];

  const [aster, hyperliquid] = await Promise.all([
    getMarketsWithOiDeltas("aster"),
    getMarketsWithOiDeltas("hyperliquid")
  ]);

  return getOiDeltaLeaderboardFromMarkets([...aster, ...hyperliquid], period, mode, scope);
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
  const interval: HistoryInterval = "1h";
  const periodHours = DELTA_PERIOD_HOURS[period];
  const limit = period === "1h" ? 3 : periodHours * 2;
  const history = await fetchVolumeHistory(market.protocol, market.symbol, interval, limit);
  const { current, previous } = splitWindow(history, period);

  return {
    protocol: market.protocol,
    symbol: market.symbol,
    rawSymbol: market.rawSymbol,
    value: current || market.volume24h,
    deltaPct: pctChange(current, previous),
    deltaUsd:
      Number.isFinite(current) && Number.isFinite(previous) ? current - previous : null,
    priceChange24hPct: market.change24hPct,
    markPrice: market.markPrice
  };
}

export async function getVolumeDeltaLeaderboard(
  period: DeltaPeriod,
  mode: DeltaSortMode = "pct",
  scope: DeltaScope = "all"
) {
  const { aster, hyperliquid } = await getAllMarkets();
  const markets = [...aster, ...hyperliquid].filter((market) => market.volume24h > 0);

  if (isPostgresConfigured()) {
    const marketsWithDeltas = await attachOiDeltas(markets);
    return getVolumeDeltaLeaderboardFromMarkets(marketsWithDeltas, period, mode, scope);
  }

  const sampledMarkets = [...markets]
    .filter((market) => scope === "all" || market.protocol === scope)
    .sort((left, right) => right.volume24h - left.volume24h)
    .slice(0, 80);
  const items = await mapLimit(sampledMarkets, 6, async (market) => {
    try {
      return volumeDeltaForMarket(market, period);
    } catch {
      return null;
    }
  });

  return sortDeltaItems(
    items.filter((item): item is DeltaLeaderboardItem => item !== null),
    mode
  );
}

export function getVolumeDeltaLeaderboardFromMarkets(
  markets: Market[],
  period: DeltaPeriod,
  mode: DeltaSortMode = "pct",
  scope: DeltaScope = "all"
) {
  const items = filterMarketsByScope(markets, scope)
    .filter((market) => market.volume24h > 0)
    .map(
      (market): DeltaLeaderboardItem => ({
        protocol: market.protocol,
        symbol: market.symbol,
        rawSymbol: market.rawSymbol,
        value: market.volume24h,
        deltaPct: pickVolumeDelta(market, period),
        deltaUsd: pickVolumeDeltaUsd(market, period),
        priceChange24hPct: market.change24hPct,
        markPrice: market.markPrice
      })
    );

  return sortDeltaItems(items, mode);
}

function countKnown(markets: Market[], pick: (market: Market) => number | null) {
  return markets.filter((market) => pick(market) != null).length;
}

export function getMarketsQuality(markets: Market[]): MarketsQuality {
  const coverage = <T extends number | null>(pick: (market: Market) => T) =>
    countKnown(markets, pick);

  return {
    deltaSource: isPostgresConfigured() ? "postgres_snapshots" : "not_configured",
    marketCount: markets.length,
    maxSnapshotStalenessHours: Object.fromEntries(
      DELTA_PERIODS.map((period) => [period, period === "1h" ? 1 : 3])
    ) as Record<DeltaPeriod, number>,
    oiDeltaCoverage: Object.fromEntries(
      DELTA_PERIODS.map((period) => [period, coverage((market) => pickOiDelta(market, period))])
    ) as Record<DeltaPeriod, number>,
    volumeDeltaCoverage: Object.fromEntries(
      DELTA_PERIODS.map((period) => [
        period,
        coverage((market) => pickVolumeDelta(market, period))
      ])
    ) as Record<DeltaPeriod, number>
  };
}
