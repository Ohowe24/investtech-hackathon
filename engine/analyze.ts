// ANALYZE: one industry profile + one list of index holdings -> a Dataset.
//
// Pure: no file system, no network. build.ts calls it to write data/companies.json, and the website
// calls it on the server for whatever holdings the user typed in. Same code, same numbers.
//
// What it does:
//   1. Candidates = the industry's Canadian universe, minus anything already held.
//   2. Every holding and every candidate gets the profile's metrics, from the store only.
//   3. The profile's declared checks give each company a result; companies are ranked.
//   4. Candidates the model passes get weights, from the profile's sleeve and cap.
// A company with no data is never guessed at: holdings keep their row with empty metrics and a note,
// candidates without data are listed in `unmeasured`.

import type { CheckResult, Company, Dataset, IndexPosition, MetricValue, ModelResult, ReportedSeries, Verdict, YearRow } from "../contract/types";
import { factSeries, periodLabel } from "./facts";
import type { IndustryProfile } from "./industries/types";
import { acquisitionIntensity, equalWeights, freeCashFlow, netDebt, netDebtToEbitda, passes, pctChange, perShare, quadrant, ratioOfPositive, sumStrict, tally } from "./metrics";
import { cashReturnFor } from "./statements";
import type { Store, StoredCompany } from "./store";

export interface AnalyzeRequest {
  /** tickers the index already holds, in the user's order */
  holdings: string[];
  /** where the holdings came from: the organizers' live index, or typed by the user */
  holdingsSource: "organizers" | "user";
  /** the organizers' positions, used only for labels (country, sub-sector) of holdings the store does not know */
  positions?: IndexPosition[];
}

export interface AnalyzeResult {
  dataset: Dataset;
  warnings: string[];
}

const NO_DATA = "No Onesheet data for this company in the cache";

