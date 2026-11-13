"use client";

import type { Company, Dataset, Deal } from "@contract/types";
import { formatValue } from "@/lib/format";

interface Props {
  dataset: Dataset;
  company: Company | null;
}

/** Year by year: what the company bought (with the filing's own words) and what owners got. */
export default function DealTimeline({ dataset, company }: Props) {
  if (!company?.history?.length) {
    return (
      <div className="rounded-xl border border-slate-200 p-5 text-sm text-slate-500">
        Pick a company to see it deal by deal: what it bought each year, and what happened to the cash behind each share.
      </div>
    );
  }
  const history = [...company.history].sort((a, b) => b.fiscalYear - a.fiscalYear);
  const deals = company.deals ?? [];
  const lastYear = history[0].fiscalYear;
  const recent = deals.filter((d) => d.fiscalYear != null && d.fiscalYear > lastYear);
  const undated = deals.filter((d) => d.fiscalYear == null);
  const maxAcq = Math.max(...history.map((h) => Math.abs(h.acquisitions ?? 0)), 0);
  const maxFcf = Math.max(...history.map((h) => Math.abs(h.fcfPerShare ?? 0)), 0);
  const sourceById = new Map(dataset.sources.map((s) => [s.id, s]));
  const cur = company.reportingCurrency ?? "";

  return (
    <div className="rounded-xl border border-slate-200 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Deal by deal: {company.name}</h2>
        <p className="text-xs text-slate-500">Money in {cur || "reporting currency"} · fiscal years · deals quoted from SEDAR filings</p>
      </div>
      {company.deals == null && (
        <p className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          Deal-level filings are only in the data pack for the five Canadian candidates. For this holding the yearly totals come from its cash flow statements.
        </p>
      )}

      <div className="mt-4 space-y-5">
        {recent.length > 0 && (
          <YearBlock title={`After FY${lastYear}`} subtitle="Deals disclosed since the last full fiscal year. Full-year numbers are not out yet.">
            <DealList deals={recent} />
          </YearBlock>
        )}
        {history.map((h) => {
          const src = h.sourceIds.map((id) => sourceById.get(id)?.label ?? id).join(" · ");
          return (
            <YearBlock key={h.fiscalYear} title={`FY${h.fiscalYear}`} subtitle={src}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Bar label="Spent on acquisitions" value={h.acquisitions} max={maxAcq} text={formatValue(h.acquisitions, "money")}
                  note={h.acquisitions != null && h.acquisitions < 0 ? "Net seller this year" : undefined} color="bg-slate-700" />
                <Bar label="Free cash flow per share" value={h.fcfPerShare} max={maxFcf}
                  text={h.fcfPerShare == null ? "Missing" : h.fcfPerShare.toFixed(2)} color="bg-green-600" />
                <Stat label="Cash return on capital" text={formatValue(h.cashReturn, "pct")}
                  note={h.cashReturn == null ? "Needs the prior year's balance sheet" : undefined} />
              </div>
              <DealList deals={deals.filter((d) => d.fiscalYear === h.fiscalYear)} />
            </YearBlock>
          );
        })}
        {undated.length > 0 && (
          <YearBlock title="Undated" subtitle="The filing gives no date for these.">
            <DealList deals={undated} />
          </YearBlock>
        )}
      </div>
    </div>
  );
}

function YearBlock({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-[110px_1fr]">
      <div>
        <div className="text-base font-semibold text-slate-900">{title}</div>
        {subtitle && <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{subtitle}</div>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Bar({ label, value, max, text, note, color }: {
  label: string; value: number | null; max: number; text: string; note?: string; color: string;
}) {
  const width = value == null || max <= 0 ? 0 : Math.min(100, (Math.abs(value) / max) * 100);
  const negative = value != null && value < 0;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${value == null ? "text-slate-400" : "text-slate-900"}`}>{text}</div>
      <div className="mt-1 h-1.5 rounded bg-slate-100">
        <div className={`h-1.5 rounded ${negative ? "bg-red-400" : color}`} style={{ width: `${width}%` }} />
      </div>
      {note && <div className="mt-0.5 text-[11px] text-slate-400">{note}</div>}
    </div>
  );
}

function Stat({ label, text, note }: { label: string; text: string; note?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${text === "Missing" ? "text-slate-400" : "text-slate-900"}`}>{text}</div>
      {note && <div className="mt-0.5 text-[11px] text-slate-400">{note}</div>}
    </div>
  );
}

function DealList({ deals }: { deals: Deal[] }) {
  if (deals.length === 0) return null;
  return (
    <ul className="space-y-2">
      {deals.map((d, i) => (
        <li key={i} className="rounded-lg bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className={`rounded px-1.5 py-0.5 font-semibold uppercase ${d.type === "acquisition" ? "bg-slate-800 text-white" : "bg-amber-100 text-amber-800"}`}>
              {d.type === "acquisition" ? "Bought" : "Sold"}
            </span>
            {d.status !== "done" && <span className="rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-800">{d.status}</span>}
            <span className="text-slate-500">{d.date ?? d.periodLabel ?? "No date in filing"}</span>
            {d.counterparty && <span className="font-medium text-slate-800">{d.counterparty}</span>}
          </div>
          <p className="mt-1.5 text-sm text-slate-800">{d.summary}</p>
          {d.quotes.length > 0 && (
            <details className="mt-1.5 text-xs">
              <summary className="cursor-pointer text-blue-700">Filing quote ({d.quotes.length})</summary>
              {d.quotes.map((q, j) => (
                <blockquote key={j} className="mt-2 border-l-2 border-slate-300 pl-3 text-slate-600">
                  “{q.quote}”
                  <div className="mt-0.5 text-[11px] text-slate-400">{q.label}</div>
                </blockquote>
              ))}
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}
