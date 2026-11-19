// THE STORE: every company the engine has data for, in one serializable object.
//
// build.ts writes it to data/store.json from engine/input/. The website's server code imports that
// file and hands it to analyze(), so any list of holdings can be tested without re-reading CSVs.
// Nothing here computes a metric: it only carries the figures exactly as the inputs give them.

import type { Deal, Source, Verdict } from "../contract/types";
import { num, parseCsv } from "./csv";
import type { Distribution, Fact, FinRow, PeriodType } from "./industries/types";

export interface StoredCompany {
  ticker: string;
  name: string;
  /** ISO-2, headquarters or incorporation (our "what counts as Canadian" rule) */
  hqCountry: string;
  listedOn?: string;
  subSector?: string;
  /** yearly statements, oldest first */
  financials: FinRow[];
  /** company-reported figures (KPIs), oldest first */
  facts: Fact[];
  /** distributions per unit, oldest first */
  distributions: Distribution[];
  /** rows from extra per-ticker input files, e.g. { "organic.csv": {...} } */
  extras: Record<string, Record<string, string>>;
  deals?: Deal[];
}

/** One company in the Canadian market map (engine/input/market.csv, from npm run discover). Labels only, no figures. */
export interface MarketEntry {
  ticker: string;
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  /** ISO-2 country from the company profile */
  country: string;
  /** market capitalisation in the listing currency, as the profile gives it */
  marketCap: number | null;
  /** broad index ETFs that hold it */
  etfs: string[];
  sourceId: string;
}

/** A human decision typed in companies.csv. It overrides the model for that ticker. */
export interface Decision {
  verdict: Verdict;
  reason?: string;
  proposedWeightPct?: number;
}

export interface Store {
  /** true while built from engine/input-sample (FAKE) */
  isFake: boolean;
  companies: Record<string, StoredCompany>;
  /** the Canadian market map, for industries that find their own candidates */
  market: MarketEntry[];
  sources: Source[];
  decisions: Record<string, Decision>;
  /** problems found while reading the inputs */
  warnings: string[];
}

const PERIOD_TYPES: PeriodType[] = ["Annual", "Quarterly", "SemiAnnual", "NineMonths", "PointInTime"];
const VERDICTS: Verdict[] = ["add", "reject", "watch", "existing"];

/**
 * Builds the store from the text of the input files. `read(file)` returns a file's text, or null if it does not exist.
 * Pure: no file system access, so it is easy to test.
 */
