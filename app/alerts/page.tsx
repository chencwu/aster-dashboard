"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Activity, BellRing, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/client-fetch";
import { formatPct, formatUsd } from "@/lib/format";
import { PROTOCOLS } from "@/lib/protocols";
import { cn } from "@/lib/utils";
import type { AlertDirection, AlertItem, AlertSignal } from "@/lib/types";

type AlertsResponse = {
  ok: true;
  generatedAt: number;
  status: "ready" | "quiet" | "not_configured";
  hours?: number;
  symbol?: string | null;
  items: AlertItem[];
  message?: string | null;
};

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

export default function AlertsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">加载报警流</div>}>
      <AlertsContent />
    </Suspense>
  );
}

function AlertsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSymbol = searchParams.get("symbol")?.trim().toUpperCase() || "";
  const [symbolInput, setSymbolInput] = useState(urlSymbol);

  useEffect(() => {
    setSymbolInput(urlSymbol);
  }, [urlSymbol]);

  const alertsUrl = useMemo(() => {
    const params = new URLSearchParams({ hours: "24", limit: "300" });
    if (urlSymbol) params.set("symbol", urlSymbol);
    return `/api/alerts?${params.toString()}`;
  }, [urlSymbol]);

  const query = useQuery({
    queryKey: ["alerts", "24h", urlSymbol],
    queryFn: () => fetchJson<AlertsResponse>(alertsUrl),
    refetchInterval: 60_000
  });
  const items = query.data?.items ?? [];

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSymbol = symbolInput.trim().toUpperCase();
    const params = new URLSearchParams(searchParams.toString());

    if (nextSymbol) {
      params.set("symbol", nextSymbol);
    } else {
      params.delete("symbol");
    }

    const queryString = params.toString();
    router.replace(queryString ? `/alerts?${queryString}` : "/alerts");
  }

  function clearSearch() {
    setSymbolInput("");
    router.replace("/alerts");
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">最近 24h 报警流</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Aster + Hyperliquid 每 5min 快照触发的报警会落库保存；同时满足动态金额阈值和百分比阈值才触发，避免大币种小波动刷屏。
          </p>
        </div>

        <form className="flex w-full gap-2 sm:w-[360px]" onSubmit={submitSearch}>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={symbolInput}
              onChange={(event) => setSymbolInput(event.target.value.trim().toUpperCase())}
              placeholder="搜索 coin，如 DOGE"
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            搜索
          </Button>
          {urlSymbol ? (
            <Button type="button" variant="ghost" size="icon" aria-label="清除搜索" onClick={clearSearch}>
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </form>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" />
            报警流
            {urlSymbol ? <Badge>{urlSymbol}</Badge> : null}
          </CardTitle>
          <CardDescription>
            {urlSymbol
              ? `页面每 60 秒刷新，只显示 ${urlSymbol} 最近 24h 已保存的报警。`
              : "页面每 60 秒刷新，显示最近 24h 已保存的报警；点击 coin 可跳转到追踪页查看历史曲线。"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="flex h-56 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-4 w-4 animate-spin" />
              加载报警流
            </div>
          ) : query.isError ? (
            <div className="flex h-56 items-center justify-center text-sm text-rose-300">
              {(query.error as Error).message}
            </div>
          ) : items.length ? (
            <div className="space-y-2">
              {items.map((item) => (
                <Link
                  key={item.id}
                  href={`/tracker?symbol=${encodeURIComponent(item.symbol)}`}
                  className={cn(
                    "flex flex-col gap-2 rounded-md border px-4 py-3 transition-colors hover:border-primary/60 sm:flex-row sm:items-center sm:justify-between",
                    severityClass(item.severity)
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{alertText(item)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      前值 {formatUsd(item.previousValue)} · 当前 {formatUsd(item.currentValue)} · 阈值 {formatUsd(item.thresholdUsd)}
                      {item.priceDeltaPct == null ? "" : ` · 价格 ${formatPct(item.priceDeltaPct)}`}
                      {" "}· 间隔 {item.snapshotGapMinutes.toFixed(1)}min
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
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex h-56 items-center justify-center text-center text-sm text-muted-foreground">
              {query.data?.message ?? "最近 24h 暂无已落库的报警。"}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
