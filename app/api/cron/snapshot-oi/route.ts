import { NextRequest, NextResponse } from "next/server";
import { getMarkets } from "@/lib/data";
import {
  insertFiveMinuteAlertEvents,
  insertOiSnapshots,
  isPostgresConfigured
} from "@/lib/db/oi-history";
import { refreshPrecomputedPayloads } from "@/lib/precompute";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!isPostgresConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "POSTGRES_URL is not configured"
      },
      { status: 503 }
    );
  }

  try {
    const [asterMarkets, hyperliquidMarkets] = await Promise.all([
      getMarkets("aster", { includeInvalidForSnapshot: true }),
      getMarkets("hyperliquid")
    ]);

    const [asterInserted, hyperliquidInserted] = await Promise.all([
      insertOiSnapshots("aster", asterMarkets),
      insertOiSnapshots("hyperliquid", hyperliquidMarkets)
    ]);
    const [alerts, precomputed] = await Promise.all([
      insertFiveMinuteAlertEvents(),
      refreshPrecomputedPayloads({
        asterMarkets,
        hyperliquidMarkets
      })
    ]);

    return NextResponse.json({
      ok: true,
      generatedAt: Date.now(),
      inserted: {
        aster: asterInserted,
        hyperliquid: hyperliquidInserted
      },
      symbols: {
        aster: asterMarkets.length,
        hyperliquid: hyperliquidMarkets.length
      },
      alerts,
      precomputed
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Snapshot failed" },
      { status: 500 }
    );
  }
}
