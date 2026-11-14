// What every industry profile declares. One profile = one index the tool can complete.
// The engine (analyze.ts) is generic; everything industry-specific lives in a profile.

import type { MapConfig, MetricDef, MetricValue } from "../../contract/types";

/** One fiscal year of statement data for one company, as read from engine/input/financials.csv. */
export interface FinRow {
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
  goodwill: number | null;
  currency: string;
  sourceId: string;
}

/** Period types as the Onesheet company profiles label them. */
export type PeriodType = "Annual" | "Quarterly" | "SemiAnnual" | "NineMonths" | "PointInTime";

/**
 * One company-reported figure (a KPI such as FFO per unit or occupancy), copied from a filing,
 * as read from engine/input/facts.csv. `value` is exactly what the profile holds: ratios as decimals.
 */
export interface Fact {
  metric: string;
  periodType: PeriodType;
  fiscalYear: number;
  /** null for point-in-time values */
  fiscalQuarter: number | null;
  /** ISO date the period ends */
  reportDate: string;
  value: number;
  sourceId: string;
  /** the filing quote behind the value, so a profile can check what the figure really is */
  quote?: string;
}

/** One declared rule. "gate" checks must pass; "score" checks count toward the score. */
export interface CheckDef {
  id: string;
  kind: "gate" | "score";
  label: string;
  metricId: string;
  op: ">=" | "<=";
  threshold: number;
  rule: string;
}

/** A threshold the rule lab lets the user move. id must match a CheckDef.id. */
export interface RuleControl {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: "pct" | "multiple";
  why: string;
}

export interface MetricContext {
  ticker: string;
  /** a row from an optional per-ticker input file (e.g. "organic.csv"), if the file and the row exist */
  lookup: (file: string) => Record<string, string> | undefined;
  /** company-reported figures from engine/input/facts.csv, oldest first */
  facts: Fact[];
}

/** A Canadian company the tool tests as a candidate for this industry's index. Names and listings are labels, not data. */
export interface UniverseEntry {
  ticker: string;
  name: string;
  listedOn: "TSX" | "TSXV";
  subSector: string;
  /** one plain line: why it belongs to this industry */
  why: string;
  /** where that is confirmed */
  sourceUrl?: string;
}

export interface IndustryProfile {
  /** short stable id, used in URLs and file names */
  id: string;
  /** display name, e.g. "Serial acquirers" */
  name: string;
  /** one line for the industry picker */
  tagline: string;
  /** the organizers' index this industry completes; must match an index name in data/indexes.json */
  indexName: string;
  currency: string;
  /** the one question the tool answers for this industry */
  question: string;
  /** share of the index we fill with additions */
  sleevePct: number;
  /** no single addition above this weight */
  maxWeightPct: number;
  /** related companies share one weight slot */
  relatedGroups: string[][];
  /** how check results become a recommendation (see tally() in metrics.ts) */
  scoring: { passShare: number; mixedShare: number; minAvailable: number };
  checks: CheckDef[];
  metricDefs: MetricDef[];
  map: MapConfig;
  /** title of the map view */
  mapTitle: string;
  /** last ranking tie-breaker: higher value of this metric ranks first */
  rankTiebreak: string;
  /** thresholds the rule lab exposes */
  ruleControls: RuleControl[];
  /** extra per-ticker input files the metrics read, besides financials.csv */
  extraInputs: string[];
  /** views that only make sense with yearly statements (the X-ray and the deal timeline) */
  hasStatements: boolean;
  /** the Canadian companies this industry tests as candidates */
  universe: UniverseEntry[];
  /** display names for well-known non-Canadian holdings, so a typed ticker shows a name. Labels only. */
  holdingNames: Record<string, string>;
  /** the industry's formulas. Must use only pure functions from engine/metrics.ts. */
  computeMetrics: (rows: FinRow[], ctx: MetricContext) => { metrics: Record<string, MetricValue>; warnings: string[] };
}
