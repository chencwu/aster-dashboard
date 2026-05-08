"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatCompactNumber, formatNumber, formatUsd } from "@/lib/format";

export type BuybackDailyPoint = {
  date: string;
  hypeBought: number;
  usdcSpent: number;
};

export type BuybackBalancePoint = {
  ts: number;
  hypeBalance: number;
};

const tooltipStyle = {
  background: "#111820",
  border: "1px solid #26323d",
  borderRadius: 8,
  color: "#eaf2f8"
};

const tooltipLabelStyle = { color: "#eaf2f8" };
const tooltipItemStyle = { color: "#eaf2f8" };

function formatDateLabel(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}

function formatTsLabel(value: number) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(value);
}

export function DailyHypeBoughtChart({ data }: { data: BuybackDailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatDateLabel} tickLine={false} axisLine={false} minTickGap={20} />
        <YAxis tickFormatter={(value) => formatCompactNumber(Number(value))} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          labelFormatter={(value) => formatDateLabel(String(value))}
          formatter={(value) => [`${formatNumber(Number(value))} HYPE`, "买回"]}
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
        />
        <Bar dataKey="hypeBought" fill="#1bdfa0" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DailyUsdcSpentChart({ data }: { data: BuybackDailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatDateLabel} tickLine={false} axisLine={false} minTickGap={20} />
        <YAxis tickFormatter={(value) => formatUsd(Number(value))} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          labelFormatter={(value) => formatDateLabel(String(value))}
          formatter={(value) => [formatUsd(Number(value)), "花费"]}
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
        />
        <Bar dataKey="usdcSpent" fill="#4ab0ff" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AfBalanceChart({ data }: { data: BuybackBalancePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="afBalanceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis dataKey="ts" tickFormatter={formatTsLabel} tickLine={false} axisLine={false} minTickGap={20} />
        <YAxis
          tickFormatter={(value) => formatCompactNumber(Number(value))}
          tickLine={false}
          axisLine={false}
          domain={["auto", "auto"]}
        />
        <Tooltip
          labelFormatter={(value) => formatTsLabel(Number(value))}
          formatter={(value) => [`${formatNumber(Number(value))} HYPE`, "AF 余额"]}
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
        />
        <Area
          type="monotone"
          dataKey="hypeBalance"
          stroke="#f59e0b"
          strokeWidth={2}
          fill="url(#afBalanceFill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
