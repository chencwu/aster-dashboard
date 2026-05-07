"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Search
} from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/client-fetch";
import type { HistoryPoint, Market } from "@/lib/types";
import { cn } from "@/lib/utils";
import { deltaTone, formatFunding, formatNumber, formatPct, formatUsd } from "@/lib/format";

type SortKey =
  | "symbol"
  | "markPrice"
  | "change24hPct"
  | "oi"
  | "oiDelta1hPct"
  | "oiDelta24hPct"
  | "oiDelta7dPct"
  | "volume24h"
  | "volumeDelta24hPct"
  | "volumeDelta7dPct"
  | "fundingRate"
  | "ratio";

type Props = {
  markets: Market[];
};

type OiHistoryResponse = {
  ok: true;
  points: HistoryPoint[];
  status: "ready" | "insufficient_history" | "not_configured";
  collectedHours: number;
  message?: string | null;
};

const columns: Array<{ key: SortKey; label: string }> = [
  { key: "symbol", label: "Symbol" },
  { key: "markPrice", label: "Mark Price" },
  { key: "change24hPct", label: "24h Change" },
  { key: "oi", label: "OI" },
  { key: "oiDelta1hPct", label: "OI 1h Δ" },
  { key: "oiDelta24hPct", label: "OI 24h Δ" },
  { key: "oiDelta7dPct", label: "OI 7d Δ" },
  { key: "volume24h", label: "Volume 24h" },
  { key: "volumeDelta24hPct", label: "Vol 24h Δ" },
  { key: "volumeDelta7dPct", label: "Vol 7d Δ" },
  { key: "fundingRate", label: "Funding" },
  { key: "ratio", label: "OI/Vol" }
];

function sortValue(market: Market, key: SortKey) {
  if (key === "symbol") return market.symbol;
  if (key === "ratio") return market.volume24h > 0 ? market.oi / market.volume24h : 0;
  return market[key] ?? -Infinity;
}

function isAnomaly(market: Market) {
  const oiDelta = market.oiDelta24hPct;
  const volumeDelta = market.volumeDelta24hPct;
  return (
    (oiDelta != null && (oiDelta > 50 || oiDelta < -30)) ||
    (volumeDelta != null && volumeDelta > 200)
  );
}

function badgeTone(value: number | null) {
  if (value == null) return "neutral";
  return value >= 0 ? "positive" : "negative";
}

function historySegments(points: HistoryPoint[]) {
  return points.slice(1).map((point, index) => {
    const previous = points[index];
    return {
      key: `${previous.ts}-${point.ts}`,
      points: [previous, point],
      isImputed: Boolean(previous.isImputed || point.isImputed)
    };
  });
}

