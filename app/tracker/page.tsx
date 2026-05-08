"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { HistoryChart } from "@/components/HistoryChart";
import { PriceChart } from "@/components/PriceChart";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/client-fetch";
import { PROTOCOLS } from "@/lib/protocols";
import type { Market, ProtocolSlug } from "@/lib/types";

type MarketsResponse = {
  ok: true;
  markets: Market[];
};

const PROTOCOL_SLUGS: ProtocolSlug[] = ["aster", "hyperliquid"];

export default function TrackerPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">加载追踪页</div>}>
      <TrackerContent />
    </Suspense>
  );
}

function TrackerContent() {
  const searchParams = useSearchParams();
  const urlSymbol = searchParams.get("symbol")?.trim().toUpperCase() || "BTC";
  const [symbol, setSymbol] = useState(urlSymbol);

  useEffect(() => {
    setSymbol(urlSymbol);
  }, [urlSymbol]);

  const asterQuery = useQuery({
    queryKey: ["markets", "aster", "tracker"],
    queryFn: () => fetchJson<MarketsResponse>("/api/markets/aster"),
    refetchInterval: 60_000
  });
  const hlQuery = useQuery({
    queryKey: ["markets", "hyperliquid", "tracker"],
    queryFn: () => fetchJson<MarketsResponse>("/api/markets/hyperliquid"),
    refetchInterval: 60_000
  });

  const symbols = useMemo(() => {
    const merged = new Set<string>();
    for (const market of asterQuery.data?.markets ?? []) merged.add(market.symbol);
    for (const market of hlQuery.data?.markets ?? []) merged.add(market.symbol);
    return Array.from(merged).sort().slice(0, 500);
  }, [asterQuery.data?.markets, hlQuery.data?.markets]);

  const activeSymbol = symbol || "BTC";

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">OI / Volume 增长追踪</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            输入币种后会同时展示 Aster 与 Hyperliquid 上的 OI / Volume 历史；没有 Postgres 时 OI 区域会显示采集状态，币种在某平台未上线时该卡显示数据不足。
          </p>
        </div>
        <div className="w-full sm:w-64">
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
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {PROTOCOL_SLUGS.map((slug) => (
          <HistoryChart
            key={`${slug}-oi`}
            title={`${PROTOCOLS[slug].name} · OI 历史曲线`}
            description={activeSymbol}
            protocol={slug}
            symbol={activeSymbol}
            metric="oi"
          />
        ))}
        {PROTOCOL_SLUGS.map((slug) => (
          <HistoryChart
            key={`${slug}-volume`}
            title={`${PROTOCOLS[slug].name} · Volume 历史曲线`}
            description={activeSymbol}
            protocol={slug}
            symbol={activeSymbol}
            metric="volume"
          />
        ))}
      </section>

      <section>
        <PriceChart symbol={activeSymbol} />
      </section>
    </div>
  );
}
