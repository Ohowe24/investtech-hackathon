"use client";

import { useState } from "react";
import type { Company, Dataset } from "@contract/types";
import { formatValue, recStyle } from "@/lib/format";
import { metricInfo } from "@/lib/explain";
import { Explain, Segmented } from "./ui";

const W = 760;
const H = 470;
const PAD = { left: 60, right: 16, top: 30, bottom: 46 };
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-medium text-muted">
          {(["pass", "mixed", "fail"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: recStyle[k].dot }} />
              {recStyle[k].label}
            </span>
          ))}
          <span className="h-3 w-px bg-line" />
          <span className="flex items-center gap-1.5">
            <span className="grid h-3.5 w-3.5 place-items-center rounded-full border border-ink"><span className="h-1.5 w-1.5 rounded-full bg-faint" /></span>
            Ringed = Canadian candidate
          </span>
        </div>
        <Segmented value={show} onChange={setShow} options={[
          { id: "all", label: "All" },
          { id: "candidates", label: "Canadian" },
          { id: "holdings", label: "Holdings" },
        ]} />
      </div>

      <div className="relative mx-auto max-w-4xl">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Company map" onMouseLeave={() => onHover(null)}>
          <defs>
            <linearGradient id="zone-good" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2f5454" stopOpacity={0.10} />
              <stop offset="1" stopColor="#2f5454" stopOpacity={0.03} />
            </linearGradient>
            <linearGradient id="zone-bad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#c8372d" stopOpacity={0.08} />
              <stop offset="1" stopColor="#c8372d" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          {/* Quiet zones: soft tints, the left band barely there. */}
          <rect x={left} y={top} width={tx - left} height={bottom - top} fill="#000" opacity={0.025} />
          <rect x={tx} y={top} width={right - tx} height={ty - top} fill="url(#zone-good)" />
          <rect x={tx} y={ty} width={right - tx} height={bottom - ty} fill="url(#zone-bad)" />

          {/* Light gridlines with axis ticks (chart scale only, not data). */}
          {ticks(x0, x1).map((v) => (
            <g key={`x${v}`}>
              <line x1={sx(v)} x2={sx(v)} y1={top} y2={bottom} stroke="#000" strokeOpacity={0.05} />
              <text x={sx(v)} y={bottom + 16} textAnchor="middle" className="fill-faint text-[10.5px] tabular-nums">{tickLabel(v, xUnit)}</text>
            </g>
          ))}
          {ticks(y0, y1).map((v) => (
            <g key={`y${v}`}>
              <line x1={left} x2={right} y1={sy(v)} y2={sy(v)} stroke="#000" strokeOpacity={0.05} />
              <text x={left - 8} y={sy(v) + 3.5} textAnchor="end" className="fill-faint text-[10.5px] tabular-nums">{tickLabel(v, yUnit)}</text>
            </g>
          ))}

          <line x1={tx} x2={tx} y1={top} y2={bottom} stroke="#2f5454" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="4 4" />
          <line x1={left} x2={right} y1={ty} y2={ty} stroke="#2f5454" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="4 4" />
          <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="#000" strokeOpacity={0.18} />

          <Zone x={tx + 12} y={top + 20} anchor="start" text={map.zones.topRight} className="fill-teal" />
          <Zone x={right - 12} y={bottom - 26} anchor="end" text={map.zones.bottomRight} className="fill-bad" />
          {/* The left side is one grey band (fails the acquirer line), so it gets one label, stacked at the bottom. */}
          <text x={(left + tx) / 2} y={bottom - 24} textAnchor="middle" pointerEvents="none"
            className="fill-faint text-[10px] font-semibold uppercase tracking-[0.12em]">
            {map.zones.topLeft.split(" · ")[0].split(" ").map((w, i) => <tspan key={i} x={(left + tx) / 2} dy={i === 0 ? 0 : 13}>{w}</tspan>)}
          </text>

          {/* Threshold values sit on the dashed lines as small pills. */}
          <ThresholdPill x={tx} y={top - 2} text={`≥ ${formatValue(map.xThreshold, xUnit)}`} anchor="middle" />
          <ThresholdPill x={right} y={ty} text={`≥ ${formatValue(map.yThreshold, yUnit)}`} anchor="end" />

          <text x={(left + right) / 2} y={H - 8} textAnchor="middle" className="fill-muted text-[11.5px] font-medium">{xDef?.label ?? map.x} →</text>
          <text x={14} y={(top + bottom) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(top + bottom) / 2})`} className="fill-muted text-[11.5px] font-medium">{yDef?.label ?? map.y} →</text>

          {focus && (
            <g pointerEvents="none">
              <line x1={sx(xv(focus))} x2={sx(xv(focus))} y1={sy(yv(focus))} y2={bottom} stroke="#000" strokeOpacity={0.35} strokeWidth={1} strokeDasharray="2 3" />
              <line x1={left} x2={sx(xv(focus))} y1={sy(yv(focus))} y2={sy(yv(focus))} stroke="#000" strokeOpacity={0.35} strokeWidth={1} strokeDasharray="2 3" />
            </g>
          )}

          {order.map((c) => {
            const cx = sx(xv(c));
            const cy = sy(yv(c));
            const isSel = c.ticker === selected;
            const isHot = c.ticker === hovered;
            const dim = hovered != null && !isHot && !isSel;
            const flip = cx > right - 70;
            return (
              <g key={c.ticker} onClick={() => onSelect(c.ticker)} onMouseEnter={() => onHover(c.ticker)}
                className="cursor-pointer" opacity={dim ? 0.3 : 1} style={{ transition: "opacity 150ms" }}>
                <circle cx={cx} cy={cy} r={16} fill="transparent" />
                {!c.inIndex && <circle cx={cx} cy={cy} r={isHot ? 12 : 10} fill="white" fillOpacity={0.6} stroke="#000" strokeWidth={1.25} style={{ transition: "r 150ms" }} />}
                <circle cx={cx} cy={cy} r={isHot || isSel ? 7 : 5.5} fill={dotColor(c)}
                  stroke="white" strokeWidth={1.5} style={{ transition: "r 150ms" }} />
                <text x={flip ? cx - (c.inIndex ? 10 : 15) : cx + (c.inIndex ? 10 : 15)} y={cy + 3.5} textAnchor={flip ? "end" : "start"}
                  stroke="white" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke"
                  className={`text-[11px] ${!c.inIndex || isHot ? "fill-ink font-semibold" : "fill-muted font-medium"}`}>
                  {c.ticker}{offChart(c) && <tspan className="fill-faint font-normal"> (off chart)</tspan>}
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

      <div className="mx-auto mt-2 flex max-w-4xl flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
        <span>Across: <Explain info={{ ...metricInfo(dataset, map.x), note: `Dashed line at ${formatValue(map.xThreshold, xUnit)}.` }} className="font-medium text-ink">{xDef?.label ?? map.x}</Explain></span>
        <span>Up: <Explain info={{ ...metricInfo(dataset, map.y), note: `Dashed line at ${formatValue(map.yThreshold, yUnit)}.` }} className="font-medium text-ink">{yDef?.label ?? map.y}</Explain></span>
      </div>

      {missing.length > 0 && (
        <p className="mx-auto mt-2 max-w-4xl text-xs text-muted">
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

/** Quadrant name: a small caps kicker, then the description. */
function Zone({ x, y, text, className, anchor }: { x: number; y: number; text: string; className: string; anchor: "start" | "end" }) {
  const [head, ...rest] = text.split(" · ");
  return (
    <text x={x} y={y} textAnchor={anchor} pointerEvents="none" className={className}>
      <tspan x={x} className="text-[10px] font-semibold uppercase tracking-[0.12em]">{head}</tspan>
      {rest.map((l, i) => <tspan key={i} x={x} dy={14} className="text-[12px] font-medium" fillOpacity={0.8}>{l}</tspan>)}
    </text>
  );
}

/** Small dark label pinned to a threshold line. */
function ThresholdPill({ x, y, text, anchor }: { x: number; y: number; text: string; anchor: "middle" | "end" }) {
  const w = text.length * 6 + 12;
  const rx = anchor === "middle" ? x - w / 2 : x - w;
  return (
    <g pointerEvents="none">
      <rect x={rx} y={y - 9} width={w} height={18} rx={9} fill="#2f5454" />
      <text x={rx + w / 2} y={y + 3.5} textAnchor="middle" className="fill-white text-[10px] font-semibold tabular-nums">{text}</text>
    </g>
  );
}

/** About five round tick values across [lo, hi]. Chart scale only. */
function ticks(lo: number, hi: number): number[] {
  const raw = (hi - lo) / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

function tickLabel(v: number, unit: string): string {
  if (unit === "pct") return `${Math.round(v * 100)}%`;
  if (unit === "multiple") return `${+v.toFixed(1)}×`;
  return `${+v.toFixed(2)}`;
}
