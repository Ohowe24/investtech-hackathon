"use client";

// The guide's answer cards. A card carries only references (a ticker, a metric id);
// every value here is read from the same dataset the rest of the site shows,
// and drawn with the site's own pieces: its badges, pass/fail dots and value colours.

import { useState, type ReactNode } from "react";
import type { Company, Dataset, IndexSnapshot, MetricDef } from "@contract/types";
import { formatMetric, formatValue, pct, recStyle, verdictStyle } from "@/lib/format";
import { metricState, ranking, scoredMetrics, stateBg, stateText } from "@/lib/rank";
import { completeIndex, sharePct, type IndexState } from "@/lib/indexMath";
import {
  countryOverrides, dealTitle, dealWhen, findIndex, modelAdditions, rankOn, rankPhrase, sortedDeals, testedCompanies, trimPct,
} from "@/lib/assistant/brain";
import type { Action, Block } from "@/lib/assistant/types";
import { Dot } from "../ui";
import { ArrowRight } from "./icons";

export interface CardProps {
  dataset: Dataset;
  snapshot: IndexSnapshot;
  onAction: (a: Action) => void;
}

/** A ticker in running text or a card. Click to open the company. */
export function TickerChip({ ticker, dataset, onAction }: { ticker: string } & Pick<CardProps, "dataset" | "onAction">) {
  const c = dataset.companies.find((x) => x.ticker === ticker);
  if (!c) return <span className="font-mono text-[11px] font-semibold">{ticker}</span>;
  return (
    <button type="button" onClick={() => onAction({ kind: "open", ticker, label: `Open ${ticker}` })} title={`${c.name} · open its page`}
      className="mx-px inline-flex items-center rounded bg-soft px-1 py-px align-[1px] font-mono text-[11px] font-semibold leading-tight text-ink ring-1 ring-inset ring-black/[0.06] transition-colors hover:bg-ink hover:text-white">
      {ticker}
    </button>
  );
}

const badge = "rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap";

function Shell({ title, right, children, flush = false }: { title?: ReactNode; right?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="guide-in overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {(title || right) && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <h4 className="min-w-0 truncate text-[11px] font-medium uppercase tracking-wide text-faint">{title}</h4>
          {right}
        </div>
      )}
      <div className={flush ? "" : "p-3"}>{children}</div>
    </section>
  );
}

const byTicker = (ds: Dataset, t: string) => ds.companies.find((c) => c.ticker === t);
const defOf = (ds: Dataset, id: string) => ds.metricDefs.find((d) => d.id === id);

export function AnswerBlock({ block, ...p }: { block: Block } & CardProps) {
  switch (block.kind) {
    case "company": { const c = byTicker(p.dataset, block.ticker); return c ? <CompanyCard c={c} {...p} /> : null; }
    case "checks": { const c = byTicker(p.dataset, block.ticker); return c ? <ChecksCard c={c} {...p} /> : null; }
    case "metric": {
      const c = byTicker(p.dataset, block.ticker);
      const d = defOf(p.dataset, block.metricId);
      return c && d ? <MetricCard c={c} def={d} {...p} /> : null;
    }
    case "compare": return <CompareCard tickers={block.tickers} {...p} />;
    case "deals": { const c = byTicker(p.dataset, block.ticker); return c ? <DealsCard c={c} limit={block.limit} {...p} /> : null; }
    case "ranking": { const d = defOf(p.dataset, block.metricId); return d ? <RankingCard def={d} tickers={block.tickers} highlight={block.highlight} {...p} /> : null; }
    case "list": return <ListCard title={block.title} tickers={block.tickers} metricId={block.metricId} {...p} />;
    case "whatif": return <WhatIfCard additions={block.additions} {...p} />;
    case "rules": return <RulesCard {...p} />;
  }
}

// ───────────── company ─────────────