export function MarketsTable({ markets }: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("oi");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return markets
      .filter((market) =>
        normalizedQuery
          ? market.symbol.toLowerCase().includes(normalizedQuery) ||
            market.rawSymbol.toLowerCase().includes(normalizedQuery)
          : true
      )
      .sort((left, right) => {
        const leftValue = sortValue(left, sortKey);
        const rightValue = sortValue(right, sortKey);
        const modifier = direction === "asc" ? 1 : -1;

        if (typeof leftValue === "string" && typeof rightValue === "string") {
          return leftValue.localeCompare(rightValue) * modifier;
        }

        return ((leftValue as number) - (rightValue as number)) * modifier;
      });
  }, [direction, markets, query, sortKey]);

  function toggleSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setDirection(nextKey === "symbol" ? "asc" : "desc");
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索 BTC / ETH / SOL"
          className="pl-9"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[1280px] text-left text-sm">
          <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3 font-medium">
                  <button
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    onClick={() => toggleSort(column.key)}
                  >
                    {column.label}
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((market, index) => {
              const ratio = market.volume24h > 0 ? market.oi / market.volume24h : 0;
              const rowKey = `${market.protocol}-${market.rawSymbol}`;
              const expanded = expandedKey === rowKey;

              return (
                <Fragment key={rowKey}>
                  <tr
                    key={rowKey}
                    className={cn(
                      "border-b border-border/70 last:border-0",
                      isAnomaly(market) && "bg-amber-400/10",
                      expanded && "bg-muted/20"
                    )}
                  >
                    <td className="px-4 py-3 text-muted-foreground">{index + 1}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">
                      <button
                        className="inline-flex items-center gap-2 hover:text-primary"
                        onClick={() => setExpandedKey(expanded ? null : rowKey)}
                      >
                        {expanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        {market.symbol}
                      </button>
                    </td>
                    <td className="px-4 py-3">{formatUsd(market.markPrice)}</td>
                    <td className={`px-4 py-3 ${deltaTone(market.change24hPct)}`}>
                      {formatPct(market.change24hPct)}
                    </td>
                    <td className="px-4 py-3 font-medium">{formatUsd(market.oi)}</td>
                    <td className={`px-4 py-3 ${deltaTone(market.oiDelta1hPct)}`}>
                      {formatPct(market.oiDelta1hPct)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={badgeTone(market.oiDelta24hPct)}>
                        {formatPct(market.oiDelta24hPct)}
                      </Badge>
                    </td>
                    <td className={`px-4 py-3 ${deltaTone(market.oiDelta7dPct)}`}>
                      {formatPct(market.oiDelta7dPct)}
                    </td>
                    <td className="px-4 py-3 font-medium">{formatUsd(market.volume24h)}</td>
                    <td className={`px-4 py-3 ${deltaTone(market.volumeDelta24hPct)}`}>
                      {formatPct(market.volumeDelta24hPct)}
                    </td>
                    <td className={`px-4 py-3 ${deltaTone(market.volumeDelta7dPct)}`}>
                      {formatPct(market.volumeDelta7dPct)}
                    </td>
                    <td className={`px-4 py-3 ${deltaTone(market.fundingRate)}`}>
                      {formatFunding(market.fundingRate)}
                    </td>
                    <td className="px-4 py-3">{ratio.toFixed(2)}</td>
                  </tr>
                  {expanded ? (
                    <tr key={`${rowKey}-details`} className="border-b border-border/70 bg-background">
                      <td colSpan={columns.length + 1} className="px-4 py-4">
                        <OiCollectionDetails market={market} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OiCollectionDetails({ market }: { market: Market }) {
  const query = useQuery({
    queryKey: ["oi-history-preview", market.protocol, market.symbol],
    queryFn: () =>
      fetchJson<OiHistoryResponse>(
        `/api/history/oi/${market.protocol}/${encodeURIComponent(market.symbol)}?range=1d`
      ),
    refetchInterval: 60_000
  });
  const points = useMemo(() => query.data?.points ?? [], [query.data?.points]);
  const hasImputedPoints = points.some((point) => point.isImputed);
  const segments = useMemo(() => historySegments(points), [points]);

  return (
    <div className="grid gap-4 rounded-md border bg-card p-4 lg:grid-cols-[1fr_22rem]">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <DetailItem label="采集键" value={`${market.protocol} / ${market.symbol}`} />
        <DetailItem label="原始合约" value={market.rawSymbol} />
        <DetailItem label="采集频率" value="5 分钟 / symbol" />
        <DetailItem label="Raw OI (base)" value={formatNumber(market.oiBase)} />
        <DetailItem label="Mark Price" value={formatUsd(market.markPrice)} />
        <DetailItem label="OI USD" value={formatUsd(market.oi)} />
        <DetailItem label="Funding" value={formatFunding(market.fundingRate)} />
        <DetailItem label="Volume 24h" value={formatUsd(market.volume24h)} />
        <DetailItem
          label="存库字段"
          value="ts, oi_base, oi_usd, mark_price, funding_rate, volume24h_usd"
        />
      </div>

      <div className="min-h-36 rounded-md border bg-background/60 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">最近 24h OI 快照</div>
            <div className="text-xs text-muted-foreground">
              {query.data?.status === "ready"
                ? `${points.length} 个采样点`
                : query.data?.message ?? "正在读取采集状态"}
            </div>
          </div>
          <a
            className="inline-flex h-8 items-center rounded-md bg-muted px-3 text-xs font-medium text-foreground hover:bg-muted/80"
            href={`/tracker?protocol=${market.protocol}&symbol=${encodeURIComponent(market.symbol)}`}
          >
            打开追踪
          </a>
        </div>

        {query.isLoading ? (
          <div className="flex h-28 items-center justify-center gap-2 text-xs text-muted-foreground">
            <CircleDashed className="h-4 w-4 animate-spin" />
            加载采集状态
          </div>
        ) : points.length > 1 ? (
          <ResponsiveContainer width="100%" height={112}>
            <LineChart data={points}>
              <XAxis dataKey="ts" hide />
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Tooltip
                formatter={(value, _name, item) => [
                  formatUsd(Number(value)),
                  item.payload?.isImputed ? "OI (复用上个点)" : "OI"
                ]}
                labelFormatter={(value) =>
                  new Intl.DateTimeFormat("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit"
                  }).format(Number(value))
                }
                contentStyle={{ background: "#111820", border: "1px solid #26323d", borderRadius: 8, color: "#eaf2f8" }}
                labelStyle={{ color: "#eaf2f8" }}
                itemStyle={{ color: "#eaf2f8" }}
              />
              {hasImputedPoints
                ? segments.map((segment) => (
                    <Line
                      key={segment.key}
                      data={segment.points}
                      type="linear"
                      dataKey="value"
                      stroke={segment.isImputed ? "#ff5c7a" : "#1bdfa0"}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))
                : (
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#1bdfa0"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-28 items-center justify-center text-center text-xs text-muted-foreground">
            {query.data?.message ?? "还没有足够的 OI 快照。"}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/60 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
