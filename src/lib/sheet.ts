import type { Rect } from "./canvas";
export function extractLikelySheetTitle(textItems: Array<any> = []) {
  const lines = textItems.map((item) => {
    const tx = item.transform || [];
    return { text: String(item.str || "").trim(), x: tx[4] || 0, y: tx[5] || 0, h: Math.abs(tx[3] || item.height || 0) };
  }).filter((item) => item.text);
  if (!lines.length) return "";
  const ranked = [...lines].filter((item) => item.text.length >= 3).sort((a, b) => (b.h !== a.h ? b.h - a.h : a.y - b.y));
  const top = ranked.slice(0, 8);
  const likely = top.find((item) => /plan|layout|power|lighting|fixture|fire|security|device|floor|electrical|riser|details?/i.test(item.text));
  return (likely || top[0] || {}).text || "";
}
export function getDisregardBackgroundHint(sheetTitle = "") {
  if (!sheetTitle) return "Background architectural content will be deprioritized during takeoff.";
  const lower = sheetTitle.toLowerCase();
  if (lower.includes("lighting")) return "Lighting sheet detected. Ignore architectural background and compare placed symbols to the legend.";
  if (lower.includes("power")) return "Power sheet detected. Ignore architectural background and compare placed symbols to the legend.";
  if (lower.includes("fire")) return "Fire alarm related sheet detected. Ignore architectural background and compare placed symbols to the legend.";
  if (lower.includes("security") || lower.includes("low voltage") || lower.includes("communication")) return "Low-voltage related sheet detected. Ignore architectural background and compare placed symbols to the legend.";
  return "Use the drawing title to guide takeoff and ignore obvious non-electrical background content.";
}
export function getIgnoreAreas(canvas: HTMLCanvasElement, ignoreTitleBlock: boolean): Rect[] {
  const areas: Rect[] = [];
  if (ignoreTitleBlock) {
    const margin = Math.round(Math.min(canvas.width, canvas.height) * 0.02);
    const titleBlockWidth = Math.round(canvas.width * 0.22);
    const titleBlockHeight = Math.round(canvas.height * 0.16);
    areas.push({ x: Math.max(0, canvas.width - titleBlockWidth - margin), y: Math.max(0, canvas.height - titleBlockHeight - margin), w: titleBlockWidth, h: titleBlockHeight });
  }
  return areas;
}