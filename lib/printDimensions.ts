/** Canon Selphy 4×6″ (100 × 148 mm) at 300 DPI — portrait 2:3 sheet. */
export const PRINT_DPI = 300;
export const PRINT_WIDTH_PX = 1200; // 4″
export const PRINT_HEIGHT_PX = 1800; // 6″

export const STRIP_COLS = 2;
export const STRIP_ROWS = 4;
export const STRIP_COUNT = STRIP_COLS * STRIP_ROWS;

/** Layout margins scaled for print resolution. */
export const STRIP_MARGIN = 44;
export const STRIP_HEADER = 80;
export const STRIP_FOOTER = 60;
export const STRIP_GAP = 16;

/** Square photo cells in a 2×4 grid, centered on the sheet. */
export function stripPhotoSize(): number {
  const availH =
    PRINT_HEIGHT_PX -
    STRIP_HEADER -
    STRIP_FOOTER -
    (STRIP_ROWS - 1) * STRIP_GAP;
  const fromHeight = Math.floor(availH / STRIP_ROWS);

  const availW =
    PRINT_WIDTH_PX - 2 * STRIP_MARGIN - (STRIP_COLS - 1) * STRIP_GAP;
  const fromWidth = Math.floor(availW / STRIP_COLS);

  return Math.min(fromHeight, fromWidth);
}

export function stripGridWidth(): number {
  const photo = stripPhotoSize();
  return STRIP_COLS * photo + (STRIP_COLS - 1) * STRIP_GAP;
}

export function stripGridHeight(): number {
  const photo = stripPhotoSize();
  return STRIP_ROWS * photo + (STRIP_ROWS - 1) * STRIP_GAP;
}

export function stripGridX(): number {
  return Math.floor((PRINT_WIDTH_PX - stripGridWidth()) / 2);
}

export function stripGridY(): number {
  return STRIP_HEADER;
}

export function slotCol(index: number): number {
  return index % STRIP_COLS;
}

export function slotRow(index: number): number {
  return Math.floor(index / STRIP_COLS);
}

export function slotPosition(index: number): { x: number; y: number } {
  const photo = stripPhotoSize();
  const gx = stripGridX();
  const gy = stripGridY();
  const col = slotCol(index);
  const row = slotRow(index);
  return {
    x: gx + col * (photo + STRIP_GAP),
    y: gy + row * (photo + STRIP_GAP),
  };
}

export function stripContentHeight(): number {
  return STRIP_HEADER + stripGridHeight() + STRIP_FOOTER;
}
