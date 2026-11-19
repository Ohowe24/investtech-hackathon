"use client";

import { useState } from "react";
import Link from "next/link";
import type { CheckResult, Company, Dataset, IndexSnapshot, MetricDef, QualityScore, Verdict } from "@contract/types";
import { formatValue, formatMetric, listNames, recStyle, verdictStyle } from "@/lib/format";
import { scoredMetricInfo } from "@/lib/explain";
import { metricState, scoredMetrics } from "@/lib/rank";
import { median } from "../../engine/metrics";
import { Dot, Explain } from "./ui";
import { Decode } from "./live/motion";
import OutlookChip, { outlookFor } from "./OutlookChip";

interface Props {
  dataset: Dataset;
  snapshot: IndexSnapshot;
  /** address of the onboarding, pre-filled with this query */
  editHref: string;
  onOpen: (ticker: string) => void;
  onGo: (view: string) => void;
}

const hasData = (c: Company) => !!c.model && c.model.checks.some((k) => k.pass !== null);

/** Verdict groups on the ranking, in order, with the plain rule for each. */
const GROUPS: { id: Verdict; label: string; desc: string }[] = [
  { id: "add", label: "Add", desc: "Passes the must-pass check and enough of the scored checks" },
  { id: "watch", label: "Watch", desc: "Mixed results: not enough checks pass, or not enough data to say" },
  { id: "reject", label: "Reject", desc: "Fails the must-pass check, or too few of its checks pass" },
];
const groupText: Record<string, string> = { add: "text-teal", watch: "text-warn", reject: "text-bad" };
const groupLine: Record<string, string> = { add: "border-teal", watch: "border-warn", reject: "border-bad" };
const tileStyle: Record<string, string> = {
  add: "bg-teal text-white",
  watch: "bg-warnsoft text-warn ring-1 ring-inset ring-warn/35",
  reject: "bg-badsoft text-bad ring-1 ring-inset ring-bad/35",
  existing: "bg-soft text-muted",
};

