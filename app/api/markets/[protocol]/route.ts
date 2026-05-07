import { NextResponse } from "next/server";
import { getMarketsWithOiDeltas } from "@/lib/data";
import { isProtocolSlug } from "@/lib/protocols";

export const dynamic = "force-dynamic";

type Params = {
  params: {
    protocol: string;
  };
};

export async function GET(_request: Request, { params }: Params) {
  if (!isProtocolSlug(params.protocol)) {
    return NextResponse.json({ ok: false, error: "Unknown protocol" }, { status: 404 });
  }

  try {
    const markets = await getMarketsWithOiDeltas(params.protocol);
    return NextResponse.json({
      ok: true,
      generatedAt: Date.now(),
      protocol: params.protocol,
      markets
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load markets" },
      { status: 500 }
    );
  }
}
