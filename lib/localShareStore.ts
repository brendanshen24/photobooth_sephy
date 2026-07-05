import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), ".data", "strips");

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function saveLocalStrip(
  buffer: Buffer,
  ext: string
): Promise<string> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const safeExt = ext.replace(/[^a-z0-9]/gi, "") || "jpg";
  const name = `${Date.now()}-${randomUUID().slice(0, 8)}.${safeExt}`;
  await fs.writeFile(path.join(DATA_DIR, name), buffer);
  return name;
}

export async function readLocalStrip(name: string): Promise<{
  buffer: Buffer;
  contentType: string;
} | null> {
  const safeName = path.basename(name);
  if (!/^[a-zA-Z0-9._-]+$/.test(safeName)) return null;

  const filePath = path.join(DATA_DIR, safeName);
  try {
    const buffer = await fs.readFile(filePath);
    const ext = safeName.split(".").pop()?.toLowerCase() ?? "jpg";
    return { buffer, contentType: MIME[ext] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}
