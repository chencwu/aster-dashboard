import { NextResponse } from "next/server";
import {
  ensureBuybackSchema,
  getBuybackTotals,
  getDailyBalanceSeries,
  getDailyBuyback,
  getLatestBalanceSnapshot,
  getWindowBuyback,
  isPostgresConfigured
} from "@/lib/db/buyback";

export const dynamic = "force-dynamic";

const DAYS = 30;

export async function GET() {
  try {
    if (!isPostgresConfigured()) {
      return NextResponse.json(
        { ok: false, error: "POSTGRES_URL is not configured" },
        { status: 503 }
      );
    }

    await ensureBuybackSchema();

    const [daily, totals, window24h, window7d, balance, balanceSeries] = await Promise.all([
      getDailyBuyback(DAYS),
      getBuybackTotals(),
      getWindowBuyback(24),
      getWindowBuyback(24 * 7),
      getLatestBalanceSnapshot(),
      getDailyBalanceSeries(DAYS)
    ]);

    return NextResponse.json({
      ok: true,
      generatedAt: Date.now(),
      days: DAYS,
      totals,
      window: {
        h24: window24h,
        d7: window7d
      },
      balance,
      daily,
      balanceSeries
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Buyback query failed" },
      { status: 500 }
    );
  }
}
