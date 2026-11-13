"use client";

import { useState } from "react";
import type { Company, Dataset } from "@contract/types";
import { formatValue, recStyle } from "@/lib/format";
import { metricInfo } from "@/lib/explain";
import { Explain, Segmented } from "./ui";

const W = 680;
const H = 440;
const PAD = { left: 56, right: 20, top: 20, bottom: 46 };
// Chart window only (not data): values beyond it are pinned to the edge and marked,
// so one extreme company cannot squash everyone else into a corner.
const X_WINDOW = [-0.1, 1.6] as const;
const Y_WINDOW = [-0.1, 0.3] as const;
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

interface Props {
  dataset: Dataset;
  hovered: string | null;
  onHover: (ticker: string | null) => void;
  onSelect: (ticker: string) => void;
}

type Show = "all" | "candidates" | "holdings";

export default function ScatterMap({ dataset, hovered, onHover, onSelect }: Props) {
  const [show, setShow] = useState<Show>("all");
  const selected: string | null = null;
  const { map, metricDefs, companies } = dataset;
  const xDef = metricDefs.find((d) => d.id === map.x);
  const yDef = metricDefs.find((d) => d.id === map.y);
  const xUnit = xDef?.unit ?? "pct";
  const yUnit = yDef?.unit ?? "pct";

  const has = (c: Company) => c.metrics[map.x]?.value != null && c.metrics[map.y]?.value != null;
  const visible = (c: Company) => show === "all" || (show === "candidates" ? !c.inIndex : c.inIndex);
  const plotted = companies.filter(has);
  const missing = companies.filter((c) => !has(c));

  const rawX = (c: Company) => c.metrics[map.x].value as number;
  const rawY = (c: Company) => c.metrics[map.y].value as number;
  const xv = (c: Company) => clamp(rawX(c), X_WINDOW);
  const yv = (c: Company) => clamp(rawY(c), Y_WINDOW);
  const offChart = (c: Company) => xv(c) !== rawX(c) || yv(c) !== rawY(c);

  // Scale from ALL plotted companies so the frame does not jump when the filter changes.
  const xs = [...plotted.map(xv), map.xThreshold];
  const ys = [...plotted.map(yv), map.yThreshold];
  const pad = (lo: number, hi: number) => {
    const span = hi - lo || Math.abs(hi) || 1;
    return [lo - span * 0.08, hi + span * 0.08] as const;
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

  const focus = companies.find((c) => c.ticker === hovered && has(c)) ?? null;
  const dotColor = (c: Company) => (c.model ? recStyle[c.model.recommendation].dot : "#9a9a9a");
  // Draw the hovered and selected dots last so they sit on top.
  const order = plotted.filter(visible).sort((a, b) => Number(a.ticker === hovered || a.ticker === selected) - Number(b.ticker === hovered || b.ticker === selected));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          {(["pass", "mixed", "fail"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: recStyle[k].dot }} />
              {recStyle[k].label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-ink bg-white" /> Black ring = candidate
          </span>
        </div>
        <Segmented value={show} onChange={setShow} options={[
          { id: "all", label: "All" },
          { id: "candidates", label: "Canadian" },
          { id: "holdings", label: "Holdings" },
        ]} />
      </div>

      <div className="relative mx-auto max-w-3xl">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Company map" onMouseLeave={() => onHover(null)}>
          <rect x={tx} y={top} width={right - tx} height={ty - top} fill="#e6eeee" />
          <rect x={tx} y={ty} width={right - tx} height={bottom - ty} fill="#fbe9e7" opacity={0.6} />
          <rect x={left} y={top} width={tx - left} height={bottom - top} fill="#f5f5f5" />
          <line x1={tx} x2={tx} y1={top} y2={bottom} stroke="#000" strokeWidth={1} strokeDasharray="2 4" />
          <line x1={left} x2={right} y1={ty} y2={ty} stroke="#000" strokeWidth={1} strokeDasharray="2 4" />
          <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="#000" />
          <line x1={left} x2={left} y1={top} y2={bottom} stroke="#000" />

          <Zone x={(tx + right) / 2} y={top + 20} text={map.zones.topRight} className="fill-teal font-semibold" />
          <Zone x={(tx + right) / 2} y={bottom - 26} text={map.zones.bottomRight} className="fill-bad font-semibold" />
          {/* The left side is one grey band (fails the acquirer line), so it gets one label. */}
          <text x={(left + tx) / 2} y={(top + bottom) / 2} textAnchor="middle" transform={`rotate(-90 ${(left + tx) / 2} ${(top + bottom) / 2})`}
            className="fill-faint text-[12px] font-medium">{map.zones.topLeft.split(" · ")[0]}</text>

          <text x={(left + right) / 2} y={H - 8} textAnchor="middle" className="fill-muted text-[12px]">{xDef?.label ?? map.x} →</text>
          <text x={14} y={(top + bottom) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(top + bottom) / 2})`} className="fill-muted text-[12px]">{yDef?.label ?? map.y} →</text>
          <text x={tx} y={bottom + 16} textAnchor="middle" className="fill-faint text-[11px]">{formatValue(map.xThreshold, xUnit)}</text>
          <text x={left - 6} y={ty + 4} textAnchor="end" className="fill-faint text-[11px]">{formatValue(map.yThreshold, yUnit)}</text>

          {focus && (
            <g pointerEvents="none">
              <line x1={sx(xv(focus))} x2={sx(xv(focus))} y1={sy(yv(focus))} y2={bottom} stroke="#000" strokeWidth={0.75} />
              <line x1={left} x2={sx(xv(focus))} y1={sy(yv(focus))} y2={sy(yv(focus))} stroke="#000" strokeWidth={0.75} />
            </g>
          )}

          {order.map((c) => {
            const cx = sx(xv(c));
            const cy = sy(yv(c));
            const isSel = c.ticker === selected;
            const isHot = c.ticker === hovered;
            const dim = hovered != null && !isHot && !isSel;
            return (
              <g key={c.ticker} onClick={() => onSelect(c.ticker)} onMouseEnter={() => onHover(c.ticker)}
                className="cursor-pointer" opacity={dim ? 0.35 : 1} style={{ transition: "opacity 120ms" }}>
                <circle cx={cx} cy={cy} r={16} fill="transparent" />
                {isSel && <circle cx={cx} cy={cy} r={13} fill="none" stroke="#000" strokeWidth={1} />}
                <circle cx={cx} cy={cy} r={isHot || isSel ? 8.5 : 6.5} fill={dotColor(c)}
                  stroke={c.inIndex ? "white" : "#000"} strokeWidth={c.inIndex ? 1.5 : 2.5} style={{ transition: "r 120ms" }} />
                <text x={cx > right - 60 ? cx - 12 : cx + 12} y={cy + 4} textAnchor={cx > right - 60 ? "end" : "start"} className={`text-[11.5px] ${isSel || isHot ? "fill-ink font-semibold" : "fill-muted"}`}>
                  {c.ticker}{offChart(c) ? " (off chart)" : ""}
                </text>
              </g>
            );
          })}
        </svg>

        {focus && (
          <div className="pointer-events-none absolute z-10 w-56 rounded-lg bg-ink p-3 text-xs text-white shadow-xl"
            style={{
              left: `${(sx(xv(focus)) / W) * 100}%`,
              top: `${(sy(yv(focus)) / H) * 100}%`,
              transform: `translate(${sx(xv(focus)) > W * 0.6 ? "calc(-100% - 16px)" : "16px"}, ${sy(yv(focus)) > H * 0.6 ? "calc(-100% - 8px)" : "8px"})`,
            }}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{focus.ticker} · {focus.name}</span>
            </div>
            <div className="mt-2 space-y-1 text-white/75">
              <div className="flex justify-between"><span>{xDef?.label}</span><span className="tabular-nums text-white">{formatValue(rawX(focus), xUnit)}</span></div>
              <div className="flex justify-between"><span>{yDef?.label}</span><span className="tabular-nums text-white">{formatValue(rawY(focus), yUnit)}</span></div>
              {focus.model && (
                <div className="flex justify-between border-t border-white/15 pt-1">
                  <span>Result</span>
                  <span className="text-white">{recStyle[focus.model.recommendation].label}</span>
                </div>
              )}
            </div>
            {offChart(focus) && <div className="mt-1 text-white/55">Value is beyond the chart; shown at the edge.</div>}
          </div>
        )}
      </div>

      <div className="mx-auto mt-2 flex max-w-3xl flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
        <span>Across: <Explain info={{ ...metricInfo(dataset, map.x), note: `Dashed line at ${formatValue(map.xThreshold, xUnit)}.` }} className="font-medium text-ink">{xDef?.label ?? map.x}</Explain></span>
        <span>Up: <Explain info={{ ...metricInfo(dataset, map.y), note: `Dashed line at ${formatValue(map.yThreshold, yUnit)}.` }} className="font-medium text-ink">{yDef?.label ?? map.y}</Explain></span>
      </div>

      {missing.length > 0 && (
        <p className="mx-auto mt-2 max-w-3xl text-xs text-muted">
          Not shown (a value is missing):{" "}
          {missing.map((c, i) => (
            <button key={c.ticker} onClick={() => onSelect(c.ticker)} className="underline hover:text-ink">
              {c.ticker}{i < missing.length - 1 ? ", " : ""}
            </button>
          ))}
        </p>
      )}

    </div>
  );
}

/** Quadrant name, split onto two lines at " · ". */
function Zone({ x, y, text, className }: { x: number; y: number; text: string; className: string }) {
  const lines = text.split(" · ");
  return (
    <text x={x} y={y} textAnchor="middle" pointerEvents="none" className={`text-[12px] ${className}`}>
      {lines.map((l, i) => <tspan key={i} x={x} dy={i === 0 ? 0 : 14}>{l}</tspan>)}
    </text>
  );
}
