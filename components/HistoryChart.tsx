"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson } from "@/lib/client-fetch";
import { formatUsd } from "@/lib/format";
import type { HistoryPoint, ProtocolSlug } from "@/lib/types";

type Range = "1h" | "12h" | "1d" | "3d" | "7d";

type HistoryResponse = {
  ok: true;
  points: HistoryPoint[];
  message?: string | null;
};

type Props = {
  title: string;
  protocol: ProtocolSlug;
  symbol: string;
  metric: "oi" | "volume";
  description?: string;
};

const ranges: Array<{ value: Range; label: string }> = [
  { value: "1h", label: "1H" },
  { value: "12h", label: "12H" },
  { value: "1d", label: "1D" },
  { value: "3d", label: "3D" },
  { value: "7d", label: "7D" }
];

function volumeParams(range: Range) {
  if (range === "1h") return { interval: "5m", limit: 13 };
  if (range === "12h") return { interval: "30m", limit: 25 };
  if (range === "1d") return { interval: "1h", limit: 25 };
  if (range === "3d") return { interval: "4h", limit: 19 };
  return { interval: "4h", limit: 43 };
}

function historyUrl(metric: "oi" | "volume", protocol: ProtocolSlug, symbol: string, range: Range) {
  const encodedSymbol = encodeURIComponent(symbol);

  if (metric === "oi") {
    return `/api/history/oi/${protocol}/${encodedSymbol}?range=${range}`;
  }

  const params = volumeParams(range);
  return `/api/history/volume/${protocol}/${encodedSymbol}?interval=${params.interval}&limit=${params.limit}`;
}

function formatTs(ts: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(ts);
}

function metricStroke(metric: "oi" | "volume") {
  return metric === "oi" ? "#1bdfa0" : "#4ab0ff";
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

export function HistoryChart({ title, protocol, symbol, metric, description }: Props) {
  const [range, setRange] = useState<Range>("7d");
  const url = useMemo(() => historyUrl(metric, protocol, symbol, range), [metric, protocol, range, symbol]);
  const query = useQuery({
    queryKey: ["history", metric, protocol, symbol, range],
    queryFn: () => fetchJson<HistoryResponse>(url),
    enabled: Boolean(symbol),
    refetchInterval: metric === "oi" ? 60_000 : 5 * 60_000
  });

  const points = useMemo(() => query.data?.points ?? [], [query.data?.points]);
  const hasImputedPoints = points.some((point) => point.isImputed);
  const segments = useMemo(() => historySegments(points), [points]);

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>
              {description ?? `${protocol} / ${symbol}`}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {ranges.map((item) => (
              <Button
                key={item.value}
                size="sm"
                variant={range === item.value ? "default" : "secondary"}
                onClick={() => setRange(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="flex h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4 animate-spin" />
            加载历史数据
          </div>
        ) : points.length < 2 ? (
          <div className="flex h-72 items-center justify-center text-center text-sm text-muted-foreground">
            {query.data?.message ?? "历史数据不足，等待采集或换一个时间档。"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={288}>
            <LineChart data={points}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="ts"
                tickFormatter={formatTs}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
              />
              <YAxis tickFormatter={(value) => formatUsd(Number(value))} tickLine={false} axisLine={false} />
              <Tooltip
                labelFormatter={(value) => formatTs(Number(value))}
                formatter={(value, _name, item) => [
                  formatUsd(Number(value)),
                  item.payload?.isImputed
                    ? `${metric.toUpperCase()} (复用上个点)`
                    : metric.toUpperCase()
                ]}
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
                      stroke={segment.isImputed ? "#ff5c7a" : metricStroke(metric)}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))
                : (
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={metricStroke(metric)}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
