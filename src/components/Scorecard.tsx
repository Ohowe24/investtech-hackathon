"use client";

import { useState } from "react";
import type { Company, Dataset } from "@contract/types";
import { formatMetric, pct, recStyle, verdictStyle } from "@/lib/format";

interface Props {
  dataset: Dataset;
  selected: string | null;
  onSelect: (ticker: string) => void;
}

type Filter = "candidates" | "holdings" | "all";

/** The same declared test applied to every company: one row each, one dot per check. */
export default function Scorecard({ dataset, selected, onSelect }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const tested = dataset.companies.filter((c) => c.model);
  const checks = tested[0]?.model?.checks ?? [];
  if (checks.length === 0) return null;

  const rows = tested
    .filter((c) => (filter === "all" ? true : filter === "candidates" ? !c.inIndex : c.inIndex))
    .sort((a, b) => a.model!.rank - b.model!.rank);
  const unitOf = new Map(dataset.metricDefs.map((d) => [d.id, d.unit]));
  const tabs: { id: Filter; label: string }[] = [
    { id: "all", label: `All (${tested.length})` },
    { id: "candidates", label: `Canadian candidates (${tested.filter((c) => !c.inIndex).length})` },
    { id: "holdings", label: `Current holdings (${tested.filter((c) => c.inIndex).length})` },
  ];

  return (
    <div className="rounded-xl border border-slate-200 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">One test, every company</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            The rules were written down before the results. Two must-pass gates, then five scored checks. Missing data is never counted as a fail.
          </p>
        </div>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setFilter(t.id)}
              className={`rounded-md px-3 py-1.5 ${filter === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="w-8 pb-2 font-medium">#</th>
              <th className="pb-2 font-medium">Company</th>
              {checks.map((k) => (
                <th key={k.id} className="px-1 pb-2 text-center font-medium" title={k.rule}>
                  <div className="mx-auto max-w-[92px] leading-tight">{k.label}</div>
                  <div className="text-[10px] font-normal normal-case text-slate-400">{k.kind === "gate" ? "must pass" : "scored"}</div>
                </th>
              ))}
              <th className="pb-2 text-center font-medium">Score</th>
              <th className="pb-2 font-medium">Model says</th>
              <th className="pb-2 text-right font-medium">Weight</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <Row key={c.ticker} c={c} unitOf={unitOf} active={c.ticker === selected} onSelect={onSelect} />
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-4 grid gap-x-6 gap-y-1 text-xs text-slate-500 md:grid-cols-2">
        {checks.map((k) => (
          <li key={k.id}>
            <span className="font-medium text-slate-700">{k.label}:</span> {k.rule}.
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ c, unitOf, active, onSelect }: {
  c: Company;
  unitOf: Map<string, "pct" | "multiple" | "money" | "count">;
  active: boolean;
  onSelect: (t: string) => void;
}) {
  const m = c.model!;
  const rec = recStyle[m.recommendation];
  return (
    <tr onClick={() => onSelect(c.ticker)}
      className={`cursor-pointer border-t border-slate-100 ${active ? "bg-slate-100" : "hover:bg-slate-50"}`}>
      <td className="py-2.5 text-slate-400">{m.rank}</td>
      <td className="py-2.5 pr-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900">{c.ticker}</span>
          <span className="truncate text-slate-600">{c.name}</span>
          {!c.inIndex && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-700">Candidate</span>}
        </div>
      </td>
      {m.checks.map((k) => {
        const value = formatMetric(c.metrics[k.metricId], unitOf.get(k.metricId) ?? "pct");
        const tone = k.pass === null ? "text-slate-400" : k.pass ? "text-green-700" : "text-red-700";
        const dot = k.pass === null ? "border border-slate-300 bg-white" : k.pass ? "bg-green-500" : "bg-red-500";
        return (
          <td key={k.id} className="px-1 py-2.5 text-center" title={`${k.rule}: ${k.pass === null ? "no data" : k.pass ? "pass" : "fail"}`}>
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
            <div className={`text-[11px] tabular-nums ${tone}`}>{k.pass === null ? "no data" : value}</div>
          </td>
        );
      })}
      <td className="py-2.5 text-center tabular-nums text-slate-700">
        {m.passed}/{m.available}
        {m.available < m.total && <div className="text-[10px] text-slate-400">of {m.total} checks</div>}
      </td>
      <td className="py-2.5">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${rec.badge}`}>{rec.label}</span>
      </td>
      <td className="py-2.5 text-right tabular-nums">
        {c.inIndex ? (
          <span className="text-xs text-slate-400">held</span>
        ) : c.proposedWeightPct != null ? (
          <span className="font-semibold text-slate-900">{pct(c.proposedWeightPct, 2)}</span>
        ) : (
          <span className={`text-xs ${verdictStyle[c.verdict].badge} rounded-full px-2 py-0.5`}>{verdictStyle[c.verdict].label}</span>
        )}
      </td>
    </tr>
  );
}
