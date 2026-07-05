import QRCode from "qrcode";

const BLOB_HOST = ".public.blob.vercel-storage.com";

function isPrivateLanHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

export function isAllowedShareUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && parsed.hostname.endsWith(BLOB_HOST)) {
      return true;
    }
    if (
      parsed.pathname.startsWith("/api/share/file/") &&
      isPrivateLanHost(parsed.hostname)
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function uploadStripShare(imageDataUrl: string): Promise<string> {
  const res = await fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Share upload failed");
  }
  const { url } = (await res.json()) as { url: string };
  return url;
}

/** Booth save page — nicer on mobile than opening the raw image URL. */
export function buildShareViewUrl(origin: string, imageUrl: string): string {
  return `${origin}/view?u=${encodeURIComponent(imageUrl)}`;
}

export async function createStripShareQr(
  imageDataUrl: string,
  origin: string
): Promise<string> {
  const imageUrl = await uploadStripShare(imageDataUrl);
  const viewUrl = buildShareViewUrl(origin, imageUrl);
  return QRCode.toDataURL(viewUrl, {
    margin: 1,
    width: 112,
    errorCorrectionLevel: "M",
  });
}
