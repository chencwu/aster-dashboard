import { NextRequest, NextResponse } from "next/server";
import { fetchVolumeHistory } from "@/lib/data";
import { isProtocolSlug } from "@/lib/protocols";
import { AsterSymbolNotFoundError } from "@/lib/sources/aster";
import { BinanceSymbolNotFoundError, fetchBinanceVolumeHistory } from "@/lib/sources/binance";
import { HyperliquidSymbolNotFoundError } from "@/lib/sources/hyperliquid";
import type { HistoryInterval } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = {
  params: {
    protocol: string;
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

  if (params.protocol === "binance") {
    try {
      const points = await fetchBinanceVolumeHistory(symbol, interval, limit);

      return NextResponse.json({
        ok: true,
        generatedAt: Date.now(),
        protocol: "binance",
        symbol,
        metric: "volume",
        period: interval,
        points,
        message: points.length > 1 ? null : "Binance 未找到该币种的 USDT 永续成交额数据。"
      });
    } catch (error) {
      if (error instanceof BinanceSymbolNotFoundError) {
        return NextResponse.json({
          ok: true,
          generatedAt: Date.now(),
          protocol: "binance",
          symbol,
          metric: "volume",
          period: interval,
          points: [],
          message: "Binance 未找到该币种的 USDT 永续成交额数据。"
        });
      }

      return NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to load Binance volume history"
        },
        { status: 500 }
      );
    }
  }

  if (!isProtocolSlug(params.protocol)) {
    return NextResponse.json({ ok: false, error: "Unknown protocol" }, { status: 404 });
  }

  try {
    const points = await fetchVolumeHistory(params.protocol, symbol, interval, limit);

    return NextResponse.json({
      ok: true,
      generatedAt: Date.now(),
      protocol: params.protocol,
      symbol,
      metric: "volume",
      period: interval,
      points
    });
  } catch (error) {
    if (error instanceof AsterSymbolNotFoundError) {
      return NextResponse.json({
        ok: true,
        generatedAt: Date.now(),
        protocol: params.protocol,
        symbol,
        metric: "volume",
        period: interval,
        points: [],
        message: "Aster 未找到该币种的 USDT 永续成交额数据。"
      });
    }
    if (error instanceof HyperliquidSymbolNotFoundError) {
      return NextResponse.json({
        ok: true,
        generatedAt: Date.now(),
        protocol: params.protocol,
        symbol,
        metric: "volume",
        period: interval,
        points: [],
        message: "Hyperliquid 未找到该币种的永续成交额数据。"
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load volume history"
      },
      { status: 500 }
    );
  }
}
