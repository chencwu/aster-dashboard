"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { MarketsTable } from "@/components/MarketsTable";
import { OiPieChart } from "@/components/OiPieChart";
import { VolumePieChart } from "@/components/VolumePieChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson } from "@/lib/client-fetch";
import { PROTOCOLS } from "@/lib/protocols";
import type { Market, MarketsQuality, ProtocolSlug } from "@/lib/types";

type MarketsResponse = {
  ok: true;
  generatedAt: number;
  protocol: ProtocolSlug;
  markets: Market[];
  quality: MarketsQuality;
};

export default function MarketsPage() {
  const [protocol, setProtocol] = useState<ProtocolSlug>("aster");
  const query = useQuery({
    queryKey: ["markets", protocol],
    queryFn: () => fetchJson<MarketsResponse>(`/api/markets/${protocol}`),
    refetchInterval: 60_000
  });
  const markets = query.data?.markets ?? [];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">单币种细分</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            按平台查看所有合约币种的价格、OI、Funding 和 24h 成交额；OI Δ 依赖本地快照。
          </p>
        </div>
        <div className="flex rounded-md border bg-card p-1">
          {(["aster", "hyperliquid"] as ProtocolSlug[]).map((slug) => (
            <Button
              key={slug}
              size="sm"
              variant={protocol === slug ? "default" : "ghost"}
              onClick={() => setProtocol(slug)}
            >
              {PROTOCOLS[slug].name}
            </Button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{PROTOCOLS[protocol].name} OI 占比</CardTitle>
            <CardDescription>前 15 名独立显示，其余合并为 Others</CardDescription>
          </CardHeader>
          <CardContent>{markets.length ? <OiPieChart items={markets} /> : <LoadingPanel />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{PROTOCOLS[protocol].name} Volume 占比</CardTitle>
            <CardDescription>按 24h 成交额计算币种份额</CardDescription>
          </CardHeader>
          <CardContent>{markets.length ? <VolumePieChart items={markets} /> : <LoadingPanel />}</CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>币种排行表</CardTitle>
          <CardDescription>
            列头可排序，OI 24h Δ 大幅变化会高亮整行。
            {query.data?.quality
              ? ` Delta 24h 覆盖 ${query.data.quality.oiDeltaCoverage["24h"]}/${query.data.quality.marketCount}，快照容忍 ${query.data.quality.maxSnapshotStalenessHours["24h"]}h。`
              : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {query.isError ? (
            <div className="rounded-md border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
              {(query.error as Error).message}
            </div>
          ) : markets.length ? (
            <MarketsTable markets={markets} />
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
