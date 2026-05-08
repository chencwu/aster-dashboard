export type ProtocolSlug = "aster" | "hyperliquid";

export type HistoryInterval = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "8h" | "1d";

export type DashboardStats = {
  totalOi: number;
  totalVolume24h: number;
  protocolCount: 2;
};

export type Protocol = {
  slug: ProtocolSlug;
  name: string;
  logo: string;
  url: string;
  oi: number;
  oi7d: number[];
  oiDelta24hPct: number | null;
  volume24h: number;
  volume7d: number[];
  volumeDelta24hPct: number | null;
  symbolCount: number;
};

export type Market = {
  protocol: ProtocolSlug;
  symbol: string;
  rawSymbol: string;
  markPrice: number;
  marketCap: number | null;
  fdv: number | null;
  change24hPct: number;
  oiBase: number;
  oi: number;
  oiDelta1hPct: number | null;
  oiDelta24hPct: number | null;
  oiDelta7dPct: number | null;
  oiDelta1hUsd: number | null;
  oiDelta24hUsd: number | null;
  oiDelta7dUsd: number | null;
  volume24h: number;
  volumeDelta1hPct: number | null;
  volumeDelta24hPct: number | null;
  volumeDelta7dPct: number | null;
  volumeDelta1hUsd: number | null;
  volumeDelta24hUsd: number | null;
  volumeDelta7dUsd: number | null;
  fundingRate: number;
};

export type HistoryPoint = {
  ts: number;
  value: number;
  isImputed?: boolean;
  imputedReason?: string | null;
};

export type OhlcPoint = {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type HistorySeries = {
  protocol: ProtocolSlug;
  symbol: string;
  metric: "oi" | "volume";
  period: HistoryInterval;
  points: HistoryPoint[];
};

export type SymbolCompare = {
  symbol: string;
  aster: Market | null;
  hyperliquid: Market | null;
};

export type DeltaPeriod = "1h" | "24h" | "7d";

export type DeltaSortMode = "pct" | "amount";

export type DeltaScope = "all" | ProtocolSlug;

export type MarketsQuality = {
  deltaSource: "postgres_snapshots" | "not_configured";
  marketCount: number;
  maxSnapshotStalenessHours: Record<DeltaPeriod, number>;
  oiDeltaCoverage: Record<DeltaPeriod, number>;
  volumeDeltaCoverage: Record<DeltaPeriod, number>;
};

export type DeltaLeaderboardItem = {
  protocol: ProtocolSlug;
  symbol: string;
  rawSymbol: string;
  value: number;
  deltaPct: number | null;
  deltaUsd: number | null;
  priceChange24hPct: number;
  markPrice?: number;
};

export type ApiOk<T> = T & {
  ok: true;
  generatedAt: number;
};

export type ApiError = {
  ok: false;
  error: string;
};
