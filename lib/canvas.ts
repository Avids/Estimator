export type Rect = { x: number; y: number; w: number; h: number };

export function drawCanvasToVisible(sourceCanvas: HTMLCanvasElement, targetCanvas: HTMLCanvasElement) {
  targetCanvas.width = sourceCanvas.width;
  targetCanvas.height = sourceCanvas.height;
  const ctx = targetCanvas.getContext("2d")!;
  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  ctx.drawImage(sourceCanvas, 0, 0);
}

export function grayscaleBinarize(canvas: HTMLCanvasElement, threshold = 200) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    out[p] = gray < threshold ? 1 : 0;
  }
  return { data: out, width, height };
}

export function maskCanvasAreas(sourceCanvas: HTMLCanvasElement, areas: Rect[] = []) {
  const out = document.createElement("canvas");
  out.width = sourceCanvas.width;
  out.height = sourceCanvas.height;
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(sourceCanvas, 0, 0);
  if (areas.length) {
    ctx.save();
    ctx.fillStyle = "white";
    areas.forEach((a) => ctx.fillRect(a.x, a.y, a.w, a.h));
    ctx.restore();
  }
  return out;
}

export function copyCanvas(sourceCanvas: HTMLCanvasElement) {
  return maskCanvasAreas(sourceCanvas, []);
}

export function cropCanvas(sourceCanvas: HTMLCanvasElement, rect: Rect) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(rect.w));
  c.height = Math.max(1, Math.round(rect.h));
  const ctx = c.getContext("2d")!;
  ctx.drawImage(sourceCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, c.width, c.height);
  return c;
}

export function getSelectionBoxStyle(dragRect: Rect | null, canvasEl: HTMLCanvasElement | null) {
  if (!dragRect || !canvasEl) return null;
  const rect = canvasEl.getBoundingClientRect();
  return {
    left: `${(dragRect.x / canvasEl.width) * rect.width + 12}px`,
    top: `${(dragRect.y / canvasEl.height) * rect.height + 12}px`,
    width: `${(dragRect.w / canvasEl.width) * rect.width}px`,
    height: `${(dragRect.h / canvasEl.height) * rect.height}px`,
  };
}

export function drawOverlay(overlayCanvas: HTMLCanvasElement, detections: any[], hoveredId: string | null) {
  const ctx = overlayCanvas.getContext("2d")!;
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  ctx.lineWidth = 2;
  ctx.font = "12px sans-serif";
  detections.forEach((d, idx) => {
    const active = hoveredId === d.id;
    ctx.strokeStyle = d.color;
    ctx.fillStyle = active ? `${d.color}33` : `${d.color}18`;
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.strokeRect(d.x, d.y, d.w, d.h);
    const label = `${idx + 1} · ${d.label}`;
    const textW = ctx.measureText(label).width + 10;
    const textX = d.x;
    const textY = Math.max(16, d.y - 4);
    ctx.fillStyle = d.color;
    ctx.fillRect(textX, textY - 14, textW, 16);
    ctx.fillStyle = "white";
    ctx.fillText(label, textX + 5, textY - 2);
  });
}