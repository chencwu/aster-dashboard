"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { CoinAlertHistory } from "@/components/CoinAlertHistory";
import { CoinDescription } from "@/components/CoinDescription";
import { HistoryChart } from "@/components/HistoryChart";
import type { HistoryRange } from "@/components/HistoryChart";
import { PriceChart } from "@/components/PriceChart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/client-fetch";
import { PROTOCOLS } from "@/lib/protocols";
import type { Market, ProtocolSlug } from "@/lib/types";

type MarketsResponse = {
  ok: true;
  markets: Market[];
};

type TrackerProtocolSlug = ProtocolSlug | "binance";

const TRACKER_PROTOCOLS: Array<{ slug: TrackerProtocolSlug; name: string }> = [
  { slug: "binance", name: "BN" },
  { slug: "aster", name: PROTOCOLS.aster.name },
  { slug: "hyperliquid", name: PROTOCOLS.hyperliquid.name }
];

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
  const [historyRange, setHistoryRange] = useState<HistoryRange>("7d");

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

  const activeSymbol = urlSymbol || "BTC";

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">OI / Volume 增长追踪</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            输入币种后会同时展示 BN、Aster 与 Hyperliquid 上的 OI / Volume 历史；BN 的 OI 直接读取 5m 历史，Aster 与 Hyperliquid 的 OI 来自本地快照。
          </p>
        </div>
        <TrackerSymbolSearch symbols={symbols} urlSymbol={urlSymbol} />
      </section>

      <CoinDescription symbol={activeSymbol} />

      <section className="grid gap-4 xl:grid-cols-3">
        {TRACKER_PROTOCOLS.map(({ slug, name }) => (
          <HistoryChart
            key={`${slug}-oi`}
            title={`${name} · OI 历史曲线`}
            description={activeSymbol}
            protocol={slug}
            symbol={activeSymbol}
            metric="oi"
            range={historyRange}
            onRangeChange={setHistoryRange}
          />
        ))}
        {TRACKER_PROTOCOLS.map(({ slug, name }) => (
          <HistoryChart
            key={`${slug}-volume`}
            title={`${name} · Volume 历史曲线`}
            description={activeSymbol}
            protocol={slug}
            symbol={activeSymbol}
            metric="volume"
            range={historyRange}
            onRangeChange={setHistoryRange}
          />
        ))}
      </section>

      <section>
        <PriceChart symbol={activeSymbol} />
      </section>

      <section>
        <CoinAlertHistory symbol={activeSymbol} />
      </section>
    </div>
  );
}

function TrackerSymbolSearch({
  symbols,
  urlSymbol
}: {
  symbols: string[];
  urlSymbol: string;
}) {
  const router = useRouter();
  const [symbolInput, setSymbolInput] = useState(urlSymbol);

  useEffect(() => {
    setSymbolInput(urlSymbol);
  }, [urlSymbol]);

  function submitSymbol(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSymbol = symbolInput.trim().toUpperCase() || "BTC";
    setSymbolInput(nextSymbol);
    router.replace(`/tracker?symbol=${encodeURIComponent(nextSymbol)}`);
  }

  return (
    <form className="flex w-full gap-2 sm:w-[360px]" onSubmit={submitSymbol}>
      <Input
        list="tracker-symbols"
        value={symbolInput}
        onChange={(event) => setSymbolInput(event.target.value.trim().toUpperCase())}
        placeholder="BTC"
      />
      <Button type="submit" variant="secondary" className="gap-2">
        跳转
        <ArrowRight className="h-4 w-4" />
      </Button>
      <datalist id="tracker-symbols">
        {symbols.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
    </form>
  );
}
