"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson } from "@/lib/client-fetch";
import { formatUsd } from "@/lib/format";
import type { OhlcPoint } from "@/lib/types";

type Range = "1h" | "12h" | "1d" | "3d" | "7d";

type PriceResponse = {
  ok: true;
  candles: OhlcPoint[];
  message?: string | null;
};

const ranges: Array<{ value: Range; label: string }> = [
  { value: "1h", label: "1H" },
  { value: "12h", label: "12H" },
  { value: "1d", label: "1D" },
  { value: "3d", label: "3D" },
  { value: "7d", label: "7D" }
];

function rangeParams(range: Range) {
  if (range === "1h") return { interval: "5m", limit: 13 };
  if (range === "12h") return { interval: "30m", limit: 25 };
  if (range === "1d") return { interval: "1h", limit: 25 };
  if (range === "3d") return { interval: "4h", limit: 19 };
  return { interval: "4h", limit: 43 };
}

function formatTs(ts: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(ts);
}

const BULL = "#10b981";
const BEAR = "#ef4444";

type CandleRow = OhlcPoint & {
  openClose: [number, number];
  highLow: [number, number];
};

type CandleShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: CandleRow;
};

function CandleShape(props: CandleShapeProps) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload || width <= 0 || height <= 0) return null;

  const { open, close, high, low } = payload;
  const isBull = close >= open;
  const fill = isBull ? BULL : BEAR;

  const priceRange = high - low;
  const pxPerUnit = priceRange > 0 ? height / priceRange : 0;
  const yFor = (price: number) => y + (high - price) * pxPerUnit;

  const wickX = x + width / 2;
  const bodyTop = yFor(Math.max(open, close));
  const bodyBottom = yFor(Math.min(open, close));
  const bodyHeight = Math.max(1, bodyBottom - bodyTop);

  return (
    <g stroke={fill} fill={fill}>
      <line x1={wickX} x2={wickX} y1={y} y2={y + height} strokeWidth={1} />
      <rect x={x} y={bodyTop} width={width} height={bodyHeight} fill={fill} stroke="none" />
    </g>
  );
}

type CandleTooltipProps = {
  active?: boolean;
  label?: number | string;
  payload?: Array<{ payload?: CandleRow }>;
};

function CandleTooltip({ active, label, payload }: CandleTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const isBull = row.close >= row.open;
  return (
    <div className="rounded-md border border-[#26323d] bg-[#111820] px-3 py-2 text-xs text-[#eaf2f8] shadow-md">
      <div className="font-medium">{formatTs(Number(label))}</div>
      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-muted-foreground">开</span>
        <span>{formatUsd(row.open)}</span>
        <span className="text-muted-foreground">高</span>
        <span style={{ color: BULL }}>{formatUsd(row.high)}</span>
        <span className="text-muted-foreground">低</span>
        <span style={{ color: BEAR }}>{formatUsd(row.low)}</span>
        <span className="text-muted-foreground">收</span>
        <span style={{ color: isBull ? BULL : BEAR }}>{formatUsd(row.close)}</span>
      </div>
    </div>
  );
}

export function PriceChart({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<Range>("1d");
  const url = useMemo(() => {
    const params = rangeParams(range);
    return `/api/history/price/${encodeURIComponent(symbol)}?interval=${params.interval}&limit=${params.limit}`;
  }, [range, symbol]);

  const query = useQuery({
    queryKey: ["price", symbol, range],
    queryFn: () => fetchJson<PriceResponse>(url),
    enabled: Boolean(symbol),
    refetchInterval: 60_000
  });

  const rows = useMemo<CandleRow[]>(
    () =>
      (query.data?.candles ?? []).map((candle) => ({
        ...candle,
        openClose: [candle.open, candle.close],
        highLow: [candle.low, candle.high]
      })),
    [query.data?.candles]
  );
  const hasData = rows.length > 1;

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Binance · K 线</CardTitle>
            <CardDescription>{symbol}USDT · Perp OHLC（中立参考价）</CardDescription>
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
          <div className="flex h-80 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4 animate-spin" />
            加载 K 线数据
          </div>
        ) : !hasData ? (
          <div className="flex h-80 items-center justify-center text-center text-sm text-muted-foreground">
            {query.data?.message ?? "K 线数据不足，等待采集或换一个时间档。"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={rows}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="ts"
                tickFormatter={formatTs}
                tickLine={false}
                axisLine={false}
                minTickGap={36}
              />
              <YAxis
                tickFormatter={(value) => formatUsd(Number(value))}
                tickLine={false}
                axisLine={false}
                domain={["auto", "auto"]}
                allowDecimals
              />
              <Tooltip content={<CandleTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar
                dataKey="highLow"
                shape={(props: unknown) => <CandleShape {...(props as CandleShapeProps)} />}
                isAnimationActive={false}
              >
                {rows.map((row, index) => (
                  <Cell key={index} fill={row.close >= row.open ? BULL : BEAR} />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
