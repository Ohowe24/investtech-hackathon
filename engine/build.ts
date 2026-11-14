// ENGINE: spreadsheets in -> data/companies.json out.  Run:  npm run engine [-- --industry <id>]
//
// The industry profile (engine/industries/) supplies the index, metrics, checks and map. Default: acquirers.
// Reads engine/input/ if it has companies.csv, otherwise engine/input-sample/ (FAKE).
// Writes data/companies.json, which is the only file the website reads.
// Numbers are computed here; verdicts and reasons are human decisions taken from companies.csv.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult, Company, Deal, Dataset, MetricValue, ModelResult, Source, Verdict, YearRow } from "../contract/types";
import { num, parseCsv } from "./csv";
import { getIndustry } from "./industries";
import type { FinRow } from "./industries/types";
import { acquisitionIntensity, equalWeights, freeCashFlow, netDebt, netDebtToEbitda, passes, ratioOfPositive, pctChange, perShare, quadrant, sumStrict, tally } from "./metrics";
import { cashReturnFor } from "./statements";

const industryArg = process.argv.indexOf("--industry");
const config = getIndustry(industryArg >= 0 ? process.argv[industryArg + 1] : undefined);

const root = process.cwd();
const realDir = join(root, "engine", "input");
const sampleDir = join(root, "engine", "input-sample");
const isFake = !existsSync(join(realDir, "companies.csv"));
const dir = isFake ? sampleDir : realDir;

const read = (file: string) => parseCsv(readFileSync(join(dir, file), "utf8"));
const companiesCsv = read("companies.csv");
const financialsCsv = read("financials.csv");
const sourcesCsv = read("sources.csv");

const extraCsv: Record<string, Record<string, string>[]> = Object.fromEntries(
  config.extraInputs.map((f) => [f, existsSync(join(dir, f)) ? read(f) : []]),
);
const dealsByTicker: Record<string, Deal[]> = existsSync(join(dir, "deals.json")) ? JSON.parse(readFileSync(join(dir, "deals.json"), "utf8")) : {};

const sources: Source[] = sourcesCsv.map((s) => ({ id: s.id, label: s.label, url: s.url || undefined, ...(s.quote ? { quote: s.quote } : {}) }));
const sourceIds = new Set(sources.map((s) => s.id));
const warnings: string[] = [];

const byTicker = new Map<string, FinRow[]>();
for (const r of financialsCsv) {
  const year = num(r.fiscal_year);
  if (year == null) {
    warnings.push(`financials.csv: row for ${r.ticker} has no fiscal_year, skipped`);
    continue;
  }
  if (r.source_id && !sourceIds.has(r.source_id)) warnings.push(`${r.ticker} ${year}: unknown source_id "${r.source_id}"`);
  const list = byTicker.get(r.ticker) ?? [];
  list.push({
    year,
    revenue: num(r.revenue),
    ocf: num(r.operating_cash_flow),
    capex: num(r.capex),
    acquisitions: num(r.acquisitions),
    shares: num(r.diluted_shares),
    debt: num(r.total_debt),
    cash: num(r.cash),
    organic: num(r.organic_growth_pct),
    equity: num(r.total_equity),
    ebitda: num(r.ebitda),
    goodwill: num(r.goodwill),
    currency: r.currency ?? "",
    sourceId: r.source_id,
  });
  byTicker.set(r.ticker, list);
}

const VERDICTS: Verdict[] = ["add", "reject", "watch", "existing"];

const rowsFor = (ticker: string) => (byTicker.get(ticker) ?? []).sort((a, b) => a.year - b.year);

