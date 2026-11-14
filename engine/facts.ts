// Picking company-reported figures (facts.csv) for a metric. Pure, tested in facts.test.ts.
//
// Reported figures come in many period shapes (full year, nine months, a quarter, a balance-sheet date).
// These helpers only ever compare like with like, and never fill a gap: no match means null.

import type { Fact, PeriodType } from "./industries/types";
import { pctChange, safeDiv } from "./metrics";

/** Longest period first: a full year says more than a quarter. */
export const PERIOD_PREFERENCE: PeriodType[] = ["Annual", "NineMonths", "SemiAnnual", "Quarterly", "PointInTime"];

export interface FactFilter {
  /** metric ids to accept, in order of preference when two share a period */
  metrics: string[];
  /** the filing quote must match this, so a field that holds a different figure is never used */
  quote?: RegExp;
  /** ...and must not match this */
  exclude?: RegExp;
  /** plausible range for the value; anything outside is treated as a different figure and skipped */
  min?: number;
  max?: number;
  /** period types allowed; default: all */
  periods?: PeriodType[];
}

export function matching(facts: Fact[], f: FactFilter): Fact[] {
  return facts.filter(
    (x) =>
      f.metrics.includes(x.metric) &&
      (!f.periods || f.periods.includes(x.periodType)) &&
      (f.min == null || x.value >= f.min) &&
      (f.max == null || x.value <= f.max) &&
      (!f.quote || (x.quote != null && f.quote.test(x.quote))) &&
      (!f.exclude || x.quote == null || !f.exclude.test(x.quote)),
  );
}

/** Human label for a fact's period, e.g. "FY2025", "9M 2026", "Q3 2026", "at 2026-09-30". */
export function periodLabel(x: Pick<Fact, "periodType" | "fiscalYear" | "fiscalQuarter" | "reportDate">): string {
  switch (x.periodType) {
    case "Annual": return `FY${x.fiscalYear}`;
    case "NineMonths": return `9M ${x.fiscalYear}`;
    case "SemiAnnual": return `6M ${x.fiscalYear}`;
    case "Quarterly": return `Q${x.fiscalQuarter} ${x.fiscalYear}`;
    case "PointInTime": return `at ${x.reportDate}`;
  }
}

/** Orders facts: latest fiscal year first; within a year, the longest period; then the latest date; then the metric listed first. */
function byRecencyThenLength(f: FactFilter) {
  return (a: Fact, b: Fact) =>
    b.fiscalYear - a.fiscalYear ||
    PERIOD_PREFERENCE.indexOf(a.periodType) - PERIOD_PREFERENCE.indexOf(b.periodType) ||
    b.reportDate.localeCompare(a.reportDate) ||
    f.metrics.indexOf(a.metric) - f.metrics.indexOf(b.metric);
}

/**
 * The most informative recent value: from the latest fiscal year reported, the longest period
 * (full year, then nine months, six months, a quarter). A stale full year never beats a fresh nine months.
 * `pointInTimeFirst` is for balance-sheet figures (debt ratio, occupancy): the latest date wins.
 */
export function latestFact(facts: Fact[], f: FactFilter, pointInTimeFirst = false): Fact | null {
  const found = matching(facts, f);
  if (found.length === 0) return null;
  if (pointInTimeFirst) {
    return [...found].sort((a, b) => b.reportDate.localeCompare(a.reportDate) || f.metrics.indexOf(a.metric) - f.metrics.indexOf(b.metric))[0];
  }
  return [...found].sort(byRecencyThenLength(f))[0];
}

/**
 * Growth over one year, like for like: the latest period that has the same period one year earlier
 * (FY2025 vs FY2024, 9M 2026 vs 9M 2025, Q3 2026 vs Q3 2025). Full years are tried first.
 * Null if no such pair exists or the earlier value is not positive.
 */
export function yearOverYear(facts: Fact[], f: FactFilter): { value: number | null; from: Fact; to: Fact } | null {
  const found = matching(facts, f);
  for (const type of PERIOD_PREFERENCE.filter((t) => t !== "PointInTime")) {
    const ofType = found.filter((x) => x.periodType === type).sort((a, b) => b.reportDate.localeCompare(a.reportDate));
    for (const to of ofType) {
      const from = ofType.find((x) => x.fiscalYear === to.fiscalYear - 1 && x.fiscalQuarter === to.fiscalQuarter && x.metric === to.metric);
      if (from) return { value: from.value > 0 ? pctChange(from.value, to.value) : null, from, to };
    }
  }
  return null;
}

/**
 * part ÷ whole for the same period (same period type, year and quarter), e.g. distributions per unit ÷ AFFO per unit.
 * Same order as latestFact: latest fiscal year, then the longest period both have. Null if they share no period
 * or the whole is not positive.
 */
export function samePeriodRatio(facts: Fact[], part: FactFilter, whole: FactFilter): { value: number | null; part: Fact; whole: Fact } | null {
  const parts = matching(facts, part).filter((x) => x.periodType !== "PointInTime").sort(byRecencyThenLength(part));
  const wholes = matching(facts, whole).filter((x) => x.periodType !== "PointInTime");
  for (const p of parts) {
    const w = wholes.find((x) => x.periodType === p.periodType && x.fiscalYear === p.fiscalYear && x.fiscalQuarter === p.fiscalQuarter);
    if (w) return { value: w.value > 0 ? safeDiv(p.value, w.value) : null, part: p, whole: w };
  }
  return null;
}
