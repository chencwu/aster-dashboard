import { NextRequest, NextResponse } from "next/server";
import { fetchVolumeHistory } from "@/lib/data";
import { isProtocolSlug } from "@/lib/protocols";
import type { HistoryInterval, HistoryPoint } from "@/lib/types";

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

function imputeInvalidVolumePoints(points: HistoryPoint[]) {
  let previousValid: HistoryPoint | null = null;

  return points.flatMap((point) => {
    if (Number.isFinite(point.value) && point.value > 0) {
      previousValid = { ...point, isImputed: false, imputedReason: null };
      return [previousValid];
    }

    if (!previousValid) {
      return [];
    }

    return [
      {
        ...point,
        value: previousValid.value,
        isImputed: true,
        imputedReason: "volume_invalid"
      }
    ];
  });
}

export async function GET(request: NextRequest, { params }: Params) {
  if (!isProtocolSlug(params.protocol)) {
    return NextResponse.json({ ok: false, error: "Unknown protocol" }, { status: 404 });
  }

  const interval = parseInterval(request.nextUrl.searchParams.get("interval"));
  const defaultLimit = interval === "1d" ? 30 : 168;
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"), defaultLimit);
  const symbol = decodeURIComponent(params.symbol);

  try {
    const points = imputeInvalidVolumePoints(
      await fetchVolumeHistory(params.protocol, symbol, interval, limit)
    );

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
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load volume history"
      },
      { status: 500 }
    );
  }
}
