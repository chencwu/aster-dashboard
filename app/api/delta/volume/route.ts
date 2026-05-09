import { NextRequest, NextResponse } from "next/server";
import { getVolumeDeltaLeaderboard } from "@/lib/data";
import { getPrecomputedPayload, type PrecomputedKey } from "@/lib/db/precomputed";
import { isDeltaPeriod, type ApiOk, type DeltaLeaderboardItem, type DeltaPeriod, type DeltaSortMode } from "@/lib/types";

export const dynamic = "force-dynamic";

function parsePeriod(value: string | null): DeltaPeriod {
  if (isDeltaPeriod(value)) return value;
  return "24h";
}

function parseMode(value: string | null): DeltaSortMode {
  return value === "amount" ? "amount" : "pct";
}

export async function GET(request: NextRequest) {
  const period = parsePeriod(request.nextUrl.searchParams.get("period"));
  const mode = parseMode(request.nextUrl.searchParams.get("mode"));

  try {
    const precomputed = await getPrecomputedPayload<
      ApiOk<{
        metric: "volume";
        period: DeltaPeriod;
        mode: DeltaSortMode;
        status: "ready" | "insufficient_history";
        items: DeltaLeaderboardItem[];
      }>
    >(`delta:volume:${period}:${mode}` as PrecomputedKey);

    if (precomputed) {
      return NextResponse.json(precomputed);
    }

    const items = await getVolumeDeltaLeaderboard(period, mode);
    return NextResponse.json({
      ok: true,
      generatedAt: Date.now(),
      metric: "volume",
      period,
      mode,
      status: items.length ? "ready" : "insufficient_history",
      items
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load volume deltas"
      },
      { status: 500 }
    );
  }
}
