"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, BellRing } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson } from "@/lib/client-fetch";
import { formatPct, formatUsd } from "@/lib/format";
import { PROTOCOLS } from "@/lib/protocols";
import { cn } from "@/lib/utils";
import type { AlertItem, AlertSignal } from "@/lib/types";

type AlertsResponse = {
  ok: true;
  generatedAt: number;
  status: "ready" | "quiet" | "not_configured";
  hours?: number;
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

function alertText(item: AlertItem) {
  return `${item.symbol} ${formatTs(item.ts)}，${signalLabels[item.signal]} ${formatSignedUsd(item.deltaUsd)} / ${formatPct(item.deltaPct)}，${PROTOCOLS[item.protocol].name}`;
}

function severityClass(severity: AlertItem["severity"]) {
  if (severity === "high") return "border-rose-500/50 bg-rose-500/10";
  if (severity === "medium") return "border-amber-500/50 bg-amber-500/10";
  return "border-border bg-card";
}

export default function AlertsPage() {
  const query = useQuery({
    queryKey: ["alerts", "24h"],
    queryFn: () => fetchJson<AlertsResponse>("/api/alerts?hours=24&limit=300"),
    refetchInterval: 60_000
  });
  const items = query.data?.items ?? [];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">最近 24h 报警流</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Aster + Hyperliquid 每 5min 快照触发的报警会落库保存；同时满足动态金额阈值和百分比阈值才触发，避免大币种小波动刷屏。
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" />
            报警流
          </CardTitle>
          <CardDescription>
            页面每 60 秒刷新，显示最近 24h 已保存的报警；点击 coin 可跳转到追踪页查看历史曲线。
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
                      前值 {formatUsd(item.previousValue)} · 当前 {formatUsd(item.currentValue)} · 阈值 {formatUsd(item.thresholdUsd)} · 间隔 {item.snapshotGapMinutes.toFixed(1)}min
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Badge>{PROTOCOLS[item.protocol].name}</Badge>
                    <Badge className={signalTones[item.signal]}>{signalLabels[item.signal]}</Badge>
                    <Badge>{formatSignedUsd(item.deltaUsd)}</Badge>
                    <Badge>{formatPct(item.deltaPct)}</Badge>
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
