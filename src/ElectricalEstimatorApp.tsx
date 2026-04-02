import React, { useEffect, useMemo, useRef, useState } from "react";
import SummaryTable from "./components/SummaryTable";
import { DEVICE_TYPES, createSafeId, getDeviceMeta } from "./lib/constants";
import { cropCanvas, drawCanvasToVisible, drawOverlay, getSelectionBoxStyle, type Rect } from "./lib/canvas";
import { detectTemplatesOnPage } from "./lib/detection";
import { exportAnnotatedPdf, exportAnnotatedPng } from "./lib/export";
import { renderSinglePagePdfToCanvas } from "./lib/pdf";
import { extractLikelySheetTitle, getDisregardBackgroundHint, getIgnoreAreas } from "./lib/sheet";
import { runSelfTests } from "./lib/tests";
runSelfTests();
type SymbolDef = { id: string; name: string; tag: string; type: string; color: string; canvas: HTMLCanvasElement };
export default function ElectricalEstimatorApp() {
  const [legendFile, setLegendFile] = useState<File | null>(null);
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [legendRender, setLegendRender] = useState<any>(null);
  const [sheetRender, setSheetRender] = useState<any>(null);
  const [isLoadingLegend, setIsLoadingLegend] = useState(false);
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [symbolDefs, setSymbolDefs] = useState<SymbolDef[]>([]);
  const [detections, setDetections] = useState<any[]>([]);
  const [hoveredDetection, setHoveredDetection] = useState<string | null>(null);
  const [dragRect, setDragRect] = useState<Rect | null>(null);
  const [pendingCrop, setPendingCrop] = useState<HTMLCanvasElement | null>(null);
  const [form, setForm] = useState({ name: "", tag: "", type: "power" });
  const [settings, setSettings] = useState({ binaryThreshold: 200, matchThreshold: 0.62, finalScoreThreshold: 0.68, nmsThreshold: 0.28, maxPerSymbol: 250, scales: [0.8, 0.9, 1.0, 1.1, 1.2] });
  const [status, setStatus] = useState("Upload the legend PDF first.");
  const [sheetTitle, setSheetTitle] = useState("");
  const [ignoreTitleBlock, setIgnoreTitleBlock] = useState(true);
  const legendCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sheetCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => { if (legendRender && legendCanvasRef.current) drawCanvasToVisible(legendRender.canvas, legendCanvasRef.current); }, [legendRender]);
  useEffect(() => {
    if (sheetRender && sheetCanvasRef.current && overlayCanvasRef.current) {
      drawCanvasToVisible(sheetRender.canvas, sheetCanvasRef.current);
      overlayCanvasRef.current.width = sheetRender.canvas.width;
      overlayCanvasRef.current.height = sheetRender.canvas.height;
      drawOverlay(overlayCanvasRef.current, detections, hoveredDetection);
    }
  }, [sheetRender, detections, hoveredDetection]);

  async function handleLegendUpload(file?: File) {
    if (!file) return;
    setIsLoadingLegend(true); setStatus("Loading legend PDF...");
    try {
      const rendered = await renderSinglePagePdfToCanvas(file, 2.2);
      setLegendFile(file); setLegendRender(rendered);
      setStatus("Legend ready. Draw a box around each legend symbol and assign a type. Tag is optional.");
    } catch (err) {
      console.error(err); setStatus("Could not read the legend PDF. Please upload a clean single-page PDF.");
    } finally { setIsLoadingLegend(false); }
  }

  async function handleSheetUpload(file?: File) {
    if (!file) return;
    setIsLoadingSheet(true); setStatus("Loading drawing sheet...");
    try {
      const rendered = await renderSinglePagePdfToCanvas(file, 2.2);
      setSheetFile(file); setSheetRender(rendered); setDetections([]);
      const detectedTitle = extractLikelySheetTitle(rendered.textItems || []);
      setSheetTitle(detectedTitle);
      setStatus(detectedTitle ? `Drawing ready. Detected title: ${detectedTitle}` : "Drawing ready. Run the count after defining legend symbols.");
    } catch (err) {
      console.error(err); setStatus("Could not read the drawing PDF. Please upload a clean single-page PDF.");
    } finally { setIsLoadingSheet(false); }
  }

  function pointerToCanvasRect(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) };
  }

  function onLegendPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!legendCanvasRef.current || !legendRender) return;
    const pt = pointerToCanvasRect(event, legendCanvasRef.current);
    setDragRect({ x: pt.x, y: pt.y, w: 0, h: 0 });
  }

  function onLegendPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRect || !legendCanvasRef.current) return;
    const pt = pointerToCanvasRect(event, legendCanvasRef.current);
    setDragRect((r) => r ? ({ x: Math.min(r.x, pt.x), y: Math.min(r.y, pt.y), w: Math.abs(pt.x - r.x), h: Math.abs(pt.y - r.y) }) : null);
  }

  function onLegendPointerUp() {
    if (!dragRect || !legendRender || dragRect.w < 8 || dragRect.h < 8) { setDragRect(null); return; }
    setPendingCrop(cropCanvas(legendRender.canvas, dragRect));
    setForm((f) => ({ ...f, name: f.name || `Symbol ${symbolDefs.length + 1}` }));
    setDragRect(null);
  }

  function addSymbolDefinition() {
    if (!pendingCrop || !form.name.trim()) return;
    const meta = getDeviceMeta(form.type);
    setSymbolDefs((defs) => defs.concat({ id: createSafeId(), name: form.name.trim(), tag: form.tag.trim(), type: form.type, color: meta.color, canvas: pendingCrop }));
    setPendingCrop(null); setForm({ name: "", tag: "", type: "power" });
    setStatus("Legend symbol added. Continue adding symbols or upload the drawing PDF.");
  }

  function removeSymbol(id: string) {
    setSymbolDefs((defs) => defs.filter((d) => d.id !== id));
    setDetections((prev) => prev.filter((d) => d.symbolId !== id));
  }

  function runDetection() {
    if (!sheetRender || !symbolDefs.length) { setStatus("You need at least one legend symbol and one drawing PDF before detection can run."); return; }
    const ignoreAreas = getIgnoreAreas(sheetRender.canvas, ignoreTitleBlock);
    setStatus(`Scanning drawing. ${getDisregardBackgroundHint(sheetTitle)}`);
    setTimeout(() => {
      try {
        const found = detectTemplatesOnPage(sheetRender.canvas, symbolDefs, settings, { ignoreAreas });
        setDetections(found); setStatus(`Detection complete. ${found.length} devices highlighted for verification.`);
      } catch (err) {
        console.error(err); setStatus("Detection failed on this sheet. Try cleaner legend crops or adjust the thresholds.");
      }
    }, 20);
  }

  const selectionBoxStyle = getSelectionBoxStyle(dragRect, legendCanvasRef.current);
  const totalsByType = useMemo(() => {
    const map = new Map();
    detections.forEach((d) => map.set(d.type, (map.get(d.type) || 0) + 1));
    return DEVICE_TYPES.map((t) => ({ ...t, count: map.get(t.value) || 0 }));
  }, [detections]);

  return (
    <div className="app-shell">
      <div className="grid-two">
        <div className="left-column">
          <div className="hero panel">
            <div className="hero-title">Electrical Estimator Pro</div>
            <div className="hero-subtitle">Legend-first takeoff review for single-page PDFs. Symbols can still be counted even when many placed instances do not have nearby designation text, because the app compares placed symbols to the legend symbols.</div>
            <div className="status-box">{status}</div>
          </div>

          <div className="panel"><div className="panel-title">1. Upload legend PDF</div><input type="file" accept="application/pdf" disabled={isLoadingLegend} onChange={(e) => handleLegendUpload(e.target.files?.[0] || undefined)} />{legendFile && <div className="small-note">Loaded: {legendFile.name}</div>}</div>
          <div className="panel"><div className="panel-title">2. Upload single-page drawing PDF</div><input type="file" accept="application/pdf" disabled={!legendRender || isLoadingSheet} onChange={(e) => handleSheetUpload(e.target.files?.[0] || undefined)} />{sheetFile && <div className="small-note">Loaded: {sheetFile.name}</div>}</div>

          <div className="panel">
            <div className="panel-title">Legend symbols</div>
            <div className="small-note">Draw a box around a legend symbol, then classify it. Tag is optional because many placed symbols will not show nearby designation text.</div>
            {pendingCrop && (
              <div className="pending-box">
                <canvas ref={(node) => { if (!node || !pendingCrop) return; node.width = pendingCrop.width; node.height = pendingCrop.height; const ctx = node.getContext("2d")!; ctx.clearRect(0,0,node.width,node.height); ctx.drawImage(pendingCrop,0,0); }} className="symbol-preview" />
                <div className="form-grid">
                  <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Example: 2x4 LED fixture" /></label>
                  <label>Tag<input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="Optional: L1, DUP, SW" /></label>
                  <label>Type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{DEVICE_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></label>
                  <div className="button-row"><button className="button" onClick={addSymbolDefinition}>Add symbol</button><button className="button secondary" onClick={() => setPendingCrop(null)}>Cancel</button></div>
                </div>
              </div>
            )}
            <div className="symbol-list">
              {symbolDefs.length === 0 && <div className="muted-box">No legend symbols added yet.</div>}
              {symbolDefs.map((def) => (
                <div key={def.id} className="symbol-row">
                  <canvas ref={(node) => { if (!node) return; node.width = def.canvas.width; node.height = def.canvas.height; const ctx = node.getContext("2d")!; ctx.clearRect(0,0,node.width,node.height); ctx.drawImage(def.canvas,0,0); }} className="symbol-thumb" />
                  <div className="symbol-meta"><div className="summary-main">{def.name}</div><div className="summary-sub">{def.tag || "No tag"} · {getDeviceMeta(def.type).label}</div></div>
                  <button className="button secondary small" onClick={() => removeSymbol(def.id)}>Remove</button>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">Detection controls</div>
            <div className="small-note">{sheetTitle ? `Detected drawing title: ${sheetTitle}` : "Upload a drawing to detect the drawing title or detail title."}</div>
            <div className="small-note">{getDisregardBackgroundHint(sheetTitle)}</div>
            <label className="checkbox-row"><input type="checkbox" checked={ignoreTitleBlock} onChange={(e) => setIgnoreTitleBlock(e.target.checked)} />Ignore title block and obvious non-electrical zones</label>
            <label>Binary threshold: {settings.binaryThreshold}<input type="range" min="120" max="240" value={settings.binaryThreshold} onChange={(e) => setSettings({ ...settings, binaryThreshold: Number(e.target.value) })} /></label>
            <label>Match threshold: {settings.matchThreshold.toFixed(2)}<input type="range" min="0.4" max="0.9" step="0.01" value={settings.matchThreshold} onChange={(e) => setSettings({ ...settings, matchThreshold: Number(e.target.value) })} /></label>
            <label>Final score threshold: {settings.finalScoreThreshold.toFixed(2)}<input type="range" min="0.45" max="0.95" step="0.01" value={settings.finalScoreThreshold} onChange={(e) => setSettings({ ...settings, finalScoreThreshold: Number(e.target.value) })} /></label>
            <div className="button-row"><button className="button" disabled={!sheetRender || !symbolDefs.length} onClick={runDetection}>Run device count</button><button className="button secondary" onClick={() => setDetections([])}>Clear results</button></div>
            <div className="button-row">
              <button className="button secondary" disabled={!detections.length || !sheetCanvasRef.current || !overlayCanvasRef.current} onClick={() => exportAnnotatedPng(sheetCanvasRef.current!, overlayCanvasRef.current!)}>Download PNG markup</button>
              <button className="button secondary" disabled={!detections.length || !sheetRender || !overlayCanvasRef.current} onClick={() => exportAnnotatedPdf(sheetRender.bytes, overlayCanvasRef.current!, "annotated-takeoff.pdf")}>Download marked-up PDF</button>
            </div>
          </div>

          <SummaryTable detections={detections} />
        </div>

        <div className="right-column">
          <div className="panel">
            <div className="panel-title">Legend</div>
            <div className="canvas-wrap">
              {!legendRender && <div className="canvas-placeholder">Upload the legend PDF to begin.</div>}
              <canvas ref={legendCanvasRef} className="pdf-canvas" onPointerDown={onLegendPointerDown} onPointerMove={onLegendPointerMove} onPointerUp={onLegendPointerUp} />
              {selectionBoxStyle && <div className="selection-box" style={selectionBoxStyle} />}
            </div>
          </div>
          <div className="panel">
            <div className="panel-title">Drawing with markups</div>
            <div className="canvas-wrap">
              {!sheetRender && <div className="canvas-placeholder">Upload the drawing PDF after the legend is ready.</div>}
              <div className="sheet-stage"><canvas ref={sheetCanvasRef} className="pdf-canvas" /><canvas ref={overlayCanvasRef} className="overlay-canvas" /></div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-title">Live totals</div>
            <div className="totals-grid">{totalsByType.map((t) => <div key={t.value} className="total-card"><div className="summary-left"><span className="dot" style={{ backgroundColor: t.color }} /><div className="summary-sub">{t.label}</div></div><div className="total-number">{t.count}</div></div>)}</div>
          </div>
          <div className="panel">
            <div className="panel-title">Review list</div>
            <div className="review-list">
              {detections.length === 0 && <div className="muted-box">No review items yet.</div>}
              {detections.map((d, i) => (
                <div key={d.id} className="review-row" onMouseEnter={() => setHoveredDetection(d.id)} onMouseLeave={() => setHoveredDetection(null)}>
                  <div className="summary-left"><span className="dot" style={{ backgroundColor: d.color }} /><div><div className="summary-main">#{i + 1} · {d.label}</div><div className="summary-sub">{getDeviceMeta(d.type).label} · x={Math.round(d.x)}, y={Math.round(d.y)} · score {d.score.toFixed(2)}</div></div></div>
                  <div className="badge">{Math.round(d.w)} x {Math.round(d.h)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}