function CompanyCard({ c, dataset, onAction }: { c: Company } & CardProps) {
  const m = c.model;
  const tested = testedCompanies(dataset);
  const hist = [...(c.history ?? [])].filter((h) => h.fcfPerShare != null).sort((a, b) => a.fiscalYear - b.fiscalYear);
  return (
    <Shell>
      <button type="button" onClick={() => onAction({ kind: "open", ticker: c.ticker, label: `Open ${c.ticker}` })} className="group flex w-full items-center gap-3 text-left">
        <span className="grid h-9 w-12 shrink-0 place-items-center rounded-lg bg-ink font-mono text-[11px] font-semibold text-white">{c.ticker}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink group-hover:underline">{c.name}</span>
          <span className="block truncate text-[11px] text-muted">
            {[c.subSector, `HQ ${c.hqCountry}`, c.inIndex ? "In the index" : "Candidate"].filter(Boolean).join(" · ")}
          </span>
        </span>
      </button>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {m && <span className={`${badge} ${recStyle[m.recommendation].badge}`}>{recStyle[m.recommendation].label}</span>}
        {!c.inIndex && <span className={`${badge} ${verdictStyle[c.verdict].badge}`}>{verdictStyle[c.verdict].label}</span>}
        <span className="ml-auto text-[11px] text-muted">
          {m && <>Rank <span className="font-mono font-semibold text-ink">{m.rank}</span> of {tested.length}</>}
          {c.proposedWeightPct != null && <> · <span className="font-mono font-semibold text-ink">{trimPct(c.proposedWeightPct)}</span></>}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {scoredMetrics(dataset).map((d) => (
          <div key={d.id} className="min-w-0 rounded-lg bg-soft px-2 py-1.5" title={c.metrics[d.id]?.note ?? d.description}>
            <div className="truncate text-[10px] text-muted">{d.short ?? d.label}</div>
            <div className={`font-mono text-[13px] font-semibold tabular-nums ${stateText[metricState(c, d.id)]}`}>{formatMetric(c.metrics[d.id], d.unit)}</div>
          </div>
        ))}
        {m && (
          <div className="min-w-0 rounded-lg border border-line px-2 py-1.5">
            <div className="truncate text-[10px] text-muted">Checks passed</div>
            <div className="font-mono text-[13px] font-semibold tabular-nums text-ink">
              {m.checks.filter((k) => k.pass).length}<span className="font-normal text-faint"> / {m.checks.filter((k) => k.pass !== null).length}</span>
            </div>
          </div>
        )}
      </div>
      {hist.length >= 2 && <Sparkline company={c} years={hist.map((h) => h.fiscalYear)} values={hist.map((h) => h.fcfPerShare!)} />}
    </Shell>
  );
}

