"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { fetchJson } from "@/lib/client-fetch";
import { formatUsd } from "@/lib/format";

type CoinProfile = {
  id: string;
  symbol: string;
  name: string;
  description: string;
  imageUrl: string | null;
  homepage: string | null;
  marketCapRank: number | null;
  marketCap: number | null;
  fdv: number | null;
  totalSupply: number | null;
  categories: string[];
  source: "coingecko";
};

type CoinProfileResponse = {
  ok: true;
  profile: CoinProfile | null;
};

type Props = {
  symbol: string;
};

function profileUrl(symbol: string) {
  return `/api/coin/${encodeURIComponent(symbol)}`;
}

function ProfileMetric({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="rounded-md border bg-background/50 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold">{formatUsd(value)}</div>
    </div>
  );
}

function SupplyMetric({ value }: { value: number | null | undefined }) {
  return (
    <div className="rounded-md border bg-background/50 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
        Total Supply
      </div>
      <div className="mt-1 text-sm font-semibold">
        {value == null || !Number.isFinite(value)
          ? "待采集"
          : new Intl.NumberFormat("en-US", {
              notation: "compact",
              maximumFractionDigits: 2
            }).format(value)}
      </div>
    </div>
  );
}

export function CoinDescription({ symbol }: Props) {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const query = useQuery({
    queryKey: ["coin-profile", normalizedSymbol],
    queryFn: () => fetchJson<CoinProfileResponse>(profileUrl(normalizedSymbol)),
    enabled: Boolean(normalizedSymbol),
    staleTime: 5 * 60_000,
    refetchInterval: (query) => (query.state.data?.profile ? false : 5 * 60_000),
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000)
  });

  const profile = query.data?.profile;

  if (!normalizedSymbol) {
    return null;
  }

  const fallbackDescription = query.isError
    ? "币种资料暂时加载失败，稍后会自动重试。"
    : query.isLoading || query.isFetching
      ? "加载币种简介..."
      : "CoinGecko 暂无可用币种简介，稍后会自动重试。";

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-sm font-semibold text-muted-foreground">
            {profile?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : query.isLoading || query.isError ? (
              <Info className="h-5 w-5" />
            ) : (
              normalizedSymbol.slice(0, 3)
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-semibold">
                {profile ? `${profile.name} (${profile.symbol})` : `${normalizedSymbol} 简介`}
              </div>
              {profile?.marketCapRank ? <Badge>Rank #{profile.marketCapRank}</Badge> : null}
              <Badge>CoinGecko</Badge>
            </div>
            <p className="max-w-5xl text-sm leading-6 text-muted-foreground">
              {profile?.description ?? fallbackDescription}
            </p>
            {profile ? (
              <div className="grid max-w-2xl grid-cols-1 gap-2 pt-2 sm:grid-cols-3">
                <ProfileMetric label="Market Cap" value={profile.marketCap} />
                <ProfileMetric label="FDV" value={profile.fdv} />
                <SupplyMetric value={profile.totalSupply} />
              </div>
            ) : null}
            {profile?.categories.length ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {profile.categories.map((category) => (
                  <Badge key={category}>{category}</Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {profile?.homepage ? (
          <a
            href={profile.homepage}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            官网
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}
