import React, { useMemo } from "react";
import { exportCsv } from "../lib/export";
import { getDeviceMeta } from "../lib/constants";
export default function SummaryTable({ detections }: { detections: any[] }) {
  const counts = useMemo(() => {
    const map = new Map();
    detections.forEach((d) => {
      const key = `${d.type}__${d.tag || d.label}`;
      const curr = map.get(key) || { type: d.type, tag: d.tag || d.label, count: 0, color: d.color };
      curr.count += 1;
      map.set(key, curr);
    });
    return Array.from(map.values()).sort((a: any, b: any) => a.type.localeCompare(b.type) || a.tag.localeCompare(b.tag));
  }, [detections]);
  return (
    <div className="panel">
      <div className="panel-title">Count summary</div>
      <div className="summary-list">
        {counts.length === 0 && <div className="muted-box">No detections yet.</div>}
        {counts.map((row: any) => (
          <div key={`${row.type}-${row.tag}`} className="summary-row">
            <div className="summary-left">
              <span className="dot" style={{ backgroundColor: row.color }} />
              <div><div className="summary-main">{row.tag}</div><div className="summary-sub">{getDeviceMeta(row.type).label}</div></div>
            </div>
            <div className="badge">{row.count}</div>
          </div>
        ))}
      </div>
      {!!counts.length && <button className="button secondary wide" onClick={() => exportCsv(counts)}>Download counts CSV</button>}
    </div>
  );
}