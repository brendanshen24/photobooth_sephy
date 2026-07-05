import { hasBlobCredentials, uploadPublicBlob } from "@/lib/blobClient";
import { saveLocalStrip } from "@/lib/localShareStore";
import { NextResponse } from "next/server";

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const match = /^data:(image\/[\w+.-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;

  const contentType = match[1]!.toLowerCase();
  const buffer = Buffer.from(match[2]!, "base64");
  return { buffer, contentType };
}

export async function POST(request: Request) {
  let body: { image?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = typeof body.image === "string" ? dataUrlToBuffer(body.image) : null;
  if (!parsed) {
    return NextResponse.json({ error: "Expected data:image URL" }, { status: 400 });
  }

  const ext =
    parsed.contentType.includes("png")
      ? "png"
      : parsed.contentType.includes("webp")
        ? "webp"
        : "jpg";

  const origin = new URL(request.url).origin;

  if (hasBlobCredentials()) {
    const pathname = `strips/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    try {
      const blob = await uploadPublicBlob(pathname, parsed.buffer, {
        contentType: parsed.contentType,
      });
      return NextResponse.json({ url: blob.url });
    } catch (err) {
      console.error("Blob upload failed:", err);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
  }

  try {
    const name = await saveLocalStrip(parsed.buffer, ext);
    const url = `${origin}/api/share/file/${name}`;
    return NextResponse.json({ url, local: true });
  } catch (err) {
    console.error("Local share save failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
