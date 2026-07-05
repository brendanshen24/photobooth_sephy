/** Load an image file as a square-cropped canvas (matches booth captures). */
export function imageFileToCanvas(file: File): Promise<HTMLCanvasElement> {
  return loadImageFile(file, (img) => {
    const side = Math.min(img.width, img.height);
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, side, side);
    return canvas;
  });
}

/** Load an image file scaled to cover a 4×6 print canvas. */
export function imageFileToPrintCanvas(
  file: File,
  width: number,
  height: number
): Promise<HTMLCanvasElement> {
  return loadImageFile(file, (img) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    const scale = Math.max(width / img.width, height / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const dx = (width - drawW) / 2;
    const dy = (height - drawH) / 2;
    ctx.drawImage(img, dx, dy, drawW, drawH);
    return canvas;
  });
}

function loadImageFile(
  file: File,
  draw: (img: HTMLImageElement) => HTMLCanvasElement
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        resolve(draw(img));
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Could not process image"));
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not load ${file.name}`));
    };

    img.src = url;
  });
}

export function canvasToThumb(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/jpeg", 0.92);
}
