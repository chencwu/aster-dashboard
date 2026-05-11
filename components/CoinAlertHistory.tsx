"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, BellRing } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson } from "@/lib/client-fetch";
import { formatPct, formatUsd } from "@/lib/format";
import { PROTOCOLS } from "@/lib/protocols";
import { normalizeTrackerSymbol } from "@/lib/symbols";
import { cn } from "@/lib/utils";
import type { AlertDirection, AlertItem, AlertSignal } from "@/lib/types";

type AlertWindow = "1d" | "3d" | "7d";

type AlertsResponse = {
  ok: true;
  generatedAt: number;
  status: "ready" | "quiet" | "not_configured";
  hours?: number | null;
  symbol?: string | null;
  items: AlertItem[];
  message?: string | null;
};

const windows: Array<{ value: AlertWindow; label: string; hours: number }> = [
  { value: "1d", label: "1D", hours: 24 },
  { value: "3d", label: "3D", hours: 72 },
  { value: "7d", label: "7D", hours: 168 }
];

const windowMap = new Map(windows.map((item) => [item.value, item]));

function windowConfig(window: AlertWindow) {
  return windowMap.get(window) ?? windows[2];
}

const signalLabels: Record<AlertSignal, string> = {
  oi_spike: "OI 爆发",
  oi_drop: "OI 快速下降",
  volume_spike: "Volume 爆发"
};

const signalTones: Record<AlertSignal, string> = {
  oi_spike: "text-emerald-300",
  oi_drop: "text-rose-300",
  volume_spike: "text-sky-300"
};

const directionLabels: Record<AlertDirection, string> = {
  long_build: "多头加仓",
  short_build: "空头加仓",
  short_cover: "空头平仓",
  long_unwind: "多头平仓",
  unclear: "方向不明"
};

function formatTs(ts: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(ts);
}

function formatSignedUsd(value: number) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${formatUsd(Math.abs(value))}`;
}

function isOiSignal(signal: AlertSignal) {
  return signal === "oi_spike" || signal === "oi_drop";
}

function pricePhrase(item: AlertItem) {
  return item.priceDeltaPct == null ? "" : `，价格 ${formatPct(item.priceDeltaPct)}`;
}

function directionPhrase(item: AlertItem) {
  if (!isOiSignal(item.signal) || item.direction === "unclear") return "";
  return `，${directionLabels[item.direction]}`;
}

function alertText(item: AlertItem) {
  return `${item.symbol} ${formatTs(item.ts)}，${signalLabels[item.signal]} ${formatSignedUsd(item.deltaUsd)} / ${formatPct(item.deltaPct)}${pricePhrase(item)}${directionPhrase(item)}，${PROTOCOLS[item.protocol].name}`;
}

function severityClass(severity: AlertItem["severity"]) {
  if (severity === "high") return "border-rose-500/50 bg-rose-500/10";
  if (severity === "medium") return "border-amber-500/50 bg-amber-500/10";
  return "border-border bg-card";
}

export function CoinAlertHistory({ symbol }: { symbol: string }) {
  const normalizedSymbol = normalizeTrackerSymbol(symbol);
  const [window, setWindow] = useState<AlertWindow>("7d");

  const url = useMemo(() => {
    const config = windowConfig(window);
    const params = new URLSearchParams({
      hours: String(config.hours),
      limit: "5000",
      symbol: normalizedSymbol
    });
    return `/api/alerts?${params.toString()}`;
  }, [normalizedSymbol, window]);

  const query = useQuery({
    queryKey: ["alerts", "coin", normalizedSymbol, window],
    queryFn: () => fetchJson<AlertsResponse>(url),
    enabled: Boolean(normalizedSymbol),
    refetchInterval: 60_000
  });

  const items = query.data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-primary" />
              历史报警
              <Badge>{normalizedSymbol}</Badge>
              {items.length ? <Badge>{items.length}</Badge> : null}
            </CardTitle>
            <CardDescription className="mt-1">
              {normalizedSymbol} 最近 {windowConfig(window).label} 已保存的报警
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {windows.map((item) => (
              <Button
                key={item.value}
                size="sm"
                type="button"
                variant={window === item.value ? "default" : "secondary"}
                onClick={() => setWindow(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4 animate-spin" />
            加载历史报警
          </div>
        ) : query.isError ? (
          <div className="flex h-48 items-center justify-center text-sm text-rose-300">
            {(query.error as Error).message}
          </div>
        ) : items.length ? (
          <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex flex-col gap-2 rounded-md border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
                  severityClass(item.severity)
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{alertText(item)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    前值 {formatUsd(item.previousValue)} · 当前 {formatUsd(item.currentValue)} · 阈值{" "}
                    {formatUsd(item.thresholdUsd)}
                    {item.priceDeltaPct == null ? "" : ` · 价格 ${formatPct(item.priceDeltaPct)}`} · 间隔{" "}
                    {item.snapshotGapMinutes.toFixed(1)}min
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Badge>{PROTOCOLS[item.protocol].name}</Badge>
                  <Badge className={signalTones[item.signal]}>{signalLabels[item.signal]}</Badge>
                  <Badge>{formatSignedUsd(item.deltaUsd)}</Badge>
                  <Badge>{formatPct(item.deltaPct)}</Badge>
                  {item.priceDeltaPct == null ? null : <Badge>价格 {formatPct(item.priceDeltaPct)}</Badge>}
                  {isOiSignal(item.signal) && item.direction !== "unclear" ? (
                    <Badge>{directionLabels[item.direction]}</Badge>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-48 items-center justify-center text-center text-sm text-muted-foreground">
            {query.data?.message ?? `${normalizedSymbol} 暂无已落库的报警。`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
