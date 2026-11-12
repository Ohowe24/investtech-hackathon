// ENGINE: spreadsheets in -> data/companies.json out.  Run:  npm run engine
//
// Reads engine/input/ if it has companies.csv, otherwise engine/input-sample/ (FAKE).
// Writes data/companies.json, which is the only file the website reads.
// Numbers are computed here; verdicts and reasons are human decisions taken from companies.csv.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Company, Dataset, MetricValue, Source, Verdict } from "../contract/types";
import { config } from "./config";
import { num, parseCsv } from "./csv";
import { cagr, freeCashFlow, netDebtToFcf, pctChange, perShare, quadrant, safeDiv, sumStrict } from "./metrics";

const root = process.cwd();
const realDir = join(root, "engine", "input");
const sampleDir = join(root, "engine", "input-sample");
const isFake = !existsSync(join(realDir, "companies.csv"));
const dir = isFake ? sampleDir : realDir;

const read = (file: string) => parseCsv(readFileSync(join(dir, file), "utf8"));
const companiesCsv = read("companies.csv");
const financialsCsv = read("financials.csv");
const sourcesCsv = read("sources.csv");

const sources: Source[] = sourcesCsv.map((s) => ({ id: s.id, label: s.label, url: s.url || undefined }));
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
    sourceId: r.source_id,
  });
  byTicker.set(r.ticker, list);
}

const VERDICTS: Verdict[] = ["add", "reject", "watch", "existing"];

function metricsFor(ticker: string): Record<string, MetricValue> {
  const rows = (byTicker.get(ticker) ?? []).sort((a, b) => a.year - b.year);
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
      ocfSum != null && ocfSum > 0 ? safeDiv(acqSum, ocfSum) : null,
      allSources,
      acqSum == null ? "Acquisition spending missing for at least one year" : ocfSum == null || ocfSum <= 0 ? "Operating cash flow missing or not positive" : undefined,
    ),
    fcfPerShareCagr: mv(
      cagr(fcfpsFirst, fcfpsLast, years),
      endSources,
      fcfpsFirst != null && fcfpsFirst <= 0 ? "Starting FCF per share was zero or negative, so growth is undefined" : undefined,
    ),
    revenueCagr: mv(cagr(first?.revenue, last?.revenue, years), endSources),
    shareCountChange: mv(pctChange(first?.shares, last?.shares), endSources),
    netDebtToFcf: mv(
      last ? netDebtToFcf(last.debt, last.cash, fcfLast) : null,
      last?.sourceId ? [last.sourceId] : [],
      fcfLast != null && fcfLast <= 0 ? "Latest FCF not positive, so the ratio is meaningless" : undefined,
      last ? `FY${last.year}` : undefined,
    ),
    organicGrowth: mv(
      last?.organic ?? null,
      last?.sourceId ? [last.sourceId] : [],
      last?.organic == null ? "Not disclosed in the data provided" : undefined,
      last ? `FY${last.year}` : undefined,
    ),
  };
}

const companies: Company[] = companiesCsv.map((c) => {
  const verdict = (c.verdict || "watch") as Verdict;
  if (!VERDICTS.includes(verdict)) warnings.push(`${c.ticker}: unknown verdict "${c.verdict}"`);
  if (!c.reason) warnings.push(`${c.ticker}: no reason written yet`);
  const metrics = metricsFor(c.ticker);
  const weight = num(c.proposed_weight_pct);
  return {
    ticker: c.ticker,
    name: c.name,
    hqCountry: c.hq_country,
    listedOn: c.listed_on || undefined,
    subSector: c.sub_sector || undefined,
    inIndex: c.in_index.toLowerCase() === "true",
    metrics,
    zone: quadrant(
      metrics[config.map.x]?.value,
      metrics[config.map.y]?.value,
      config.map.xThreshold,
      config.map.yThreshold,
      config.map.zones,
    ),
    verdict,
    proposedWeightPct: verdict === "add" ? (weight ?? config.defaultAddWeightPct) : undefined,
    reason: c.reason || undefined,
  };
});

const dataset: Dataset = {
  isFake,
  generatedAt: new Date().toISOString(),
  indexName: config.indexName,
  currency: config.currency,
  question: config.question,
  metricDefs: config.metricDefs,
  map: config.map,
  companies,
  sources,
};

writeFileSync(join(root, "data", "companies.json"), JSON.stringify(dataset, null, 2) + "\n");

const pct = (v: number | null | undefined) => (v == null ? "  —   " : `${(v * 100).toFixed(1).padStart(5)}%`);
console.log(`\nBuilt data/companies.json from ${isFake ? "engine/input-sample (FAKE)" : "engine/input"}\n`);
console.log("ticker      acq.int   fcf/sh/yr  zone              verdict");
for (const c of companies) {
  console.log(
    `${c.ticker.padEnd(10)}  ${pct(c.metrics.acqIntensity?.value)}   ${pct(c.metrics.fcfPerShareCagr?.value)}    ${c.zone.padEnd(16)}  ${c.verdict}`,
  );
}
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log("  - " + w);
}
console.log("");
