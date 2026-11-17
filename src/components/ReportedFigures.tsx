"use client";

import type { Company, Dataset, ReportedSeries } from "@contract/types";
import { formatValue } from "@/lib/format";
import { ChartCard } from "./charts";

/** Company-reported figures over time (REIT-style KPIs). One small bar chart per figure, each bar labelled with its period and source. */
export default function ReportedFigures({ dataset, company }: { dataset: Dataset; company: Company }) {
  const series = company.reported ?? [];
  if (series.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-white">Reported figures over time</h2>
        <span className="text-xs text-white/55">As filed on SEDAR · hover a bar for its source · gaps are periods the data does not have</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {series.map((s) => <SeriesCard key={s.id} dataset={dataset} company={company} s={s} />)}
      </div>
    </section>
  );
}

const W = 320;
const H = 150;
const PAD = { top: 18, bottom: 22, left: 4, right: 4 };

function fmt(v: number, unit: ReportedSeries["unit"]): string {
  if (unit === "pct") return `${(v * 100).toFixed(Math.abs(v) < 0.1 ? 1 : 0)}%`;
  if (unit === "count") return v.toLocaleString("en", { maximumFractionDigits: 3 });
  return formatValue(v, unit);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Q3 2026" -> "Q3 '26", "2026-09-30" -> "Sep '26", "FY2025" stays. Short enough for eight bars. */
function shortPeriod(label: string): string {
  const d = label.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (d) return `${MONTHS[Number(d[2]) - 1]} '${d[1].slice(2)}`;
  return label.replace(/ (\d{2})(\d{2})$/, " '$2");
}

function SeriesCard({ dataset, company, s }: { dataset: Dataset; company: Company; s: ReportedSeries }) {
  const checks = (company.model?.checks ?? []).filter((k) => s.metricId && k.metricId === s.metricId && k.threshold != null);
  const label = new Map(dataset.sources.map((x) => [x.id, x]));
  const vals = s.points.map((p) => p.value);
  const lines = checks.map((k) => k.threshold!);
  const lo = Math.min(0, ...vals, ...lines);
  const hi = Math.max(0, ...vals, ...lines);
  const span = hi - lo || 1;
  const y = (v: number) => PAD.top + (1 - (v - lo) / span) * (H - PAD.top - PAD.bottom);
  const band = (W - PAD.left - PAD.right) / Math.max(s.points.length, 1);
  const barW = Math.min(band * 0.62, 34);
  const last = s.points[s.points.length - 1];
  const first = s.points[0];
  const sub = [s.basis === "Point in time" ? "At each balance-sheet date" : s.basis === "Annual" ? "By fiscal year" : "By quarter", s.note].filter(Boolean).join(" · ");

  return (
    <ChartCard title={s.label} sub={sub}>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-mono text-lg font-semibold tabular-nums text-ink">{fmt(last.value, s.unit)}</span>
        <span className="text-[11px] text-muted">{last.label}</span>
        {s.points.length > 1 && (
          <span className="ml-auto text-[11px] text-faint">from {fmt(first.value, s.unit)} in {first.label}</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${s.label}: ${s.points.map((p) => `${p.label} ${fmt(p.value, s.unit)}`).join(", ")}`}>
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#d4d4d4" />
        {s.points.map((p, i) => {
          const cx = PAD.left + band * (i + 0.5);
          const y0 = y(0);
          const y1 = y(p.value);
          const fails = checks.some((k) => (k.op === ">=" ? p.value < k.threshold! : p.value > k.threshold!));
          const src = label.get(p.sourceId);
          return (
            <g key={p.date}>
              <title>{`${p.label}: ${fmt(p.value, s.unit)}\n${src?.label ?? p.sourceId}${src?.quote ? `\n“${src.quote}”` : ""}`}</title>
              <rect x={cx - barW / 2} width={barW} y={Math.min(y0, y1)} height={Math.max(Math.abs(y1 - y0), 1)} rx={2}
                style={{ transformOrigin: "center bottom", animationDelay: `${120 + i * 50}ms` }}
                className={`a-grow-y ${i === s.points.length - 1 ? (fails ? "fill-bad" : "fill-teal") : fails ? "fill-bad/40" : "fill-ink/20"}`} />
              <text x={cx} y={Math.min(y0, y1) - 4} textAnchor="middle" className="fill-ink text-[9px] tabular-nums">{fmt(p.value, s.unit)}</text>
              <text x={cx} y={H - 6} textAnchor="middle" className="fill-faint text-[8.5px]">{shortPeriod(p.label)}</text>
            </g>
          );
        })}
        {checks.map((k, j) => (
          <g key={k.id}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(k.threshold!)} y2={y(k.threshold!)} stroke={k.kind === "gate" ? "#000" : "#2f5454"} strokeDasharray="4 3" strokeWidth={1} />
            {/* Two lines close together: one label on the right, the next on the left. */}
            <text x={j % 2 ? PAD.left : W - PAD.right} y={y(k.threshold!) - 3} textAnchor={j % 2 ? "start" : "end"}
              className="fill-muted text-[8.5px]" paintOrder="stroke" stroke="#fff" strokeWidth={3}>{k.kind === "gate" ? "must" : "pass"} {k.target}</text>
          </g>
        ))}
      </svg>
    </ChartCard>
  );
}
