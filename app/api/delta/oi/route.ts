import { NextRequest, NextResponse } from "next/server";
import { getOiDeltaLeaderboard } from "@/lib/data";
import { isPostgresConfigured } from "@/lib/db/oi-history";
import { getPrecomputedPayload, type PrecomputedKey } from "@/lib/db/precomputed";
import type { ApiOk, DeltaLeaderboardItem, DeltaPeriod, DeltaSortMode } from "@/lib/types";

export const dynamic = "force-dynamic";

function parsePeriod(value: string | null): DeltaPeriod {
  if (value === "1h" || value === "7d") return value;
  return "24h";
}

function parseMode(value: string | null): DeltaSortMode {
  return value === "amount" ? "amount" : "pct";
}

export async function GET(request: NextRequest) {
  const period = parsePeriod(request.nextUrl.searchParams.get("period"));
  const mode = parseMode(request.nextUrl.searchParams.get("mode"));

  if (!isPostgresConfigured()) {
    return NextResponse.json({
      ok: true,
      generatedAt: Date.now(),
      metric: "oi",
      period,
      mode,
      status: "not_configured",
      items: [],
      message: "Postgres 未配置，OI Δ 排行将在快照采集后可用。"
    });
  }

  try {
    const precomputed = await getPrecomputedPayload<
      ApiOk<{
        metric: "oi";
        period: DeltaPeriod;
        mode: DeltaSortMode;
        status: "ready" | "insufficient_history";
        items: DeltaLeaderboardItem[];
      }>
    >(`delta:oi:${period}:${mode}` as PrecomputedKey);

    if (precomputed) {
      return NextResponse.json(precomputed);
    }

    const items = await getOiDeltaLeaderboard(period, mode);
    return NextResponse.json({
      ok: true,
      generatedAt: Date.now(),
      metric: "oi",
      period,
      mode,
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
