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
  /** one plain sentence, written by a human */
  reason?: string;
}

export interface Source {
  id: string;
  /** e.g. "Q2 2026 MD&A p.15" */
  label: string;
  url?: string;
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