function historyFor(ticker: string): YearRow[] {
  const rows = rowsFor(ticker);
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

function totalsFor(ticker: string): Company["totals"] {
  const rows = rowsFor(ticker);
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

function metricsFor(ticker: string): Record<string, MetricValue> {
  const out = config.computeMetrics(rowsFor(ticker), {
    ticker,
    lookup: (file) => extraCsv[file]?.find((r) => r.ticker === ticker),
  });
  warnings.push(...out.warnings);
  return out.metrics;
}

// ---- The model: apply the declared checks, rank, recommend, weight ----

const drafts = companiesCsv.map((c) => {
  const metrics = metricsFor(c.ticker);
  const checks: CheckResult[] = config.checks.map((k) => ({
    id: k.id,
    label: k.label,
    rule: k.rule,
    target: `${k.op === ">=" ? "≥" : "≤"} ${config.metricDefs.find((m) => m.id === k.metricId)?.unit === "multiple" ? `${k.threshold}×` : `${Math.round(k.threshold * 1000) / 10}%`}`,
    threshold: k.threshold,
    op: k.op,
    kind: k.kind,
    metricId: k.metricId,
    pass: passes(metrics[k.metricId]?.value, k.op, k.threshold),
  }));
  const t = tally(
    checks.filter((k) => k.kind === "gate").map((k) => k.pass),
    checks.filter((k) => k.kind === "score").map((k) => k.pass),
    config.scoring,
  );
  return { c, metrics, checks, t };
});

// Rank: recommendation first, then share of scored checks passed, then how many had data, then the profile's tie-break metric.
const recOrder = { pass: 0, mixed: 1, fail: 2 } as const;
const share = (d: (typeof drafts)[number]) => (d.t.available > 0 ? d.t.passed / d.t.available : 0);
const ranked = [...drafts].sort(
  (a, b) =>
    recOrder[a.t.recommendation] - recOrder[b.t.recommendation] ||
    share(b) - share(a) ||
    b.t.available - a.t.available ||
    (b.metrics[config.rankTiebreak]?.value ?? -Infinity) - (a.metrics[config.rankTiebreak]?.value ?? -Infinity),
);
const rankOf = new Map(ranked.map((d, i) => [d.c.ticker, i + 1]));

const isCandidate = (c: Record<string, string>) => c.in_index.toLowerCase() !== "true";
const humanVerdict = (c: Record<string, string>) => (c.verdict ? (c.verdict as Verdict) : null);
const modelVerdict = (rec: ModelResult["recommendation"]): Verdict => (rec === "pass" ? "add" : rec === "mixed" ? "watch" : "reject");

// Weights: equal split of the sleeve across the companies being added; related companies share one slot.
const adds = drafts.filter((d) => isCandidate(d.c) && (humanVerdict(d.c) ?? modelVerdict(d.t.recommendation)) === "add").map((d) => d.c.ticker);
const groups: string[][] = [];
for (const t of adds) {
  const related = config.relatedGroups.find((g) => g.includes(t));
  const existing = related && groups.find((g) => g.some((x) => related.includes(x)));
  if (existing) existing.push(t);
  else groups.push([t]);
}
const modelWeights = equalWeights(groups, config.sleevePct, config.maxWeightPct);

const modelReason = (d: (typeof drafts)[number]): string => {
  const failed = d.checks.filter((k) => k.pass === false).map((k) => k.label);
  const unknown = d.checks.filter((k) => k.pass === null).map((k) => k.label);
  const parts: string[] = [];
  if (failed.length) parts.push(`Failed: ${failed.join(", ")}.`);
  if (unknown.length) parts.push(`No data: ${unknown.join(", ")}.`);
  return parts.join(" ") || "Passed every check.";
};

const companies: Company[] = drafts.map((d) => {
  const { c, metrics } = d;
  const human = humanVerdict(c);
  if (human && !VERDICTS.includes(human)) warnings.push(`${c.ticker}: unknown verdict "${c.verdict}"`);
  const verdict: Verdict = human ?? modelVerdict(d.t.recommendation);
  const weight = num(c.proposed_weight_pct);
  const rows = rowsFor(c.ticker);
  const deals = dealsByTicker[c.ticker];
  return {
    ticker: c.ticker,
    name: c.name,
    hqCountry: c.hq_country,
    listedOn: c.listed_on || undefined,
    subSector: c.sub_sector || undefined,
    inIndex: !isCandidate(c),
    metrics,
    zone: quadrant(
      metrics[config.map.x]?.value,
      metrics[config.map.y]?.value,
      config.map.xThreshold,
      config.map.yThreshold,
      config.map.zones,
    ),
    verdict,
    verdictSource: human ? "human" : "model",
    proposedWeightPct: verdict === "add" ? (weight ?? modelWeights[c.ticker]) : undefined,
    reason: c.reason || (human === "existing" ? undefined : modelReason(d)),
    model: { checks: d.checks, ...d.t, rank: rankOf.get(c.ticker)! },
    history: historyFor(c.ticker),
    totals: totalsFor(c.ticker),
    ...(deals ? { deals } : {}),
    reportingCurrency: rows[rows.length - 1]?.currency || undefined,
  };
});

const dataset: Dataset = {
  isFake,
  industryId: config.id,
  generatedAt: new Date().toISOString(),
  indexName: config.indexName,
  currency: config.currency,
  question: config.question,
  metricDefs: config.metricDefs,
  rules: {
    result:
      `Passes: both must-pass checks pass, and at least ${config.scoring.passShare * 100}% of the other checks with data pass (${config.scoring.minAvailable} or more with data). ` +
      `Fails: a must-pass check fails, or fewer than ${config.scoring.mixedShare * 100}% pass. Mixed: anything else. Every scored check counts the same: there are no weights. Missing data is never a fail.`,
    weight:
      `${config.sleevePct}% of the index is split equally among the companies we add, at most ${config.maxWeightPct}% each. ` +
      config.relatedGroups.map((g) => `${g.join(" and ")} share one slot (one controls the other).`).join(" "),
  },
  map: config.map,
  companies,
  sources,
};

writeFileSync(join(root, "data", "companies.json"), JSON.stringify(dataset, null, 2) + "\n");

const fmt = (v: number | null | undefined, unit: string) =>
  (v == null ? "—" : unit === "pct" ? `${(v * 100).toFixed(1)}%` : unit === "multiple" ? `${v.toFixed(1)}×` : v.toFixed(1)).padStart(9);
console.log(`
Built data/companies.json (${config.id}) from ${isFake ? "engine/input-sample (FAKE)" : "engine/input"}
`);
console.log(`rank ticker ${config.metricDefs.map((m) => (m.short ?? m.id).slice(0, 9).padStart(9)).join(" ")}  checks  model   verdict  weight`);
for (const c of [...companies].sort((a, b) => a.model!.rank - b.model!.rank)) {
  console.log(
    `${String(c.model!.rank).padStart(3)}  ${c.ticker.padEnd(6)} ${config.metricDefs.map((m) => fmt(c.metrics[m.id]?.value, m.unit)).join(" ")}   ${c.model!.passed}/${c.model!.available}    ${c.model!.recommendation.padEnd(6)}  ${c.verdict.padEnd(8)} ${c.proposedWeightPct ?? ""}`,
  );
}
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log("  - " + w);
}
console.log("");
