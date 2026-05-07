import {
  getDashboardStatsFromMarkets,
  getMarkets,
  getMarketsQuality,
  getOiDeltaLeaderboardFromMarkets,
  getProtocolsFromMarkets,
  getVolumeDeltaLeaderboardFromMarkets
} from "@/lib/data";
import { attachOiDeltas } from "@/lib/db/oi-history";
import { setPrecomputedPayloads, type PrecomputedKey } from "@/lib/db/precomputed";
import type { DeltaPeriod, Market, ProtocolSlug } from "@/lib/types";

type RefreshInput = {
  asterMarkets?: Market[];
  hyperliquidMarkets?: Market[];
};

const periods: DeltaPeriod[] = ["1h", "24h", "7d"];

function isDisplayableMarket(protocol: ProtocolSlug, market: Market) {
  if (protocol !== "aster") return true;

  return market.oi > 0 && market.oiBase > 0 && market.markPrice > 0;
}

function keyForDelta(metric: "oi" | "volume", period: DeltaPeriod): PrecomputedKey {
  return `delta:${metric}:${period}` as PrecomputedKey;
}

export async function refreshPrecomputedPayloads(input: RefreshInput = {}) {
  const generatedAt = Date.now();
  const [rawAster, rawHyperliquid] = await Promise.all([
    input.asterMarkets ?? getMarkets("aster"),
    input.hyperliquidMarkets ?? getMarkets("hyperliquid")
  ]);
  const displayAster = rawAster.filter((market) => isDisplayableMarket("aster", market));
  const displayHyperliquid = rawHyperliquid.filter((market) =>
    isDisplayableMarket("hyperliquid", market)
  );
  const allWithDeltas = await attachOiDeltas([...displayAster, ...displayHyperliquid]);
  const aster = allWithDeltas.filter((market) => market.protocol === "aster");
  const hyperliquid = allWithDeltas.filter((market) => market.protocol === "hyperliquid");
  const allMarkets = [...aster, ...hyperliquid];
  const protocols = await getProtocolsFromMarkets({ aster, hyperliquid });

  const payloads = [
    {
      key: "stats" as const,
      payload: {
        ok: true,
        generatedAt,
        ...getDashboardStatsFromMarkets(allMarkets)
      }
    },
    {
      key: "protocols" as const,
      payload: {
        ok: true,
        generatedAt,
        protocols
      }
    },
    {
      key: "markets:aster" as const,
      payload: {
        ok: true,
        generatedAt,
        protocol: "aster",
        markets: aster,
        quality: getMarketsQuality(aster)
      }
    },
    {
      key: "markets:hyperliquid" as const,
      payload: {
        ok: true,
        generatedAt,
        protocol: "hyperliquid",
        markets: hyperliquid,
        quality: getMarketsQuality(hyperliquid)
      }
    },
    ...periods.flatMap((period) => {
      const oiItems = getOiDeltaLeaderboardFromMarkets(allMarkets, period);
      const volumeItems = getVolumeDeltaLeaderboardFromMarkets(allMarkets, period);

      return [
        {
          key: keyForDelta("oi", period),
          payload: {
            ok: true,
            generatedAt,
            metric: "oi",
            period,
            status: oiItems.length ? "ready" : "insufficient_history",
            items: oiItems
          }
        },
        {
          key: keyForDelta("volume", period),
          payload: {
            ok: true,
            generatedAt,
            metric: "volume",
            period,
            status: volumeItems.length ? "ready" : "insufficient_history",
            items: volumeItems
          }
        }
      ];
    })
  ];

  const written = await setPrecomputedPayloads(payloads);

  return {
    generatedAt,
    written,
    symbols: {
      aster: aster.length,
      hyperliquid: hyperliquid.length
    }
  };
}
