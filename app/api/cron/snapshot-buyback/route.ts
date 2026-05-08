import { NextRequest, NextResponse } from "next/server";
import {
  backfillBalanceFromFills,
  ensureBuybackSchema,
  getLatestFillTime,
  insertBalanceSnapshot,
  insertBuybackFills,
  isPostgresConfigured
} from "@/lib/db/buyback";
import {
  fetchAssistanceFundBalance,
  fetchAssistanceFundBuybackFills
} from "@/lib/sources/hyperliquid-buyback";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_BACKFILL_DAYS = 30;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!isPostgresConfigured()) {
    return NextResponse.json(
      { ok: false, error: "POSTGRES_URL is not configured" },
      { status: 503 }
    );
  }

  try {
    await ensureBuybackSchema();

    const latestFillTime = await getLatestFillTime();
    const now = Date.now();
    const startTime =
      latestFillTime != null
        ? latestFillTime + 1
        : now - DEFAULT_BACKFILL_DAYS * 24 * 60 * 60 * 1000;

    const [fills, balance] = await Promise.all([
      fetchAssistanceFundBuybackFills(startTime, now),
      fetchAssistanceFundBalance()
    ]);

    const inserted = await insertBuybackFills(fills);
    await insertBalanceSnapshot(balance);
    const balanceBackfilled = await backfillBalanceFromFills();

    return NextResponse.json({
      ok: true,
      generatedAt: now,
      window: { start: startTime, end: now },
      fillsFetched: fills.length,
      fillsInserted: inserted,
      balanceBackfilled,
      balance
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Buyback snapshot failed" },
      { status: 500 }
    );
  }
}
