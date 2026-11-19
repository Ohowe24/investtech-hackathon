"use client";

import { useState } from "react";
import type { Company, Dataset, Deal, YearRow } from "@contract/types";
import { formatValue } from "@/lib/format";
import { yearInfo } from "@/lib/explain";
import { Explain, type Explanation } from "./ui";

const W = 640;
const H = 230;
const PAD = { left: 16, right: 16, top: 24, bottom: 30 };

/** Year by year: cash spent on acquisitions (bars) and free cash flow per share (line). Click a year for its figures. */
export default function DealTimeline({ dataset, company }: { dataset: Dataset; company: Company }) {
  const [hover, setHover] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [showDeals, setShowDeals] = useState(false);

  if (!company.history?.length) return null;
  const history = [...company.history].sort((a, b) => a.fiscalYear - b.fiscalYear);
  const deals = company.deals ?? [];
  const lastYear = history[history.length - 1].fiscalYear;
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

  const focusYear = hover ?? picked ?? lastYear;
  const focus = history.find((h) => h.fiscalYear === focusYear) ?? history[history.length - 1];
  const first = history[0];
  const change = (a: number | null, b: number | null) => (a == null || b == null || a <= 0 ? null : b / a - 1);

  return (
    <div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
        <div>
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Acquisition spend and free cash flow per share by year"
            onMouseLeave={() => setHover(null)}>
            <line x1={PAD.left} x2={W - PAD.right} y1={base} y2={base} stroke="var(--color-ink)" />
            {history.map((h, i) => {
              const active = h.fiscalYear === focus.fiscalYear;
              const hgt = barH(h.acquisitions);
              const negative = h.acquisitions != null && h.acquisitions < 0;
              return (
                <g key={h.fiscalYear} className="cursor-pointer" onMouseEnter={() => setHover(h.fiscalYear)}
                  onClick={() => setPicked(picked === h.fiscalYear ? null : h.fiscalYear)}>
                  <rect x={cx(i) - band / 2} y={PAD.top - 20} width={band} height={H - PAD.top + 20} fill="transparent" />
                  <rect x={cx(i) - band * 0.26} y={base - hgt} width={band * 0.52} height={hgt} rx={3}
                    fill={negative ? "var(--color-bad)" : "var(--color-teal)"} opacity={active ? 1 : 0.55}
                    className="a-grow-y" style={{ transition: "opacity 120ms", transformOrigin: "center bottom", animationDelay: `${150 + i * 90}ms` }} />
                  {h.acquisitions == null && <text x={cx(i)} y={base - 8} textAnchor="middle" className="fill-faint text-[10px]">missing</text>}
                  <text x={cx(i)} y={H - 10} textAnchor="middle" className={`text-[12px] ${active ? "fill-ink font-semibold" : "fill-muted"}`}>
                    FY{h.fiscalYear}
                  </text>
                </g>
              );
            })}
            {linePts && <polyline points={linePts} fill="none" stroke="var(--color-ink)" strokeWidth={1.75} pointerEvents="none" pathLength={1} className="a-draw" style={{ animationDelay: "400ms" }} />}
            {history.map((h, i) =>
              h.fcfPerShare == null ? null : (
                <circle key={h.fiscalYear} cx={cx(i)} cy={fy(h.fcfPerShare)} r={h.fiscalYear === focus.fiscalYear ? 5.5 : 3.5}
                  fill="var(--panel-solid)" stroke="var(--color-ink)" strokeWidth={1.75} pointerEvents="none"
                  className="a-pop" style={{ animationDelay: `${450 + (i / Math.max(history.length - 1, 1)) * 1200}ms` }} />
              ),
            )}
          </svg>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-teal" /> Spent on acquisitions</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-bad" /> Sold more than it bought</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-ink" /> Free cash flow per share</span>
          </div>
        </div>

        <div className="self-start rounded-xl border border-line">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <span className="text-sm font-semibold text-ink">FY{focus.fiscalYear}</span>
            <span className="truncate text-[11px] text-faint">{focus.sourceIds.map((id) => sourceById.get(id)?.label ?? id).join(" · ")}</span>
          </div>
          <Readout info={yearInfo.acquisitions} value={formatValue(focus.acquisitions, "money")} />
          <Readout info={yearInfo.operatingCashFlow} value={formatValue(focus.operatingCashFlow, "money")} />
          <Readout info={yearInfo.fcfPerShare} value={focus.fcfPerShare == null ? "Missing" : focus.fcfPerShare.toFixed(2)}
            note={deltaNote(change(first.fcfPerShare, focus.fcfPerShare), first)} />
          <Readout info={yearInfo.cashReturn} value={formatValue(focus.cashReturn, "pct")} />
          <Readout info={yearInfo.dilutedShares} value={formatValue(focus.dilutedShares, "money")}
            note={deltaNote(change(first.dilutedShares, focus.dilutedShares), first)} last />
        </div>
      </div>

      {deals.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowDeals(!showDeals)} className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink hover:border-ink">
            {showDeals ? "Hide deals" : `Show deals from filings (${deals.length})`}
          </button>
          {showDeals && (
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
              {deals.map((d, i) => <DealRow key={i} d={d} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function deltaNote(delta: number | null, first: YearRow): string | undefined {
  if (delta == null) return undefined;
  return `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}% vs FY${first.fiscalYear}`;
}

function Readout({ info, value, note, last }: { info: Explanation; value: string; note?: string; last?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 px-4 py-2 ${last ? "" : "border-b border-line"}`}>
      <Explain info={info} className="text-left text-sm text-muted">{info.title}</Explain>
      <span className="text-right">
        <span className={`text-sm font-semibold tabular-nums ${value === "Missing" ? "text-faint" : "text-ink"}`}>{value}</span>
        {note && <span className="block text-[11px] text-faint">{note}</span>}
      </span>
    </div>
  );
}

function DealRow({ d }: { d: Deal }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded px-1.5 py-0.5 font-semibold ${d.type === "acquisition" ? "bg-ink text-white" : "bg-warnsoft text-warn"}`}>
          {d.type === "acquisition" ? "Bought" : "Sold"}
        </span>
        {d.status !== "done" && <span className="rounded bg-tealsoft px-1.5 py-0.5 font-medium text-teal">{d.status}</span>}
        <span className="chip">{d.date ?? d.periodLabel ?? "no date"}</span>
        {d.counterparty && <span className="font-medium text-ink">{d.counterparty}</span>}
        {d.quotes.length > 0 && (
          <button onClick={() => setOpen(!open)} className="ml-auto text-xs text-muted underline hover:text-ink">
            {open ? "Hide quote" : "Filing quote"}
          </button>
        )}
      </div>
      <p className="mt-1.5 text-sm text-ink">{d.summary}</p>
      {open && (
        <div className="mt-2 space-y-2">
          {d.quotes.map((q, j) => (
            <blockquote key={j} className="border-l-2 border-teal pl-3 text-xs text-muted">
              “{q.quote}” <span className="text-faint">· {q.label}</span>
            </blockquote>
          ))}
        </div>
      )}
    </li>
  );
}
