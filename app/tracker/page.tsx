"use client";

import { Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { DeltaLeaderboard } from "@/components/DeltaLeaderboard";
import { HistoryChart } from "@/components/HistoryChart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/client-fetch";
import { PROTOCOLS } from "@/lib/protocols";
import type { Market, ProtocolSlug } from "@/lib/types";

type MarketsResponse = {
  ok: true;
  markets: Market[];
};

export default function TrackerPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">加载追踪页</div>}>
      <TrackerContent />
    </Suspense>
  );
}

function TrackerContent() {
  const searchParams = useSearchParams();
  const initialProtocol = searchParams.get("protocol") === "hyperliquid" ? "hyperliquid" : "aster";
  const initialSymbol = searchParams.get("symbol")?.trim().toUpperCase() || "BTC";
  const [protocol, setProtocol] = useState<ProtocolSlug>(initialProtocol);
  const [symbol, setSymbol] = useState(initialSymbol);
  const marketsQuery = useQuery({
    queryKey: ["markets", protocol, "tracker"],
    queryFn: () => fetchJson<MarketsResponse>(`/api/markets/${protocol}`),
    refetchInterval: 60_000
  });

  const symbols = useMemo(
    () => (marketsQuery.data?.markets ?? []).map((market) => market.symbol).slice(0, 250),
    [marketsQuery.data?.markets]
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">OI / Volume 增长追踪</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            用 OI 快照识别堆仓，用 K 线成交额识别突然爆量；没有 Postgres 时 OI 区域会显示采集状态。
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[auto_16rem]">
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
          <div>
            <Input
              list="tracker-symbols"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.trim().toUpperCase())}
              placeholder="BTC"
            />
            <datalist id="tracker-symbols">
              {symbols.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <DeltaLeaderboard
          metric="oi"
          title="OI Δ 排行榜"
          description="按 1h / 24h / 7d OI 增长率寻找正在被堆仓的币种"
        />
        <DeltaLeaderboard
          metric="volume"
          title="Volume Δ 排行榜"
          description="按 K 线成交额增长率寻找突然爆量的币种"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <HistoryChart title="OI 历史曲线" protocol={protocol} symbol={symbol || "BTC"} metric="oi" />
        <HistoryChart title="Volume 历史曲线" protocol={protocol} symbol={symbol || "BTC"} metric="volume" />
      </section>
    </div>
  );
}