function Sparkline({ company, years, values }: { company: Company; years: number[]; values: number[] }) {
  const W = 300;
  const H = 44;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => 3 + (i / (values.length - 1)) * (W - 6);
  const y = (v: number) => H - 5 - ((v - lo) / (hi - lo || 1)) * (H - 10);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const n2 = (v: number) => v.toFixed(2);
  return (
    <div className="mt-3 border-t border-line pt-2.5">
      <div className="flex items-baseline justify-between text-[10px] text-muted">
        <span>Free cash flow per share</span>
        <span className="font-mono text-faint">{company.reportingCurrency}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-11 w-full overflow-visible" role="img" aria-label={`Free cash flow per share from FY${years[0]} to FY${years[years.length - 1]}`}>
        <defs>
          <linearGradient id={`spark-${company.ticker}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2f5454" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#2f5454" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${d} L${x(values.length - 1)},${H} L${x(0)},${H} Z`} fill={`url(#spark-${company.ticker})`} />
        <path d={d} fill="none" stroke="#2f5454" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" className="guide-draw" pathLength={1} />
        {values.map((v, i) => (
          <circle key={years[i]} cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 3 : 1.75} fill={i === values.length - 1 ? "#2f5454" : "#fff"} stroke="#2f5454" strokeWidth={1.25}>
            <title>{`FY${years[i]}: ${n2(v)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-0.5 flex justify-between font-mono text-[10px] tabular-nums text-faint">
        <span>FY{years[0]} · {n2(values[0])}</span>
        <span className="text-ink">FY{years[years.length - 1]} · {n2(values[values.length - 1])}</span>
      </div>
    </div>
  );
}

// ───────────── checks ─────────────

function ChecksCard({ c, dataset, onAction }: { c: Company } & CardProps) {
  const m = c.model;
  if (!m) return null;
  return (
    <Shell flush title={<>Model checks · {c.ticker}</>} right={<span className={`${badge} ${recStyle[m.recommendation].badge}`}>{recStyle[m.recommendation].label}</span>}>
      <ul>
        {m.checks.map((k) => {
          const def = defOf(dataset, k.metricId);
          const st = k.pass === null ? "none" : k.pass ? "pass" : "fail";
          return (
            <li key={k.id} className="flex items-center gap-2.5 border-b border-line px-3 py-2 text-[12px] last:border-0" title={k.rule}>
              <Dot pass={k.pass} size={8} />
              <span className="min-w-0 flex-1 text-ink">
                {k.label}
                {k.kind === "gate" && <span className="ml-1.5 rounded bg-soft px-1 py-px align-[1px] text-[9px] font-medium uppercase tracking-wide text-muted">Must pass</span>}
              </span>
              <span className={`font-mono tabular-nums ${stateText[st]}`}>{formatMetric(c.metrics[k.metricId], def?.unit ?? "pct")}</span>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => onAction({ kind: "highlight", target: "checks", ticker: c.ticker, label: "Show me" })}
        className="flex w-full items-center justify-between border-t border-line bg-canvas px-3 py-2 text-[11px] text-muted transition-colors hover:text-ink">
        <span><span className="font-mono font-semibold text-ink">{m.passed}</span> of {m.available} scored checks passed</span>
        <span className="flex items-center gap-1">On the page <ArrowRight className="h-2.5 w-2.5" /></span>
      </button>
    </Shell>
  );
}

// ───────────── one metric ─────────────

function MetricCard({ c, def, dataset, onAction }: { c: Company; def: MetricDef } & CardProps) {
  const mv = c.metrics[def.id];
  const r = rankOn(dataset, c, def);
  const checks = c.model?.checks.filter((k) => k.metricId === def.id) ?? [];
  const withData = ranking(testedCompanies(dataset), def).filter((x) => x.metrics[def.id]?.value != null);
  return (
    <Shell title={<>{def.label} · {c.ticker}</>}>
      <div className="flex items-end justify-between gap-3">
        <div className={`font-mono text-[26px] font-semibold leading-none tabular-nums tracking-tight ${mv?.value == null ? "text-faint" : stateText[metricState(c, def.id)]}`}>
          {formatMetric(mv, def.unit)}
        </div>
        {r && <div className="text-right text-[11px] text-muted">{rankPhrase(def, r)}</div>}
      </div>
      {mv?.period && <div className="mt-1 text-[11px] text-faint">{mv.period}</div>}
      {checks.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {checks.map((k) => (
            <span key={k.id} title={k.rule}
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${k.pass === null ? "bg-soft text-faint" : k.pass ? "bg-tealsoft text-teal" : "bg-badsoft text-bad"}`}>
              {k.pass === null ? "" : k.pass ? "✓ " : "✕ "}{k.target}
            </span>
          ))}
        </div>
      )}
      {withData.length > 0 && <MiniRank def={def} list={withData} me={c.ticker} onAction={onAction} />}
      {mv?.note && <p className="mt-2 text-[11px] leading-snug text-muted">{mv.note}</p>}
    </Shell>
  );
}

/** The same strip as the dashboard's metric tiles: every company, this one raised. */
function MiniRank({ def, list, me, onAction }: { def: MetricDef; list: Company[]; me?: string } & Pick<CardProps, "onAction">) {
  return (
    <div className="mt-3">
      <div className="flex items-end gap-px" role="img" aria-label={`Every company on ${def.label}`}>
        {list.map((x) => {
          const mine = x.ticker === me;
          return (
            <button key={x.ticker} type="button" onClick={() => onAction({ kind: "open", ticker: x.ticker, label: `Open ${x.ticker}` })}
              title={`${x.ticker} · ${formatMetric(x.metrics[def.id], def.unit)}`}
              className={`flex-1 rounded-[2px] transition-opacity ${stateBg[metricState(x, def.id)]} ${mine ? "h-3.5 shadow-[0_0_8px_rgba(61,220,108,0.9)]" : "h-2 opacity-30 hover:opacity-100"}`} />
          );
        })}
      </div>
      <div className="mt-1 text-[10px] text-faint">{def.higherIsBetter === false ? "Lowest first" : "Highest first"} · {list.length} companies with data</div>
    </div>
  );
}

// ───────────── compare ─────────────

