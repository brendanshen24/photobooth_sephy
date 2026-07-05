import { NextResponse } from "next/server";

const PRINT_SERVER =
  process.env.PRINT_SERVER_URL?.trim() ||
  `http://127.0.0.1:${process.env.PRINT_SERVER_PORT ?? "3847"}`;

export async function GET() {
  try {
    const res = await fetch(`${PRINT_SERVER}/printers`, { cache: "no-store" });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Print server list printers failed:", err);
    return NextResponse.json({ error: "Print server unavailable" }, { status: 503 });
  }
}
