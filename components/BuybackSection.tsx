"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Coins, Flame, Wallet } from "lucide-react";
import {
  AfBalanceChart,
  DailyHypeBoughtChart,
  DailyUsdcSpentChart,
  type BuybackBalancePoint,
  type BuybackDailyPoint
} from "@/components/BuybackCharts";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson } from "@/lib/client-fetch";
import { formatCompactNumber, formatUsd } from "@/lib/format";

type BuybackResponse = {
  ok: true;
  generatedAt: number;
  days: number;
  totals: {
    hypeBought: number;
    usdcSpent: number;
    fillCount: number;
    firstFillAt: number | null;
    lastFillAt: number | null;
  };
  window: {
    h24: { hypeBought: number; usdcSpent: number };
    d7: { hypeBought: number; usdcSpent: number };
  };
  balance: {
    ts: number;
    hypeBalance: number;
    entryNotional: number;
  } | null;
  daily: BuybackDailyPoint[];
  balanceSeries: BuybackBalancePoint[];
};

function formatHype(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "待采集";
  return `${formatCompactNumber(value)} HYPE`;
}

export function BuybackSection() {
  const query = useQuery({
    queryKey: ["buyback", "hyperliquid"],
    queryFn: () => fetchJson<BuybackResponse>("/api/buyback/hyperliquid"),
    refetchInterval: 5 * 60_000
  });

  const data = query.data;
  const totals = data?.totals;
  const balance = data?.balance;
  const window24h = data?.window.h24;

  const cumulativeHype = totals?.hypeBought ?? 0;
  const cumulativeUsd = totals?.usdcSpent ?? 0;
  const avgPrice = cumulativeHype > 0 ? cumulativeUsd / cumulativeHype : null;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Hyperliquid 回购 (Assistance Fund)</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          AF 钱包 0xfefe…fefe 持续用协议费用买回 HYPE 并永久留存。统计窗口为最近 30 天，每 15 分钟增量更新。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="累计 HYPE 回购"
          value={formatHype(cumulativeHype || null)}
          caption={
            window24h
              ? `24h ${formatCompactNumber(window24h.hypeBought)} HYPE${
                  avgPrice ? ` · 均价 ${formatUsd(avgPrice)}` : ""
                }`
              : "等待数据采集"
          }
          icon={<Flame className="h-5 w-5" />}
        />
        <StatCard
          title="累计 USDC 花费"
          value={formatUsd(cumulativeUsd || null)}
          caption={window24h ? `24h ${formatUsd(window24h.usdcSpent)}` : "等待数据采集"}
          icon={<Coins className="h-5 w-5" />}
        />
        <StatCard
          title="AF 当前 HYPE 余额"
          value={formatHype(balance?.hypeBalance)}
          caption={
            balance
              ? `成本基础 ${formatUsd(balance.entryNotional)} · 更新 ${new Date(
                  balance.ts
                ).toLocaleString("zh-CN")}`
              : "等待数据采集"
          }
          icon={<Wallet className="h-5 w-5" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>每日 HYPE 买回量</CardTitle>
            <CardDescription>近 30 天 AF 在 HYPE/USDC 现货的成交规模</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartGuard query={query} hasData={(data?.daily?.length ?? 0) > 0}>
              <DailyHypeBoughtChart data={data?.daily ?? []} />
            </ChartGuard>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>每日 USDC 花费</CardTitle>
            <CardDescription>每日买回成本，反映回购预算节奏</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartGuard query={query} hasData={(data?.daily?.length ?? 0) > 0}>
              <DailyUsdcSpentChart data={data?.daily ?? []} />
            </ChartGuard>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>AF 余额累计曲线</CardTitle>
            <CardDescription>EOD 抓取的 AF 钱包 HYPE 余额，体现长期累积</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartGuard query={query} hasData={(data?.balanceSeries?.length ?? 0) > 1}>
              <AfBalanceChart data={data?.balanceSeries ?? []} />
            </ChartGuard>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function ChartGuard({
  query,
  hasData,
  children
}: {
  query: { isLoading: boolean; isError: boolean; error: unknown };
  hasData: boolean;
  children: React.ReactNode;
}) {
  if (query.isError) {
    return (
      <div className="rounded-md border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
        {(query.error as Error)?.message ?? "加载失败"}
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Activity className="h-4 w-4 animate-spin" />
        加载数据
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="flex h-52 items-center justify-center text-center text-sm text-muted-foreground">
        历史数据不足，等待 cron 采集补全。
      </div>
    );
  }

  return <>{children}</>;
}
