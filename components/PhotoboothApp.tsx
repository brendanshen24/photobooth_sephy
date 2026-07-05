"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CupsPrinterClient } from "@/lib/cupsPrinterClient";
import { canvasToThumb, imageFileToCanvas, imageFileToPrintCanvas } from "@/lib/loadPhoto";
import { canvasToPrintDataUrl, composeSinglePhoto, PRINT_HEIGHT_PX, PRINT_WIDTH_PX } from "@/lib/photoStrip";
import { captureVideoToCanvas, renderVideoFrame } from "@/lib/renderFrame";
import {
  composeStripWithSurround,
  renderSurroundPreview,
  STRIP_COUNT,
  STRIP_SURROUNDS,
  type SurroundId,
} from "@/lib/stripSurrounds";
import StripShareQr from "@/components/StripShareQr";

const PREVIEW_SIZE = 440;
/** Preview canvas + border-4 + p-1 — side panels align to this height */
const PREVIEW_FRAME_H = PREVIEW_SIZE + 16 + 8;

type BoothMode = "camera" | "upload";
type UploadLayout = "strip" | "single";

export default function PhotoboothApp() {
  const printerRef = useRef(new CupsPrinterClient());
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<HTMLCanvasElement[]>([]);
  const lastPrintDataUrlRef = useRef<string | null>(null);
  const animRef = useRef<number>(0);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadSlotRef = useRef<number | null>(null);

  const [mode, setMode] = useState<BoothMode>("camera");
  const [uploadLayout, setUploadLayout] = useState<UploadLayout>("strip");
  const singleFrameRef = useRef<HTMLCanvasElement | null>(null);
  const [supported, setSupported] = useState(true);
  const [cameraOk, setCameraOk] = useState(false);
  const [printerName, setPrinterName] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printWarning, setPrintWarning] = useState<string | null>(null);
  const [surroundId, setSurroundId] = useState<SurroundId>("classic");
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [lastShot, setLastShot] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [singleThumb, setSingleThumb] = useState<string | null>(null);

  const [surroundPreviews, setSurroundPreviews] = useState<
    Partial<Record<SurroundId, string>>
  >({});

  useEffect(() => {
    const map: Partial<Record<SurroundId, string>> = {};
    for (const s of STRIP_SURROUNDS) {
      map[s.id] = renderSurroundPreview(s.id);
    }
    setSurroundPreviews(map);
  }, []);

  const capturedCount = thumbs.filter(Boolean).length;
  const nextPhoto = capturedCount + 1;
  const stripComplete = capturedCount >= STRIP_COUNT;
  const stripStarted = capturedCount > 0;
  const allSlotsFilled = thumbs.length >= STRIP_COUNT && thumbs.every(Boolean);

  const resetStrip = useCallback(() => {
    framesRef.current = [];
    setThumbs([]);
    singleFrameRef.current = null;
    setSingleThumb(null);
    uploadSlotRef.current = null;
  }, []);

  const setFrameAt = useCallback((index: number, canvas: HTMLCanvasElement) => {
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext("2d")!.drawImage(canvas, 0, 0);
    framesRef.current[index] = copy;

    setThumbs((prev) => {
      const next = [...prev];
      while (next.length < STRIP_COUNT) next.push("");
      next[index] = canvasToThumb(copy);
      return next;
    });
  }, []);

  const nextEmptySlot = useCallback((): number => {
    for (let i = 0; i < STRIP_COUNT; i++) {
      if (!framesRef.current[i]?.width) return i;
    }
    return -1;
  }, []);

  const addUploadedFiles = async (files: FileList) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;

    setPrintError(null);

    if (uploadLayout === "single") {
      const canvas = await imageFileToPrintCanvas(
        list[0]!,
        PRINT_WIDTH_PX,
        PRINT_HEIGHT_PX
      );
      singleFrameRef.current = canvas;
      setSingleThumb(canvasToThumb(canvas));
      return;
    }

    if (uploadSlotRef.current !== null) {
      const index = uploadSlotRef.current;
      uploadSlotRef.current = null;
      const canvas = await imageFileToCanvas(list[0]!);
      setFrameAt(index, canvas);
      return;
    }

    let index = nextEmptySlot();
    for (const file of list) {
      if (index < 0) break;
      const canvas = await imageFileToCanvas(file);
      setFrameAt(index, canvas);
      index = nextEmptySlot();
    }
  };

  const handleUploadInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = "";
    if (!files?.length) return;

    setBusy(true);
    try {
      await addUploadedFiles(files);
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : "Could not load photos");
    } finally {
      setBusy(false);
    }
  };

  const openUploadPicker = (slotIndex: number | null = null) => {
    uploadSlotRef.current = slotIndex;
    uploadInputRef.current?.click();
  };

  const switchMode = (next: BoothMode) => {
    if (next === mode || busy) return;
    resetStrip();
    setPrintError(null);
    setMode(next);
  };

  const switchUploadLayout = (next: UploadLayout) => {
    if (next === uploadLayout || busy) return;
    resetStrip();
    setPrintError(null);
    setUploadLayout(next);
  };

  const printUploadedStrip = async () => {
    if (!printerRef.current.connected || busy) return;
    const frames = Array.from(
      { length: STRIP_COUNT },
      (_, i) => framesRef.current[i]!
    );
    if (!frames.every((f) => f?.width > 0)) return;
    setBusy(true);
    setProgress(5);
    try {
      await printStrip(frames);
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : "Print failed");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const drawPreview = useCallback(() => {
    const video = videoRef.current;
    const canvas = previewCanvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      animRef.current = requestAnimationFrame(drawPreview);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      animRef.current = requestAnimationFrame(drawPreview);
      return;
    }

    canvas.width = PREVIEW_SIZE;
    canvas.height = PREVIEW_SIZE;
    renderVideoFrame(ctx, video, PREVIEW_SIZE);

    animRef.current = requestAnimationFrame(drawPreview);
  }, []);

  useEffect(() => {
    setSupported(CupsPrinterClient.isSupported());
  }, []);

  useEffect(() => {
    if (mode !== "camera") return;

    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          setCameraOk(true);
          animRef.current = requestAnimationFrame(drawPreview);
        }
      } catch {
        /* camera unavailable */
      }
    }

    startCamera();

    return () => {
      cancelAnimationFrame(animRef.current);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [drawPreview, mode]);

  const connectPrinter = async () => {
    setBusy(true);
    setServerError(null);
    try {
      const name = await printerRef.current.connect();
      setPrinterName(name);
      const health = await printerRef.current.checkHealth();
      const warning =
        health.queue?.warning ??
        (health.queue?.printerStatus as { error?: string } | undefined)?.error ??
        null;
      setPrintWarning(warning);
      if (!health.ok) {
        setPrintError(
          warning ??
            "Printer is not ready. Check USB connection and power, then click Resume printer."
        );
      }
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Could not connect to print server"
      );
    } finally {
      setBusy(false);
    }
  };

  const resumePrinter = async () => {
    if (!printerRef.current.connected || busy) return;
    setBusy(true);
    setPrintError(null);
    try {
      const result = await printerRef.current.resumePrinter();
      const health = await printerRef.current.checkHealth();
      setPrintWarning(health.queue?.warning ?? null);
      if (!result.ok) {
        setPrintError(
          result.error ??
            "Printer still not ready. Check USB cable, power, paper, and ink cassette."
        );
      } else {
        setPrintError(null);
      }
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : "Could not resume printer");
    } finally {
      setBusy(false);
    }
  };

  const flashShot = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 280);
  };

  const printDataUrl = async (dataUrl: string, copies = 1) => {
    let lastWarning: string | null = null;
    for (let i = 0; i < copies; i++) {
      const result = await printerRef.current.printImage(dataUrl, {
        onProgress: (pct) => setProgress(Math.round(((i + pct / 100) / copies) * 100)),
      });
      if (result.warning) lastWarning = result.warning;
    }
    setPrintWarning(lastWarning);
  };

  const printSinglePhoto = async () => {
    if (!printerRef.current.connected || busy) return;
    const frame = singleFrameRef.current;
    if (!frame) return;

    setBusy(true);
    setProgress(5);
    setPrintError(null);
    try {
      const printCanvas = composeSinglePhoto(frame);
      const dataUrl = canvasToPrintDataUrl(printCanvas);
      await printDataUrl(dataUrl);
      setLastShot(dataUrl);
      lastPrintDataUrlRef.current = dataUrl;
      resetStrip();
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : "Print failed");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const printStrip = async (frames: HTMLCanvasElement[]) => {
    const strip = composeStripWithSurround(frames, surroundId);
    const dataUrl = canvasToPrintDataUrl(strip);
    setPrintError(null);
    await printDataUrl(dataUrl);
    setLastShot(dataUrl);
    lastPrintDataUrlRef.current = dataUrl;
    resetStrip();
  };

  const reprintLast = async (copies: number) => {
    const dataUrl = lastPrintDataUrlRef.current;
    if (!printerRef.current.connected || !dataUrl || busy) return;

    setBusy(true);
    try {
      await printDataUrl(dataUrl, copies);
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : "Reprint failed");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const shutter = async () => {
    if (!printerRef.current.connected) return;
    if (!cameraOk || busy || stripComplete) return;

    const video = videoRef.current;
    const frameCanvas = frameCanvasRef.current;
    if (!video || !frameCanvas) return;

    setBusy(true);

    try {
      for (let n = 3; n >= 1; n--) {
        setCountdown(n);
        await new Promise((r) => setTimeout(r, 700));
      }
      setCountdown(null);

      flashShot();
      captureVideoToCanvas(frameCanvas, video);

      const copy = document.createElement("canvas");
      copy.width = frameCanvas.width;
      copy.height = frameCanvas.height;
      copy.getContext("2d")!.drawImage(frameCanvas, 0, 0);
      framesRef.current.push(copy);
      setThumbs((prev) => [...prev, copy.toDataURL("image/jpeg", 0.92)]);

      const newCount = framesRef.current.length;
      if (newCount < STRIP_COUNT) {
        setBusy(false);
        return;
      }

      setProgress(5);
      await printStrip(framesRef.current);
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : "Print failed");
    } finally {
      setBusy(false);
      setProgress(0);
      setCountdown(null);
    }
  };

  if (!supported) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-center">
        <p className="text-booth-accent">
          This browser does not support the photobooth app.
        </p>
      </main>
    );
  }

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-booth-bg text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,#000_95%)]" />

      <header className="relative z-10 flex shrink-0 items-center justify-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex rounded-full border border-white/15 p-0.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => switchMode("camera")}
            className={`rounded-full px-3 py-1 text-xs transition ${
              mode === "camera"
                ? "bg-booth-accent text-white"
                : "text-white/60 hover:text-white/90"
            }`}
          >
            Booth
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => switchMode("upload")}
            className={`rounded-full px-3 py-1 text-xs transition ${
              mode === "upload"
                ? "bg-booth-accent text-white"
                : "text-white/60 hover:text-white/90"
            }`}
          >
            Your photos
          </button>
        </div>

        {printerName ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={resumePrinter}
              className="shrink-0 rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
            >
              Resume printer
            </button>
            <button
              type="button"
              onClick={() => {
                printerRef.current.disconnect();
                setPrinterName(null);
                resetStrip();
                setPrintError(null);
                setPrintWarning(null);
              }}
              className="shrink-0 rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/70"
            >
              {printerName} · disconnect
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={connectPrinter}
            className="shrink-0 rounded-full bg-booth-accent px-4 py-1.5 text-xs font-medium text-white"
          >
            Connect printer
          </button>
        )}
      </header>

      {serverError && (
        <p className="relative z-10 shrink-0 bg-red-950/80 px-4 py-2 text-center text-xs text-red-200">
          {serverError}
        </p>
      )}

      {printWarning && (
        <p className="relative z-10 shrink-0 bg-blue-950/80 px-4 py-2 text-center text-xs text-blue-200">
          {printWarning}
        </p>
      )}

      {printError && (
        <p className="relative z-10 shrink-0 bg-amber-950/80 px-4 py-2 text-center text-xs text-amber-200">
          Print error: {printError}
        </p>
      )}

      <div className="relative z-10 flex min-h-0 w-full flex-1 items-center justify-center overflow-y-auto px-3 py-4 lg:px-6">
        <div className="grid w-full max-w-6xl grid-cols-1 justify-items-center gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-start lg:justify-items-stretch lg:gap-x-6 lg:gap-y-4">
        {/* Left — strip progress (same height as preview frame) */}
        <aside className="flex w-full max-w-[440px] flex-col gap-2 lg:w-36 lg:max-w-none lg:justify-self-end">
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">
            {mode === "upload" && uploadLayout === "single" ? "Your photo" : "Your strip"}
          </p>

          <div
            className="flex flex-col rounded-lg border border-white/15 bg-black/40 p-2"
            style={{ height: PREVIEW_FRAME_H }}
          >
            {mode === "upload" && uploadLayout === "single" ? (
              <>
                <p className="mb-1.5 shrink-0 text-center text-xs font-medium text-booth-glow">
                  {singleThumb ? "Ready to print" : "No photo selected"}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => openUploadPicker(null)}
                  className="relative min-h-0 flex-1 overflow-hidden rounded border border-white/20 transition hover:border-white/40 disabled:opacity-40"
                >
                  {singleThumb ? (
                    <img
                      src={singleThumb}
                      alt="Selected photo"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-white/30">
                      Tap to choose
                    </div>
                  )}
                </button>
              </>
            ) : (
              <>
            <p className="mb-1.5 shrink-0 text-center text-xs font-medium text-booth-glow">
              {stripComplete
                ? "Printing…"
                : mode === "upload"
                  ? `${capturedCount} of ${STRIP_COUNT} selected`
                  : `Photo ${Math.min(nextPhoto, STRIP_COUNT)} of ${STRIP_COUNT}`}
            </p>
            <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-4 gap-1">
              {Array.from({ length: STRIP_COUNT }, (_, i) => {
                const isDone = Boolean(thumbs[i]);
                const isCurrent =
                  mode === "camera" && i === capturedCount && !stripComplete;
                const isUploadSlot = mode === "upload" && !stripComplete;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={busy || (mode === "camera" && !isUploadSlot)}
                    onClick={() => {
                      if (mode === "upload") openUploadPicker(i);
                    }}
                    className={`relative min-h-0 flex-1 overflow-hidden rounded border transition ${
                      isCurrent
                        ? "border-booth-accent ring-2 ring-booth-accent/40"
                        : isDone
                          ? "border-booth-glow/50"
                          : isUploadSlot
                            ? "border-white/20 hover:border-white/40"
                            : "border-white/10"
                    } ${mode === "upload" ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <div className="h-full w-full bg-white/5">
                      {thumbs[i] ? (
                        <img
                          src={thumbs[i]}
                          alt={`Photo ${i + 1}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center font-mono text-sm text-white/20">
                          {i + 1}
                        </div>
                      )}
                    </div>
                    {isCurrent && (
                      <span className="absolute bottom-0 left-0 right-0 bg-booth-accent/90 py-0.5 text-center text-[9px] font-medium uppercase tracking-wide">
                        Now
                      </span>
                    )}
                    {isDone && (
                      <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-booth-glow text-[10px] font-bold text-booth-bg">
                        ✓
                      </span>
                    )}
                    {mode === "upload" && !thumbs[i] && (
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white/30">
                        Tap to add
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
              </>
            )}
          </div>

          {((mode === "upload" && uploadLayout === "single" && singleThumb) ||
            (stripStarted && !busy)) && (
            <button
              type="button"
              onClick={resetStrip}
              className="w-full rounded-lg border border-white/15 py-1.5 text-[10px] text-white/60 hover:bg-white/5"
            >
              Start over
            </button>
          )}
        </aside>

        {/* Center — preview + shutter / upload */}
        <div className="flex w-full max-w-[440px] flex-col items-center gap-2 lg:justify-self-center">
          <p className="w-full font-mono text-[10px] uppercase tracking-widest text-white/40 lg:text-center">
            {mode === "camera"
              ? "Live preview · 4×6 color print"
              : uploadLayout === "single"
                ? "Single photo · 4×6 print"
                : "Photo strip · 4×6 print"}
          </p>

          {mode === "camera" ? (
            <>
          <div className="relative w-full">
            <div className="rounded-sm border-4 border-white/90 bg-black p-1 shadow-[0_0_40px_rgba(255,51,102,0.25)]">
              <canvas
                ref={previewCanvasRef}
                width={PREVIEW_SIZE}
                height={PREVIEW_SIZE}
                className="block w-full"
              />
            </div>
            {countdown !== null && (
              <div
                key={countdown}
                className="absolute inset-0 flex items-center justify-center text-8xl font-bold text-booth-glow animate-countdown"
              >
                {countdown}
              </div>
            )}
            {flash && (
              <div className="pointer-events-none absolute inset-0 bg-white animate-flash" />
            )}
          </div>

          <video ref={videoRef} className="hidden" playsInline muted />
          <canvas ref={frameCanvasRef} className="hidden" />

          <div className="flex flex-col items-center gap-4 pt-2">
          <button
            type="button"
            disabled={busy || !cameraOk || stripComplete}
            onClick={shutter}
            aria-label={`Capture photo ${nextPhoto}`}
            className="group flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white bg-booth-accent shadow-[0_0_24px_rgba(255,51,102,0.5)] transition enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-40"
          >
            <span className="h-12 w-12 rounded-full border-2 border-white/80 bg-white/20 transition group-enabled:group-hover:bg-white/30" />
          </button>
          {busy && progress > 0 && (
            <div className="h-1 w-48 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-booth-glow transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          </div>
            </>
          ) : (
            <div
              className="flex w-full flex-col items-center justify-center gap-4 rounded-sm border-4 border-white/90 bg-black/60 p-6 shadow-[0_0_40px_rgba(255,51,102,0.25)]"
              style={{ height: PREVIEW_FRAME_H }}
            >
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*"
                multiple={uploadLayout === "strip"}
                className="hidden"
                onChange={handleUploadInput}
              />

              <div className="flex rounded-full border border-white/15 p-0.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => switchUploadLayout("strip")}
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    uploadLayout === "strip"
                      ? "bg-booth-glow/20 text-booth-glow"
                      : "text-white/60 hover:text-white/90"
                  }`}
                >
                  Strip (8)
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => switchUploadLayout("single")}
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    uploadLayout === "single"
                      ? "bg-booth-glow/20 text-booth-glow"
                      : "text-white/60 hover:text-white/90"
                  }`}
                >
                  Single photo
                </button>
              </div>

              {uploadLayout === "single" ? (
                <>
                  <p className="text-center text-sm text-white/70">
                    Choose one photo to print full-size on 4×6.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openUploadPicker(null)}
                    className="rounded-full border border-white/25 px-5 py-2 text-sm text-white/90 hover:bg-white/5 disabled:opacity-40"
                  >
                    {singleThumb ? "Choose different photo" : "Choose photo"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !printerName || !singleThumb}
                    onClick={printSinglePhoto}
                    className="rounded-full bg-booth-accent px-6 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                  >
                    Print photo
                  </button>
                </>
              ) : (
                <>
              <p className="text-center text-sm text-white/70">
                Choose {STRIP_COUNT} photos for your 4×6 strip.
                <br />
                <span className="text-xs text-white/45">
                  Tap any slot to pick individually, or add them all at once.
                </span>
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => openUploadPicker(null)}
                className="rounded-full border border-white/25 px-5 py-2 text-sm text-white/90 hover:bg-white/5 disabled:opacity-40"
              >
                Choose photos
              </button>
              <button
                type="button"
                disabled={
                  busy ||
                  !printerName ||
                  !allSlotsFilled ||
                  stripComplete
                }
                onClick={printUploadedStrip}
                className="rounded-full bg-booth-accent px-6 py-2.5 text-sm font-medium text-white disabled:opacity-40"
              >
                {stripComplete ? "Printing…" : "Print strip"}
              </button>
                </>
              )}
              {busy && progress > 0 && (
                <div className="h-1 w-48 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-booth-glow transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right — strip surrounds (same height as preview frame) */}
        <aside className="flex w-full max-w-[440px] flex-col gap-2 lg:w-52 lg:max-w-none lg:justify-self-start">
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">
            {mode === "upload" && uploadLayout === "single"
              ? "Print options"
              : "Strip surround"}
          </p>

          <div
            className="flex flex-col overflow-hidden rounded-lg border border-white/15 bg-black/40"
            style={{ height: PREVIEW_FRAME_H }}
          >
            {mode === "upload" && uploadLayout === "single" ? (
              <div className="flex min-h-0 flex-1 flex-col justify-center p-4 text-center">
                <p className="text-xs text-white/50">
                  Your photo fills the full 4×6″ sheet.
                  Landscape and portrait images are cropped to fit.
                </p>
              </div>
            ) : (
            <>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
            {STRIP_SURROUNDS.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy || stripStarted}
                onClick={() => setSurroundId(s.id)}
                className={`flex w-full gap-2 rounded-md border p-1.5 text-left transition ${
                  surroundId === s.id
                    ? "border-booth-glow bg-booth-glow/10"
                    : "border-transparent hover:bg-white/5 disabled:opacity-40"
                }`}
              >
                {surroundPreviews[s.id] ? (
                  <img
                    src={surroundPreviews[s.id]}
                    alt=""
                    className="h-14 w-8 shrink-0 rounded border border-white/10 object-cover object-top"
                  />
                ) : (
                  <div className="h-14 w-8 shrink-0 rounded border border-white/10 bg-white/10" />
                )}
                <div className="min-w-0">
                  <p
                    className={`text-xs font-medium ${
                      surroundId === s.id ? "text-booth-glow" : "text-white/90"
                    }`}
                  >
                    {s.label}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-snug text-white/45">
                    {s.description}
                  </p>
                </div>
              </button>
            ))}
            </div>
            </>
            )}

            <div className="shrink-0 space-y-1 border-t border-white/10 p-2">
              {stripStarted && (
                <p className="text-[10px] text-white/35">
                  Surround locked for this strip
                </p>
              )}

              {lastShot && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wide text-white/40">
                    Last print
                  </p>
                  <div className="flex items-start gap-2">
                    <img
                      src={lastShot}
                      alt="Last strip"
                      className="min-w-0 max-h-28 flex-1 rounded border border-white/15 object-contain"
                    />
                    <StripShareQr imageDataUrl={lastShot} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      disabled={busy || !printerName}
                      onClick={() => reprintLast(1)}
                      className="flex-1 rounded-md border border-white/20 py-1.5 text-[10px] text-white/80 hover:bg-white/5 disabled:opacity-40"
                    >
                      Print again
                    </button>
                    <button
                      type="button"
                      disabled={busy || !printerName}
                      onClick={() => reprintLast(2)}
                      className="rounded-md border border-white/20 px-2 py-1.5 text-[10px] text-white/80 hover:bg-white/5 disabled:opacity-40"
                    >
                      ×2
                    </button>
                    <button
                      type="button"
                      disabled={busy || !printerName}
                      onClick={() => reprintLast(3)}
                      className="rounded-md border border-white/20 px-2 py-1.5 text-[10px] text-white/80 hover:bg-white/5 disabled:opacity-40"
                    >
                      ×3
                    </button>
                    <button
                      type="button"
                      disabled={busy || !printerName}
                      onClick={() => reprintLast(4)}
                      className="rounded-md border border-white/20 px-2 py-1.5 text-[10px] text-white/80 hover:bg-white/5 disabled:opacity-40"
                    >
                      ×4
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
        </div>
      </div>

      <footer className="relative z-10 shrink-0 border-t border-white/10 px-4 py-3">
        <p className="text-center font-mono text-[10px] uppercase tracking-widest text-white/35">
          Canon Selphy · 4×6″ (100 × 148 mm) · local CUPS print server
        </p>
      </footer>
    </main>
  );
}