export function storeFromInputs(read: (file: string) => string | null, isFake: boolean): Store {
  const csv = (file: string) => {
    const t = read(file);
    return t == null ? [] : parseCsv(t);
  };
  const warnings: string[] = [];
  // outlook-sources.csv is written by npm run outlook, so npm run inputs (which rewrites sources.csv) cannot drop it
  const sources: Source[] = [...csv("sources.csv"), ...csv("outlook-sources.csv")].map((s) => ({ id: s.id, label: s.label, url: s.url || undefined, ...(s.quote ? { quote: s.quote } : {}) }));
  const sourceIds = new Set(sources.map((s) => s.id));
  const quoteOf = new Map(sources.filter((s) => s.quote).map((s) => [s.id, s.quote!]));
  const companies: Record<string, StoredCompany> = {};
  const decisions: Record<string, Decision> = {};

  const company = (ticker: string): StoredCompany =>
    (companies[ticker] ??= { ticker, name: ticker, hqCountry: "", financials: [], facts: [], distributions: [], extras: {} });

  for (const c of csv("companies.csv")) {
    const s = company(c.ticker);
    s.name = c.name || c.ticker;
    s.hqCountry = c.hq_country ?? "";
    s.listedOn = c.listed_on || undefined;
    s.subSector = c.sub_sector || undefined;
    // "existing" only says the company is held; it is not a decision about adding it.
    if (c.verdict && c.verdict !== "existing") {
      if (!VERDICTS.includes(c.verdict as Verdict)) warnings.push(`${c.ticker}: unknown verdict "${c.verdict}"`);
      else decisions[c.ticker] = { verdict: c.verdict as Verdict, reason: c.reason || undefined, proposedWeightPct: num(c.proposed_weight_pct) ?? undefined };
    }
  }

  // The market map. Names and labels fill in only what companies.csv did not set.
  const market: MarketEntry[] = csv("market.csv").map((r) => ({
    ticker: r.ticker, symbol: r.symbol, name: r.name, exchange: r.exchange, sector: r.sector, industry: r.industry,
    country: r.country, marketCap: num(r.market_cap), etfs: r.in_etfs ? r.in_etfs.split(" ") : [], sourceId: r.source_id,
  }));

  for (const r of csv("financials.csv")) {
    const year = num(r.fiscal_year);
    if (year == null) {
      warnings.push(`financials.csv: row for ${r.ticker} has no fiscal_year, skipped`);
      continue;
    }
    if (r.source_id && !sourceIds.has(r.source_id)) warnings.push(`${r.ticker} ${year}: unknown source_id "${r.source_id}"`);
    company(r.ticker).financials.push({
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
      assets: num(r.total_assets),
      ...(r.period_end ? { periodEnd: r.period_end } : {}),
      currency: r.currency ?? "",
      sourceId: r.source_id,
    });
  }

  for (const r of csv("facts.csv")) {
    const value = num(r.value);
    const fiscalYear = num(r.fiscal_year);
    const periodType = r.period_type as PeriodType;
    if (value == null || fiscalYear == null || !PERIOD_TYPES.includes(periodType)) {
      warnings.push(`facts.csv: unreadable row for ${r.ticker} ${r.metric}, skipped`);
      continue;
    }
    if (r.source_id && !sourceIds.has(r.source_id)) warnings.push(`${r.ticker} ${r.metric}: unknown source_id "${r.source_id}"`);
    company(r.ticker).facts.push({
      metric: r.metric,
      periodType,
      fiscalYear,
      fiscalQuarter: num(r.fiscal_quarter),
      reportDate: r.report_date,
      value,
      sourceId: r.source_id,
      ...(quoteOf.has(r.source_id) ? { quote: quoteOf.get(r.source_id) } : {}),
    });
  }

  for (const r of csv("distributions.csv")) {
    const amount = num(r.amount);
    if (amount == null || !r.date) {
      warnings.push(`distributions.csv: unreadable row for ${r.ticker}, skipped`);
      continue;
    }
    if (r.source_id && !sourceIds.has(r.source_id)) warnings.push(`${r.ticker} distribution ${r.date}: unknown source_id "${r.source_id}"`);
    company(r.ticker).distributions.push({ date: r.date, amount, currency: r.currency ?? "", sourceId: r.source_id });
  }

  for (const file of ["organic.csv", "outlook-tailwind.csv"]) {
    for (const r of csv(file)) company(r.ticker).extras[file] = r;
  }

  const dealsText = read("deals.json");
  if (dealsText) {
    const deals = JSON.parse(dealsText) as Record<string, Deal[]>;
    for (const [t, list] of Object.entries(deals)) if (list.length) company(t).deals = list;
  }

  for (const m of market) {
    const c = companies[m.ticker];
    if (!c) continue;
    if (c.name === c.ticker && m.name) c.name = m.name;
    if (!c.hqCountry && m.country) c.hqCountry = m.country;
    c.listedOn ??= m.exchange || undefined;
    c.subSector ??= m.industry || undefined;
  }

  for (const c of Object.values(companies)) {
    c.financials.sort((a, b) => a.year - b.year);
    c.distributions.sort((a, b) => a.date.localeCompare(b.date));
    c.facts.sort((a, b) => a.reportDate.localeCompare(b.reportDate) || a.metric.localeCompare(b.metric));
  }
  return { isFake, companies, market, sources, decisions, warnings };
}
