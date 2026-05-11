import { NextRequest, NextResponse } from "next/server";
import {
  getCollectionSummary,
  getOiHistory,
  isPostgresConfigured
} from "@/lib/db/oi-history";
import { isProtocolSlug } from "@/lib/protocols";
import { BinanceSymbolNotFoundError, fetchBinanceOiHistory } from "@/lib/sources/binance";
import { toProtocolLookupSymbol } from "@/lib/symbols";

export const dynamic = "force-dynamic";

type Params = {
  params: {
    protocol: string;
    symbol: string;
  };
};

function parseHours(value: string | null) {
  if (value === "1h") return 1;
  if (value === "12h") return 12;
  if (value === "1d") return 24;
  if (value === "3d") return 24 * 3;
  return 24 * 7;
}

export async function GET(request: NextRequest, { params }: Params) {
  const symbol = decodeURIComponent(params.symbol);
  const hours = parseHours(request.nextUrl.searchParams.get("range"));

  if (params.protocol === "binance") {
    try {
      const points = await fetchBinanceOiHistory(symbol, hours);
      const hasEnoughPoints = points.length > 1;

      return NextResponse.json({
        ok: true,
        generatedAt: Date.now(),
        protocol: "binance",
        symbol,
        metric: "oi",
        points,
        status: hasEnoughPoints ? "ready" : "insufficient_history",
        message: hasEnoughPoints
          ? null
          : "Binance 当前时间档内还没有 OI 快照，可能是该币种未上线 USDT 永续。"
      });
    } catch (error) {
      if (error instanceof BinanceSymbolNotFoundError) {
        return NextResponse.json({
          ok: true,
          generatedAt: Date.now(),
          protocol: "binance",
          symbol,
          metric: "oi",
          points: [],
          status: "not_listed",
          message: "Binance 未找到该币种的 USDT 永续 OI 数据。"
        });
      }

      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Failed to load Binance OI history" },
        { status: 500 }
      );
    }
  }

  if (!isProtocolSlug(params.protocol)) {
    return NextResponse.json({ ok: false, error: "Unknown protocol" }, { status: 404 });
  }

  if (!isPostgresConfigured()) {
    return NextResponse.json({
      ok: true,
      generatedAt: Date.now(),
      protocol: params.protocol,
      symbol,
      metric: "oi",
      points: [],
      status: "not_configured",
      collectedHours: 0,
      message: "Postgres 未配置，OI 历史将在配置 POSTGRES_URL 后开始采集。"
    });
  }

  try {
    const lookupSymbol = toProtocolLookupSymbol(params.protocol, symbol);
    const [points, collectionSummary] = await Promise.all([
      getOiHistory(params.protocol, lookupSymbol, hours),
      getCollectionSummary(params.protocol, lookupSymbol)
    ]);
    const hasEnoughPoints = points.length > 1;

    return NextResponse.json({
      ok: true,
      generatedAt: Date.now(),
      protocol: params.protocol,
      symbol,
      metric: "oi",
      points,
      status: hasEnoughPoints ? "ready" : "insufficient_history",
      collectedHours: collectionSummary.collectedHours,
      pointCount: collectionSummary.pointCount,
      firstTs: collectionSummary.firstTs,
      lastTs: collectionSummary.lastTs,
      message:
        hasEnoughPoints
          ? null
          : collectionSummary.pointCount
            ? `OI 历史正在累积，当前已有 ${collectionSummary.pointCount} 个采样点，约 ${collectionSummary.collectedHours.toFixed(1)} 小时。`
            : "当前时间档内还没有 OI 快照。"
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load OI history" },
      { status: 500 }
    );
  }
}
