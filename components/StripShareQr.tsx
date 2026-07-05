"use client";

import { createStripShareQr } from "@/lib/stripShare";
import { useEffect, useState } from "react";

interface StripShareQrProps {
  imageDataUrl: string;
}

/** Uploads strip to Vercel Blob and shows a QR to the save page. */
export default function StripShareQr({ imageDataUrl }: StripShareQrProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function buildQr() {
      setQrDataUrl(null);
      setError(false);
      try {
        const qr = await createStripShareQr(
          imageDataUrl,
          window.location.origin
        );
        if (!cancelled) setQrDataUrl(qr);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    buildQr();
    return () => {
      cancelled = true;
    };
  }, [imageDataUrl]);

  if (error) {
    return (
      <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded border border-white/15 bg-white/5 p-2 text-center text-[9px] text-white/40">
        Share unavailable
      </div>
    );
  }

  if (!qrDataUrl) {
    return (
      <div className="h-28 w-28 shrink-0 animate-pulse rounded border border-white/15 bg-white/10" />
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <img
        src={qrDataUrl}
        alt="Scan to open photo strip"
        width={112}
        height={112}
        className="rounded border border-white/15 bg-white p-1"
      />
      <p className="max-w-[7rem] text-center text-[9px] leading-tight text-white/40">
        Scan to open on your phone
      </p>
    </div>
  );
}
