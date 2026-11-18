"use client";

import { useState } from "react";
import type { Company, Dataset } from "@contract/types";
import { formatValue, recStyle } from "@/lib/format";

const REC_COLOR = { pass: "var(--color-teal)", mixed: "var(--color-warn)", fail: "var(--color-bad)" } as const;
import { metricInfo } from "@/lib/explain";
import { Explain, Segmented } from "./ui";

const W = 760;
const H = 470;
const PAD = { left: 60, right: 16, top: 30, bottom: 46 };
// Chart frame only (not data): it fits every plotted company, except true outliers (beyond three
// interquartile ranges), which are pinned to the edge and marked, so one extreme value cannot squash the rest.
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
  const X_WINDOW = frame(plotted.map(rawX), map.xThreshold);
  const Y_WINDOW = frame(plotted.map(rawY), map.yThreshold);
  const xv = (c: Company) => clamp(rawX(c), X_WINDOW);
  const yv = (c: Company) => clamp(rawY(c), Y_WINDOW);
  const offChart = (c: Company) => xv(c) !== rawX(c) || yv(c) !== rawY(c);

  // Scale from ALL plotted companies so the frame does not jump when the filter changes.
  const xs = [...plotted.map(xv), map.xThreshold];
  const ys = [...plotted.map(yv), map.yThreshold];
  const pad = (lo: number, hi: number) => {
    const span = hi - lo || Math.abs(hi) || 1;
    return [lo - span * 0.14, hi + span * 0.14] as const;
  };
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
  const sx = (v: number) => PAD.left + ((v - x0) / (x1 - x0)) * (W - PAD.left - PAD.right);
  const sy = (v: number) => H - PAD.bottom - ((v - y0) / (y1 - y0)) * (H - PAD.top - PAD.bottom);

  const goodRight = xDef?.higherIsBetter !== false;
  const goodUp = yDef?.higherIsBetter !== false;
  const tx = sx(map.xThreshold);
  const ty = sy(map.yThreshold);
  const left = PAD.left;
  const right = W - PAD.right;
  const top = PAD.top;
  const bottom = H - PAD.bottom;

  const focus = companies.find((c) => c.ticker === hovered && has(c)) ?? null;
  const dotColor = (c: Company) => (c.model ? REC_COLOR[c.model.recommendation] : "var(--color-faint)");
  // Draw the hovered and selected dots last so they sit on top.
  const order = plotted.filter(visible).sort((a, b) => Number(a.ticker === hovered || a.ticker === selected) - Number(b.ticker === hovered || b.ticker === selected));

  // Radar: a beam turns around the crosshair where the two pass lines meet; each dot pings as the beam passes it.
  const SWEEP_S = 6;
  const reach = Math.max(...[[left, top], [right, top], [left, bottom], [right, bottom]].map(([x, y]) => Math.hypot(x - tx, y - ty)));
  const wedge = (a0: number, a1: number) => {
    const r = (a: number) => (a * Math.PI) / 180;
    return `M${tx},${ty} L${tx + reach * Math.cos(r(a0))},${ty + reach * Math.sin(r(a0))} A${reach},${reach} 0 0 1 ${tx + reach * Math.cos(r(a1))},${ty + reach * Math.sin(r(a1))} Z`;
  };
  const pingDelay = (cx: number, cy: number) => {
    const deg = ((Math.atan2(cy - ty, cx - tx) * 180) / Math.PI + 360) % 360;
    return (deg / 360) * SWEEP_S;
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-medium text-muted">
          {(["pass", "mixed", "fail"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: REC_COLOR[k] }} />
              {recStyle[k].label}
            </span>
          ))}
          <span className="h-3 w-px bg-line" />
          <span className="flex items-center gap-1.5">
            <span className="grid h-3.5 w-3.5 place-items-center rounded-full border border-ink"><span className="h-1.5 w-1.5 rounded-full bg-faint" /></span>
            Ringed = Canadian candidate
          </span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] border border-dashed border-faint" />Dashed = your stock</span>
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
              <stop offset="0" stopColor="var(--color-teal)" stopOpacity={0.10} />
              <stop offset="1" stopColor="var(--color-teal)" stopOpacity={0.03} />
            </linearGradient>
            <linearGradient id="zone-bad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="var(--color-bad)" stopOpacity={0.08} />
              <stop offset="1" stopColor="var(--color-bad)" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          {/* Quiet zones: the better quadrant (per each metric's direction) tinted green, the worse one red. */}
          <rect x={goodRight ? tx : left} y={goodUp ? top : ty} width={goodRight ? right - tx : tx - left} height={goodUp ? ty - top : bottom - ty} fill="url(#zone-good)" />
          <rect x={goodRight ? left : tx} y={goodUp ? ty : top} width={goodRight ? tx - left : right - tx} height={goodUp ? bottom - ty : ty - top} fill="url(#zone-bad)" />

          {/* Light gridlines with axis ticks (chart scale only, not data). */}
          {ticks(x0, x1).map((v) => (
            <g key={`x${v}`}>
              <line x1={sx(v)} x2={sx(v)} y1={top} y2={bottom} stroke="var(--color-ink)" strokeOpacity={0.05} />
              <text x={sx(v)} y={bottom + 16} textAnchor="middle" className="fill-faint text-[10.5px] tabular-nums">{tickLabel(v, xUnit)}</text>
            </g>
          ))}
          {ticks(y0, y1).map((v) => (
            <g key={`y${v}`}>
              <line x1={left} x2={right} y1={sy(v)} y2={sy(v)} stroke="var(--color-ink)" strokeOpacity={0.05} />
              <text x={left - 8} y={sy(v) + 3.5} textAnchor="end" className="fill-faint text-[10.5px] tabular-nums">{tickLabel(v, yUnit)}</text>
            </g>
          ))}

          <clipPath id="plot-clip"><rect x={left} y={top} width={right - left} height={bottom - top} /></clipPath>
          <g clipPath="url(#plot-clip)" pointerEvents="none" className="a-fade" style={{ animationDelay: "900ms" }}>
            <g style={{ transformBox: "view-box", transformOrigin: `${tx}px ${ty}px`, animation: `sweep ${SWEEP_S}s linear infinite` }}>
              {Array.from({ length: 14 }, (_, i) => (
                <path key={i} d={wedge(-42 + i * 3, -39 + i * 3)} fill="#3ddc6c" opacity={0.004 + i * i * 0.0007} />
              ))}
              <line x1={tx} y1={ty} x2={tx + reach} y2={ty} stroke="#3ddc6c" strokeOpacity={0.55} strokeWidth={1.25} />
            </g>
            {[0.25, 0.5, 0.75].map((f) => (
              <circle key={f} cx={tx} cy={ty} r={reach * f} fill="none" stroke="var(--color-ink)" strokeOpacity={0.07} strokeDasharray="2 5" />
            ))}
          </g>

          <line x1={tx} x2={tx} y1={top} y2={bottom} stroke="var(--color-ink)" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="4 4"
            className="a-grow-y" style={{ transformOrigin: "center top", animationDelay: "150ms" }} />
          <line x1={left} x2={right} y1={ty} y2={ty} stroke="var(--color-ink)" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="4 4"
            className="a-grow-x" style={{ transformBox: "fill-box", animationDelay: "250ms" }} />
          <circle cx={tx} cy={ty} r={3} fill="var(--color-ink)" className="a-pop" style={{ animationDelay: "500ms" }} />
          <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="var(--color-ink)" strokeOpacity={0.18} />

          {/* Each zone named in a corner of its quadrant that no dot sits in (outer corner first, then the one by the crosshair). */}
          {(["topLeft", "topRight", "bottomLeft", "bottomRight"] as const).map((k) => {
            const isRight = k.endsWith("Right"), isTop = k.startsWith("top");
            const tone = isRight === goodRight && isTop === goodUp ? "fill-teal" : isRight !== goodRight && isTop !== goodUp ? "fill-bad" : "fill-faint";
            const outerX = isRight ? right - 12 : left + 12, innerX = isRight ? tx + 12 : tx - 12;
            const outerY = isTop ? top + 18 : bottom - 26, innerY = isTop ? ty - 26 : ty + 18;
            const spots = [[outerX, outerY, isRight ? "end" : "start"], [innerX, innerY, isRight ? "start" : "end"], [outerX, innerY, isRight ? "end" : "start"], [innerX, outerY, isRight ? "start" : "end"]] as const;
            const free = spots.find(([x, y, anchor]) => {
              const x0 = anchor === "start" ? x : x - 190, x1 = anchor === "start" ? x + 190 : x;
              const inQuad = (anchor === "start" ? x1 : x0) > left && (anchor === "start" ? x1 : x0) < right;
              return inQuad && !plotted.some((c) => { const px = sx(xv(c)), py = sy(yv(c)); return px > x0 - 24 && px < x1 + 24 && py > y - 22 && py < y + 30; });
            });
            return free ? <Zone key={k} x={free[0]} y={free[1]} anchor={free[2]} text={map.zones[k]} className={tone} /> : null;
          })}

          {/* The two bars sit on their dashed lines as small pills. */}
          <ThresholdPill x={tx} y={top - 2} text={`${goodRight ? "≥" : "≤"} ${formatValue(map.xThreshold, xUnit)}`} anchor="middle" />
          <ThresholdPill x={left + 4} y={ty} text={`${goodUp ? "≥" : "≤"} ${formatValue(map.yThreshold, yUnit)}`} anchor="start" />

          <text x={(left + right) / 2} y={H - 8} textAnchor="middle" className="fill-muted text-[11.5px] font-medium">{xDef?.label ?? map.x} →</text>
          <text x={14} y={(top + bottom) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(top + bottom) / 2})`} className="fill-muted text-[11.5px] font-medium">{yDef?.label ?? map.y} →</text>

          {focus && (
            <g pointerEvents="none">
              <line x1={sx(xv(focus))} x2={sx(xv(focus))} y1={sy(yv(focus))} y2={bottom} stroke="var(--color-ink)" strokeOpacity={0.35} strokeWidth={1} strokeDasharray="2 3" />
              <line x1={left} x2={sx(xv(focus))} y1={sy(yv(focus))} y2={sy(yv(focus))} stroke="var(--color-ink)" strokeOpacity={0.35} strokeWidth={1} strokeDasharray="2 3" />
            </g>
          )}

          {order.map((c) => {
            const cx = sx(xv(c));
            const cy = sy(yv(c));
            const isSel = c.ticker === selected;
            const isHot = c.ticker === hovered;
            const dim = hovered != null && !isHot && !isSel;
            const flip = cx > right - 70;
            const fly = { ["--fx" as string]: `${tx - cx}px`, ["--fy" as string]: `${ty - cy}px`, animationDelay: `${450 + plotted.indexOf(c) * 45}ms` };
            return (
              <g key={c.ticker} onClick={() => onSelect(c.ticker)} onMouseEnter={() => onHover(c.ticker)}
                className="cursor-pointer" opacity={dim ? 0.3 : 1} style={{ transition: "opacity 150ms" }}>
              <g className="map-fly" style={fly}>
                <circle cx={cx} cy={cy} r={6} fill="none" stroke={c.inIndex ? dotColor(c) : "var(--color-signal)"} strokeWidth={c.inIndex ? 1.5 : 2}
                  pointerEvents="none" className="map-ping" style={{ animationDelay: `${pingDelay(cx, cy)}s`, animationDuration: `${SWEEP_S}s` }} />
                <circle cx={cx} cy={cy} r={16} fill="transparent" />
                {c.inIndex && <rect x={cx - 11} y={cy - 11} width={22} height={22} rx={5} fill="none" stroke="var(--color-faint)" strokeWidth={1.2} strokeDasharray="3 3" />}
                {!c.inIndex && <circle cx={cx} cy={cy} r={isHot ? 12 : 10} fill="var(--panel-solid)" fillOpacity={0.6} stroke="var(--color-ink)" strokeWidth={1.25} style={{ transition: "r 150ms" }} />}
                <circle cx={cx} cy={cy} r={isHot || isSel ? 7 : 5.5} fill={dotColor(c)}
                  stroke="var(--panel-solid)" strokeWidth={1.5} style={{ transition: "r 150ms" }} />
                <text x={flip ? cx - (c.inIndex ? 10 : 15) : cx + (c.inIndex ? 10 : 15)} y={cy + 3.5} textAnchor={flip ? "end" : "start"}
                  stroke="var(--panel-solid)" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke"
                  className={`text-[11px] ${!c.inIndex || isHot ? "fill-ink font-semibold" : "fill-muted font-medium"}`}>
                  {c.ticker}{offChart(c) && <tspan className="fill-faint font-normal"> (off chart)</tspan>}
                </text>
              </g>
              </g>
            );
          })}
        </svg>

        {focus && (
          <div className="pointer-events-none absolute z-10 w-56 rounded-lg bg-[#0a0a0a] p-3 text-xs text-white shadow-xl ring-1 ring-white/10"
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
              {focus.model?.score && (
                <div className="flex justify-between">
                  <span>Quality score</span>
                  <span className="tabular-nums text-white">{focus.model.score.value == null ? "—" : `${focus.model.score.value} / 100`}</span>
                </div>
              )}
            </div>
            {offChart(focus) && <div className="mt-1 text-white/55">Value is beyond the chart; shown at the edge.</div>}
          </div>
        )}
      </div>

      <div className="mx-auto mt-4 grid max-w-4xl gap-2 sm:grid-cols-2">
        {(["topLeft", "topRight", "bottomLeft", "bottomRight"] as const).map((k) => {
          const isRight = k.endsWith("Right"), isTop = k.startsWith("top");
          const good = isRight === goodRight && isTop === goodUp, bad = isRight !== goodRight && isTop !== goodUp;
          const here = plotted.filter((c) => c.zone === map.zones[k]);
          return (
            <div key={k} className={`rounded-xl border px-3.5 py-2.5 ${good ? "border-teal/40 bg-tealsoft" : bad ? "border-bad/40 bg-badsoft" : "border-line"}`}>
              <div className={`text-[12.5px] font-semibold ${good ? "text-teal" : bad ? "text-bad" : "text-ink"}`}>{map.zones[k]}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {here.length ? here.map((c) => (
                  <button key={c.ticker} onClick={() => onSelect(c.ticker)} onMouseEnter={() => onHover(c.ticker)} onMouseLeave={() => onHover(null)}
                    className="inline-flex items-center gap-1 rounded-md border border-line bg-[var(--panel-hi)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink hover:border-ink">
                    {c.ticker}{c.model?.score?.value != null && <span className="font-normal text-faint">{c.model.score.value}</span>}
                  </button>
                )) : <span className="text-xs text-faint">None</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mx-auto mt-3 flex max-w-4xl flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
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
function ThresholdPill({ x, y, text, anchor }: { x: number; y: number; text: string; anchor: "middle" | "end" | "start" }) {
  const w = text.length * 6 + 12;
  const rx = anchor === "middle" ? x - w / 2 : anchor === "start" ? x : x - w;
  return (
    <g pointerEvents="none">
      <rect x={rx} y={y - 9} width={w} height={18} rx={9} fill="var(--color-ink)" />
      <text x={rx + w / 2} y={y + 3.5} textAnchor="middle" className="text-[10px] font-semibold tabular-nums" fill="var(--panel-solid)">{text}</text>
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
  if (unit === "pct") return `${+(v * 100).toFixed(Math.abs(v * 100) % 1 < 1e-9 ? 0 : 1)}%`;
  if (unit === "multiple") return `${+v.toFixed(1)}×`;
  return `${+v.toFixed(2)}`;
}

/** The chart frame on one axis: every value and the bar, with true outliers (beyond 3 IQR of the quartiles) left out. Chart scale only. */
function frame(values: number[], bar: number): readonly [number, number] {
  const v = [...values].sort((a, b) => a - b);
  if (v.length < 4) return [Math.min(bar, ...v), Math.max(bar, ...v)] as const;
  const q = (p: number) => v[Math.floor(p * (v.length - 1))];
  const iqr = q(0.75) - q(0.25);
  const lo = iqr > 0 ? q(0.25) - 3 * iqr : v[0];
  const hi = iqr > 0 ? q(0.75) + 3 * iqr : v[v.length - 1];
  return [Math.min(bar, Math.max(lo, v[0])), Math.max(bar, Math.min(hi, v[v.length - 1]))] as const;
}
