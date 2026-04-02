import * as pdfjsLib from "pdfjs-dist";
if (pdfjsLib?.GlobalWorkerOptions) pdfjsLib.GlobalWorkerOptions.workerSrc = "";

export async function renderSinglePagePdfToCanvas(file: File, scale = 2.2) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data: bytes, disableWorker: true, useWorkerFetch: false, isEvalSupported: false });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  await page.render({ canvasContext: ctx, viewport }).promise;

  let textItems: Array<{ str: string; transform: number[]; width: number; height: number; hasEOL: boolean }> = [];
  try {
    const textContent = await page.getTextContent();
    textItems = (textContent.items || []).map((item: any) => ({
      str: item.str || "",
      transform: item.transform || [],
      width: item.width || 0,
      height: item.height || 0,
      hasEOL: Boolean(item.hasEOL),
    }));
  } catch {}
  return { canvas, pdf, page, viewport, scale, textItems, bytes };
}