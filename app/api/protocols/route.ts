import { NextResponse } from "next/server";
import { getProtocols } from "@/lib/data";
import { getPrecomputedPayload } from "@/lib/db/precomputed";
import type { ApiOk, Protocol } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const precomputed = await getPrecomputedPayload<ApiOk<{ protocols: Protocol[] }>>("protocols");
    if (precomputed) {
      return NextResponse.json(precomputed);
    }

    const protocols = await getProtocols();
    return NextResponse.json({ ok: true, generatedAt: Date.now(), protocols });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load protocols"
      },
      { status: 500 }
    );
  }
}
