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
  /** two or three words, for column headers and card titles */
  short?: string;
  /** "pct" values are stored as decimals: 0.12 means 12% */
  unit: Unit;
  /** one plain sentence: what it shows */
  description: string;
  /** one or two plain sentences: how it is calculated */
  formula?: string;
  /** one plain sentence: why it matters when judging the company */
  why?: string;
  /** research figures behind the choice of this metric, each naming its source */
  facts?: string[];
  higherIsBetter?: boolean;
  /** weight in the quality score (points out of 100); absent or 0 = shown but not scored */
  weight?: number;
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
  /** sums across every year in history; null if any year is missing */
  totals?: {
    period: string;
    operatingCashFlow: number | null;
    capex: number | null;
    freeCashFlow: number | null;
    acquisitions: number | null;
    /** free cash flow left after acquisitions */
    fcfAfterAcquisitions: number | null;
    /** revenue added from first to last year */
    revenueAdded: number | null;
    /** goodwill added from first to last year */
    goodwillAdded: number | null;
  };
  /** reporting currency of the money values in history, e.g. "USD" */
  reportingCurrency?: string;
  /** set when the engine has no data at all for this company (e.g. a holding typed by the user) */
  dataNote?: string;
  /** company-reported figures over time (industries judged on KPIs, e.g. REITs), one series per figure */
  reported?: ReportedSeries[];
  /** sell-side analysts' current buy / hold / sell ratings. null means no ratings were found (see note). Not used in the verdict. */
  analyst?: AnalystRatings | null;
}

export type AnalystSentiment = "bullish" | "neutral" | "bearish";

/** How many analysts rate the stock at each level this month, and what that adds up to. */
export interface AnalystRatings {
  /** date the counts were fetched, "YYYY-MM-DD" */
  asOf: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  total: number;
  /** average rating, 1 = strong buy … 5 = strong sell */
  meanScore: number;
  /** share rating it buy or strong buy, as a decimal */
  buyShare: number;
  /** null when fewer analysts than the minimum rate it (see note) */
  sentiment: AnalystSentiment | null;
  sourceIds: string[];
  note?: string;
}

/** One company-reported figure over time, as filed. Every point carries its own source. */
export interface ReportedSeries {
  id: string;
  label: string;
  unit: Unit;
  /** "Quarterly" for flows (payout, growth), "Point in time" for balance-sheet figures, "Annual" when no quarters are reported */
  basis: "Quarterly" | "Point in time" | "Annual";
  /** MetricDef.id this figure feeds, so the chart can draw that metric's pass lines */
  metricId?: string;
  /** a caveat that applies to the whole series */
  note?: string;
  /** oldest first */
  points: { label: string; date: string; value: number; sourceId: string }[];
}

/** A Canadian candidate from the industry's universe that could not be tested, and why. */
export interface UnmeasuredCandidate {
  ticker: string;
  name: string;
  listedOn?: string;
  subSector?: string;
  /** why it is in the industry's universe */
  why: string;
  /** why it was not tested */
  note: string;
}

/** One declared rule applied to one company. */
export interface CheckResult {
  id: string;
  /** short name, e.g. "Owners gained" */
  label: string;
  /** plain-language rule, e.g. "FCF per share grew at least 7% a year" */
  rule: string;
  /** the pass line as a short token, e.g. "≥ 20%" or "≤ 3×" */
  target?: string;
  /** the pass line as a number in the metric's unit (decimals for pct), for charts */
  threshold?: number;
  op?: ">=" | "<=";
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
  /** weighted quality score out of 100, when the industry declares weights */
  score?: QualityScore;
}

/** One variable's contribution to the quality score. */
export interface ScorePart {
  /** MetricDef.id */
  metricId: string;
  /** points available for this variable (all parts add up to 100) */
  weight: number;
  /** 0-1: share of this variable's points earned; null = no data, so it drops out and the others are rescaled */
  grade: number | null;
  /** how the grade is set, in one plain line, e.g. "0 at 0%, full at 15% a year" or "rank among the 32 companies tested" */
  scale: string;
}

/** Weighted quality score: each variable graded 0-1, times its weight, out of 100. */
export interface QualityScore {
  /** 0-100, whole number; null when the variables with data carry too little of the weight */
  value: number | null;
  /** share of the total weight that had data, 0-1 */
  coverage: number;
  parts: ScorePart[];
  note?: string;
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
  /** detail rows, all nullable; money in the reporting currency, ratios as decimals */
  capex?: number | null;
  ebitda?: number | null;
  totalDebt?: number | null;
  cash?: number | null;
  totalEquity?: number | null;
  goodwill?: number | null;
  /** debt - cash; negative = net cash */
  netDebt?: number | null;
  /** revenue vs the prior fiscal year */
  revenueGrowth?: number | null;
  ebitdaMargin?: number | null;
  ocfMargin?: number | null;
  fcfMargin?: number | null;
  /** free cash flow / EBITDA */
  fcfConversion?: number | null;
  /** capex / revenue */
  capexIntensity?: number | null;
  /** net acquisitions / operating cash flow, that year; 0 in a net-seller year */
  acqToOcf?: number | null;
  /** net debt / that year's EBITDA */
  netDebtToEbitda?: number | null;
  /** goodwill / total equity */
  goodwillToEquity?: number | null;
  revenuePerShare?: number | null;
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
  /** which industry profile built this file (engine/industries/), e.g. "acquirers" */
  industryId: string;
  /** display name of that industry, e.g. "Serial acquirers" */
  industryName?: string;
  /** where the index holdings came from: the organizers' live index, or typed in by the user */
  holdingsSource?: "organizers" | "user";
  generatedAt: string;
  /** must match an index name in data/indexes.json */
  indexName: string;
  currency: string;
  /** the one question the tool answers */
  question: string;
  metricDefs: MetricDef[];
  /** plain-language rules, composed by the engine from config values */
  rules?: {
    /** how check results become Passes / Mixed / Fails */
    result: string;
    /** how proposed weights are set */
    weight: string;
    /** how the quality score out of 100 is built, when the industry has one */
    score?: string;
  };
  map: MapConfig;
  /** title of the map view, e.g. "Acquisition spend vs FCF per share growth" */
  mapTitle?: string;
  /** false when the industry is judged on company-reported KPIs rather than yearly statements (no X-ray, no deal timeline) */
  hasStatements?: boolean;
  companies: Company[];
  /** Canadian candidates in the industry's universe that had no data to test */
  unmeasured?: UnmeasuredCandidate[];
  /** which candidates this run tests: only the ones the organizers provided, or those plus the rest of the researched universe */
  candidateSet?: {
    mode: "provided" | "expanded";
    /** tickers the organizers provided */
    provided: string[];
    /** further Canadian candidates "Generate more" adds: in the universe, not provided, not already held, with data to test */
    more: number;
  };
  sources: Source[];
}

// ---- The organizers' live indexes (data/indexes.json, from trimestre.ca) ----

export interface IndexPosition {
  ticker: string;
  country: string;
  countryCode: string;
  subSector: string;
  weightPct: number;
  /** the fields below come from the organizers' feed; absent for a position the user typed in */
  signal?: string;
  signalDir?: "up" | "down";
  shares?: number;
  marketValue?: number;
  pnlPct?: number;
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
  /** where the holdings came from, e.g. the organizers' feed URL, or "Entered by you" */
  source: string;
  indexes: IndexDef[];
}
