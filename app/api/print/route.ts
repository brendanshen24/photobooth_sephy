import { NextResponse } from "next/server";

const PRINT_SERVER =
  process.env.PRINT_SERVER_URL?.trim() ||
  `http://127.0.0.1:${process.env.PRINT_SERVER_PORT ?? "3847"}`;

export async function POST(request: Request) {
  let body: string;
  try {
    body = await request.text();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const res = await fetch(`${PRINT_SERVER}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const text = await res.text();

    if (!res.ok) {
      console.error("[api/print] print server error:", text);
    } else {
      try {
        const parsed = JSON.parse(text) as { jobId?: string; warning?: string; queue?: { jobCount?: number } };
        console.log(
          "[api/print] submitted",
          parsed.jobId ?? "job",
          parsed.queue?.jobCount != null ? `(queue: ${parsed.queue.jobCount})` : ""
        );
        if (parsed.warning) console.warn("[api/print]", parsed.warning);
      } catch {
        console.log("[api/print] ok");
      }
    }

    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[api/print] proxy failed:", err);
    return NextResponse.json(
      { error: "Print server unavailable. Run pnpm dev or pnpm print-server." },
      { status: 503 }
    );
  }
}
