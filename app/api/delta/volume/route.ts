import { NextRequest, NextResponse } from "next/server";
import { getVolumeDeltaLeaderboard } from "@/lib/data";
import type { DeltaPeriod } from "@/lib/types";

export const dynamic = "force-dynamic";

function parsePeriod(value: string | null): DeltaPeriod {
  if (value === "1h" || value === "7d") return value;
  return "24h";
}

export async function GET(request: NextRequest) {
  const period = parsePeriod(request.nextUrl.searchParams.get("period"));

  try {
    const items = await getVolumeDeltaLeaderboard(period);
    return NextResponse.json({
      ok: true,
      generatedAt: Date.now(),
      metric: "volume",
      period,
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
