import { NextRequest, NextResponse } from "next/server";
import { getRecentAlertEvents, isPostgresConfigured } from "@/lib/db/oi-history";
import { normalizeTrackerSymbol } from "@/lib/symbols";
import type { AlertItem, ApiOk } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseLimit(value: string | null, allowUnlimited: boolean) {
  if (allowUnlimited && value === "all") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 100;
  return Math.min(Math.floor(parsed), 5000);
}

function parseHours(value: string | null, all: boolean) {
  if (all) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 24;
  return Math.min(Math.floor(parsed), 24 * 30);
}

function parseSymbol(value: string | null) {
  const symbol = value ? normalizeTrackerSymbol(value) : "";
  return symbol ? symbol.slice(0, 32) : null;
}

export async function GET(request: NextRequest) {
  const all = request.nextUrl.searchParams.get("all") === "1";
  const hours = parseHours(request.nextUrl.searchParams.get("hours"), all);
  const symbol = parseSymbol(request.nextUrl.searchParams.get("symbol"));
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"), all && Boolean(symbol));

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
    const items = await getRecentAlertEvents(hours, limit, symbol);

    return NextResponse.json<ApiOk<{
      status: "ready" | "quiet";
      hours: number | null;
      symbol: string | null;
      items: AlertItem[];
      message: string | null;
    }>>({
      ok: true,
      generatedAt: Date.now(),
      status: items.length ? "ready" : "quiet",
      hours,
      symbol,
      items,
      message: items.length
        ? null
        : symbol
          ? hours == null
            ? `${symbol} 暂无已落库的报警。`
            : `最近 ${hours}h 暂无 ${symbol} 已落库的报警。`
          : hours == null
            ? "暂无已落库的报警。"
            : `最近 ${hours}h 暂无已落库的报警。`
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
