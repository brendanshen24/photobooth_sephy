import {
  PRINT_HEIGHT_PX,
  PRINT_WIDTH_PX,
  STRIP_COUNT,
  STRIP_FOOTER,
  STRIP_GAP,
  STRIP_HEADER,
  STRIP_ROWS,
  slotPosition,
  stripContentHeight,
  stripGridHeight,
  stripGridWidth,
  stripGridX,
  stripGridY,
  stripPhotoSize,
} from "./printDimensions";

export type SurroundId =
  | "classic"
  | "film"
  | "hearts"
  | "noir"
  | "confetti";

export interface StripSurround {
  id: SurroundId;
  label: string;
  description: string;
  inspirationUrl?: string;
  inspirationLabel?: string;
}

/** Styles inspired by common photobooth strip templates found online. */
export const STRIP_SURROUNDS: StripSurround[] = [
  {
    id: "classic",
    label: "Classic booth",
    description: "White strip, bold black dividers",
    inspirationUrl: "https://tools.jlvextension.com/photo-strip-generator/",
    inspirationLabel: "Photo strip generator",
  },
  {
    id: "film",
    label: "35mm film",
    description: "Cream stock with sprocket holes",
    inspirationUrl: "https://www.vecteezy.com/free-vector/film-strip",
    inspirationLabel: "Film strip vectors",
  },
  {
    id: "hearts",
    label: "Love strip",
    description: "Wedding-style heart corners",
    inspirationUrl: "https://www.hgdesigns.co/freebie-photo-both-strip-kit/",
    inspirationLabel: "HG Designs strip kit",
  },
  {
    id: "noir",
    label: "Noir",
    description: "Black border, silver accent",
    inspirationUrl: "https://www.pngitem.com/middle/JoToJw_transparent-photo-booth-strip-template-hd-png-download/",
    inspirationLabel: "Booth strip template",
  },
  {
    id: "confetti",
    label: "Party",
    description: "Confetti dots on white",
    inspirationUrl: "https://www.vecteezy.com/free-png/photo-booth-frame",
    inspirationLabel: "Booth frame PNGs",
  },
];

const STRIP_W = PRINT_WIDTH_PX;
const STRIP_H = PRINT_HEIGHT_PX;

