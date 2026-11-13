// ENGINE: spreadsheets in -> data/companies.json out.  Run:  npm run engine
//
// Reads engine/input/ if it has companies.csv, otherwise engine/input-sample/ (FAKE).
// Writes data/companies.json, which is the only file the website reads.
// Numbers are computed here; verdicts and reasons are human decisions taken from companies.csv.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult, Company, Deal, Dataset, MetricValue, ModelResult, Source, Verdict, YearRow } from "../contract/types";
import { config } from "./config";
import { num, parseCsv } from "./csv";
import { acquisitionIntensity, meanStrict, cagr, cashReturnOnCapital, equalWeights, freeCashFlow, netDebtToEbitda, passes, pctChange, perShare, quadrant, sumStrict, tally } from "./metrics";

const root = process.cwd();
const realDir = join(root, "engine", "input");
const sampleDir = join(root, "engine", "input-sample");
const isFake = !existsSync(join(realDir, "companies.csv"));
const dir = isFake ? sampleDir : realDir;

const read = (file: string) => parseCsv(readFileSync(join(dir, file), "utf8"));
const companiesCsv = read("companies.csv");
const financialsCsv = read("financials.csv");
const sourcesCsv = read("sources.csv");

const organicCsv = existsSync(join(dir, "organic.csv")) ? read("organic.csv") : [];
const dealsByTicker: Record<string, Deal[]> = existsSync(join(dir, "deals.json")) ? JSON.parse(readFileSync(join(dir, "deals.json"), "utf8")) : {};

const sources: Source[] = sourcesCsv.map((s) => ({ id: s.id, label: s.label, url: s.url || undefined, ...(s.quote ? { quote: s.quote } : {}) }));
const sourceIds = new Set(sources.map((s) => s.id));
const warnings: string[] = [];

interface Row {
  year: number;
  revenue: number | null;
  ocf: number | null;
  capex: number | null;
  acquisitions: number | null;
  shares: number | null;
  debt: number | null;
  cash: number | null;
  organic: number | null;
  equity: number | null;
  ebitda: number | null;
  currency: string;
  sourceId: string;
}

const byTicker = new Map<string, Row[]>();
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
    currency: r.currency ?? "",
    sourceId: r.source_id,
  });
  byTicker.set(r.ticker, list);
}

const VERDICTS: Verdict[] = ["add", "reject", "watch", "existing"];

const rowsFor = (ticker: string) => (byTicker.get(ticker) ?? []).sort((a, b) => a.year - b.year);

/** Cash return for one year: needs that year's FCF and the balance sheets at both ends of it. */
function cashReturnFor(rows: Row[], i: number): number | null {
  const r = rows[i];
  const prev = rows[i - 1];
  if (!r || !prev || r.year - prev.year !== 1) return null;
  return cashReturnOnCapital(freeCashFlow(r.ocf, r.capex), prev.debt, prev.equity, r.debt, r.equity);
}

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
      sourceIds: r.sourceId ? [r.sourceId] : [],
    };
  });
}