function CompareCard({ tickers, dataset, onAction }: { tickers: string[] } & CardProps) {
  const cs = tickers.map((t) => byTicker(dataset, t)).filter((c): c is Company => !!c);
  const lead = (def: MetricDef): string | null => {
    if (def.higherIsBetter == null) return null;
    const have = cs.filter((c) => c.metrics[def.id]?.value != null);
    if (have.length < 2) return null;
    const sign = def.higherIsBetter ? -1 : 1;
    const top = [...have].sort((a, b) => sign * (a.metrics[def.id].value! - b.metrics[def.id].value!));
    if (formatMetric(top[0].metrics[def.id], def.unit) === formatMetric(top[1].metrics[def.id], def.unit)) return null;
    return top[0].ticker;
  };
  return (
    <Shell flush title="Side by side">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-canvas">
            <th className="px-2.5 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-faint" />
            {cs.map((c) => (
              <th key={c.ticker} className="px-2.5 py-2 text-right">
                <TickerChip ticker={c.ticker} dataset={dataset} onAction={onAction} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-line">
            <td className="px-2.5 py-2 text-muted">Result</td>
            {cs.map((c) => (
              <td key={c.ticker} className="px-2.5 py-2 text-right">
                {c.model ? <span className={`${badge} ${recStyle[c.model.recommendation].badge}`}>{recStyle[c.model.recommendation].label} · #{c.model.rank}</span> : "—"}
              </td>
            ))}
          </tr>
          {scoredMetrics(dataset).map((d) => {
            const winner = lead(d);
            return (
              <tr key={d.id} className="border-t border-line">
                <td className="px-2.5 py-2 leading-tight text-muted" title={d.description}>{d.short ?? d.label}</td>
                {cs.map((c) => (
                  <td key={c.ticker} className={`whitespace-nowrap px-2.5 py-2 text-right font-mono tabular-nums ${stateText[metricState(c, d.id)]} ${winner === c.ticker ? "font-semibold" : ""}`}>
                    {winner === c.ticker && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-signal align-middle" title="Leads" />}
                    {formatMetric(c.metrics[d.id], d.unit)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center gap-1.5 border-t border-line bg-canvas px-3 py-1.5 text-[10px] text-faint">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-signal" /> leads · colours show each company&apos;s own checks
      </div>
    </Shell>
  );
}

// ───────────── deals ─────────────

function DealsCard({ c, limit, onAction }: { c: Company; limit: number } & CardProps) {
  const all = sortedDeals(c);
  const list = all.slice(0, limit);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Shell flush title={<>Deals · {c.ticker} · newest first</>} right={<span className="font-mono text-[11px] text-faint">{all.length}</span>}>
      <ol className="relative">
        {list.map((d, i) => (
          <li key={`${dealWhen(d)}-${i}`} className="relative border-b border-line py-2.5 pl-8 pr-3 last:border-0">
            <span className={`absolute left-3 top-[15px] h-2 w-2 rounded-full ring-4 ring-white ${d.type === "acquisition" ? "bg-teal" : "bg-warn"}`} />
            {i < list.length - 1 && <span className="absolute bottom-0 left-[15.5px] top-[23px] w-px bg-line" aria-hidden />}
            <div className="flex items-center gap-2 text-[10px]">
              <span className="font-mono text-faint">{dealWhen(d)}</span>
              <span className={`${badge} ${d.type === "acquisition" ? "bg-tealsoft text-teal" : "bg-warnsoft text-warn"}`}>{d.type === "acquisition" ? "Bought" : "Sold"}</span>
              <span className="ml-auto uppercase tracking-wide text-faint">{d.status}</span>
            </div>
            <div className="mt-1 text-[12px] font-semibold leading-snug text-ink">{dealTitle(d)}</div>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">{d.summary}</p>
            {d.quotes.length > 0 && (
              <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}
                className="mt-1 text-[11px] font-medium text-teal hover:underline">
                {open === i ? "Hide the filing" : `Read the filing${d.quotes.length > 1 ? ` · ${d.quotes.length} quotes` : ""}`}
              </button>
            )}
            {open === i && (
              <div className="mt-2 space-y-1.5">
                {d.quotes.map((q, j) => (
                  <blockquote key={j} className="guide-in rounded-r-md border-l-2 border-teal/50 bg-canvas px-2.5 py-1.5 text-[11px] leading-relaxed text-ink/80">
                    “{q.quote}”
                    <footer className="mt-1 text-[10px] text-faint">{q.label}</footer>
                  </blockquote>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      {all.length > list.length && (
        <button type="button" onClick={() => onAction({ kind: "highlight", target: "deals", ticker: c.ticker, label: "Show acquisitions by year" })}
          className="flex w-full items-center justify-between border-t border-line bg-canvas px-3 py-2 text-[11px] text-muted transition-colors hover:text-ink">
          <span>{all.length - list.length} more on {c.ticker}&apos;s page</span>
          <ArrowRight className="h-2.5 w-2.5" />
        </button>
      )}
    </Shell>
  );
}

// ───────────── ranking and lists ─────────────

function RankingCard({ def, tickers, highlight, dataset, onAction }: { def: MetricDef; tickers: string[]; highlight?: string } & CardProps) {
  const cs = tickers.map((t) => byTicker(dataset, t)).filter((c): c is Company => !!c && c.metrics[def.id]?.value != null);
  const shown = cs.length > 10 && highlight ? windowAround(cs, highlight) : cs.slice(0, 10);
  const max = Math.max(...cs.map((c) => Math.abs(c.metrics[def.id].value!)), 1e-9);
  return (
    <Shell title={def.short ?? def.label} right={<span className="text-[10px] text-faint">{def.higherIsBetter === false ? "Lower is better" : def.higherIsBetter ? "Higher is better" : "Context"}</span>}>
      <ol className="-mx-1 space-y-0.5">
        {shown.map((c) => {
          const v = c.metrics[def.id].value!;
          const mine = c.ticker === highlight;
          const st = metricState(c, def.id);
          return (
            <li key={c.ticker} className={`flex items-center gap-2 rounded-md px-1 py-1 ${mine ? "bg-tealsoft" : ""}`}>
              <span className="w-4 text-right font-mono text-[10px] text-faint">{cs.indexOf(c) + 1}</span>
              <span className="w-12 shrink-0"><TickerChip ticker={c.ticker} dataset={dataset} onAction={onAction} /></span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-soft">
                <span className={`guide-bar block h-full rounded-full ${stateBg[st]}`} style={{ width: `${Math.max(3, (Math.abs(v) / max) * 100)}%` }} />
              </span>
              <span className={`w-14 text-right font-mono text-[11px] tabular-nums ${stateText[st]}`}>{formatValue(v, def.unit)}</span>
            </li>
          );
        })}
      </ol>
      {shown.length < cs.length && <div className="mt-1.5 text-[10px] text-faint">Showing {shown.length} of {cs.length}</div>}
    </Shell>
  );
}

function windowAround(cs: Company[], t: string): Company[] {
  const i = cs.findIndex((c) => c.ticker === t);
  if (i < 0) return cs.slice(0, 10);
  const start = Math.max(0, Math.min(i - 4, cs.length - 10));
  return cs.slice(start, start + 10);
}

function ListCard({ title, tickers, metricId, dataset, onAction }: { title: string; tickers: string[]; metricId?: string } & CardProps) {
  const def = metricId ? defOf(dataset, metricId) : undefined;
  const cs = tickers.map((t) => byTicker(dataset, t)).filter((c): c is Company => !!c);
  return (
    <Shell flush title={title} right={<span className="font-mono text-[11px] text-faint">{cs.length}</span>}>
      <ul>
        {cs.map((c) => (
          <li key={c.ticker}>
            <button type="button" onClick={() => onAction({ kind: "open", ticker: c.ticker, label: `Open ${c.ticker}` })}
              className="flex w-full items-center gap-2.5 border-b border-line px-3 py-2 text-left transition-colors last:border-0 hover:bg-canvas">
              <span className="w-11 shrink-0 font-mono text-[11px] font-semibold text-ink">{c.ticker}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{c.name}</span>
              {def ? (
                <span className={`font-mono text-[11px] tabular-nums ${stateText[metricState(c, def.id)]}`}>{formatMetric(c.metrics[def.id], def.unit)}</span>
              ) : c.model ? (
                <span className={`${badge} ${recStyle[c.model.recommendation].badge}`}>{recStyle[c.model.recommendation].label}</span>
              ) : null}
              {!c.inIndex && !def && <span className={`${badge} ${verdictStyle[c.verdict].badge}`}>{verdictStyle[c.verdict].label}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

// ───────────── what-if (recomputed here with completeIndex) ─────────────

function WhatIfCard({ additions, dataset, snapshot, onAction }: { additions: { ticker: string; weightPct: number }[] } & CardProps) {
  const index = findIndex(dataset, snapshot);
  if (!index) return null;
  const overrides = countryOverrides(dataset);
  const picks = modelAdditions(dataset);
  const scenario = additions
    .map((a) => { const c = byTicker(dataset, a.ticker); return c ? { ticker: c.ticker, name: c.name, weightPct: a.weightPct, countryCode: c.hqCountry, subSector: c.subSector } : null; })
    .filter((a): a is NonNullable<typeof a> => a != null);
  const same = scenario.length === picks.length && scenario.every((a) => picks.some((p) => p.ticker === a.ticker && p.weightPct === a.weightPct));
  const today = completeIndex(index, [], overrides).before;
  const model = completeIndex(index, picks, overrides).after;
  const yours = completeIndex(index, scenario, overrides).after;
  const cols: { title: string; state: IndexState; accent?: boolean }[] = [
    { title: "Today", state: today },
    { title: same ? "With the picks" : "Model's picks", state: model, accent: same },
    ...(same ? [] : [{ title: "With yours", state: yours, accent: true }]),
  ];
  return (
    <Shell title="Canadian share and cash" right={
      <button type="button" onClick={() => onAction({ kind: "view", view: "index", label: "Open the Index page" })}
        className="flex items-center gap-1 text-[10px] text-faint transition-colors hover:text-ink">Index page <ArrowRight className="h-2.5 w-2.5" /></button>
    }>
      <div className={`grid gap-1.5 ${cols.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {cols.map((col) => {
          const ca = sharePct(col.state, "CA");
          return (
            <div key={col.title} className={`rounded-lg border p-2.5 ${col.accent ? "border-teal/25 bg-tealsoft/60" : "border-line bg-canvas"}`}>
              <div className={`truncate text-[10px] font-semibold uppercase tracking-wide ${col.accent ? "text-teal" : "text-faint"}`}>{col.title}</div>
              <div className={`mt-1 font-mono text-[17px] font-semibold tabular-nums tracking-tight ${col.accent ? "text-teal" : "text-ink"}`}>{pct(ca)}</div>
              <div className="text-[10px] text-muted">Canadian</div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/[0.06]">
                <div className={`guide-bar h-full rounded-full ${col.accent ? "bg-teal" : "bg-ink/35"}`} style={{ width: `${Math.min(100, ca)}%` }} />
              </div>
              <dl className="mt-2 space-y-0.5 text-[10px] text-muted">
                <div className="flex justify-between"><dt>Cash</dt><dd className="font-mono tabular-nums text-ink">{pct(col.state.cashPct)}</dd></div>
                <div className="flex justify-between"><dt>Holdings</dt><dd className="font-mono tabular-nums text-ink">{col.state.rows.length}</dd></div>
              </dl>
            </div>
          );
        })}
      </div>
      {scenario.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
          <span>Adding</span>
          {scenario.map((a) => (
            <span key={a.ticker} className="inline-flex items-center gap-1">
              <TickerChip ticker={a.ticker} dataset={dataset} onAction={onAction} />
              <span className="font-mono text-ink">{trimPct(a.weightPct)}</span>
            </span>
          ))}
        </div>
      )}
    </Shell>
  );
}

// ───────────── rules ─────────────

function RulesCard({ dataset }: CardProps) {
  const checks = testedCompanies(dataset)[0]?.model?.checks ?? [];
  return (
    <Shell flush title="The model's checks">
      <ul>
        {checks.map((k) => (
          <li key={k.id} className="flex items-start gap-2.5 border-b border-line px-3 py-2 last:border-0">
            <span className={`mt-px shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${k.kind === "gate" ? "bg-warnsoft text-warn" : "bg-tealsoft text-teal"}`}>
              {k.kind === "gate" ? "Must pass" : "Scored"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-medium text-ink">{k.label}</span>
              <span className="block text-[11px] leading-snug text-muted">{k.rule}</span>
            </span>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
