"use client";

import { useState } from "react";
import type { CheckResult, Company, Dataset, Unit } from "@contract/types";
import { formatMetric, pct, recStyle, verdictStyle } from "@/lib/format";
import { Card, Dot, Segmented } from "./ui";

interface Props {
  dataset: Dataset;
  selected: string | null;
  hovered: string | null;
  onSelect: (ticker: string) => void;
  onHover: (ticker: string | null) => void;
}

type Filter = "all" | "candidates" | "holdings";

/** The same declared test applied to every company. Click a column to sort by it. */
export default function Scorecard({ dataset, selected, hovered, onSelect, onHover }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "rank", dir: 1 });
  const [tip, setTip] = useState<{ ticker: string; check: CheckResult } | null>(null);

  const tested = dataset.companies.filter((c) => c.model);
  const checks = tested[0]?.model?.checks ?? [];
  if (checks.length === 0) return null;
  const unitOf = new Map(dataset.metricDefs.map((d) => [d.id, d.unit]));

  const sortValue = (c: Company): number | null => {
    if (sort.key === "rank") return c.model!.rank;
    if (sort.key === "weight") return c.proposedWeightPct ?? null;
    const check = checks.find((k) => k.id === sort.key);
    return check ? (c.metrics[check.metricId]?.value ?? null) : null;
  };
  const rows = tested
    .filter((c) => (filter === "all" ? true : filter === "candidates" ? !c.inIndex : c.inIndex))
    .sort((a, b) => {
      const av = sortValue(a);
      const bv = sortValue(b);
      if (av == null && bv == null) return a.model!.rank - b.model!.rank;
      if (av == null) return 1; // missing always last
      if (bv == null) return -1;
      return (av - bv) * sort.dir || a.model!.rank - b.model!.rank;
    });
  const clickSort = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "rank" ? 1 : -1 }));
  const arrow = (key: string) => (sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : "");

  return (
    <Card
      label="One test, every company"
      lead="Rules first, results second."
      rest="Two gates every company must pass, then five scored checks. Missing data is never counted as a fail. Click a column to sort, a row to open the company."
      right={
        <Segmented value={filter} onChange={setFilter} options={[
          { id: "all", label: `All ${tested.length}` },
          { id: "candidates", label: `Candidates ${tested.filter((c) => !c.inIndex).length}` },
          { id: "holdings", label: `Holdings ${tested.filter((c) => c.inIndex).length}` },
        ]} />
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-faint">
              <th className="w-9 pb-2 font-normal">
                <button onClick={() => clickSort("rank")} className="hover:text-ink">#{arrow("rank")}</button>
              </th>
              <th className="pb-2 font-normal">Company</th>
              {checks.map((k) => (
                <th key={k.id} className="px-1 pb-2 text-center font-normal">
                  <button onClick={() => clickSort(k.id)} title={k.rule}
                    className={`mx-auto block max-w-[96px] leading-tight hover:text-ink ${sort.key === k.id ? "text-ink" : ""}`}>
                    {k.label}{arrow(k.id)}
                    <span className="mt-0.5 block text-[10px] text-faint">{k.kind === "gate" ? "gate" : "scored"}</span>
                  </button>
                </th>
              ))}
              <th className="pb-2 text-center font-normal">Score</th>
              <th className="pb-2 font-normal">Model</th>
              <th className="pb-2 text-right font-normal">
                <button onClick={() => clickSort("weight")} className="hover:text-ink">Weight{arrow("weight")}</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const m = c.model!;
              const rec = recStyle[m.recommendation];
              const active = c.ticker === selected;
              const hot = c.ticker === hovered;
              return (
                <tr key={c.ticker} onClick={() => onSelect(c.ticker)}
                  onMouseEnter={() => onHover(c.ticker)} onMouseLeave={() => { onHover(null); setTip(null); }}
                  className={`cursor-pointer border-b border-line transition-colors ${active ? "bg-soft" : hot ? "bg-soft/60" : ""}`}>
                  <td className="py-3 tabular-nums text-faint">{m.rank}</td>
                  <td className="py-3 pr-2">
                    <div className="flex items-center gap-2">
                      {active && <span className="h-4 w-0.5 rounded bg-ink" />}
                      <span className="font-semibold text-ink">{c.ticker}</span>
                      <span className="truncate text-muted">{c.name}</span>
                      {!c.inIndex && <span className="chip">CANDIDATE</span>}
                    </div>
                  </td>
                  {m.checks.map((k) => {
                    const showTip = tip?.ticker === c.ticker && tip.check.id === k.id;
                    return (
                      <td key={k.id} className="relative px-1 py-3 text-center"
                        onMouseEnter={() => setTip({ ticker: c.ticker, check: k })} onMouseLeave={() => setTip(null)}>
                        <Dot pass={k.pass} />
                        <div className={`text-[11px] tabular-nums ${k.pass === null ? "text-faint" : k.pass ? "text-teal" : "text-bad"}`}>
                          {k.pass === null ? "no data" : formatMetric(c.metrics[k.metricId], (unitOf.get(k.metricId) ?? "pct") as Unit)}
                        </div>
                        {showTip && (
                          <div className="pointer-events-none absolute left-1/2 top-full z-20 w-56 -translate-x-1/2 rounded-lg bg-ink p-3 text-left text-xs text-white shadow-xl">
                            <div className="font-medium">{k.label}</div>
                            <div className="mt-1 text-white/70">{k.rule}.</div>
                            <div className="mt-2 flex items-center justify-between border-t border-white/15 pt-2">
                              <span className="text-white/70">{c.ticker}{c.metrics[k.metricId]?.period ? ` · ${c.metrics[k.metricId].period}` : ""}</span>
                              <span className="font-semibold tabular-nums">
                                {k.pass === null ? "No data" : `${formatMetric(c.metrics[k.metricId], (unitOf.get(k.metricId) ?? "pct") as Unit)} · ${k.pass ? "pass" : "fail"}`}
                              </span>
                            </div>
                            {c.metrics[k.metricId]?.note && <div className="mt-1 text-white/60">{c.metrics[k.metricId].note}</div>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-3 text-center tabular-nums text-ink">
                    {m.passed}/{m.available}
                    {m.available < m.total && <div className="text-[10px] text-faint">{m.total - m.available} without data</div>}
                  </td>
                  <td className="py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${rec.badge}`}>{rec.label}</span>
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {c.inIndex ? (
                      <span className="text-xs text-faint">held</span>
                    ) : c.proposedWeightPct != null ? (
                      <span className="font-semibold text-ink">{pct(c.proposedWeightPct, 2)}</span>
                    ) : (
                      <span className="text-xs text-muted">{verdictStyle[c.verdict].label}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5"><Dot pass={true} size={8} /> Pass</span>
        <span className="flex items-center gap-1.5"><Dot pass={false} size={8} /> Fail</span>
        <span className="flex items-center gap-1.5"><Dot pass={null} size={8} /> No data, not counted</span>
        <span className="text-faint">Hover any cell for the rule and the number behind it.</span>
      </div>
    </Card>
  );
}
