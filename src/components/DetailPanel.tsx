"use client";

import type { Company, Dataset } from "@contract/types";
import { formatMetric, recStyle, verdictStyle } from "@/lib/format";
import { Dot } from "./ui";

interface Props {
  dataset: Dataset;
  company: Company | null;
}

/** Company profile card: the question, the checks, the numbers, and where each one comes from. */
export default function DetailPanel({ dataset, company }: Props) {
  if (!company) {
    return (
      <div className="rounded-2xl border border-line p-6 text-sm text-muted">
        Pick a company in the table or on the map to open its profile.
      </div>
    );
  }

  const sourceById = new Map(dataset.sources.map((s) => [s.id, s]));
  const unitOf = new Map(dataset.metricDefs.map((d) => [d.id, d.unit]));
  const m = company.model;
  const usedSources = [...new Set(dataset.metricDefs.flatMap((d) => company.metrics[d.id]?.sourceIds ?? []))];
  const quoted = usedSources.map((id) => sourceById.get(id)).filter((s) => s?.quote);
  const years = company.history?.map((h) => h.fiscalYear) ?? [];

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-ink">{company.name}</div>
          <div className="truncate text-xs text-muted">
            {company.subSector ?? ""}{company.subSector ? " · " : ""}HQ {company.hqCountry}{company.inIndex ? " · held in the index" : " · candidate"}
          </div>
        </div>
        <span className="chip shrink-0">
          {company.listedOn ? `${company.listedOn}:` : ""}{company.ticker}{years.length ? ` · FY${years[0]}–FY${years[years.length - 1]}` : ""}
        </span>
      </div>

      <div className="px-5 py-4">
        <div className="text-[17px] font-semibold leading-snug tracking-tight text-ink">
          Did buying make each share worth more?
        </div>
        {m && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 font-medium ${recStyle[m.recommendation].badge}`}>{recStyle[m.recommendation].label}</span>
            <span className="text-muted">{m.passed} of {m.available} scored checks · rank {m.rank} of {dataset.companies.length}</span>
            {!company.inIndex && (
              <span className={`rounded-full px-2.5 py-1 font-medium ${verdictStyle[company.verdict].badge}`}>
                {verdictStyle[company.verdict].label}{company.proposedWeightPct != null ? ` at ${company.proposedWeightPct.toFixed(2)}%` : ""}
              </span>
            )}
          </div>
        )}
        {company.reason && (
          <p className="mt-3 text-sm text-muted">
            {company.reason}{" "}
            <span className="text-faint">{company.verdictSource === "model" ? "Set by the declared rules." : "Set by a human reviewer."}</span>
          </p>
        )}
      </div>

      {m && (
        <div className="border-t border-line px-5 py-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-faint">
                <th className="py-2 font-normal">Check</th>
                <th className="py-2 font-normal">Rule</th>
                <th className="py-2 text-right font-normal">Value</th>
              </tr>
            </thead>
            <tbody>
              {m.checks.map((k) => {
                const mv = company.metrics[k.metricId];
                return (
                  <tr key={k.id} className="border-t border-line align-top">
                    <td className="py-2.5 pr-2">
                      <div className="flex items-center gap-2 font-medium text-ink">
                        <Dot pass={k.pass} size={9} />
                        {k.label}
                      </div>
                      {k.kind === "gate" && <div className="ml-[17px] text-[11px] text-faint">gate</div>}
                    </td>
                    <td className="py-2.5 pr-2 text-xs text-muted">{k.rule}</td>
                    <td className="py-2.5 text-right">
                      <div className={`font-semibold tabular-nums ${k.pass === null ? "text-faint" : k.pass ? "text-teal" : "text-bad"}`}>
                        {k.pass === null ? "No data" : formatMetric(mv, unitOf.get(k.metricId) ?? "pct")}
                      </div>
                      {mv?.period && <div className="text-[11px] text-faint">{mv.period}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {quoted.length > 0 && (
        <div className="border-t border-line px-5 py-3">
          {quoted.map((s) => (
            <blockquote key={s!.id} className="border-l-2 border-teal pl-3 text-xs text-muted">
              “{s!.quote}”
              <div className="mt-0.5 text-[11px] text-faint">{s!.label}</div>
            </blockquote>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-soft px-5 py-3 text-xs text-muted">
        <span className="mr-1">Sourced from</span>
        {years.length > 0 && <span className="chip !whitespace-normal">Onesheet API · statements FY{years[0]}–FY{years[years.length - 1]}</span>}
        {quoted.length > 0 && <span className="chip">SEDAR MD&amp;A</span>}
        {company.deals && <span className="chip">{company.deals.length} deal filings</span>}
      </div>
    </div>
  );
}
