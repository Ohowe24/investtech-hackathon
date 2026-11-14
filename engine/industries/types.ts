// What every industry profile declares. One profile = one index the tool can complete.
// The engine (build.ts) is generic; everything industry-specific lives in a profile.

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
}

export interface IndustryProfile {
  /** short stable id, used in URLs and file names */
  id: string;
  /** must match an index name in data/indexes.json */
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
  /** last ranking tie-breaker: higher value of this metric ranks first */
  rankTiebreak: string;
  /** thresholds the rule lab exposes */
  ruleControls: RuleControl[];
  /** extra per-ticker input files the metrics read, besides financials.csv */
  extraInputs: string[];
  /** the industry's formulas. Must use only pure functions from engine/metrics.ts. */
  computeMetrics: (rows: FinRow[], ctx: MetricContext) => { metrics: Record<string, MetricValue>; warnings: string[] };
}