function metricsFor(ticker: string): Record<string, MetricValue> {
  const rows = rowsFor(ticker);
  if (rows.length < 2) {
    warnings.push(`${ticker}: needs at least 2 fiscal years in financials.csv (has ${rows.length})`);
  }
  const first = rows[0];
  const last = rows[rows.length - 1];
  const years = first && last ? last.year - first.year : 0;
  const period = first && last ? `FY${first.year}–FY${last.year}` : undefined;
  const allSources = [...new Set(rows.map((r) => r.sourceId).filter(Boolean))];
  const endSources = [...new Set([first?.sourceId, last?.sourceId].filter(Boolean) as string[])];

  const mv = (value: number | null, ids: string[], note?: string, p = period): MetricValue => ({
    value,
    period: p,
    sourceIds: ids,
    ...(value == null ? { note: note ?? "Missing or not computable from the data provided" } : note ? { note } : {}),
  });

  const fcfFirst = first ? freeCashFlow(first.ocf, first.capex) : null;
  const fcfLast = last ? freeCashFlow(last.ocf, last.capex) : null;
  const fcfpsFirst = first ? perShare(fcfFirst, first.shares) : null;
  const fcfpsLast = last ? perShare(fcfLast, last.shares) : null;

  const acqSum = sumStrict(rows.map((r) => r.acquisitions));
  const ocfSum = sumStrict(rows.map((r) => r.ocf));

  return {
    acqIntensity: mv(
      acquisitionIntensity(acqSum, ocfSum),
      allSources,
      acqSum == null
        ? "Acquisition spending missing for at least one year"
        : ocfSum == null || ocfSum <= 0
          ? "Operating cash flow missing or not positive"
          : acqSum <= 0
            ? "Net seller over the period: divestiture proceeds exceeded acquisition spending, so net acquisition spending is zero"
            : undefined,
    ),
    fcfPerShareCagr: mv(
      cagr(fcfpsFirst, fcfpsLast, years),
      endSources,
      fcfpsFirst != null && fcfpsFirst <= 0 ? "Starting FCF per share was zero or negative, so growth is undefined" : undefined,
    ),
    revenueCagr: mv(cagr(first?.revenue, last?.revenue, years), endSources),
    shareCountChange: mv(pctChange(first?.shares, last?.shares), endSources),
    cashReturn: mv(
      cashReturnFor(rows, rows.length - 1),
      [...new Set([rows[rows.length - 2]?.sourceId, last?.sourceId].filter(Boolean) as string[])],
      rows.length < 2 ? "Needs two consecutive years" : undefined,
      last ? `FY${last.year}` : undefined,
    ),
    netDebtToEbitda: (() => {
      // Latest net debt against average EBITDA of the last three years, so one good year
      // at the top of a cycle cannot make the debt look small.
      const lastThree = rows.slice(-3);
      const avgEbitda = lastThree.length === 3 ? meanStrict(lastThree.map((r) => r.ebitda)) : null;
      return mv(
        last ? netDebtToEbitda(last.debt, last.cash, avgEbitda) : null,
        [...new Set(lastThree.map((r) => r.sourceId).filter(Boolean))],
        lastThree.length < 3
          ? "Needs three years of EBITDA"
          : avgEbitda != null && avgEbitda <= 0
            ? "Average EBITDA not positive, so the ratio is meaningless"
            : undefined,
        last ? `FY${last.year} debt, FY${lastThree[0].year}–FY${last.year} EBITDA` : undefined,
      );
    })(),
    organicGrowth: (() => {
      const o = organicCsv.find((r) => r.ticker === ticker);
      const v = o ? num(o.organic_growth_pct) : null;
      return mv(v, o?.source_id ? [o.source_id] : [], v == null ? "Not reported in the data provided" : undefined, o?.period || (last ? `FY${last.year}` : undefined));
    })(),
  };
}

// ---- The model: apply the declared checks, rank, recommend, weight ----

const drafts = companiesCsv.map((c) => {
  const metrics = metricsFor(c.ticker);
  const checks: CheckResult[] = config.checks.map((k) => ({
    id: k.id,
    label: k.label,
    rule: k.rule,
    target: `${k.op === ">=" ? "≥" : "≤"} ${config.metricDefs.find((m) => m.id === k.metricId)?.unit === "multiple" ? `${k.threshold}×` : `${Math.round(k.threshold * 1000) / 10}%`}`,
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

// Rank: recommendation first, then share of scored checks passed, then how many had data, then FCF/share growth.
const recOrder = { pass: 0, mixed: 1, fail: 2 } as const;
const share = (d: (typeof drafts)[number]) => (d.t.available > 0 ? d.t.passed / d.t.available : 0);
const ranked = [...drafts].sort(
  (a, b) =>
    recOrder[a.t.recommendation] - recOrder[b.t.recommendation] ||
    share(b) - share(a) ||
    b.t.available - a.t.available ||
    (b.metrics.fcfPerShareCagr?.value ?? -Infinity) - (a.metrics.fcfPerShareCagr?.value ?? -Infinity),
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
    ...(deals ? { deals } : {}),
    reportingCurrency: rows[rows.length - 1]?.currency || undefined,
  };
});

const dataset: Dataset = {
  isFake,
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

const pct = (v: number | null | undefined) => (v == null ? "  —   " : `${(v * 100).toFixed(1).padStart(5)}%`);
console.log(`\nBuilt data/companies.json from ${isFake ? "engine/input-sample (FAKE)" : "engine/input"}\n`);
console.log("rank ticker  acq.int   fcf/sh/yr  cashRet  dilution  ND/EBITDA  organic  checks  model   verdict  weight");
const x = (v: number | null | undefined) => (v == null ? "   —  " : `${v.toFixed(1).padStart(5)}×`);
for (const c of [...companies].sort((a, b) => a.model!.rank - b.model!.rank)) {
  const m = c.metrics;
  console.log(
    `${String(c.model!.rank).padStart(3)}  ${c.ticker.padEnd(6)} ${pct(m.acqIntensity?.value)}   ${pct(m.fcfPerShareCagr?.value)}   ${pct(m.cashReturn?.value)}  ${pct(m.shareCountChange?.value)}   ${x(m.netDebtToEbitda?.value)}   ${pct(m.organicGrowth?.value)}   ${c.model!.passed}/${c.model!.available}    ${c.model!.recommendation.padEnd(6)}  ${c.verdict.padEnd(8)} ${c.proposedWeightPct ?? ""}`,
  );
}
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log("  - " + w);
}
console.log("");
