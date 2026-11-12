"use client";

import type { Dataset } from "@contract/types";
import { formatValue, verdictStyle } from "@/lib/format";

const W = 640;
const H = 420;
const PAD = { left: 64, right: 24, top: 24, bottom: 52 };

interface Props {
  dataset: Dataset;
  selected: string | null;
  onSelect: (ticker: string) => void;
}

export default function ScatterMap({ dataset, selected, onSelect }: Props) {
  const { map, metricDefs, companies } = dataset;
  const xDef = metricDefs.find((d) => d.id === map.x);
  const yDef = metricDefs.find((d) => d.id === map.y);

  const plotted = companies.filter((c) => c.metrics[map.x]?.value != null && c.metrics[map.y]?.value != null);
  const missing = companies.filter((c) => !plotted.includes(c));

  const xs = [...plotted.map((c) => c.metrics[map.x].value as number), map.xThreshold];
  const ys = [...plotted.map((c) => c.metrics[map.y].value as number), map.yThreshold];
  const pad = (lo: number, hi: number) => {
    const span = hi - lo || Math.abs(hi) || 1;
    return [lo - span * 0.12, hi + span * 0.12] as const;
  };
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));

  const sx = (v: number) => PAD.left + ((v - x0) / (x1 - x0)) * (W - PAD.left - PAD.right);
  const sy = (v: number) => H - PAD.bottom - ((v - y0) / (y1 - y0)) * (H - PAD.top - PAD.bottom);

  const tx = sx(map.xThreshold);
  const ty = sy(map.yThreshold);
  const left = PAD.left;
  const right = W - PAD.right;
  const top = PAD.top;
  const bottom = H - PAD.bottom;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Company map">
        <rect x={tx} y={top} width={right - tx} height={ty - top} fill="#f0fdf4" />
        <rect x={left} y={ty} width={tx - left} height={bottom - ty} fill="#f8fafc" />
        <rect x={tx} y={ty} width={right - tx} height={bottom - ty} fill="#fef2f2" />
        <rect x={left} y={top} width={tx - left} height={ty - top} fill="#f8fafc" />
        <rect x={left} y={top} width={right - left} height={bottom - top} fill="none" stroke="#cbd5e1" />
        <line x1={tx} x2={tx} y1={top} y2={bottom} stroke="#94a3b8" strokeDasharray="4 4" />
        <line x1={left} x2={right} y1={ty} y2={ty} stroke="#94a3b8" strokeDasharray="4 4" />

        <text x={right - 8} y={top + 18} textAnchor="end" className="fill-green-700 text-[13px] font-medium">{map.zones.topRight}</text>
        <text x={left + 8} y={top + 18} className="fill-slate-500 text-[13px] font-medium">{map.zones.topLeft}</text>
        <text x={right - 8} y={bottom - 10} textAnchor="end" className="fill-red-700 text-[13px] font-medium">{map.zones.bottomRight}</text>
        <text x={left + 8} y={bottom - 10} className="fill-slate-500 text-[13px] font-medium">{map.zones.bottomLeft}</text>

        <text x={(left + right) / 2} y={H - 14} textAnchor="middle" className="fill-slate-600 text-[13px]">{xDef?.label ?? map.x} →</text>
        <text x={16} y={(top + bottom) / 2} textAnchor="middle" transform={`rotate(-90 16 ${(top + bottom) / 2})`} className="fill-slate-600 text-[13px]">{yDef?.label ?? map.y} →</text>
        <text x={tx} y={bottom + 16} textAnchor="middle" className="fill-slate-400 text-[11px]">{formatValue(map.xThreshold, xDef?.unit ?? "pct")}</text>
        <text x={left - 6} y={ty + 4} textAnchor="end" className="fill-slate-400 text-[11px]">{formatValue(map.yThreshold, yDef?.unit ?? "pct")}</text>

        {plotted.map((c) => {
          const cx = sx(c.metrics[map.x].value as number);
          const cy = sy(c.metrics[map.y].value as number);
          const isSel = c.ticker === selected;
          return (
            <g key={c.ticker} onClick={() => onSelect(c.ticker)} className="cursor-pointer">
              <circle cx={cx} cy={cy} r={isSel ? 10 : 7} fill={verdictStyle[c.verdict].dot} fillOpacity={0.85}
                stroke={c.inIndex ? "#0f172a" : "white"} strokeWidth={c.inIndex ? 2.5 : 1.5} />
              <text x={cx + 12} y={cy + 4} className={`text-[12px] ${isSel ? "fill-slate-900 font-semibold" : "fill-slate-700"}`}>{c.ticker}</text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {Object.entries(verdictStyle).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: v.dot }} />
            {v.label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-slate-900" /> Already in index
        </span>
      </div>

      {missing.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Not on the map (missing data):{" "}
          {missing.map((c, i) => (
            <button key={c.ticker} onClick={() => onSelect(c.ticker)} className="underline hover:text-slate-800">
              {c.ticker}{i < missing.length - 1 ? ", " : ""}
            </button>
          ))}
        </p>
      )}
    </div>
  );
}
