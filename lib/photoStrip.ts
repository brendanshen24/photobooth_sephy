import {
  PRINT_HEIGHT_PX,
  PRINT_WIDTH_PX,
  STRIP_COUNT,
  slotPosition,
  stripPhotoSize,
} from "./printDimensions";

export { STRIP_COUNT, PRINT_WIDTH_PX, PRINT_HEIGHT_PX };

/** Full-bleed single photo on a 4×6 canvas. */
export function composeSinglePhoto(source: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = PRINT_WIDTH_PX;
  out.height = PRINT_HEIGHT_PX;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PRINT_WIDTH_PX, PRINT_HEIGHT_PX);
  ctx.drawImage(source, 0, 0, PRINT_WIDTH_PX, PRINT_HEIGHT_PX);
  return out;
}

/** Square frames in a 2×4 grid on a 4×6 canvas. */
export function composePhotoStrip(frames: HTMLCanvasElement[]): HTMLCanvasElement {
  if (frames.length !== STRIP_COUNT) {
    throw new Error(`Expected ${STRIP_COUNT} frames, got ${frames.length}`);
  }

  const photo = stripPhotoSize();
  const out = document.createElement("canvas");
  out.width = PRINT_WIDTH_PX;
  out.height = PRINT_HEIGHT_PX;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PRINT_WIDTH_PX, PRINT_HEIGHT_PX);

  frames.forEach((frame, i) => {
    const { x, y } = slotPosition(i);
    ctx.drawImage(
      frame,
      0,
      0,
      frame.width,
      frame.height,
      x,
      y,
      photo,
      photo
    );
  });

  return out;
}

/** Export a print canvas as a high-quality JPEG data URL. */
export function canvasToPrintDataUrl(
  canvas: HTMLCanvasElement,
  quality = 0.95
): string {
  return canvas.toDataURL("image/jpeg", quality);
}
