import { NextResponse } from "next/server";
import { getDashboardStats } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getDashboardStats();
    return NextResponse.json({ ok: true, generatedAt: Date.now(), ...stats });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load stats" },
      { status: 500 }
    );
  }
}
