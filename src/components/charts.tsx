"use client";

import { useState, type ReactNode } from "react";
import { useInView } from "./live/motion";

/** Series colours: ink, the dark teal, a light teal, a warm ochre, grey. */
export const C = { ink: "var(--color-ink)", teal: "var(--color-teal)", sea: "#8fb3b3", ochre: "#c9982a", grey: "#b5b5b5", bad: "var(--color-bad)" };

export interface Series {
  label: string;
  values: (number | null | undefined)[];
  kind: "bar" | "line";
  color: string;
  /** which scale the series is drawn on; default left */
  axis?: "left" | "right";
  dashed?: boolean;
}

export interface RefLine {
  value: number;
  label: string;
  axis?: "left" | "right";
}

interface Props {
  years: number[];
  series: Series[];
  fmtLeft: (v: number) => string;
  fmtRight?: (v: number) => string;
  refs?: RefLine[];
  height?: number;
}

const W = 520;
const PAD = { left: 46, right: 46, top: 12, bottom: 24 };

/** Round a domain outward to a tidy step so the axis labels are short. */
function nice(min: number, max: number): { min: number; max: number; ticks: number[] } {
  if (min === max) max = min + 1;
  const raw = (max - min) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
  return { min: lo, max: hi, ticks };
}

/** Bars and lines by fiscal year, on one or two scales. Hover a year to read every series. Missing years leave a gap. */
export function TrendChart({ years, series, fmtLeft, fmtRight, refs = [], height = 210 }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const H = height;
  const hasRight = series.some((s) => s.axis === "right");
  const padR = hasRight ? PAD.right : 12;
  const band = (W - PAD.left - padR) / Math.max(years.length, 1);
  const cx = (i: number) => PAD.left + band * (i + 0.5);

  const domain = (axis: "left" | "right") => {
    const vals = [
      ...series.filter((s) => (s.axis ?? "left") === axis).flatMap((s) => s.values),
      ...refs.filter((r) => (r.axis ?? "left") === axis).map((r) => r.value),
    ].filter((v): v is number => v != null);
    if (vals.length === 0) return null;
    return nice(Math.min(0, ...vals), Math.max(0, ...vals));
  };
  const dl = domain("left");
  const dr = domain("right");
  const y = (v: number, axis: "left" | "right" = "left") => {
    const d = axis === "right" ? dr : dl;
    if (!d) return H - PAD.bottom;
    return PAD.top + (1 - (v - d.min) / (d.max - d.min)) * (H - PAD.top - PAD.bottom);
  };
  const fmt = (s: Series) => (s.axis === "right" && fmtRight ? fmtRight : fmtLeft);

  const bars = series.filter((s) => s.kind === "bar");
  const lines = series.filter((s) => s.kind === "line");
  const barW = (band * 0.68) / Math.max(bars.length, 1);
  const at = hover ?? years.length - 1;
  const empty = series.every((s) => s.values.every((v) => v == null));

  if (empty) return <p className="py-10 text-center text-xs text-faint">Not in the data provided.</p>;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" onMouseLeave={() => setHover(null)}>
        {dl?.ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--color-ink)" : "var(--color-line)"} strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="fill-faint text-[9px] tabular-nums">{fmtLeft(t)}</text>
          </g>
        ))}
        {hasRight && dr?.ticks.map((t) => (
          <text key={t} x={W - padR + 6} y={y(t, "right") + 3} className="fill-faint text-[9px] tabular-nums">{(fmtRight ?? fmtLeft)(t)}</text>
        ))}
        {years.map((yr, i) => (
          <g key={yr} onMouseEnter={() => setHover(i)}>
            <rect x={cx(i) - band / 2} y={0} width={band} height={H} fill="transparent" />
            <text x={cx(i)} y={H - 7} textAnchor="middle" className={`text-[10px] ${at === i ? "fill-ink font-semibold" : "fill-muted"}`}>FY{yr}</text>
          </g>
        ))}
        {hover != null && dl && <line x1={PAD.left} x2={W - padR} y1={y(0)} y2={y(0)} stroke="var(--color-ink)" strokeWidth={1} pointerEvents="none" />}
        {bars.map((s, b) =>
          s.values.map((v, i) => {
            if (v == null) return null;
            const y0 = y(0, s.axis);
            const y1 = y(v, s.axis);
            return (
              <rect key={`${s.label}-${i}`} x={cx(i) - (barW * bars.length) / 2 + b * barW + 1} width={Math.max(barW - 2, 1)}
                y={Math.min(y0, y1)} height={Math.max(Math.abs(y1 - y0), 0.5)} rx={2} fill={s.color} pointerEvents="none"
                className="a-grow-y" style={{ transformOrigin: y1 <= y0 ? "center bottom" : "center top", animationDelay: `${120 + i * 70 + b * 35}ms` }} />
            );
          }),
        )}
        {refs.map((r) => (
          <g key={r.label} pointerEvents="none" className="a-grow-x" style={{ transformBox: "fill-box", animationDelay: "500ms" }}>
            <line x1={PAD.left} x2={W - padR} y1={y(r.value, r.axis)} y2={y(r.value, r.axis)} stroke={C.bad} strokeWidth={1} strokeDasharray="4 3" />
            <text x={PAD.left + 4} y={y(r.value, r.axis) - 4} className="text-[9px] font-medium" fill={C.bad}>{r.label}</text>
          </g>
        ))}
        {lines.map((s) => {
          // Break the line wherever a year is missing.
          const segs: string[][] = [[]];
          s.values.forEach((v, i) => (v == null ? segs.push([]) : segs[segs.length - 1].push(`${cx(i)},${y(v, s.axis)}`)));
          return (
            <g key={s.label} pointerEvents="none">
              {segs.filter((g) => g.length > 1).map((g, k) => (
                <polyline key={k} points={g.join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined}
                  strokeLinejoin="round" strokeLinecap="round" pathLength={s.dashed ? undefined : 1}
                  className={s.dashed ? "a-fade" : "a-draw"} style={{ animationDelay: "250ms" }} />
              ))}
              {s.values.map((v, i) => v == null ? null : (
                <circle key={i} cx={cx(i)} cy={y(v, s.axis)} r={at === i ? 4 : 2.75} fill="var(--panel-solid)" stroke={s.color} strokeWidth={2}
                  className="a-pop" style={{ animationDelay: `${300 + (i / Math.max(years.length - 1, 1)) * 1100}ms` }} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="font-mono font-semibold text-ink">FY{years[at]}</span>
        {series.map((s) => {
          const v = s.values[at];
          return (
            <span key={s.label} className="flex items-center gap-1.5">
              {s.kind === "bar"
                ? <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: s.color }} />
                : <span className="inline-block h-0.5 w-3.5" style={{ background: s.color }} />}
              {s.label}
              <span className={`font-mono tabular-nums ${v == null ? "text-faint" : "font-semibold text-ink"}`}>{v == null ? "—" : fmt(s)(v)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** A chart panel: title, one line on how to read it, the chart. */
export function ChartCard({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  const [ref, inView] = useInView<HTMLElement>();
  return (
    <section ref={ref} className={`spot reveal ${inView ? "is-in" : ""} min-w-0 rounded-xl border border-line bg-white p-4`}>
      <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
      {sub && <p className="mt-0.5 text-[11px] leading-snug text-faint">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** One horizontal bar split into labelled parts. Parts must be non-negative and are drawn in proportion to their sum. */
export function SplitBar({ parts, fmt }: { parts: { label: string; value: number; color: string }[]; fmt: (v: number) => string }) {
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div>
      <div className="a-grow-x flex h-7 w-full overflow-hidden rounded-md" style={{ animationDelay: "200ms" }}>
        {shown.map((p) => <div key={p.label} title={`${p.label} · ${fmt(p.value)}`} style={{ flexGrow: p.value, flexBasis: 0, background: p.color }} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: p.color }} />
            {p.label} <span className="font-mono font-semibold tabular-nums text-ink">{fmt(p.value)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
