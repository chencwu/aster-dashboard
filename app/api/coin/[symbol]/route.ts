import { NextResponse } from "next/server";
import { fetchCoinProfile } from "@/lib/sources/coin-profile";
import { normalizeTrackerSymbol } from "@/lib/symbols";
import type { CoinProfile } from "@/lib/sources/coin-profile";

export const dynamic = "force-dynamic";

type Params = {
  params: {
    symbol: string;
  };
};

export async function GET(_request: Request, { params }: Params) {
  const symbol = normalizeTrackerSymbol(decodeURIComponent(params.symbol));

  if (!symbol) {
    return NextResponse.json(
      { ok: false, error: "Symbol is required" },
      { status: 400 }
    );
  }

  try {
    const profile = await fetchCoinProfile(symbol);

    return NextResponse.json({
      ok: true,
      generatedAt: Date.now(),
      symbol,
      profile: profile satisfies CoinProfile | null
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load coin profile"
      },
      { status: 500 }
    );
  }
}
