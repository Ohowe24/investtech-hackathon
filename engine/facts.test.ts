import { describe, expect, it } from "vitest";
import { latestFact, matching, samePeriodRatio, yearOverYear } from "./facts";
import type { Fact, PeriodType } from "./industries/types";

const f = (metric: string, periodType: PeriodType, fiscalYear: number, fiscalQuarter: number | null, value: number, quote = metric): Fact => ({
  metric, periodType, fiscalYear, fiscalQuarter, value, quote,
  reportDate: periodType === "Annual" ? `${fiscalYear}-12-31` : `${fiscalYear}-${String((fiscalQuarter ?? 4) * 3).padStart(2, "0")}-30`,
  sourceId: `${metric}-${periodType}-${fiscalYear}-${fiscalQuarter}`,
});

describe("matching", () => {
  it("only accepts a field whose filing quote names the figure", () => {
    const facts = [f("affo_ratio", "Annual", 2025, 4, 0.69, "ACFO payout ratio - diluted"), f("affo_ratio", "Annual", 2023, 4, 0.71, "AFFO payout ratio - diluted")];
    expect(matching(facts, { metrics: ["affo_ratio"], quote: /AFFO payout/i, exclude: /ACFO/i }).map((x) => x.fiscalYear)).toEqual([2023]);
  });
  it("skips values outside the plausible range", () => {
    expect(matching([f("occupancy", "PointInTime", 2026, null, 61288)], { metrics: ["occupancy"], max: 1 })).toEqual([]);
  });
});

describe("latestFact", () => {
  it("takes the latest fiscal year, then the longest period in it", () => {
    const facts = [f("x", "Annual", 2023, 4, 1), f("x", "Quarterly", 2026, 3, 2), f("x", "NineMonths", 2026, 3, 3)];
    expect(latestFact(facts, { metrics: ["x"] })?.value).toBe(3);
  });
  it("for balance-sheet figures, takes the latest date", () => {
    const facts = [f("d", "PointInTime", 2025, 4, 0.4), f("d", "PointInTime", 2026, 3, 0.42)];
    expect(latestFact(facts, { metrics: ["d"] }, true)?.value).toBe(0.42);
  });
  it("is null when nothing matches", () => {
    expect(latestFact([], { metrics: ["x"] })).toBeNull();
  });
});

describe("yearOverYear", () => {
  it("compares like with like, full years first", () => {
    const facts = [f("ffo", "Annual", 2024, 4, 2.0), f("ffo", "Annual", 2025, 4, 2.2), f("ffo", "NineMonths", 2026, 3, 1.5), f("ffo", "NineMonths", 2025, 3, 1.0)];
    const g = yearOverYear(facts, { metrics: ["ffo"] })!;
    expect(g.value).toBeCloseTo(0.1);
    expect(g.from.fiscalYear).toBe(2024);
  });
  it("never compares a quarter with a different quarter", () => {
    expect(yearOverYear([f("ffo", "Quarterly", 2026, 3, 1), f("ffo", "Quarterly", 2025, 2, 2)], { metrics: ["ffo"] })).toBeNull();
  });
  it("is null when the earlier value is not positive", () => {
    expect(yearOverYear([f("ffo", "Annual", 2024, 4, 0), f("ffo", "Annual", 2025, 4, 1)], { metrics: ["ffo"] })?.value).toBeNull();
  });
});

describe("samePeriodRatio", () => {
  it("divides figures from the same period only", () => {
    const facts = [f("dist", "SemiAnnual", 2026, 2, 0.775), f("affo", "SemiAnnual", 2026, 2, 1.102), f("dist", "NineMonths", 2025, 3, 1.158), f("affo", "Quarterly", 2026, 3, 0.572)];
    const r = samePeriodRatio(facts, { metrics: ["dist"] }, { metrics: ["affo"] })!;
    expect(r.value).toBeCloseTo(0.775 / 1.102);
    expect(r.part.periodType).toBe("SemiAnnual");
  });
  it("is null with no shared period", () => {
    expect(samePeriodRatio([f("dist", "Annual", 2025, 4, 1)], { metrics: ["dist"] }, { metrics: ["affo"] })).toBeNull();
  });
});
