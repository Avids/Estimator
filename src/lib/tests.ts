import { cn, createSafeId } from "./constants";
import { getSelectionBoxStyle } from "./canvas";
import { computeTemplateDensity, nonMaxSuppression, trimBinary } from "./detection";
import { extractLikelySheetTitle, getDisregardBackgroundHint } from "./sheet";
export function runSelfTests() {
  const tests = [
    { name: "density", run: () => computeTemplateDensity({ data: new Uint8ClampedArray([1, 0, 0, 0]) }) === 0.25 },
    { name: "nms", run: () => nonMaxSuppression([{ x: 0, y: 0, w: 10, h: 10, score: 0.9 }, { x: 1, y: 1, w: 10, h: 10, score: 0.8 }, { x: 30, y: 30, w: 10, h: 10, score: 0.7 }], 0.3).length === 2 },
    { name: "trim", run: () => trimBinary({ width: 4, height: 4, data: new Uint8ClampedArray([0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0]) }, 0).width === 2 },
    { name: "selection-style", run: () => getSelectionBoxStyle(null, null) === null },
    { name: "sheet-title", run: () => extractLikelySheetTitle([{ str: "GENERAL NOTES", transform: [1,0,0,8,10,10] }, { str: "LIGHTING LAYOUT", transform: [1,0,0,24,10,20] }]) === "LIGHTING LAYOUT" },
    { name: "hint", run: () => getDisregardBackgroundHint("LIGHTING LAYOUT").toLowerCase().includes("lighting sheet detected") },
    { name: "safe-id", run: () => typeof createSafeId() === "string" && createSafeId().length > 0 },
    { name: "cn", run: () => cn("a", false, null, "b") === "a b" },
  ];
  const failures = tests.filter((test) => { try { return !test.run(); } catch { return true; } });
  if (failures.length) console.warn("Self-tests failed:", failures.map((f) => f.name));
}