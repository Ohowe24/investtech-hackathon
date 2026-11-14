"use client";

import Link from "next/link";
import type { Company, Dataset, IndexSnapshot, MetricDef } from "@contract/types";
import { formatValue, formatMetric, pct, recStyle, verdictStyle } from "@/lib/format";
import { scoredMetricInfo } from "@/lib/explain";
import { metricState, scoredMetrics, stateText } from "@/lib/rank";
import { median } from "../../engine/metrics";
import { Dot, Explain } from "./ui";
import { Decode } from "./live/motion";

interface Props {
  dataset: Dataset;
  snapshot: IndexSnapshot;
  /** address of the onboarding, pre-filled with this query */
  editHref: string;
  weightRule?: string;
  onOpen: (ticker: string) => void;
  onGo: (view: string) => void;
}

const hasData = (c: Company) => !!c.model && c.model.checks.some((k) => k.pass !== null);

/** The answer to the onboarding: Canadian candidates ranked, then the index's own holdings ranked the same way. */
export default function Ranking({ dataset, snapshot, editHref, weightRule, onOpen, onGo }: Props) {
  const index = snapshot.indexes.find((i) => i.name === dataset.indexName);
  const byRank = [...dataset.companies].sort((a, b) => (a.model?.rank ?? 1e9) - (b.model?.rank ?? 1e9));
  const candidates = byRank.filter((c) => !c.inIndex);
  const holdings = byRank.filter((c) => c.inIndex);
  const measuredHoldings = holdings.filter(hasData);
  const blankHoldings = holdings.filter((c) => !hasData(c));
  const unmeasured = dataset.unmeasured ?? [];
  const metrics = scoredMetrics(dataset);
  const adds = candidates.filter((c) => c.verdict === "add");
  const checks = dataset.companies[0]?.model?.checks ?? [];

  // Your index's median on each metric, from the holdings that have a value. Shown as a reference row.
  const medians: Record<string, number | null> = Object.fromEntries(
    metrics.map((d) => [d.id, median(measuredHoldings.map((c) => c.metrics[d.id]?.value))]),
  );

  return (
    <div className="space-y-5">
      <section className="spot scan-once rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted">
              <span className="live-dot" /> {dataset.industryName ?? dataset.industryId} ·{" "}
              {dataset.holdingsSource === "organizers" ? `the organizers' “${dataset.indexName}”` : "your index"}
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
              <Decode
                text={adds.length ? `${adds.length} Canadian ${adds.length === 1 ? "company passes" : "companies pass"}: ${adds.map((c) => c.ticker).join(", ")}` : candidates.length ? "No Canadian candidate passes every bar yet" : "No Canadian candidate could be tested"}
                letters duration={900} delay={150} />
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              {candidates.length} Canadian {candidates.length === 1 ? "candidate" : "candidates"} tested{unmeasured.length ? ` (${unmeasured.length} more without data)` : ""}, against {holdings.length} holdings, on {checks.length} declared checks.
              {" "}Ranked by checks passed; must-pass checks come first.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href={editHref} className="rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:border-ink">
              Edit holdings
            </Link>
            {adds.length > 0 && (
              <button onClick={() => onGo("recommendation")} className="rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white">
                Recommendation →
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-line sm:grid-cols-4 sm:divide-x sm:divide-line">
          <Stat label="Add" value={String(adds.length)} sub={adds.length ? `${pct(adds.reduce((s, c) => s + (c.proposedWeightPct ?? 0), 0), 2)} of the index` : "none pass"} />
          <Stat label="Watch" value={String(candidates.filter((c) => c.verdict === "watch").length)} sub="mixed results" />
          <Stat label="Reject" value={String(candidates.filter((c) => c.verdict === "reject").length)} sub="fail a must-pass check" />
          <Stat label="Index cash" value={index ? pct(index.cashPct, 2) : "—"} sub={weightRule ?? "before additions"} />
        </div>
      </section>

      <RankTable
        title="Canadian candidates, ranked"
        subtitle="Each one tested on the same checks as your holdings. Click a row for the full company page."
        dataset={dataset} rows={candidates} metrics={metrics} medians={medians} medianLabel="Your index median" onOpen={onOpen} showVerdict
        empty="No Canadian candidate in this industry has data yet." />

      {unmeasured.length > 0 && (
        <section className="rounded-xl border border-dashed border-white/20 bg-white/[0.03] px-5 py-4">
          <h3 className="text-[13px] font-semibold text-white">Also Canadian, not tested ({unmeasured.length})</h3>
          <p className="mt-0.5 text-xs text-white/55">In this industry&apos;s universe, but the engine has no filing data for them. Nothing is guessed: they are listed, not ranked.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {unmeasured.map((u) => (
              <li key={u.ticker} className="flex items-start gap-3 text-[13px]">
                <span className="mt-px grid h-6 min-w-14 place-items-center rounded-md border border-white/15 px-1.5 font-mono text-[11px] font-semibold text-white/80">{u.ticker}</span>
                <span className="min-w-0 text-white/70"><span className="text-white">{u.name}</span>{u.subSector ? ` · ${u.subSector}` : ""}<span className="block text-xs text-white/45">{u.note}</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <RankTable
        title="Your holdings, ranked on the same checks"
        subtitle="How the index you already own does on the bar the candidates must clear."
        dataset={dataset} rows={measuredHoldings} metrics={metrics} medians={medians} medianLabel="Median" onOpen={onOpen}
        empty={blankHoldings.length ? "None of your holdings has data in the engine's cache yet." : "No holdings."} />

      {blankHoldings.length > 0 && (
        <section className="rounded-xl border border-dashed border-white/20 bg-white/[0.03] px-5 py-4">
          <h3 className="text-[13px] font-semibold text-white">Holdings without data ({blankHoldings.length})</h3>
          <p className="mt-0.5 text-xs text-white/55">
            Kept in the index and in every before/after, but not ranked: the engine has no Onesheet data cached for them.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {blankHoldings.map((c) => (
              <span key={c.ticker} title={c.name} className="rounded-md border border-white/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-white/75">{c.ticker}</span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="border-line px-5 py-3.5 [&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-b-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-ink"><Decode text={value} delay={300} /></div>
      <div className="truncate text-xs text-muted" title={sub}>{sub}</div>
    </div>
  );
}

const ROW = 90;

function RankTable({ title, subtitle, dataset, rows, metrics, medians, medianLabel, onOpen, showVerdict, empty }: {
  title: string; subtitle: string; dataset: Dataset; rows: Company[]; metrics: MetricDef[]; medians: Record<string, number | null>;
  medianLabel: string; onOpen: (t: string) => void; showVerdict?: boolean; empty: string;
}) {
  const showMedian = metrics.some((d) => medians[d.id] != null);
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><Dot pass={true} size={8} /> Pass</span>
          <span className="flex items-center gap-1.5"><Dot pass={false} size={8} /> Fail</span>
          <span className="flex items-center gap-1.5"><Dot pass={null} size={8} /> No data</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas text-[11px] font-medium uppercase tracking-wide text-faint">
                <th className="w-12 py-2.5 pl-5 text-left font-medium">#</th>
                <th className="py-2.5 text-left font-medium">Company</th>
                <th className="py-2.5 text-left font-medium">
                  <Explain info={{ title: "Result", how: dataset.rules?.result }} className="uppercase tracking-wide">Result</Explain>
                </th>
                {metrics.map((d) => (
                  <th key={d.id} className="px-3 py-2.5 text-right font-medium">
                    <Explain info={scoredMetricInfo(dataset, d.id)} className="uppercase tracking-wide">{d.short ?? d.label}</Explain>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-left font-medium">Checks</th>
                {showVerdict && (
                  <th className="py-2.5 pr-5 text-right font-medium">
                    <Explain info={{ title: "Proposed weight", how: dataset.rules?.weight }} className="uppercase tracking-wide">Verdict</Explain>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((c, r) => {
                const m = c.model!;
                const rec = recStyle[m.recommendation];
                const t0 = 200 + r * ROW;
                return (
                  <tr key={c.ticker} onClick={() => onOpen(c.ticker)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen(c.ticker)}
                    style={{ animationDelay: `${t0}ms` }}
                    className="a-rise group cursor-pointer border-b border-line outline-none transition-colors hover:bg-canvas focus-visible:bg-canvas">
                    <td className="relative py-3 pl-5 font-mono text-sm font-semibold tabular-nums text-ink">
                      <span className="absolute inset-y-1 left-0 w-[3px] origin-center scale-y-0 rounded-r bg-signal transition-transform duration-300 group-hover:scale-y-100" />
                      {r + 1}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-8 min-w-14 shrink-0 place-items-center rounded-md bg-soft px-1.5 font-mono text-[11px] font-semibold text-ink">{c.ticker}</span>
                        <div className="min-w-0">
                          <div className="max-w-[220px] truncate font-medium text-ink">{c.name}</div>
                          <div className="max-w-[220px] truncate text-xs text-faint">{[c.subSector, c.listedOn].filter(Boolean).join(" · ")}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`a-stamp rounded-full px-2.5 py-1 text-xs font-medium ${rec.badge}`} style={{ animationDelay: `${t0 + 350}ms` }}>{rec.label}</span>
                    </td>
                    {metrics.map((d) => {
                      const st = metricState(c, d.id);
                      return (
                        <td key={d.id} title={c.metrics[d.id]?.period ? `${c.metrics[d.id]?.period}${c.metrics[d.id]?.note ? ` · ${c.metrics[d.id]?.note}` : ""}` : c.metrics[d.id]?.note}
                          className={`px-3 py-3 text-right font-mono text-[13px] tabular-nums ${stateText[st]}`}>
                          {st === "none" ? "—" : formatMetric(c.metrics[d.id], d.unit)}
                        </td>
                      );
                    })}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-[3px]">
                          {m.checks.map((k) => (
                            <span key={k.id} title={`${k.label}: ${k.pass === null ? "no data" : k.pass ? "pass" : "fail"}`}
                              className={`h-4 w-1.5 rounded-full ${k.pass === null ? "bg-line" : k.pass ? "bg-teal" : "bg-bad"} ${k.kind === "gate" ? "ring-1 ring-ink/30 ring-offset-1" : ""}`} />
                          ))}
                        </div>
                        <span className="font-mono text-xs tabular-nums text-muted">{m.passed}/{m.available}</span>
                      </div>
                    </td>
                    {showVerdict && (
                      <td className="py-3 pr-5 text-right">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${verdictStyle[c.verdict].badge}`}>
                          {verdictStyle[c.verdict].label}{c.proposedWeightPct != null ? ` ${pct(c.proposedWeightPct, 2)}` : ""}
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })}
              {showMedian && (
                <tr className="bg-canvas text-xs text-muted">
                  <td className="py-2.5 pl-5" />
                  <td className="py-2.5 pr-3 font-medium" colSpan={2}>
                    <Explain info={{ title: medianLabel, how: "The middle value among your holdings that have data for this metric. A reference line, not a check." }}>{medianLabel}</Explain>
                  </td>
                  {metrics.map((d) => (
                    <td key={d.id} className="px-3 py-2.5 text-right font-mono tabular-nums">{medians[d.id] == null ? "—" : formatValue(medians[d.id], d.unit)}</td>
                  ))}
                  <td colSpan={showVerdict ? 2 : 1} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
