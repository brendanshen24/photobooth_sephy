/** Draw mirrored square crop from video (full color). */

export function renderVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  size: number
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const side = Math.min(vw, vh);
  const sx = (vw - side) / 2;
  const sy = (vh - side) / 2;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.translate(size, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
  ctx.restore();
}

/** Capture high-res color frame (matches live preview). */
export function captureVideoToCanvas(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const side = Math.min(vw, vh);
  const sx = (vw - side) / 2;
  const sy = (vh - side) / 2;

  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, side, side);
  ctx.save();
  ctx.translate(side, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, sx, sy, side, side, 0, 0, side, side);
  ctx.restore();
}