function drawHeart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.beginPath();
  ctx.moveTo(12, 21);
  ctx.bezierCurveTo(4, 14, 0, 8, 0, 4);
  ctx.bezierCurveTo(0, 0, 4, 0, 8, 4);
  ctx.bezierCurveTo(10, 0, 14, 0, 16, 4);
  ctx.bezierCurveTo(16, 8, 12, 14, 12, 21);
  ctx.fill();
  ctx.restore();
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  id: SurroundId,
  w: number,
  h: number
): void {
  switch (id) {
    case "classic":
      ctx.fillStyle = "#ffffff";
      break;
    case "film":
      ctx.fillStyle = "#f4e9d8";
      break;
    case "hearts":
      ctx.fillStyle = "#fff8fa";
      break;
    case "noir":
      ctx.fillStyle = "#0a0a0a";
      break;
    case "confetti":
      ctx.fillStyle = "#ffffff";
      break;
  }
  ctx.fillRect(0, 0, w, h);

  if (id === "film") {
    ctx.fillStyle = "#2a2118";
    for (let y = 18; y < h; y += 66) {
      ctx.fillRect(12, y, 24, 36);
      ctx.fillRect(w - 36, y, 24, 36);
    }
  }
  if (id === "confetti") {
    const colors = ["#ff3366", "#ffd166", "#06d6a0", "#118ab2", "#9b5de5"];
    for (let i = 0; i < 55; i++) {
      ctx.fillStyle = colors[i % colors.length]!;
      ctx.beginPath();
      ctx.arc((i * 47 + 13) % w, (i * 31 + 7) % h, 4 + (i % 4), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawForeground(
  ctx: CanvasRenderingContext2D,
  id: SurroundId,
  w: number,
  h: number
): void {
  const photo = stripPhotoSize();
  const gx = stripGridX();
  const gy = stripGridY();
  const gridW = stripGridWidth();
  const gridH = stripGridHeight();
  const titleColor =
    id === "noir" || id === "film" ? "#d4d4d4" : id === "hearts" ? "#c73a5e" : "#111";

  ctx.strokeStyle = id === "noir" ? "#d4d4d4" : id === "hearts" ? "#e84a6f" : "#111";
  ctx.lineWidth = id === "classic" ? 10 : 5;
  ctx.strokeRect(
    id === "classic" ? 6 : 24,
    id === "classic" ? 6 : 24,
    w - (id === "classic" ? 12 : 48),
    h - (id === "classic" ? 12 : 48)
  );

  ctx.font =
    id === "film"
      ? "bold 36px monospace"
      : id === "hearts"
        ? "italic 40px Georgia, serif"
        : "bold 42px Georgia, serif";
  ctx.fillStyle = titleColor;
  ctx.textAlign = "center";
  ctx.fillText("", w / 2, 56);

  for (let i = 0; i < STRIP_COUNT; i++) {
    const { x, y } = slotPosition(i);
    ctx.lineWidth = id === "classic" ? 5 : 4;
    ctx.strokeRect(x, y, photo, photo);
  }

  if (id === "classic") {
    for (let row = 0; row < STRIP_ROWS - 1; row++) {
      const y = gy + (row + 1) * photo + row * STRIP_GAP + STRIP_GAP / 2;
      ctx.beginPath();
      ctx.moveTo(gx, y);
      ctx.lineTo(gx + gridW, y);
      ctx.stroke();
    }
    const midX = gx + photo + STRIP_GAP / 2;
    ctx.beginPath();
    ctx.moveTo(midX, gy);
    ctx.lineTo(midX, gy + gridH);
    ctx.stroke();

    ctx.font = "28px Georgia, serif";
    ctx.fillStyle = "#444";
    ctx.fillText("★ ★ ★", w / 2, h - 32);
  }

  if (id === "hearts") {
    ctx.fillStyle = "#e84a6f";
    for (let row = 0; row < STRIP_ROWS - 1; row++) {
      const y = gy + (row + 1) * photo + row * STRIP_GAP + STRIP_GAP / 2 - 18;
      drawHeart(ctx, w / 2 - 18, y, 36);
    }
    for (let i = 0; i < 4; i++) {
      drawHeart(ctx, 48 + i * 270, 18, 20);
    }
  }

  if (id === "noir") {
    ctx.fillStyle = "#888";
    ctx.font = "28px monospace";
    ctx.fillText("EST. 2026", w / 2, h - 36);
  }
}

/** Compose 8 photos (2×4) with decorative surround for 4×6 Selphy print. */
export function composeStripWithSurround(
  frames: HTMLCanvasElement[],
  surroundId: SurroundId
): HTMLCanvasElement {
  const photo = stripPhotoSize();
  const out = document.createElement("canvas");
  out.width = STRIP_W;
  out.height = STRIP_H;
  const ctx = out.getContext("2d")!;

  drawBackground(ctx, surroundId, STRIP_W, STRIP_H);
  for (let i = 0; i < STRIP_COUNT; i++) {
    const { x, y } = slotPosition(i);
    ctx.drawImage(
      frames[i]!,
      0,
      0,
      frames[i]!.width,
      frames[i]!.height,
      x,
      y,
      photo,
      photo
    );
  }
  drawForeground(ctx, surroundId, STRIP_W, STRIP_H);

  return out;
}

/** Small preview for the surround picker UI. */
export function renderSurroundPreview(
  surroundId: SurroundId,
  width = 120
): string {
  const scale = width / STRIP_W;
  const h = Math.round(stripContentHeight() * scale);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.scale(scale, scale);
  const photo = stripPhotoSize();
  drawBackground(ctx, surroundId, STRIP_W, stripContentHeight());
  for (let i = 0; i < STRIP_COUNT; i++) {
    const { x, y } = slotPosition(i);
    ctx.fillStyle = "#bbb";
    ctx.fillRect(x, y, photo, photo);
  }
  drawForeground(ctx, surroundId, STRIP_W, stripContentHeight());
  return c.toDataURL("image/png");
}

export { STRIP_COUNT };
