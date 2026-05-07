import { NextRequest, NextResponse } from "next/server";
import { getOiDeltaLeaderboard } from "@/lib/data";
import { isPostgresConfigured } from "@/lib/db/oi-history";
import type { DeltaPeriod } from "@/lib/types";

export const dynamic = "force-dynamic";

function parsePeriod(value: string | null): DeltaPeriod {
  if (value === "1h" || value === "7d") return value;
  return "24h";
}

export async function GET(request: NextRequest) {
  const period = parsePeriod(request.nextUrl.searchParams.get("period"));

  if (!isPostgresConfigured()) {
    return NextResponse.json({
      ok: true,
      generatedAt: Date.now(),
      metric: "oi",
      period,
      status: "not_configured",
      items: [],
      message: "Postgres 未配置，OI Δ 排行将在快照采集后可用。"
    });
  }

  try {
    const items = await getOiDeltaLeaderboard(period);
    return NextResponse.json({
      ok: true,
      generatedAt: Date.now(),
      metric: "oi",
      period,
      status: items.length ? "ready" : "insufficient_history",
      items
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load OI deltas" },
      { status: 500 }
    );
  }
}