/** The answer to the onboarding: Canadian candidates ranked, then the index's own holdings ranked the same way. */
export default function Ranking({ dataset, editHref, onOpen, onGo }: Props) {
  const byRank = [...dataset.companies].sort((a, b) => (a.model?.rank ?? 1e9) - (b.model?.rank ?? 1e9));
  const candidates = byRank.filter((c) => !c.inIndex);
  const holdings = byRank.filter((c) => c.inIndex);
  const measuredHoldings = holdings.filter(hasData);
  const blankHoldings = holdings.filter((c) => !hasData(c));
  const unmeasured = dataset.unmeasured ?? [];
  const metrics = scoredMetrics(dataset);
  const adds = candidates.filter((c) => c.verdict === "add");
  const checks = dataset.companies[0]?.model?.checks ?? [];
  const many = candidates.length > 12;
  const count = (v: Verdict) => candidates.filter((c) => c.verdict === v).length;

  // Your index's median on each metric, from the holdings that have a value. Shown as a reference row.
  const medians: Record<string, number | null> = Object.fromEntries(
    metrics.map((d) => [d.id, median(measuredHoldings.map((c) => c.metrics[d.id]?.value))]),
  );

  return (
    <div className="space-y-5">
      <section className="spot scan-once panel grid gap-8 px-6 py-7 md:px-8 lg:grid-cols-[1fr_minmax(0,500px)]">
        <div className="min-w-0">
          <div className="kicker flex items-center gap-2">
            <span className="live-dot" /> {dataset.industryName ?? dataset.industryId} ·{" "}
            {dataset.holdingsSource === "organizers" ? `with the organizers' “${dataset.indexName}” holdings` : holdings.length ? `with your ${holdings.length} ${holdings.length === 1 ? "stock" : "stocks"}` : "Canadian candidates"}
          </div>
          <h1 className="mt-3 text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink md:text-[38px]">
            <Decode
              text={adds.length ? `${adds.length} Canadian ${adds.length === 1 ? "company passes" : "companies pass"}${adds.length <= 3 ? `: ${listNames(adds.map((c) => c.ticker))}` : " the bar"}` : candidates.length ? "No Canadian candidate passes every bar yet" : "No Canadian candidate could be tested"}
              letters duration={900} delay={150} />
          </h1>
          {adds.length === 1 && <div className="mt-1.5 text-lg font-semibold text-teal">{adds[0].name}</div>}
          <p className="mt-3 max-w-xl text-[15px] text-muted">
            {candidates.length} Canadian {candidates.length === 1 ? "candidate" : "candidates"} tested{unmeasured.length ? ` (${unmeasured.length} more without data)` : ""}{holdings.length ? `, against your ${holdings.length} ${holdings.length === 1 ? "stock" : "stocks"}` : ""}, on {checks.length} declared checks.
            {" "}{dataset.rules?.score ? "Verdict from the checks; within each verdict, ranked by quality score out of 100." : "Ranked by checks passed; must-pass checks come first."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link href={editHref} className="rounded-[10px] border border-line px-4 py-2 text-[13.5px] font-medium text-ink transition-colors hover:border-ink">
              {holdings.length ? "Edit your stocks" : "Add your stocks"}
            </Link>
            {adds.length > 0 && (
              <button onClick={() => onGo("recommendation")} className="rounded-[10px] bg-ink px-4 py-2 text-[13.5px] font-semibold text-white">
                Recommendation →
              </button>
            )}
          </div>
        </div>

        {candidates.length > 0 && (
          <div className="min-w-0">
            <div className="kicker mb-3">All {candidates.length} candidates, best to worst</div>
            {/* One row when they fit; a wrapping grid when there are many. */}
            <div className={many ? "grid grid-cols-[repeat(auto-fill,minmax(46px,1fr))] gap-1" : "flex gap-1"}>
              {candidates.map((c, i) => (
                <button key={c.ticker} onClick={() => onOpen(c.ticker)} title={`#${i + 1} ${c.name} · ${verdictStyle[c.verdict].label}`}
                  className={`tile-${c.verdict} flex min-w-0 flex-col justify-end rounded-lg p-1.5 text-left font-mono text-[10px] font-semibold transition-transform hover:-translate-y-0.5 ${tileStyle[c.verdict]} ${many ? "h-11" : `h-14 flex-1 ${c.verdict === "add" ? "flex-[1.7]" : ""}`}`}>
                  <span className="text-[9px] font-medium opacity-70">#{i + 1}</span>
                  <span className="truncate">{c.ticker}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {GROUPS.map((g) => (
                <div key={g.id} className={`border-t-2 pt-2 ${groupLine[g.id]}`}>
                  <div className={`kicker ${groupText[g.id]}`}>{g.label}</div>
                  <div className="mt-1 text-[26px] font-bold leading-none tracking-tight text-ink"><Decode text={String(count(g.id))} delay={300} /></div>
                  <div className="mt-1 text-xs text-faint">{g.id === "add" ? (adds.length ? "pass the bar" : "none pass") : g.id === "watch" ? "mixed results" : "fail the bar"}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-baseline gap-3 rounded-xl border border-line bg-[var(--panel-hi)] px-4 py-3">
              <span className="kicker">Your stocks</span>
              <span className="font-mono text-lg font-semibold text-ink">{holdings.length}</span>
              <span className="text-[12.5px] text-faint">{holdings.length ? "ranked on the same checks, below" : "none added: candidates are ranked against each other"}</span>
            </div>
          </div>
        )}
      </section>

      <RankTable
        title="Canadian candidates, ranked"
        subtitle={`Each one tested on the same checks${holdings.length ? " as your stocks" : ""}. Click ▾ to see why; click a row for the full company page.`}
        dataset={dataset} rows={candidates} metrics={metrics} medians={medians} medianLabel="Your stocks' median" onOpen={onOpen} grouped
        empty="No Canadian candidate in this industry has data yet." />

      {unmeasured.length > 0 && (
        <section className="panel px-6 py-5">
          <h3 className="text-[13px] font-semibold text-ink">Also Canadian, not tested ({unmeasured.length})</h3>
          <p className="mt-0.5 text-xs text-muted">In this industry&apos;s universe, but the engine has no filing data for them. Nothing is guessed: they are listed, not ranked.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {unmeasured.map((u) => (
              <li key={u.ticker} className="flex items-start gap-3 text-[13px]">
                <span className="mt-px grid h-6 min-w-14 place-items-center rounded-md border border-line px-1.5 font-mono text-[11px] font-semibold text-ink">{u.ticker}</span>
                <span className="min-w-0 text-muted"><span className="text-ink">{u.name}</span>{u.subSector ? ` · ${u.subSector}` : ""}<span className="block text-xs text-faint">{u.note}</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {holdings.length > 0 && <RankTable
        title="Your stocks, ranked on the same checks"
        subtitle="How the stocks you added do on the bar the candidates must clear."
        dataset={dataset} rows={measuredHoldings} metrics={metrics} medians={medians} medianLabel="Median" onOpen={onOpen}
        empty="None of your stocks has data in the engine's cache yet." />}

      {blankHoldings.length > 0 && (
        <section className="panel px-6 py-5">
          <h3 className="text-[13px] font-semibold text-ink">Your stocks without data ({blankHoldings.length})</h3>
          <p className="mt-0.5 text-xs text-muted">Listed, not ranked: the engine has no Onesheet data cached for them.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {blankHoldings.map((c) => (
              <span key={c.ticker} title={c.name} className="rounded-md border border-line px-2 py-0.5 font-mono text-[11px] font-semibold text-ink">{c.ticker}</span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const ROW = 70;
const HEAD = "py-3 align-bottom font-medium";

/** The checks on one metric, as the bar a value must clear ("≥ 5.8%"), and whether any is must-pass. */
function barFor(dataset: Dataset, metricId: string): { target: string; gate: boolean } {
  const ks = (dataset.companies.find((c) => c.model)?.model?.checks ?? []).filter((k) => k.metricId === metricId);
  return { target: ks.map((k) => k.target).join(" · "), gate: ks.some((k) => k.kind === "gate") };
}

export function Pips({ checks, passed, available }: { checks: CheckResult[]; passed: number; available: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-[3px]">
        {checks.map((k, i) => (
          <span key={k.id} title={`${k.label}: ${k.pass === null ? "no data" : k.pass ? "pass" : "fail"}`}
            className={`h-[18px] w-1.5 rounded-full ${k.pass === null ? "ring-1 ring-inset ring-faint/60" : k.pass ? "bg-teal" : "bg-bad"} ${k.kind === "gate" && i === 0 ? "mr-1" : ""}`} />
        ))}
      </div>
      <span className="font-mono text-xs tabular-nums text-muted">{passed}/{available}</span>
    </div>
  );
}

function RankTable({ title, subtitle, dataset, rows, metrics, medians, medianLabel, onOpen, grouped, empty }: {
  title: string; subtitle: string; dataset: Dataset; rows: Company[]; metrics: MetricDef[]; medians: Record<string, number | null>;
  medianLabel: string; onOpen: (t: string) => void; grouped?: boolean; empty: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const showMedian = metrics.some((d) => medians[d.id] != null);
  const hasScore = !!dataset.rules?.score;
  const cols = 3 + metrics.length + (grouped ? 1 : 0) + (hasScore ? 1 : 0);
  // Consecutive metric columns that are must-pass, or scored, for the group row above the headers.
  const runs: { gate: boolean; n: number }[] = [];
  for (const d of metrics) {
    const gate = barFor(dataset, d.id).gate;
    const last = runs[runs.length - 1];
    if (last && last.gate === gate) last.n++;
    else runs.push({ gate, n: 1 });
  }
  // Rank numbers run through the whole list, across groups.
  const rankNo = new Map(rows.map((c, i) => [c.ticker, i + 1]));
  const known = (c: Company) => GROUPS.some((g) => g.id === c.verdict);
  const groups: { g: { id: string; label: string; desc: string } | null; rows: Company[] }[] = grouped
    ? [
        ...GROUPS.map((g) => ({ g, rows: rows.filter((c) => c.verdict === g.id) })).filter((x) => x.rows.length),
        ...(rows.some((c) => !known(c)) ? [{ g: { id: "existing", label: "Other", desc: "" }, rows: rows.filter((c) => !known(c)) }] : []),
      ]
    : [{ g: null, rows }];

  return (
    <section className="panel">
      <div className="flex flex-wrap items-end justify-between gap-3 px-6 pb-4 pt-5">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
          <p className="mt-0.5 text-[13px] text-faint">{subtitle}</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><Dot pass={true} size={8} /> Pass</span>
          <span className="flex items-center gap-1.5"><Dot pass={false} size={8} /> Fail</span>
          <span className="flex items-center gap-1.5"><Dot pass={null} size={8} /> No data</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-line px-6 py-6 text-sm text-muted">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {/* Column groups: which checks must pass, which are scored, and the result. */}
              <tr className="bg-[var(--panel-hi)]">
                <th colSpan={2} className="border-t border-line" />
                {runs.map((r, i) => (
                  <th key={i} colSpan={r.n} className="border-t border-line px-2 pb-0 pt-3 text-left font-medium">
                    <span className={`block whitespace-nowrap border-b pb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${r.gate ? "border-warn/50 text-warn" : "border-line text-faint"}`}>
                      {r.gate ? "Must pass" : "Scored checks"}
                    </span>
                  </th>
                ))}
                <th colSpan={1 + (hasScore ? 1 : 0) + (grouped ? 1 : 0)} className={`border-t border-line pb-0 pl-3 pr-5 pt-3 text-left font-medium ${hasScore ? "border-l" : ""}`}>
                  <span className="block border-b border-line pb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">Result</span>
                </th>
              </tr>
              <tr className="border-b border-line bg-[var(--panel-hi)] text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                <th className={`${HEAD} w-10 pl-5 text-left`}>#</th>
                <th className={`${HEAD} text-left`}>Company</th>
                {metrics.map((d) => (
                  <th key={d.id} className={`${HEAD} px-2 text-right leading-[1.35]`}>
                    <Explain info={scoredMetricInfo(dataset, d.id)} className="inline-block max-w-[92px] text-balance text-right">{d.short ?? d.label}</Explain>
                  </th>
                ))}
                {hasScore && (
                  <th className={`${HEAD} border-l border-line px-3 text-left`}>
                    <Explain info={{ title: "Quality score", how: dataset.rules?.score }}>Score</Explain>
                  </th>
                )}
                <th className={`${HEAD} px-3 text-left`}>Checks</th>
                {grouped && (
                  <th className={`${HEAD} pr-5 text-right`}>
                    <Explain info={{ title: "Verdict", how: dataset.rules?.result }}>Verdict</Explain>
                  </th>
                )}
              </tr>
            </thead>
            {groups.map(({ g, rows: grp }) => (
              <tbody key={g?.id ?? "all"}>
                {g && (
                  <tr>
                    <td colSpan={cols} className="px-5 pb-2 pt-5">
                      <div className="flex items-center gap-2.5">
                        <span className={`kicker ${groupText[g.id] ?? "text-muted"}`}>{g.label}</span>
                        <span className="rounded-full bg-soft px-2 font-mono text-[11px] font-semibold text-muted">{grp.length}</span>
                        {g.desc && <span className="text-[12.5px] text-faint">{g.desc}</span>}
                      </div>
                    </td>
                  </tr>
                )}
                {grp.flatMap((c) => {
                  const m = c.model!;
                  const n = rankNo.get(c.ticker)!;
                  const top = grouped && n === 1 && c.verdict === "add";
                  const isOpen = open === c.ticker;
                  const t0 = 200 + n * ROW;
                  // When a verdict was typed by hand, also show what the model said.
                  const modelVerdict = m.recommendation === "pass" ? "add" : m.recommendation === "fail" ? "reject" : "watch";
                  const row = (
                    <tr key={c.ticker} onClick={() => onOpen(c.ticker)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen(c.ticker)}
                      style={{ animationDelay: `${t0}ms` }}
                      className={`a-rise group cursor-pointer outline-none transition-colors hover:bg-canvas focus-visible:bg-canvas ${isOpen ? "" : "border-b border-line"} ${top ? "bg-gradient-to-r from-tealsoft to-transparent" : ""}`}>
                      <td className={`relative py-3.5 pl-5 font-mono text-[15px] font-semibold tabular-nums ${top ? "text-teal" : "text-faint"}`}>
                        <span className={`absolute inset-y-2 left-0 w-[3px] rounded-r bg-teal transition-transform duration-300 ${top ? "" : "origin-center scale-y-0 group-hover:scale-y-100"}`} />
                        {n}
                      </td>
                      <td className="py-3.5 pr-2">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-7 min-w-[46px] shrink-0 place-items-center rounded-md border border-line bg-[var(--panel-hi)] px-1.5 font-mono text-[11.5px] font-semibold text-ink">{c.ticker}</span>
                          <div className="min-w-0">
                            <div className="max-w-[170px] truncate font-semibold text-ink">{c.name}</div>
                            <div className="max-w-[170px] truncate text-xs text-faint">{[c.subSector, c.listedOn].filter(Boolean).join(" · ")}</div>
                            {outlookFor(c.ticker) && <div className="mt-1"><OutlookChip ticker={c.ticker} /></div>}
                          </div>
                        </div>
                      </td>
                      {metrics.map((d) => {
                        const st = metricState(c, d.id);
                        const mv = c.metrics[d.id];
                        return (
                          <td key={d.id} title={mv?.period ? `${mv.period}${mv.note ? ` · ${mv.note}` : ""}` : mv?.note}
                            className="whitespace-nowrap px-1.5 py-3.5 text-right font-mono text-[13px] tabular-nums">
                            <span className="inline-flex items-center gap-1.5">
                              <span className={st === "none" ? "text-faint" : st === "fail" ? "rounded-md bg-badsoft px-1.5 py-0.5 text-bad" : "text-ink"}>
                                {st === "none" ? "—" : formatMetric(mv, d.unit)}
                              </span>
                              {st !== "plain" && <Dot pass={st === "none" ? null : st === "pass"} size={7} />}
                            </span>
                          </td>
                        );
                      })}
                      {hasScore && <td className="border-l border-line px-3 py-3.5"><ScoreCell score={m.score} /></td>}
                      <td className="px-3 py-3.5"><Pips checks={m.checks} passed={m.passed} available={m.available} /></td>
                      {grouped && (
                        <td className="py-3.5 pr-4 text-right">
                          <span className="inline-flex items-center gap-1">
                            {c.verdict !== modelVerdict && <span className="text-[11px] text-faint" title="The engine's result; this verdict was set by hand">model: {recStyle[m.recommendation].label}</span>}
                            <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${verdictStyle[c.verdict].badge}`}>
                              {verdictStyle[c.verdict].label}
                            </span>
                            <button onClick={(e) => { e.stopPropagation(); setOpen(isOpen ? null : c.ticker); }} aria-expanded={isOpen}
                              aria-label={`Why ${c.ticker} is ${verdictStyle[c.verdict].label}`} title="Why"
                              className="grid h-6 w-6 place-items-center rounded-md text-[11px] text-faint hover:bg-soft hover:text-ink">
                              {isOpen ? "▴" : "▾"}
                            </button>
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                  return isOpen ? [row, (
                    <tr key={`${c.ticker}-why`} className="border-b border-line">
                      <td colSpan={cols} className="px-5 pb-4 pl-[60px]">
                        <Reason company={c} />
                        {m.score && <ScoreBreakdown dataset={dataset} company={c} />}
                      </td>
                    </tr>
                  )] : [row];
                })}
              </tbody>
            ))}
            {showMedian && (
              <tbody>
                <tr className="bg-[var(--panel-hi)] text-xs text-muted">
                  <td className="py-3 pl-5" />
                  <td className="py-3 pr-3 font-medium">
                    <Explain info={{ title: medianLabel, how: "The middle value among your stocks that have data for this metric. A reference line, not a check." }}>{medianLabel}</Explain>
                  </td>
                  {metrics.map((d) => (
                    <td key={d.id} className="px-1.5 py-3 text-right font-mono tabular-nums">{medians[d.id] == null ? "—" : formatValue(medians[d.id], d.unit)}</td>
                  ))}
                  <td colSpan={(grouped ? 2 : 1) + (hasScore ? 1 : 0)} />
                </tr>
              </tbody>
            )}
          </table>
        </div>
      )}
      {grouped && dataset.rules?.result && (
        <p className="border-t border-line px-6 py-3.5 text-xs text-faint">{dataset.rules.result}</p>
      )}
    </section>
  );
}

/** Why a company got its verdict: failed checks in red, checks without data listed plainly. */
export function Reason({ company: c }: { company: Company }) {
  const checks = c.model?.checks ?? [];
  const failed = checks.filter((k) => k.pass === false);
  const nd = checks.filter((k) => k.pass === null);
  const passed = checks.filter((k) => k.pass === true);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {failed.length > 0 && <span className="kicker mr-1">Failed</span>}
      {failed.map((k) => <span key={k.id} title={k.rule} className="rounded-md bg-badsoft px-2 py-0.5 text-bad">{k.label}</span>)}
      {nd.length > 0 && <span className={`kicker mr-1 ${failed.length ? "ml-3" : ""}`}>No data</span>}
      {nd.map((k) => <span key={k.id} title={c.metrics[k.metricId]?.note ?? k.rule} className="rounded-md px-2 py-0.5 text-muted ring-1 ring-inset ring-line">{k.label}</span>)}
      {failed.length === 0 && nd.length === 0 && passed.length > 0 && <span className="rounded-md bg-tealsoft px-2 py-0.5 text-teal">Passes all {passed.length} checks</span>}
    </div>
  );
}

/** Score out of 100 with a thin bar under it. "—" when the data covers too little of the weight. */
export function ScoreCell({ score, big }: { score?: QualityScore; big?: boolean }) {
  const v = score?.value;
  if (v == null) return <span title={score?.note} className="font-mono text-[13px] text-faint">—</span>;
  const tone = v >= 70 ? "bg-teal" : v >= 45 ? "bg-warn" : "bg-bad";
  return (
    <span title={score?.note} className="inline-flex items-center gap-2.5">
      <span className={`text-right font-mono font-semibold tabular-nums text-ink ${big ? "w-8 text-[18px]" : "w-7 text-[15px]"}`}>{v}</span>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-line"><span className={`block h-full rounded-full ${tone}`} style={{ width: `${v}%` }} /></span>
    </span>
  );
}

/** Points earned on each weighted variable: the value, the grade as points out of the weight, and how it is graded. */
export function ScoreBreakdown({ dataset, company: c }: { dataset: Dataset; company: Company }) {
  const s = c.model?.score;
  if (!s) return null;
  return (
    <div className="mt-3 max-w-3xl">
      <div className="kicker mb-1.5">Quality score{s.value != null ? `: ${s.value} / 100` : ""}</div>
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {s.parts.map((p) => {
          const d = dataset.metricDefs.find((m) => m.id === p.metricId);
          const earned = p.grade == null ? null : Math.round(p.grade * p.weight * 10) / 10;
          return (
            <div key={p.metricId} title={p.scale} className="flex items-center gap-2 text-xs">
              <span className="w-40 truncate text-muted">{d?.short ?? d?.label ?? p.metricId}</span>
              <span className="w-16 text-right font-mono tabular-nums text-ink">{formatMetric(c.metrics[p.metricId], d?.unit ?? "pct")}</span>
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line"><span className="block h-full bg-teal" style={{ width: `${(p.grade ?? 0) * 100}%` }} /></span>
              <span className="whitespace-nowrap font-mono tabular-nums text-faint">{earned == null ? "no data" : `${earned} / ${p.weight}`}</span>
            </div>
          );
        })}
      </div>
      {s.note && <p className="mt-1.5 text-[11.5px] text-faint">{s.note}</p>}
    </div>
  );
}

