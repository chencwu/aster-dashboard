"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson } from "@/lib/client-fetch";
import { PROTOCOLS } from "@/lib/protocols";
import { DELTA_PERIODS, type DeltaLeaderboardItem, type DeltaPeriod, type DeltaSortMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatPct, formatUsd } from "@/lib/format";

type Response = {
  ok: true;
  mode: DeltaSortMode;
  items: DeltaLeaderboardItem[];
  message?: string;
};

type Props = {
  metric: "oi" | "volume";
  title: string;
  description: string;
};

const modes: Array<{ value: DeltaSortMode; label: string }> = [
  { value: "pct", label: "百分比" },
  { value: "amount", label: "按量 U" }
];

function isHot(metric: "oi" | "volume", item: DeltaLeaderboardItem, mode: DeltaSortMode) {
  if (mode === "amount") return item.deltaUsd != null && item.deltaUsd > 0;

  const delta = item.deltaPct;
  if (delta == null) return false;
  if (metric === "volume") return delta > 200;
  return delta > 50 || delta < -30;
}

function formatDeltaUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "待采集";
  const formatted = formatUsd(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

export function DeltaLeaderboard({ metric, title, description }: Props) {
  const [period, setPeriod] = useState<DeltaPeriod>("24h");
  const [mode, setMode] = useState<DeltaSortMode>("pct");
  const query = useQuery({
    queryKey: ["delta", metric, period, mode],
    queryFn: () => fetchJson<Response>(`/api/delta/${metric}?period=${period}&mode=${mode}`),
    refetchInterval: metric === "oi" ? 60_000 : 5 * 60_000
  });

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
            <div className="flex gap-2">
              {DELTA_PERIODS.map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={period === item ? "default" : "secondary"}
                  onClick={() => setPeriod(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              {modes.map((item) => (
                <Button
                  key={item.value}
                  size="sm"
                  variant={mode === item.value ? "default" : "secondary"}
                  onClick={() => setMode(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4 animate-spin" />
            计算排行榜
          </div>
        ) : query.data?.items.length ? (
          <div className="space-y-2">
            {query.data.items.map((item, index) => (
              <div
                key={`${item.protocol}-${item.symbol}`}
                className={cn(
                  "grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 rounded-md border bg-background/40 px-3 py-2",
                  isHot(metric, item, mode) && "border-amber-400/40 bg-amber-400/10"
                )}
              >
                <div className="text-sm text-muted-foreground">{index + 1}</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/tracker?symbol=${encodeURIComponent(item.symbol)}`}
                      className="truncate font-medium hover:text-primary hover:underline"
                    >
                      {item.symbol}
                    </Link>
                    <Badge>{PROTOCOLS[item.protocol].name}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {metric === "oi" ? "当前 OI" : "当前 24h 成交额"} {formatUsd(item.value)}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-emerald-300">
                  <ArrowUpRight className="h-4 w-4" />
                  <span className="font-semibold">
                    {mode === "amount" ? formatDeltaUsd(item.deltaUsd) : formatPct(item.deltaPct)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center text-center text-sm text-muted-foreground">
            {query.data?.message ?? "数据还不够，等待下一轮采集。"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
