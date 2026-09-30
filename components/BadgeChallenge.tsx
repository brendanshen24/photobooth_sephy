"use client";

import { useEffect, useRef, useState } from "react";
import {
  classifyTap,
  type NfcHealth,
  type NfcTap,
  type TapPopup,
} from "@/lib/nfcChallenge";
import { createOtterLoader, type OtterLoaderInstance } from "@/lib/otterLoader";

const NOTICE_MS = 8000;
const ADMIT_MS = 2400;
const SCAN_HEADLINE = "Tap the ID badge on the reader";

type LinkState = "unknown" | "online" | "offline";

function scanSubtext(
  link: LinkState,
  configError: string | null,
  readerMissing: boolean
): string {
  if (link === "offline") return "Badge reader offline";
  if (configError) return configError;
  if (readerMissing) return "Plug in the badge reader";
  return "Hold your badge near the reader";
}

function resultCopy(popup: TapPopup): { headline: string; subtext: string } {
  if (popup.kind === "first") {
    const points = `+${popup.points} ${popup.points === 1 ? "point" : "points"}`;
    return {
      headline: "Thanks for checking in! You've earned some points for your first tap.",
      subtext: popup.name ? `${points} · ${popup.name}` : points,
    };
  }
  if (popup.kind === "repeat") {
    return {
      headline: "Welcome back!, feel free to take a photo, but this time you won't be getting any points.",
      subtext: popup.name
        ? `You've already been here before, · ${popup.name}`
        : "You've already been here before!",
    };
  }
  return { headline: "Badge not recognized", subtext: popup.message };
}

export default function BadgeChallenge({
  onAdmitted,
}: {
  onAdmitted: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loaderRef = useRef<OtterLoaderInstance | null>(null);
  const fadeTimer = useRef<number | null>(null);

  const [link, setLink] = useState<LinkState>("unknown");
  const [health, setHealth] = useState<NfcHealth | null>(null);
  const [popup, setPopup] = useState<TapPopup | null>(null);
  const [headline, setHeadline] = useState(SCAN_HEADLINE);
  const [subtext, setSubtext] = useState("Hold your badge near the reader");
  const [textOpacity, setTextOpacity] = useState(1);

  useEffect(() => {
    if (!canvasRef.current) return;
    const loader = createOtterLoader(canvasRef.current);
    loaderRef.current = loader;
    return () => {
      loader.destroy();
      loaderRef.current = null;
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    let primed = false;
    let seenAt: string | null = null;
    let inFlight = false;

    async function tick() {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch("/api/nfc", { cache: "no-store" });
        const data = (await res.json()) as {
          ok?: boolean;
          health?: NfcHealth | null;
          last?: NfcTap | null;
        };
        if (stopped) return;

        setHealth(data.health ?? null);

        if (!data.ok) {
          setLink("offline");
          return;
        }
        setLink("online");

        const last = data.last ?? null;
        const at = last?.at ?? null;
        if (!primed) {
          primed = true;
          seenAt = at;
          return;
        }
        if (!at || at === seenAt) return;
        seenAt = at;
        const next = classifyTap(last);
        if (next) setPopup(next);
      } catch {
        if (!stopped) setLink("offline");
      } finally {
        inFlight = false;
      }
    }

    void tick();
    const id = window.setInterval(() => void tick(), 400);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, []);

  const configError =
    link === "online" ? health?.configError?.trim() || null : null;
  const readerMissing =
    link === "online" && !configError && health != null && !health.reader;

  useEffect(() => {
    if (fadeTimer.current) window.clearTimeout(fadeTimer.current);

    const showingResult = popup && popup.kind !== "notice";
    const next = showingResult
      ? resultCopy(popup)
      : {
          headline: SCAN_HEADLINE,
          subtext: scanSubtext(link, configError, readerMissing),
        };

    if (popup?.kind === "first") loaderRef.current?.succeed();
    else loaderRef.current?.reset();

    setTextOpacity(0);
    fadeTimer.current = window.setTimeout(() => {
      setHeadline(next.headline);
      setSubtext(next.subtext);
      setTextOpacity(1);
    }, 180);

    return () => {
      if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    };
  }, [popup, link, configError, readerMissing]);

  useEffect(() => {
    if (!popup) return;
    if (popup.kind === "notice") {
      const id = window.setTimeout(() => setPopup(null), NOTICE_MS);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => onAdmitted(), ADMIT_MS);
    return () => window.clearTimeout(id);
  }, [popup, onAdmitted]);

  const notice = popup?.kind === "notice" ? popup.message : null;

  return (
    <div className="relative flex h-dvh w-full flex-col items-center justify-center bg-booth-bg px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,#000_95%)]" />
      {notice ? (
        <div className="mb-6 w-full max-w-md rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-center text-red-200 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-center gap-2 text-lg">
            <span className="inline-block size-2 rounded-full bg-red-400 animate-ping" />
            <span>Badge not recognized</span>
          </div>
          <p className="mt-1 text-sm text-red-200/80">{notice}</p>
        </div>
      ) : null}

      <button
        type="button"
        className="relative z-10 flex cursor-default flex-col items-center border-0 bg-transparent p-0 text-inherit"
        onClick={() => {
          if (popup && popup.kind !== "notice") onAdmitted();
        }}
      >
        <div className="otter-frame">
          <canvas ref={canvasRef} className="otter-card" />
        </div>
        <div className="otter-text">
          <h2 style={{ opacity: textOpacity }}>{headline}</h2>
          <p style={{ opacity: textOpacity }}>{subtext}</p>
        </div>
      </button>
    </div>
  );
}