export function analyze(profile: IndustryProfile, store: Store, req: AnalyzeRequest): AnalyzeResult {
  const warnings: string[] = [];
  const held = new Set(req.holdings);
  const universe = new Map(profile.universe.map((u) => [u.ticker, u]));
  const positionOf = new Map((req.positions ?? []).map((p) => [p.ticker, p]));

  const rowsFor = (t: string) => store.companies[t]?.financials ?? [];
  const factsFor = (t: string) => store.companies[t]?.facts ?? [];

  const metricsFor = (t: string): Record<string, MetricValue> => {
    const s = store.companies[t];
    const out = profile.computeMetrics(rowsFor(t), {
      ticker: t,
      lookup: (file) => s?.extras[file],
      facts: factsFor(t),
      distributions: s?.distributions ?? [],
    });
    // A company the store has never seen gets one clear note instead of a list of computation warnings.
    if (s) warnings.push(...out.warnings);
    if (!s) for (const m of Object.values(out.metrics)) if (m.value == null) m.note = NO_DATA;
    return out.metrics;
  };

  const checksFor = (metrics: Record<string, MetricValue>): CheckResult[] =>
    profile.checks.map((k) => {
      const unit = profile.metricDefs.find((m) => m.id === k.metricId)?.unit;
      return {
        id: k.id,
        label: k.label,
        rule: k.rule,
        target: `${k.op === ">=" ? "≥" : "≤"} ${unit === "multiple" ? `${Math.round(k.threshold * 100) / 100}×` : `${Math.round(k.threshold * 1000) / 10}%`}`,
        threshold: k.threshold,
        op: k.op,
        kind: k.kind,
        metricId: k.metricId,
        pass: passes(metrics[k.metricId]?.value, k.op, k.threshold),
      };
    });

  type Draft = { ticker: string; isCandidate: boolean; metrics: Record<string, MetricValue>; checks: CheckResult[]; t: ReturnType<typeof tally> };
  const draft = (ticker: string, isCandidate: boolean): Draft => {
    const metrics = metricsFor(ticker);
    const checks = checksFor(metrics);
    const t = tally(
      checks.filter((k) => k.kind === "gate").map((k) => k.pass),
      checks.filter((k) => k.kind === "score").map((k) => k.pass),
      profile.scoring,
    );
    return { ticker, isCandidate, metrics, checks, t };
  };

  // 1-2. Candidates and holdings, measured.
  const candidateDrafts: Draft[] = [];
  const unmeasured: NonNullable<Dataset["unmeasured"]> = [];
  for (const u of profile.universe) {
    if (held.has(u.ticker)) continue;
    const d = draft(u.ticker, true);
    if (d.checks.every((k) => k.pass === null)) {
      unmeasured.push({
        ticker: u.ticker,
        name: u.name,
        listedOn: u.listedOn,
        subSector: u.subSector,
        why: u.why,
        note: store.companies[u.ticker] ? "Data on file is too thin for any check" : NO_DATA,
      });
    } else candidateDrafts.push(d);
  }
  const holdingDrafts = req.holdings.map((t) => draft(t, false));
  const drafts = [...candidateDrafts, ...holdingDrafts];

  // 3. Rank: recommendation first, then share of scored checks passed, then how many had data, then the profile's tie-break metric.
  const recOrder = { pass: 0, mixed: 1, fail: 2 } as const;
  const share = (d: Draft) => (d.t.available > 0 ? d.t.passed / d.t.available : 0);
  const hasData = (d: Draft) => (d.checks.some((k) => k.pass !== null) ? 0 : 1);
  const ranked = [...drafts].sort(
    (a, b) =>
      hasData(a) - hasData(b) ||
      recOrder[a.t.recommendation] - recOrder[b.t.recommendation] ||
      share(b) - share(a) ||
      b.t.available - a.t.available ||
      (b.metrics[profile.rankTiebreak]?.value ?? -Infinity) - (a.metrics[profile.rankTiebreak]?.value ?? -Infinity),
  );
  const rankOf = new Map(ranked.map((d, i) => [d.ticker, i + 1]));

  // 4. Weights: equal split of the sleeve across the candidates being added; related companies share one slot.
  const modelVerdict = (rec: ModelResult["recommendation"]): Verdict => (rec === "pass" ? "add" : rec === "mixed" ? "watch" : "reject");
  const verdictOf = (d: Draft): Verdict => (d.isCandidate ? (store.decisions[d.ticker]?.verdict ?? modelVerdict(d.t.recommendation)) : "existing");
  const adds = candidateDrafts.filter((d) => verdictOf(d) === "add").map((d) => d.ticker);
  const groups: string[][] = [];
  for (const t of adds) {
    const related = profile.relatedGroups.find((g) => g.includes(t));
    const existing = related && groups.find((g) => g.some((x) => related.includes(x)));
    if (existing) existing.push(t);
    else groups.push([t]);
  }
  const modelWeights = equalWeights(groups, profile.sleevePct, profile.maxWeightPct);

  const modelReason = (d: Draft): string => {
    const failed = d.checks.filter((k) => k.pass === false).map((k) => k.label);
    const unknown = d.checks.filter((k) => k.pass === null).map((k) => k.label);
    const parts: string[] = [];
    if (failed.length) parts.push(`Failed: ${failed.join(", ")}.`);
    if (unknown.length) parts.push(`No data: ${unknown.join(", ")}.`);
    return parts.join(" ") || "Passed every check.";
  };

  const reportedFor = (t: string): ReportedSeries[] =>
    (profile.reportedSeries ?? [])
      .map((r) => {
        const { basis, points } = factSeries(factsFor(t), r.filter, r.kind);
        return {
          id: r.id, label: r.label, unit: r.unit, basis,
          ...(r.metricId ? { metricId: r.metricId } : {}),
          ...(r.note ? { note: r.note } : {}),
          points: points.map((x) => ({ label: periodLabel(x).replace(/^at /, ""), date: x.reportDate, value: x.value, sourceId: x.sourceId })),
        };
      })
      .filter((r) => r.points.length > 0);

  const companies: Company[] = drafts.map((d) => {
    const s: StoredCompany | undefined = store.companies[d.ticker];
    const u = universe.get(d.ticker);
    const p = positionOf.get(d.ticker);
    const decision = d.isCandidate ? store.decisions[d.ticker] : undefined;
    const verdict = verdictOf(d);
    const rows = rowsFor(d.ticker);
    return {
      ticker: d.ticker,
      name: u?.name ?? (s && s.name !== d.ticker ? s.name : undefined) ?? profile.holdingNames[d.ticker] ?? d.ticker,
      hqCountry: s?.hqCountry || (u ? "CA" : p?.countryCode) || "??",
      listedOn: d.isCandidate ? (u?.listedOn ?? s?.listedOn) : s?.listedOn,
      // A holding keeps the index's own label; a candidate takes the universe's.
      subSector: d.isCandidate ? (u?.subSector ?? s?.subSector) : (s?.subSector ?? p?.subSector ?? u?.subSector),
      inIndex: !d.isCandidate,
      metrics: d.metrics,
      zone: quadrant(d.metrics[profile.map.x]?.value, d.metrics[profile.map.y]?.value, profile.map.xThreshold, profile.map.yThreshold, profile.map.zones),
      verdict,
      verdictSource: decision || !d.isCandidate ? "human" : "model",
      proposedWeightPct: verdict === "add" ? (decision?.proposedWeightPct ?? modelWeights[d.ticker]) : undefined,
      reason: decision?.reason || (d.isCandidate ? modelReason(d) : undefined),
      model: { checks: d.checks, ...d.t, rank: rankOf.get(d.ticker)! },
      history: historyFor(rows),
      totals: totalsFor(rows),
      ...(s?.deals ? { deals: s.deals } : {}),
      ...(!s ? { dataNote: NO_DATA } : {}),
      ...(reportedFor(d.ticker).length ? { reported: reportedFor(d.ticker) } : {}),
      reportingCurrency: rows[rows.length - 1]?.currency || undefined,
    };
  });

  // Only the sources this dataset points at.
  const used = new Set<string>();
  for (const c of companies) {
    for (const m of Object.values(c.metrics)) m.sourceIds.forEach((id) => used.add(id));
    for (const h of c.history ?? []) h.sourceIds.forEach((id) => used.add(id));
    for (const r of c.reported ?? []) r.points.forEach((p) => used.add(p.sourceId));
  }
  const gates = profile.checks.filter((k) => k.kind === "gate").length;

  const dataset: Dataset = {
    isFake: store.isFake,
    industryId: profile.id,
    industryName: profile.name,
    generatedAt: new Date().toISOString(),
    indexName: profile.indexName,
    holdingsSource: req.holdingsSource,
    currency: profile.currency,
    question: profile.question,
    metricDefs: profile.metricDefs,
    rules: {
      result:
        `Passes: ${gates === 1 ? "the must-pass check passes" : `${gates === 2 ? "both" : `all ${gates}`} must-pass checks pass`}, and ` +
        (profile.scoring.passShare >= 1
          ? `every other check passes, with data on at least ${profile.scoring.minAvailable} of them. `
          : `at least ${profile.scoring.passShare * 100}% of the other checks with data pass (${profile.scoring.minAvailable} or more with data). `) +
        `Fails: ${gates === 1 ? "the" : "a"} must-pass check fails, or fewer than ${profile.scoring.mixedShare * 100}% pass. Mixed: anything else. Every scored check counts the same: there are no weights. Missing data is never a fail.`,
      weight:
        `${profile.sleevePct}% of the index is split equally among the companies we add, at most ${profile.maxWeightPct}% each.` +
        profile.relatedGroups.map((g) => ` ${g.join(" and ")} share one slot (one controls the other).`).join(""),
    },
    map: profile.map,
    mapTitle: profile.mapTitle,
    hasStatements: profile.hasStatements,
    companies,
    unmeasured,
    sources: store.sources.filter((s) => used.has(s.id)),
  };
  return { dataset, warnings };
}

