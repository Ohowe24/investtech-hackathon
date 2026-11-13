"use client";

// The guide's answer cards. A card carries only references (a ticker, a metric id);
// every value here is read from the same dataset the rest of the site shows.

import { useState, type ReactNode } from "react";
import type { Company, Dataset, IndexSnapshot, MetricDef } from "@contract/types";
import { formatMetric, formatValue, pct, recStyle, verdictStyle } from "@/lib/format";
import { metricState, ranking, scoredMetrics, type State } from "@/lib/rank";
import { completeIndex, sharePct, type IndexState } from "@/lib/indexMath";
import {
  countryOverrides, dealTitle, dealWhen, findIndex, modelAdditions, rankOn, rankPhrase, sortedDeals, testedCompanies, trimPct,
} from "@/lib/assistant/brain";
import type { Action, Block } from "@/lib/assistant/types";

export const TONE: Record<State | "warn", string> = {
  pass: "#3ddc6c",
  fail: "#ff6b5e",
  none: "rgba(255,255,255,0.38)",
  plain: "#ffffff",
  warn: "#e8b931",
};
const REC_TONE = { pass: TONE.pass, mixed: TONE.warn, fail: TONE.fail } as const;
const VERDICT_TONE = { add: TONE.pass, watch: TONE.warn, reject: TONE.fail, existing: "rgba(255,255,255,0.6)" } as const;

export interface CardProps {
  dataset: Dataset;
  snapshot: IndexSnapshot;
  onAction: (a: Action) => void;
}

export function TickerChip({ ticker, dataset, onAction }: { ticker: string } & Pick<CardProps, "dataset" | "onAction">) {
  const c = dataset.companies.find((x) => x.ticker === ticker);
  if (!c) return <span className="font-mono text-[12px] font-semibold">{ticker}</span>;
  return (
    <button type="button" onClick={() => onAction({ kind: "open", ticker, label: `Open ${ticker}` })} title={`${c.name} · open its page`}
      className="mx-px inline-flex items-center rounded border border-white/15 bg-white/[0.07] px-1 py-px align-[1px] font-mono text-[11px] font-semibold leading-tight text-white transition-colors hover:border-[#3ddc6c]/70 hover:text-[#3ddc6c]">
      {ticker}
    </button>
  );
}

function Pill({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}>
      {children}
    </span>
  );
}

