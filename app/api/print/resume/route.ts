import { NextResponse } from "next/server";

const PRINT_SERVER =
  process.env.PRINT_SERVER_URL?.trim() ||
  `http://127.0.0.1:${process.env.PRINT_SERVER_PORT ?? "3847"}`;

export async function POST(request: Request) {
  let body: { printer?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* optional body */
  }

  try {
    const res = await fetch(`${PRINT_SERVER}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[api/print/resume] failed:", err);
    return NextResponse.json({ error: "Print server unavailable" }, { status: 503 });
  }
}