function historyFor(rows: StoredCompany["financials"]): YearRow[] {
  return rows.map((r, i) => {
    const fcf = freeCashFlow(r.ocf, r.capex);
    return {
      fiscalYear: r.year,
      revenue: r.revenue,
      operatingCashFlow: r.ocf,
      freeCashFlow: fcf,
      acquisitions: r.acquisitions,
      dilutedShares: r.shares,
      fcfPerShare: perShare(fcf, r.shares),
      cashReturn: cashReturnFor(rows, i),
      capex: r.capex,
      ebitda: r.ebitda,
      totalDebt: r.debt,
      cash: r.cash,
      totalEquity: r.equity,
      goodwill: r.goodwill,
      netDebt: netDebt(r.debt, r.cash),
      revenueGrowth: rows[i - 1] && r.year - rows[i - 1].year === 1 ? pctChange(rows[i - 1].revenue, r.revenue) : null,
      ebitdaMargin: ratioOfPositive(r.ebitda, r.revenue),
      ocfMargin: ratioOfPositive(r.ocf, r.revenue),
      fcfMargin: ratioOfPositive(fcf, r.revenue),
      fcfConversion: ratioOfPositive(fcf, r.ebitda),
      capexIntensity: ratioOfPositive(r.capex, r.revenue),
      acqToOcf: acquisitionIntensity(r.acquisitions, r.ocf),
      netDebtToEbitda: netDebtToEbitda(r.debt, r.cash, r.ebitda),
      goodwillToEquity: ratioOfPositive(r.goodwill, r.equity),
      revenuePerShare: perShare(r.revenue, r.shares),
      sourceIds: r.sourceId ? [r.sourceId] : [],
    };
  });
}

function totalsFor(rows: StoredCompany["financials"]): Company["totals"] {
  if (rows.length === 0) return undefined;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const fcf = sumStrict(rows.map((r) => freeCashFlow(r.ocf, r.capex)));
  const acq = sumStrict(rows.map((r) => r.acquisitions));
  const diff = (a: number | null, b: number | null) => (a == null || b == null ? null : sumStrict([b, -a]));
  return {
    period: `FY${first.year}–FY${last.year}`,
    operatingCashFlow: sumStrict(rows.map((r) => r.ocf)),
    capex: sumStrict(rows.map((r) => r.capex)),
    freeCashFlow: fcf,
    acquisitions: acq,
    fcfAfterAcquisitions: diff(acq, fcf),
    revenueAdded: diff(first.revenue, last.revenue),
    goodwillAdded: diff(first.goodwill, last.goodwill),
  };
}
