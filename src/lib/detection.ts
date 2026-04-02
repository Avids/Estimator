import { copyCanvas, grayscaleBinarize, maskCanvasAreas } from "./canvas";

export function trimBinary(binary: { data: Uint8ClampedArray; width: number; height: number }, pad = 2) {
  const { data, width, height } = binary;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[y * width + x]) {
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0) return { data, width, height, bounds: { x: 0, y: 0, w: width, h: height } };
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
  const w = maxX - minX + 1, h = maxY - minY + 1, out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) out[y * w + x] = data[(minY + y) * width + (minX + x)];
  return { data: out, width: w, height: h, bounds: { x: minX, y: minY, w, h } };
}

export function resizeBinaryNearest(binary: { data: Uint8ClampedArray; width: number; height: number }, targetW: number, targetH: number) {
  const out = new Uint8ClampedArray(targetW * targetH);
  for (let y = 0; y < targetH; y += 1) {
    for (let x = 0; x < targetW; x += 1) {
      const sx = Math.min(binary.width - 1, Math.floor((x / targetW) * binary.width));
      const sy = Math.min(binary.height - 1, Math.floor((y / targetH) * binary.height));
      out[y * targetW + x] = binary.data[sy * binary.width + sx];
    }
  }
  return { data: out, width: targetW, height: targetH };
}

export function computeTemplateDensity(binary: { data: Uint8ClampedArray }) {
  let count = 0;
  for (let i = 0; i < binary.data.length; i += 1) count += binary.data[i] ? 1 : 0;
  return count / Math.max(1, binary.data.length);
}

export function scoreWindow(pageBinary: any, px: number, py: number, tpl: any) {
  let matches = 0, active = 0, bgPenalty = 0;
  for (let y = 0; y < tpl.height; y += 1) {
    const rowOffsetTpl = y * tpl.width;
    const rowOffsetPg = (py + y) * pageBinary.width + px;
    for (let x = 0; x < tpl.width; x += 1) {
      const tv = tpl.data[rowOffsetTpl + x];
      const pv = pageBinary.data[rowOffsetPg + x];
      if (tv) { active += 1; if (pv) matches += 1; } else if (pv) bgPenalty += 1;
    }
  }
  if (!active) return 0;
  const recall = matches / active;
  const penalty = bgPenalty / (tpl.width * tpl.height);
  return recall - penalty * 0.55;
}

export function nonMaxSuppression(boxes: Array<any>, iouThreshold = 0.3) {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const keep: any[] = [];
  function iou(a: any, b: any) {
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const union = a.w * a.h + b.w * b.h - inter;
    return union ? inter / union : 0;
  }
  for (const box of sorted) if (keep.every((k) => iou(k, box) < iouThreshold)) keep.push(box);
  return keep;
}

export function detectTemplatesOnPage(pageCanvas: HTMLCanvasElement, symbolDefs: any[], settings: any, options: any = {}) {
  const workingCanvas = options.ignoreAreas?.length ? maskCanvasAreas(pageCanvas, options.ignoreAreas) : copyCanvas(pageCanvas);
  const pageBinary = grayscaleBinarize(workingCanvas, settings.binaryThreshold);
  const detections: any[] = [];
  for (const def of symbolDefs) {
    const symbolBinary = trimBinary(grayscaleBinarize(def.canvas, settings.binaryThreshold));
    const density = computeTemplateDensity(symbolBinary);
    if (density < 0.01) continue;
    const raw: any[] = [];
    for (const scale of settings.scales) {
      const tw = Math.max(8, Math.round(symbolBinary.width * scale));
      const th = Math.max(8, Math.round(symbolBinary.height * scale));
      if (tw >= pageBinary.width || th >= pageBinary.height) continue;
      const tpl = resizeBinaryNearest(symbolBinary, tw, th);
      const step = Math.max(2, Math.floor(Math.min(tw, th) / 5));
      for (let y = 0; y <= pageBinary.height - th; y += step) {
        for (let x = 0; x <= pageBinary.width - tw; x += step) {
          const score = scoreWindow(pageBinary, x, y, tpl);
          if (score >= settings.matchThreshold) raw.push({ id: `${def.id}-${scale}-${x}-${y}`, symbolId: def.id, type: def.type, tag: def.tag, label: def.tag || def.name, color: def.color, x, y, w: tw, h: th, score });
        }
      }
    }
    const deduped = nonMaxSuppression(raw, settings.nmsThreshold).filter((d) => d.score >= settings.finalScoreThreshold).slice(0, settings.maxPerSymbol);
    detections.push(...deduped);
  }
  return detections;
}