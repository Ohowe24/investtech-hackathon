"use client";

import { useState } from "react";
import type { Company, Dataset, Deal, YearRow } from "@contract/types";
import { formatValue } from "@/lib/format";
import { Card } from "./ui";

interface Props {
  dataset: Dataset;
  company: Company | null;
}

const W = 640;
const H = 260;
const PAD = { left: 16, right: 16, top: 28, bottom: 34 };

/** Year by year: what the company spent on deals, what each share earned, and the filings behind each deal. */
export default function DealTimeline({ dataset, company }: Props) {
  // Keyed on the ticker by the parent, so this state resets when the company changes.
  const [year, setYear] = useState<number | "after" | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (!company?.history?.length) {
    return (
      <Card label="Deal by deal" lead="Pick a company." rest="See what it bought each year, and what happened to the cash behind each share.">
        <div />
      </Card>
    );
  }

  const history = [...company.history].sort((a, b) => a.fiscalYear - b.fiscalYear);
  const deals = company.deals ?? [];
  const lastYear = history[history.length - 1].fiscalYear;
  const after = deals.filter((d) => d.fiscalYear != null && d.fiscalYear > lastYear);
  const undated = deals.filter((d) => d.fiscalYear == null);
  const cur = company.reportingCurrency ?? "";
  const sourceById = new Map(dataset.sources.map((s) => [s.id, s]));

  const acqMax = Math.max(...history.map((h) => Math.abs(h.acquisitions ?? 0)), 0);
  const fcfVals = history.map((h) => h.fcfPerShare).filter((v): v is number => v != null);
  const fcfMax = Math.max(...fcfVals, 0);
  const fcfMin = Math.min(...fcfVals, 0);
  const band = (W - PAD.left - PAD.right) / history.length;
  const cx = (i: number) => PAD.left + band * (i + 0.5);
  const base = H - PAD.bottom;
  const plotH = base - PAD.top;
  const barH = (v: number | null) => (v == null || acqMax <= 0 ? 0 : (Math.abs(v) / acqMax) * plotH * 0.9);
  const fy = (v: number) => base - ((v - fcfMin) / (fcfMax - fcfMin || 1)) * plotH * 0.9 - plotH * 0.05;
  const linePts = history.map((h, i) => (h.fcfPerShare == null ? null : `${cx(i)},${fy(h.fcfPerShare)}`)).filter(Boolean).join(" ");

  const focusYear = hover ?? (typeof year === "number" ? year : lastYear);
  const focus = history.find((h) => h.fiscalYear === focusYear) ?? history[history.length - 1];
  const first = history[0];
  const dealsIn = (y: number) => deals.filter((d) => d.fiscalYear === y);
  const shown: { title: string; list: Deal[] }[] =
    year === "after"
      ? [{ title: `After FY${lastYear}`, list: after }]
      : typeof year === "number"
        ? [{ title: `FY${year}`, list: dealsIn(year) }]
        : [
            ...(after.length ? [{ title: `After FY${lastYear}`, list: after }] : []),
            ...[...history].reverse().map((h) => ({ title: `FY${h.fiscalYear}`, list: dealsIn(h.fiscalYear) })).filter((g) => g.list.length),
            ...(undated.length ? [{ title: "No date in filing", list: undated }] : []),
          ];
  const change = (a: number | null, b: number | null) => (a == null || b == null || a <= 0 ? null : b / a - 1);

  return (
    <Card
      label={`Deal by deal · ${company.name}`}
      lead="What it bought, and what owners got."
      rest={`Bars are cash spent on acquisitions each fiscal year; the line is free cash flow per share. Hover a year to read it, click to see that year's deals. Money in ${cur || "reporting currency"}.`}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
        <div>
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Acquisition spend and free cash flow per share by year"
            onMouseLeave={() => setHover(null)}>
            <line x1={PAD.left} x2={W - PAD.right} y1={base} y2={base} stroke="#000" />
            {history.map((h, i) => {
              const active = h.fiscalYear === focus.fiscalYear;
              const picked = year === h.fiscalYear;
              const hgt = barH(h.acquisitions);
              const negative = h.acquisitions != null && h.acquisitions < 0;
              return (
                <g key={h.fiscalYear} className="cursor-pointer" onMouseEnter={() => setHover(h.fiscalYear)}
                  onClick={() => setYear(picked ? null : h.fiscalYear)}>
                  <rect x={cx(i) - band / 2} y={PAD.top - 20} width={band} height={H - PAD.top + 20} fill={active ? "#f5f5f5" : "transparent"} />
                  <rect x={cx(i) - band * 0.26} y={base - hgt} width={band * 0.52} height={hgt} rx={3}
                    fill={negative ? "#c8372d" : "#2f5454"} opacity={active ? 1 : 0.55} style={{ transition: "opacity 120ms" }} />
                  {h.acquisitions == null && <text x={cx(i)} y={base - 8} textAnchor="middle" className="fill-faint text-[10px]">missing</text>}
                  <text x={cx(i)} y={H - 12} textAnchor="middle" className={`text-[12px] ${picked ? "fill-ink font-semibold" : active ? "fill-ink" : "fill-muted"}`}>
                    FY{h.fiscalYear}{dealsIn(h.fiscalYear).length ? ` · ${dealsIn(h.fiscalYear).length}` : ""}
                  </text>
                  {picked && <rect x={cx(i) - band * 0.3} y={H - 5} width={band * 0.6} height={2} fill="#000" />}
                </g>
              );
            })}
            {linePts && <polyline points={linePts} fill="none" stroke="#000" strokeWidth={1.75} pointerEvents="none" />}
            {history.map((h, i) =>
              h.fcfPerShare == null ? null : (
                <circle key={h.fiscalYear} cx={cx(i)} cy={fy(h.fcfPerShare)} r={h.fiscalYear === focus.fiscalYear ? 5.5 : 3.5}
                  fill="#fff" stroke="#000" strokeWidth={1.75} pointerEvents="none" />
              ),
            )}
          </svg>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-teal" /> Spent on acquisitions</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-bad" /> Net seller that year</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-ink" /> Free cash flow per share</span>
            <span className="text-faint">The number after a year is its count of disclosed deals.</span>
          </div>
        </div>

        <div className="rounded-xl border border-line">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-semibold text-ink">FY{focus.fiscalYear}</span>
            <span className="chip !whitespace-normal text-right">{focus.sourceIds.map((id) => sourceById.get(id)?.label ?? id).join(" · ") || "no source"}</span>
          </div>
          <Readout label="Spent on acquisitions" value={formatValue(focus.acquisitions, "money")}
            note={focus.acquisitions != null && focus.acquisitions < 0 ? "Sold more than it bought" : undefined} />
          <Readout label="Operating cash flow" value={formatValue(focus.operatingCashFlow, "money")} />
          <Readout label="Free cash flow per share" value={focus.fcfPerShare == null ? "Missing" : focus.fcfPerShare.toFixed(2)}
            note={deltaNote(change(first.fcfPerShare, focus.fcfPerShare), first)} />
          <Readout label="Cash return on capital" value={formatValue(focus.cashReturn, "pct")}
            note={focus.cashReturn == null ? "Needs the prior year's balance sheet" : undefined} />
          <Readout label="Diluted shares" value={formatValue(focus.dilutedShares, "money")}
            note={deltaNote(change(first.dilutedShares, focus.dilutedShares), first)} last />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-1.5">
        <YearChip active={year === null} onClick={() => setYear(null)}>All deals{deals.length ? ` · ${deals.length}` : ""}</YearChip>
        {after.length > 0 && <YearChip active={year === "after"} onClick={() => setYear("after")}>After FY{lastYear} · {after.length}</YearChip>}
        {[...history].reverse().map((h) => (
          <YearChip key={h.fiscalYear} active={year === h.fiscalYear} onClick={() => setYear(h.fiscalYear)}>
            FY{h.fiscalYear} · {dealsIn(h.fiscalYear).length}
          </YearChip>
        ))}
      </div>

      {company.deals == null ? (
        <p className="mt-4 rounded-xl bg-soft p-4 text-sm text-muted">
          Deal-level filings are in the data pack for the five Canadian candidates only. For this holding, the yearly totals above come from its cash flow statements.
        </p>
      ) : shown.every((g) => g.list.length === 0) ? (
        <p className="mt-4 rounded-xl bg-soft p-4 text-sm text-muted">No deals disclosed in the data pack for this period.</p>
      ) : (
        <div className="mt-4 space-y-5">
          {shown.filter((g) => g.list.length).map((g) => (
            <div key={g.title} className="grid grid-cols-1 gap-3 md:grid-cols-[120px_1fr]">
              <div className="text-sm font-semibold text-ink">{g.title}<div className="text-xs font-normal text-faint">{g.list.length} disclosed</div></div>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {g.list.map((d, i) => <DealRow key={i} d={d} />)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function deltaNote(delta: number | null, first: YearRow): string | undefined {
  if (delta == null) return undefined;
  return `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}% vs FY${first.fiscalYear}`;
}

function Readout({ label, value, note, last }: { label: string; value: string; note?: string; last?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 px-4 py-2.5 ${last ? "" : "border-b border-line"}`}>
      <span className="text-sm text-muted">{label}</span>
      <span className="text-right">
        <span className={`text-sm font-semibold tabular-nums ${value === "Missing" ? "text-faint" : "text-ink"}`}>{value}</span>
        {note && <span className="block text-[11px] text-faint">{note}</span>}
      </span>
    </div>
  );
}

function YearChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${active ? "border-ink bg-ink text-white" : "border-line text-muted hover:border-ink hover:text-ink"}`}>
      {children}
    </button>
  );
}

function DealRow({ d }: { d: Deal }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="p-3.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded px-1.5 py-0.5 font-semibold ${d.type === "acquisition" ? "bg-ink text-white" : "bg-warnsoft text-warn"}`}>
          {d.type === "acquisition" ? "Bought" : "Sold"}
        </span>
        {d.status !== "done" && <span className="rounded bg-tealsoft px-1.5 py-0.5 font-medium text-teal">{d.status}</span>}
        <span className="chip">{d.date ?? d.periodLabel ?? "no date"}</span>
        {d.counterparty && <span className="font-medium text-ink">{d.counterparty}</span>}
        {d.quotes.length > 0 && (
          <button onClick={() => setOpen(!open)} className="ml-auto rounded-md border border-line px-2 py-0.5 text-xs text-ink hover:border-ink">
            {open ? "Hide sources" : `View sources · ${d.quotes.length}`}
          </button>
        )}
      </div>
      <p className="mt-2 text-sm text-ink">{d.summary}</p>
      {open && (
        <div className="mt-3 space-y-3">
          {d.quotes.map((q, j) => (
            <blockquote key={j} className="border-l-2 border-teal pl-3 text-xs text-muted">
              “{q.quote}”
              <div className="mt-1"><span className="chip !whitespace-normal">{q.label}</span></div>
            </blockquote>
          ))}
        </div>
      )}
    </li>
  );
}
