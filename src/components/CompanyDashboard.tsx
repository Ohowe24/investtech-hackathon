"use client";

import type { Company, Dataset, MetricDef } from "@contract/types";
import { formatMetric, pct, recStyle, verdictStyle } from "@/lib/format";
import { scoredMetricInfo } from "@/lib/explain";
import { metricState, ordinal, ranking, scoredMetrics, stateBg, stateText } from "@/lib/rank";
import DealTimeline from "./DealTimeline";
import { Card, Explain } from "./ui";

interface Props {
  dataset: Dataset;
  company: Company;
  onOpen: (ticker: string) => void;
  onBack: () => void;
}

/** One company: every number we have, each ranked against the other companies tested. */
export default function CompanyDashboard({ dataset, company, onOpen, onBack }: Props) {
  const tested = dataset.companies.filter((c) => c.model).sort((a, b) => a.model!.rank - b.model!.rank);
  const m = company.model;
  const i = tested.findIndex((c) => c.ticker === company.ticker);
  const prev = tested[i - 1];
  const next = tested[i + 1];
  const years = company.history?.map((h) => h.fiscalYear) ?? [];

  const scored = scoredMetrics(dataset);
  // Unscored metrics, shown only when this company has a value.
  const context = dataset.metricDefs.filter((d) => !scored.includes(d) && company.metrics[d.id]?.value != null);
  const failed = m?.checks.filter((k) => k.pass === false) ?? [];
  const noData = m?.checks.filter((k) => k.pass === null) ?? [];

  const sourceById = new Map(dataset.sources.map((s) => [s.id, s]));
  const sourceLabels = [...new Set(
    dataset.metricDefs.flatMap((d) => company.metrics[d.id]?.sourceIds ?? [])
      .map((id) => (sourceById.get(id)?.label ?? id).replace(/,?\s*FY\d{4}$/, "")),
  )];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-[13px]">
        <button onClick={onBack} className="font-medium text-muted hover:text-ink">← Companies</button>
        <div className="flex items-center gap-1 text-muted">
          <NavBtn disabled={!prev} onClick={() => prev && onOpen(prev.ticker)} label={prev ? `Previous: ${prev.ticker}` : "Previous"}>‹</NavBtn>
          <span className="px-1 font-mono text-xs tabular-nums">{i + 1} / {tested.length}</span>
          <NavBtn disabled={!next} onClick={() => next && onOpen(next.ticker)} label={next ? `Next: ${next.ticker}` : "Next"}>›</NavBtn>
        </div>
      </div>

      <section className="rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-16 place-items-center rounded-lg bg-ink font-mono text-sm font-semibold text-white">{company.ticker}</span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-ink">{company.name}</h1>
              <div className="mt-0.5 text-xs text-muted">
                {[company.subSector, `HQ ${company.hqCountry}`, company.listedOn, years.length ? `FY${years[0]}–FY${years[years.length - 1]}` : null,
                  company.inIndex ? "In the index" : "Candidate"].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {m && <span className={`rounded-full px-3 py-1.5 font-medium ${recStyle[m.recommendation].badge}`}>{recStyle[m.recommendation].label}</span>}
            {!company.inIndex && (
              <span className={`rounded-full px-3 py-1.5 font-medium ${verdictStyle[company.verdict].badge}`}>{verdictStyle[company.verdict].label}</span>
            )}
          </div>
        </div>
        {m && (
          <div className="grid grid-cols-2 divide-line border-t border-line sm:grid-cols-4 sm:divide-x">
            <Stat label="Rank" value={`${m.rank}`} unit={`of ${tested.length}`} />
            <Stat label="Checks passed" value={`${m.checks.filter((k) => k.pass).length}`} unit={`of ${m.checks.filter((k) => k.pass !== null).length}`} />
            <Stat label="Weight" info={{ title: "Proposed weight", how: dataset.rules?.weight }}
              value={company.proposedWeightPct != null ? pct(company.proposedWeightPct, 2) : "—"} unit={company.inIndex ? "already held" : company.proposedWeightPct == null ? "not added" : "proposed"} />
            <div className="px-5 py-3.5">
              <div className="text-[11px] font-medium uppercase tracking-wide text-faint">Failed</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {failed.length === 0 && <span className="text-sm font-medium text-teal">None</span>}
                {failed.map((k) => <span key={k.id} className="rounded-md bg-badsoft px-2 py-0.5 text-xs font-medium text-bad">{k.label}</span>)}
                {noData.map((k) => <span key={k.id} className="rounded-md bg-soft px-2 py-0.5 text-xs text-muted">No data: {k.label}</span>)}
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {scored.map((d) => <MetricCard key={d.id} dataset={dataset} company={company} def={d} onOpen={onOpen} />)}
        {context.map((d) => <MetricCard key={d.id} dataset={dataset} company={company} def={d} onOpen={onOpen} />)}
      </div>

      {company.history?.length ? (
        <Card title="By year" right={<span className="text-xs text-faint">{company.reportingCurrency}</span>}>
          <DealTimeline dataset={dataset} company={company} />
        </Card>
      ) : null}

      {sourceLabels.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-faint">
          <span className="mr-1">Sources</span>
          {sourceLabels.map((l) => <span key={l} className="chip !whitespace-normal">{l}</span>)}
        </div>
      )}
    </div>
  );
}

function NavBtn({ disabled, onClick, label, children }: { disabled: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button disabled={disabled} onClick={onClick} aria-label={label} title={label}
      className="grid h-7 w-7 place-items-center rounded-md border border-line bg-white text-base leading-none text-ink hover:border-ink disabled:opacity-30 disabled:hover:border-line">
      {children}
    </button>
  );
}

function Stat({ label, value, unit, info }: { label: string; value: string; unit?: string; info?: { title: string; how?: string } }) {
  return (
    <div className="px-5 py-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-faint">
        {info ? <Explain info={info} className="uppercase tracking-wide">{label}</Explain> : label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-mono text-xl font-semibold tabular-nums tracking-tight text-ink">{value}</span>
        {unit && <span className="text-xs text-muted">{unit}</span>}
      </div>
    </div>
  );
}

/** One metric: the value, its pass lines, and where it sits among every company tested. */
function MetricCard({ dataset, company, def, onOpen }: { dataset: Dataset; company: Company; def: MetricDef; onOpen: (t: string) => void }) {
  const tested = dataset.companies.filter((c) => c.model);
  const mv = company.metrics[def.id];
  const checks = company.model?.checks.filter((k) => k.metricId === def.id) ?? [];
  const order = ranking(tested, def);
  const withData = order.filter((c) => c.metrics[def.id]?.value != null);
  const pos = withData.findIndex((c) => c.ticker === company.ticker);
  const state = metricState(company, def.id);
  const lowFirst = def.higherIsBetter === false;
  // Up to three rows of the ranking, centred on this company.
  const from = Math.max(0, Math.min(pos - 1, withData.length - 3));
  const around = pos < 0 ? [] : withData.slice(from, from + 3);

  return (
    <section className="flex flex-col rounded-xl border border-line bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <Explain info={scoredMetricInfo(dataset, def.id)} className="text-[13px] font-medium text-muted">{def.short ?? def.label}</Explain>
        <div className="flex flex-wrap justify-end gap-1">
          {checks.map((k) => (
            <span key={k.id} title={k.rule}
              className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium ${k.pass === null ? "bg-soft text-faint" : k.pass ? "bg-tealsoft text-teal" : "bg-badsoft text-bad"}`}>
              {k.pass === null ? "" : k.pass ? "✓ " : "✕ "}{k.target}
            </span>
          ))}
          {checks.length === 0 && <span className="rounded-md bg-soft px-1.5 py-0.5 text-[11px] text-faint">Not scored</span>}
        </div>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className={`font-mono text-[32px] font-semibold leading-none tabular-nums tracking-tight ${mv?.value == null ? "text-faint" : stateText[state === "plain" ? "plain" : state]}`}>
          {mv?.value == null ? "—" : formatMetric(mv, def.unit)}
        </span>
        {mv?.period && <span className="text-[11px] text-faint">{mv.period}</span>}
      </div>

      {pos >= 0 ? (
        <>
          <div className="mt-4 flex items-baseline justify-between text-xs">
            <span className="font-medium text-ink">{ordinal(pos + 1)} {lowFirst ? "lowest" : "highest"} <span className="font-normal text-muted">of {withData.length}</span></span>
            {def.higherIsBetter != null && <span className="text-faint">{lowFirst ? "Lower is better" : "Higher is better"}</span>}
          </div>
          <div className="mt-2 flex items-end gap-[3px]" role="img" aria-label={`Ranked ${pos + 1} of ${withData.length}`}>
            {withData.map((c) => {
              const me = c.ticker === company.ticker;
              return (
                <button key={c.ticker} onClick={() => onOpen(c.ticker)} title={`${c.ticker} · ${formatMetric(c.metrics[def.id], def.unit)}`}
                  className={`max-w-7 flex-1 rounded-[3px] transition-all ${stateBg[metricState(c, def.id)]} ${me ? "h-7 ring-2 ring-ink ring-offset-1" : "h-4 opacity-35 hover:opacity-100"}`} />
              );
            })}
          </div>
          <ul className="mt-3 divide-y divide-line border-t border-line text-xs">
            {around.map((c) => {
              const me = c.ticker === company.ticker;
              return (
                <li key={c.ticker}>
                  <button onClick={() => onOpen(c.ticker)} disabled={me}
                    className={`flex w-full items-center gap-2 py-1.5 text-left ${me ? "font-semibold text-ink" : "text-muted hover:text-ink"}`}>
                    <span className="w-5 font-mono tabular-nums text-faint">{withData.indexOf(c) + 1}</span>
                    <span className="font-mono">{c.ticker}</span>
                    <span className="truncate font-sans font-normal text-faint">{c.name}</span>
                    <span className={`ml-auto font-mono tabular-nums ${me ? "" : stateText[metricState(c, def.id)]}`}>{formatMetric(c.metrics[def.id], def.unit)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="mt-4 text-xs text-muted">{mv?.note ?? "No data."}</p>
      )}
      {pos >= 0 && mv?.note && <p className="mt-2 text-[11px] text-faint">{mv.note}</p>}
    </section>
  );
}
