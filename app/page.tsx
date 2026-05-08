"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Database, Layers } from "lucide-react";
import { BuybackSection } from "@/components/BuybackSection";
import { OiBarChart } from "@/components/OiBarChart";
import { OiPieChart } from "@/components/OiPieChart";
import { ProtocolTable } from "@/components/ProtocolTable";
import { StatCard } from "@/components/StatCard";
import { VolumeBarChart } from "@/components/VolumeBarChart";
import { VolumePieChart } from "@/components/VolumePieChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson } from "@/lib/client-fetch";
import { formatUsd } from "@/lib/format";
import type { DashboardStats, Protocol } from "@/lib/types";

type StatsResponse = DashboardStats & {
  ok: true;
  generatedAt: number;
};

type ProtocolsResponse = {
  ok: true;
  generatedAt: number;
  protocols: Protocol[];
};

export default function DashboardPage() {
  const statsQuery = useQuery({
    queryKey: ["stats"],
    queryFn: () => fetchJson<StatsResponse>("/api/stats"),
    refetchInterval: 60_000
  });
  const protocolsQuery = useQuery({
    queryKey: ["protocols"],
    queryFn: () => fetchJson<ProtocolsResponse>("/api/protocols"),
    refetchInterval: 60_000
  });

  const protocols = protocolsQuery.data?.protocols ?? [];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Perp DEX OI / Volume 总览</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          聚合 Aster 与 Hyperliquid 的实时持仓量、24h 成交额和平台份额，OI 历史由本地 Cron 持续累积。
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Total OI"
          value={formatUsd(statsQuery.data?.totalOi)}
          caption="两平台未平仓合约总价值"
          icon={<Database className="h-5 w-5" />}
        />
        <StatCard
          title="Total Volume (24h)"
          value={formatUsd(statsQuery.data?.totalVolume24h)}
          caption="两平台 24h 总成交额"
          icon={<Activity className="h-5 w-5" />}
        />
        <StatCard
          title="Protocols"
          value={String(statsQuery.data?.protocolCount ?? 2)}
          caption="固定追踪 Aster 与 Hyperliquid"
          icon={<Layers className="h-5 w-5" />}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>OI 平台对比</CardTitle>
            <CardDescription>Aster vs Hyperliquid 当前 OI</CardDescription>
          </CardHeader>
          <CardContent>{protocols.length ? <OiBarChart protocols={protocols} /> : <LoadingPanel />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Volume 平台对比</CardTitle>
            <CardDescription>Aster vs Hyperliquid 24h 成交额</CardDescription>
          </CardHeader>
          <CardContent>{protocols.length ? <VolumeBarChart protocols={protocols} /> : <LoadingPanel />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>OI 占比</CardTitle>
            <CardDescription>两家平台当前 OI 份额</CardDescription>
          </CardHeader>
          <CardContent>{protocols.length ? <OiPieChart items={protocols} /> : <LoadingPanel />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Volume 占比</CardTitle>
            <CardDescription>两家平台 24h 成交额份额</CardDescription>
          </CardHeader>
          <CardContent>{protocols.length ? <VolumePieChart items={protocols} /> : <LoadingPanel />}</CardContent>
        </Card>
      </section>

      <BuybackSection />

      <Card>
        <CardHeader>
          <CardTitle>平台明细</CardTitle>
          <CardDescription>7D OI 与平台 Volume 走势需要 Cron 快照逐步补全。</CardDescription>
        </CardHeader>
        <CardContent>
          {protocolsQuery.isError ? (
            <ErrorPanel message={(protocolsQuery.error as Error).message} />
          ) : protocols.length ? (
            <ProtocolTable protocols={protocols} />
          ) : (
            <LoadingPanel />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="flex h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
      <Activity className="h-4 w-4 animate-spin" />
      加载数据
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return <div className="rounded-md border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">{message}</div>;
}
