function drawSquareCrop(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  size: number,
  mirrorY: boolean
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const side = Math.min(vw, vh);
  const sx = (vw - side) / 2;
  const sy = (vh - side) / 2;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  if (mirrorY) {
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
  ctx.restore();
}

/** Draw square crop from video (full color). `mirrorY` reflects across the Y axis. */
export function renderVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  size: number,
  mirrorY = true
): void {
  drawSquareCrop(ctx, video, size, mirrorY);
}

/** Capture high-res color frame (matches live preview). */
export function captureVideoToCanvas(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  mirrorY = true
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const side = Math.min(vw, vh);

  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d")!;
  drawSquareCrop(ctx, video, side, mirrorY);
}
