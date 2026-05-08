import { NextRequest, NextResponse } from "next/server";
import {
  BinanceSymbolNotFoundError,
  fetchBinanceOhlcHistory
} from "@/lib/sources/binance";
import type { HistoryInterval } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = {
  params: {
    symbol: string;
  };
};

function parseInterval(value: string | null): HistoryInterval {
  if (
    value === "1m" ||
    value === "5m" ||
    value === "15m" ||
    value === "30m" ||
    value === "4h" ||
    value === "8h" ||
    value === "1d"
  ) {
    return value;
  }

  return "1h";
}

function parseLimit(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), 720);
}

export async function GET(request: NextRequest, { params }: Params) {
  const interval = parseInterval(request.nextUrl.searchParams.get("interval"));
  const defaultLimit = interval === "1d" ? 30 : 168;
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"), defaultLimit);
  const symbol = decodeURIComponent(params.symbol);

  try {
    const candles = await fetchBinanceOhlcHistory(symbol, interval, limit);

    return NextResponse.json({
      ok: true,
      generatedAt: Date.now(),
      symbol,
      metric: "price",
      period: interval,
      candles
    });
  } catch (error) {
    if (error instanceof BinanceSymbolNotFoundError) {
      return NextResponse.json({
        ok: true,
        generatedAt: Date.now(),
        symbol,
        metric: "price",
        period: interval,
        candles: [],
        message: `${symbol} 在 Binance Futures 未上线`
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load Binance price history"
      },
      { status: 500 }
    );
  }
}
