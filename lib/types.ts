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
  change24hPct: number;
  oiBase: number;
  oi: number;
  oiDelta1hPct: number | null;
  oiDelta24hPct: number | null;
  oiDelta7dPct: number | null;
  volume24h: number;
  volumeDelta24hPct: number | null;
  volumeDelta7dPct: number | null;
  fundingRate: number;
};

export type HistoryPoint = {
  ts: number;
  value: number;
  isImputed?: boolean;
  imputedReason?: string | null;
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

export type DeltaLeaderboardItem = {
  protocol: ProtocolSlug;
  symbol: string;
  rawSymbol: string;
  value: number;
  deltaPct: number | null;
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
