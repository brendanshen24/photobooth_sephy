"use client";

import { isAllowedShareUrl } from "@/lib/stripShare";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";

function ViewStripContent() {
  const searchParams = useSearchParams();
  const src = useMemo(() => {
    const u = searchParams.get("u");
    if (!u || !isAllowedShareUrl(u)) return null;
    return u;
  }, [searchParams]);

  if (!src) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-black p-6 text-center text-sm text-white/60">
        Invalid or expired link. Scan the QR from the booth again.
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-black p-6 text-white">
      <img
        src={src}
        alt="Photo strip"
        className="max-h-[85dvh] max-w-full rounded border border-white/20 object-contain"
      />
      <a
        href={src}
        download="photostrip.jpg"
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full border border-white/30 px-5 py-2 text-sm text-white/90"
      >
        Save image
      </a>
    </main>
  );
}

export default function ViewStripPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-black">
          <div className="h-8 w-8 animate-pulse rounded-full bg-white/20" />
        </main>
      }
    >
      <ViewStripContent />
    </Suspense>
  );
}
