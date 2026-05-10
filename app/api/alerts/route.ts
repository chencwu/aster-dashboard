import { NextRequest, NextResponse } from "next/server";
import { getRecentAlertEvents, isPostgresConfigured } from "@/lib/db/oi-history";
import type { AlertItem, ApiOk } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 100;
  return Math.min(Math.floor(parsed), 500);
}

function parseHours(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 24;
  return Math.min(Math.floor(parsed), 24 * 30);
}

export async function GET(request: NextRequest) {
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const hours = parseHours(request.nextUrl.searchParams.get("hours"));

  if (!isPostgresConfigured()) {
    return NextResponse.json({
      ok: true,
      generatedAt: Date.now(),
      status: "not_configured",
      items: [],
      message: "Postgres 未配置，24h 报警流将在 OI 快照采集后可用。"
    });
  }

  try {
    const items = await getRecentAlertEvents(hours, limit);

    return NextResponse.json<ApiOk<{
      status: "ready" | "quiet";
      hours: number;
      items: AlertItem[];
      message: string | null;
    }>>({
      ok: true,
      generatedAt: Date.now(),
      status: items.length ? "ready" : "quiet",
      hours,
      items,
      message: items.length ? null : `最近 ${hours}h 暂无已落库的报警。`
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load alerts"
      },
      { status: 500 }
    );
  }
}
