import { PDFDocument } from "pdf-lib";
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
export function exportCsv(rows: Array<{ type: string; tag: string; count: number }>, filename = "device-counts.csv") {
  const header = ["Type", "Tag", "Count"];
  const lines = [header.join(",")].concat(rows.map((r) => [r.type, r.tag, r.count].join(",")));
  downloadBlob(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" }), filename);
}
export function exportAnnotatedPng(baseCanvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement, filename = "annotated-sheet.png") {
  const out = document.createElement("canvas");
  out.width = baseCanvas.width; out.height = baseCanvas.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(baseCanvas, 0, 0); ctx.drawImage(overlayCanvas, 0, 0);
  out.toBlob((blob) => { if (blob) downloadBlob(blob, filename); });
}
export async function exportAnnotatedPdf(originalPdfBytes: Uint8Array, overlayCanvas: HTMLCanvasElement, filename = "annotated-sheet.pdf") {
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const page = pdfDoc.getPages()[0];
  const pngDataUrl = overlayCanvas.toDataURL("image/png");
  const pngBytes = await fetch(pngDataUrl).then((r) => r.arrayBuffer());
  const pngImage = await pdfDoc.embedPng(pngBytes);
  const { width, height } = page.getSize();
  page.drawImage(pngImage, { x: 0, y: 0, width, height });
  const pdfBytes = await pdfDoc.save();
  downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), filename);
}