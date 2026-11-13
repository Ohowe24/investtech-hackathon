// THE CONTRACT
// The shape of data/companies.json: the one file the engine (Max) writes
// and the website (Oscar) reads. Change this only when both of you agree out loud.

export type Unit = "pct" | "multiple" | "money" | "count";

/** One number for one company, with where it came from. */
export interface MetricValue {
  /** null means missing. Never use 0 as a stand-in. */
  value: number | null;
  /** e.g. "FY2021–FY2025" */
  period?: string;
  /** ids from Dataset.sources */
  sourceIds: string[];
  /** why it is missing, or a caveat */
  note?: string;
}

/** Describes one metric so the website can label and format it. */
export interface MetricDef {
  id: string;
  label: string;
  /** "pct" values are stored as decimals: 0.12 means 12% */
  unit: Unit;
  /** one plain sentence */
  description: string;
  higherIsBetter?: boolean;
}

export type Verdict = "add" | "reject" | "watch" | "existing";

export interface Company {
  ticker: string;
  name: string;
  /** ISO-2 country of headquarters / incorporation, e.g. "CA" */
  hqCountry: string;
  /** e.g. "TSX", "NYSE" */
  listedOn?: string;
  subSector?: string;
  /** true if already held in the organizers' index */
  inIndex: boolean;
  /** keyed by MetricDef.id */
  metrics: Record<string, MetricValue>;
  /** quadrant label from MapConfig.zones, or "Not enough data" */
  zone: string;
  /** human decision (Max), not computed */
  verdict: Verdict;
  /** only for verdict "add" */
  proposedWeightPct?: number;
  /** one plain sentence. Written by a human, or composed from the failed checks when verdictSource is "model" */
  reason?: string;
  /** who set the verdict: a human in companies.csv, or the model's declared rules */
  verdictSource?: "human" | "model";
  /** the model's test of this company against the declared checks */
  model?: ModelResult;
  /** one row per fiscal year, in the company's reporting currency */
  history?: YearRow[];
  /** acquisitions and divestitures as disclosed in filings (only where the data pack covers the company) */
  deals?: Deal[];
  /** reporting currency of the money values in history, e.g. "USD" */
  reportingCurrency?: string;
}

/** One declared rule applied to one company. */
export interface CheckResult {
  id: string;
  /** short name, e.g. "Owners gained" */
  label: string;
  /** plain-language rule, e.g. "FCF per share grew at least 7% a year" */
  rule: string;
  /** "gate" checks must pass; "score" checks count toward the score */
  kind: "gate" | "score";
  /** MetricDef.id the check reads */
  metricId: string;
  /** true = pass, false = fail, null = not enough data (never counted as a fail) */
  pass: boolean | null;
}

export interface ModelResult {
  checks: CheckResult[];
  /** scored checks passed */
  passed: number;
  /** scored checks that had data */
  available: number;
  /** all scored checks, with or without data */
  total: number;
  /** "pass" = meets the bar; "mixed" = some checks fail or data is thin; "fail" = fails a gate or most checks */
  recommendation: "pass" | "mixed" | "fail";
  /** rank among all companies tested (1 = best) */
  rank: number;
}

export interface YearRow {
  fiscalYear: number;
  /** all values null when missing; money in the company's reporting currency */
  revenue: number | null;
  operatingCashFlow: number | null;
  /** operating cash flow minus capital expenditure */
  freeCashFlow: number | null;
  /** cash paid for acquisitions net of cash acquired and disposals; negative = net seller that year */
  acquisitions: number | null;
  dilutedShares: number | null;
  fcfPerShare: number | null;
  /** free cash flow / average (debt + equity); decimal */
  cashReturn: number | null;
  sourceIds: string[];
}

export interface Deal {
  type: "acquisition" | "divestiture";
  status: string;
  /** ISO date if the filing gives one */
  date?: string;
  /** e.g. "Q1 2026" when no exact date is given */
  periodLabel?: string;
  /** fiscal year the deal falls in, if known */
  fiscalYear?: number;
  counterparty?: string;
  /** summary from the Onesheet company profile */
  summary: string;
  /** word-for-word filing quotes */
  quotes: { label: string; quote: string }[];
}

export interface Source {
  id: string;
  /** e.g. "Q2 2026 MD&A p.15" */
  label: string;
  url?: string;
  /** word-for-word quote from the filing, when the source is a filing */
  quote?: string;
}

/** Which two metrics make the map, and where the dividing lines are. */
export interface MapConfig {
  x: string;
  y: string;
  xThreshold: number;
  yThreshold: number;
  zones: {
    topLeft: string;
    topRight: string;
    bottomLeft: string;
    bottomRight: string;
  };
}

export interface Dataset {
  /** true while built from sample data. The site shows a FAKE banner. */
  isFake: boolean;
  generatedAt: string;
  /** must match an index name in data/indexes.json */
  indexName: string;
  currency: string;
  /** the one question the tool answers */
  question: string;
  metricDefs: MetricDef[];
  map: MapConfig;
  companies: Company[];
  sources: Source[];
}

// ---- The organizers' live indexes (data/indexes.json, from trimestre.ca) ----

export interface IndexPosition {
  ticker: string;
  country: string;
  countryCode: string;
  subSector: string;
  signal: string;
  signalDir: "up" | "down";
  shares: number;
  marketValue: number;
  weightPct: number;
  pnlPct: number;
}

export interface IndexDef {
  name: string;
  currency: string;
  totalValue: number;
  cash: number;
  cashPct: number;
  holdings: number;
  method: string;
  positions: IndexPosition[];
}

export interface IndexSnapshot {
  updatedAt: string;
  source: string;
  indexes: IndexDef[];
}