function Shell({ title, right, children }: { title?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="guide-in rounded-xl border border-white/10 bg-white/[0.035] p-3">
      {(title || right) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50">{title}</div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

function Mark({ pass }: { pass: boolean | null }) {
  const color = pass === null ? TONE.none : pass ? TONE.pass : TONE.fail;
  return (
    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-bold" style={{ color, background: `color-mix(in srgb, ${color} 18%, transparent)` }}>
      {pass === null ? "–" : pass ? "✓" : "✕"}
    </span>
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
      <div className="flex items-center gap-2">
        <TickerChip ticker={c.ticker} dataset={dataset} onAction={onAction} />
        <span className="min-w-0 truncate text-[13px] font-semibold text-white">{c.name}</span>
        <span className="ml-auto flex shrink-0 gap-1">
          {m && <Pill color={REC_TONE[m.recommendation]}>{recStyle[m.recommendation].label}</Pill>}
          {!c.inIndex && <Pill color={VERDICT_TONE[c.verdict]}>{verdictStyle[c.verdict].label}</Pill>}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-white/50">
        {[c.subSector, `HQ ${c.hqCountry}`, m ? `Rank ${m.rank} of ${tested.length}` : null, c.inIndex ? "In the index" : c.proposedWeightPct != null ? `Weight ${trimPct(c.proposedWeightPct)}` : null].filter(Boolean).join(" · ")}
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {scoredMetrics(dataset).map((d) => (
          <div key={d.id} className="min-w-0 rounded-md bg-white/[0.045] px-2 py-1.5" title={c.metrics[d.id]?.note ?? d.description}>
            <div className="truncate text-[10px] text-white/50">{d.short ?? d.label}</div>
            <div className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: TONE[metricState(c, d.id)] }}>
              {formatMetric(c.metrics[d.id], d.unit)}
            </div>
          </div>
        ))}
      </div>
      {hist.length >= 2 && <Sparkline company={c} years={hist.map((h) => h.fiscalYear)} values={hist.map((h) => h.fcfPerShare!)} />}
    </Shell>
  );
}

function Sparkline({ company, years, values }: { company: Company; years: number[]; values: number[] }) {
  const W = 300;
  const H = 46;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => 4 + (i / (values.length - 1)) * (W - 8);
  const y = (v: number) => H - 6 - ((v - lo) / (hi - lo || 1)) * (H - 12);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  const color = up ? TONE.pass : TONE.fail;
  const n2 = (v: number) => v.toFixed(2);
  return (
    <div className="mt-2.5">
      <div className="flex items-baseline justify-between text-[10px] text-white/50">
        <span>FCF per share, FY{years[0]}–FY{years[years.length - 1]}</span>
        <span className="font-mono">{company.reportingCurrency}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-[46px] w-full" role="img" aria-label={`Free cash flow per share from FY${years[0]} to FY${years[years.length - 1]}`}>
        <path d={`${d} L${x(values.length - 1)},${H} L${x(0)},${H} Z`} fill={color} opacity={0.08} />
        <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" className="guide-draw" pathLength={1} />
        {values.map((v, i) => (
          <circle key={years[i]} cx={x(i)} cy={y(v)} r={i === 0 || i === values.length - 1 ? 2.6 : 1.6} fill={color}>
            <title>{`FY${years[i]}: ${n2(v)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between font-mono text-[10px] tabular-nums text-white/60">
        <span>{n2(values[0])}</span>
        <span>{n2(values[values.length - 1])}</span>
      </div>
    </div>
  );
}

// ───────────── checks ─────────────

function ChecksCard({ c, dataset, onAction }: { c: Company } & CardProps) {
  const m = c.model;
  if (!m) return null;
  return (
    <Shell title="Model checks" right={<TickerChip ticker={c.ticker} dataset={dataset} onAction={onAction} />}>
      <ul className="space-y-1.5">
        {m.checks.map((k) => {
          const def = defOf(dataset, k.metricId);
          const color = k.pass === null ? TONE.none : k.pass ? TONE.pass : TONE.fail;
          return (
            <li key={k.id} className="flex items-center gap-2 text-[12px]" title={k.rule}>
              <Mark pass={k.pass} />
              <span className="min-w-0 flex-1 text-white/85">
                {k.label}
                {k.kind === "gate" && <span className="ml-1.5 rounded bg-white/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-white/60">must pass</span>}
              </span>
              <span className="font-mono text-[12px] tabular-nums" style={{ color }}>{formatMetric(c.metrics[k.metricId], def?.unit ?? "pct")}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-2 text-[11px] text-white/55">
        <span>{m.passed} of {m.available} scored checks passed</span>
        <Pill color={REC_TONE[m.recommendation]}>{recStyle[m.recommendation].label}</Pill>
      </div>
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
    <Shell title={def.label} right={<TickerChip ticker={c.ticker} dataset={dataset} onAction={onAction} />}>
      <div className="font-mono text-2xl font-semibold tabular-nums tracking-tight" style={{ color: mv?.value == null ? TONE.none : TONE[metricState(c, def.id)] }}>
        {formatMetric(mv, def.unit)}
      </div>
      <div className="mt-0.5 text-[11px] text-white/50">{[mv?.period, r && rankPhrase(def, r)].filter(Boolean).join(" · ")}</div>
      {checks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {checks.map((k) => (
            <span key={k.id} title={k.rule} className="flex items-center gap-1 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/75">
              <Mark pass={k.pass} /> {k.label}
            </span>
          ))}
        </div>
      )}
      {withData.length > 0 && <MiniRank def={def} list={withData} me={c.ticker} onAction={onAction} />}
      {mv?.note && <p className="mt-2 text-[11px] leading-snug text-white/50">{mv.note}</p>}
    </Shell>
  );
}

function MiniRank({ def, list, me, onAction }: { def: MetricDef; list: Company[]; me?: string } & Pick<CardProps, "onAction">) {
  return (
    <div className="mt-2.5">
      <div className="flex items-end gap-px" role="img" aria-label={`Every company on ${def.label}`}>
        {list.map((x) => {
          const mine = x.ticker === me;
          return (
            <button key={x.ticker} type="button" onClick={() => onAction({ kind: "open", ticker: x.ticker, label: `Open ${x.ticker}` })}
              title={`${x.ticker} · ${formatMetric(x.metrics[def.id], def.unit)}`}
              className={`flex-1 rounded-[2px] transition-opacity ${mine ? "h-4 opacity-100" : "h-2 opacity-35 hover:opacity-100"}`}
              style={{ background: TONE[metricState(x, def.id)] === TONE.plain ? "rgba(255,255,255,0.5)" : TONE[metricState(x, def.id)], boxShadow: mine ? "0 0 8px rgba(61,220,108,0.8)" : undefined }} />
          );
        })}
      </div>
      <div className="mt-1 text-[10px] text-white/40">{def.higherIsBetter === false ? "Lowest first" : "Highest first"} · {list.length} companies with data</div>
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
    <Shell title="Side by side">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-white/50">
            <th className="pb-1.5 text-left font-medium" />
            {cs.map((c) => <th key={c.ticker} className="pb-1.5 text-right font-medium"><TickerChip ticker={c.ticker} dataset={dataset} onAction={onAction} /></th>)}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-white/10">
            <td className="py-1.5 text-white/60">Model</td>
            {cs.map((c) => (
              <td key={c.ticker} className="py-1.5 text-right">
                {c.model ? <span style={{ color: REC_TONE[c.model.recommendation] }}>{recStyle[c.model.recommendation].label} · #{c.model.rank}</span> : "—"}
              </td>
            ))}
          </tr>
          {scoredMetrics(dataset).map((d) => {
            const winner = lead(d);
            return (
              <tr key={d.id} className="border-t border-white/10">
                <td className="py-1.5 pr-2 text-white/60" title={d.description}>{d.short ?? d.label}</td>
                {cs.map((c) => (
                  <td key={c.ticker} className="py-1.5 text-right font-mono tabular-nums" style={{ color: TONE[metricState(c, d.id)] }}>
                    {winner === c.ticker && <span className="mr-1 text-[9px] text-[#3ddc6c]">▲</span>}
                    {formatMetric(c.metrics[d.id], d.unit)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-1.5 text-[10px] text-white/40">▲ leads on that metric · colours show each company&apos;s own checks</div>
    </Shell>
  );
}

// ───────────── deals ─────────────

function DealsCard({ c, limit, dataset, onAction }: { c: Company; limit: number } & CardProps) {
  const all = sortedDeals(c);
  const list = all.slice(0, limit);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Shell title={`Deals · newest first`} right={<TickerChip ticker={c.ticker} dataset={dataset} onAction={onAction} />}>
      <ol className="space-y-2">
        {list.map((d, i) => (
          <li key={`${dealWhen(d)}-${i}`} className="rounded-lg bg-white/[0.04] p-2">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="font-mono text-white/55">{dealWhen(d)}</span>
              <Pill color={d.type === "acquisition" ? TONE.pass : TONE.warn}>{d.type === "acquisition" ? "Bought" : "Sold"}</Pill>
              <span className="ml-auto text-[10px] uppercase tracking-wide text-white/40">{d.status}</span>
            </div>
            <div className="mt-1 text-[12px] font-semibold leading-snug text-white">{dealTitle(d)}</div>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/60">{d.summary}</p>
            {d.quotes.length > 0 && (
              <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}
                className="mt-1 text-[11px] font-medium text-[#3ddc6c] hover:underline">
                {open === i ? "Hide the filing" : `Read the filing${d.quotes.length > 1 ? ` (${d.quotes.length} quotes)` : ""}`}
              </button>
            )}
            {open === i && (
              <div className="mt-1.5 space-y-1.5">
                {d.quotes.map((q, j) => (
                  <blockquote key={j} className="border-l-2 border-[#3ddc6c]/60 pl-2 text-[11px] leading-snug text-white/80">
                    “{q.quote}”
                    <div className="mt-0.5 text-[10px] text-white/45">{q.label}</div>
                  </blockquote>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      {all.length > list.length && (
        <button type="button" onClick={() => onAction({ kind: "highlight", target: "deals", ticker: c.ticker, label: "Show acquisitions by year" })}
          className="mt-2 text-[11px] text-white/55 hover:text-white">
          {all.length - list.length} more on {c.ticker}&apos;s page →
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
    <Shell title={def.short ?? def.label} right={<span className="text-[10px] text-white/40">{def.higherIsBetter === false ? "lower is better" : def.higherIsBetter ? "higher is better" : "context"}</span>}>
      <ol className="space-y-1">
        {shown.map((c) => {
          const v = c.metrics[def.id].value!;
          const mine = c.ticker === highlight;
          const st = metricState(c, def.id);
          return (
            <li key={c.ticker} className={`flex items-center gap-2 rounded-md px-1 py-0.5 ${mine ? "bg-[#3ddc6c]/10 ring-1 ring-[#3ddc6c]/40" : ""}`}>
              <span className="w-5 text-right font-mono text-[10px] text-white/40">{cs.indexOf(c) + 1}</span>
              <span className="w-12 shrink-0"><TickerChip ticker={c.ticker} dataset={dataset} onAction={onAction} /></span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <span className="guide-bar block h-full rounded-full" style={{ width: `${Math.max(2, (Math.abs(v) / max) * 100)}%`, background: st === "plain" ? "rgba(255,255,255,0.55)" : TONE[st] }} />
              </span>
              <span className="w-14 text-right font-mono text-[11px] tabular-nums" style={{ color: TONE[st] }}>{formatValue(v, def.unit)}</span>
            </li>
          );
        })}
      </ol>
      {shown.length < cs.length && <div className="mt-1.5 text-[10px] text-white/40">Showing {shown.length} of {cs.length}</div>}
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
    <Shell title={title} right={<span className="font-mono text-[11px] text-white/50">{cs.length}</span>}>
      <ul className="space-y-1">
        {cs.map((c) => (
          <li key={c.ticker} className="flex items-center gap-2">
            <span className="w-12 shrink-0"><TickerChip ticker={c.ticker} dataset={dataset} onAction={onAction} /></span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-white/75">{c.name}</span>
            {def ? (
              <span className="font-mono text-[11px] tabular-nums" style={{ color: TONE[metricState(c, def.id)] }}>{formatMetric(c.metrics[def.id], def.unit)}</span>
            ) : c.model ? (
              <Pill color={REC_TONE[c.model.recommendation]}>{recStyle[c.model.recommendation].label}</Pill>
            ) : null}
            {!c.inIndex && <Pill color={VERDICT_TONE[c.verdict]}>{verdictStyle[c.verdict].label}</Pill>}
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
    { title: "Model's picks", state: model, accent: same },
    ...(same ? [] : [{ title: "With yours", state: yours, accent: true }]),
  ];
  const maxCa = Math.max(...cols.map((c) => sharePct(c.state, "CA")), 1e-9);
  return (
    <Shell title="What-if · Canadian share and cash" right={
      <button type="button" onClick={() => onAction({ kind: "view", view: "index", label: "Open the Index page" })} className="text-[10px] text-white/50 hover:text-white">Index page →</button>
    }>
      <div className={`grid gap-2 ${cols.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {cols.map((col) => {
          const ca = sharePct(col.state, "CA");
          return (
            <div key={col.title} className={`rounded-lg p-2 ${col.accent ? "bg-[#3ddc6c]/10 ring-1 ring-[#3ddc6c]/35" : "bg-white/[0.045]"}`}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-white/50">{col.title}</div>
              <div className="mt-1 font-mono text-lg font-semibold tabular-nums" style={{ color: col.accent ? TONE.pass : "#fff" }}>{pct(ca)}</div>
              <div className="text-[10px] text-white/45">Canadian</div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                <div className="guide-bar h-full rounded-full" style={{ width: `${(ca / maxCa) * 100}%`, background: col.accent ? TONE.pass : "rgba(255,255,255,0.55)" }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-white/55">
                <span>Cash</span><span className="font-mono tabular-nums">{pct(col.state.cashPct)}</span>
              </div>
              <div className="flex justify-between text-[10px] text-white/55">
                <span>Holdings</span><span className="font-mono tabular-nums">{col.state.rows.length}</span>
              </div>
            </div>
          );
        })}
      </div>
      {scenario.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-white/60">
          <span>Adding</span>
          {scenario.map((a) => (
            <span key={a.ticker} className="flex items-center gap-1">
              <TickerChip ticker={a.ticker} dataset={dataset} onAction={onAction} />
              <span className="font-mono">{trimPct(a.weightPct)}</span>
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
    <Shell title="The model's checks">
      <ul className="space-y-1.5">
        {checks.map((k) => (
          <li key={k.id} className="flex items-start gap-2 text-[12px]">
            <span className="mt-0.5 rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide"
              style={{ color: k.kind === "gate" ? TONE.warn : TONE.pass, background: k.kind === "gate" ? "rgba(232,185,49,0.14)" : "rgba(61,220,108,0.12)" }}>
              {k.kind === "gate" ? "must pass" : "scored"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-white/90">{k.label}</span>
              <span className="block text-[11px] leading-snug text-white/50">{k.rule}</span>
            </span>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
