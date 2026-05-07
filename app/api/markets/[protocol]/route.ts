import { NextResponse } from "next/server";
import { getMarketsQuality, getMarketsWithOiDeltas } from "@/lib/data";
import { getPrecomputedPayload } from "@/lib/db/precomputed";
import { isProtocolSlug } from "@/lib/protocols";
import type { ApiOk, Market, MarketsQuality, ProtocolSlug } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = {
  params: {
    protocol: string;
  };
};

export async function GET(_request: Request, { params }: Params) {
  if (!isProtocolSlug(params.protocol)) {
    return NextResponse.json({ ok: false, error: "Unknown protocol" }, { status: 404 });
  }

  try {
    const precomputedKey =
      params.protocol === "aster" ? "markets:aster" : "markets:hyperliquid";
    const precomputed = await getPrecomputedPayload<
      ApiOk<{
        protocol: ProtocolSlug;
        markets: Market[];
        quality: MarketsQuality;
      }>
    >(precomputedKey);

    if (precomputed) {
      return NextResponse.json(precomputed);
    }

    const markets = await getMarketsWithOiDeltas(params.protocol);
    return NextResponse.json({
      ok: true,
      generatedAt: Date.now(),
      protocol: params.protocol,
      markets,
      quality: getMarketsQuality(markets)
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load markets" },
      { status: 500 }
    );
  }
}
