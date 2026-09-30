import { NextResponse } from "next/server";

import { badgeSnapshot, startBadgeStation } from "@/lib/badge/station";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Latest badge tap. The reader runs inside this Next.js server. */
export async function GET() {
  try {
    await startBadgeStation();
    const { health, last } = badgeSnapshot();
    return NextResponse.json({ ok: true, health, last });
  } catch (err) {
    console.error("[badge] status failed", err);
    return NextResponse.json({ ok: false, health: null, last: null });
  }
}
