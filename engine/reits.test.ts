import { describe, expect, it } from "vitest";
import { reits } from "./industries/reits";
import type { Distribution, FinRow } from "./industries/types";

const row = (year: number, o: Partial<FinRow> = {}): FinRow => ({
  year, revenue: 100, ocf: 50, capex: 10, acquisitions: 0, shares: 10, debt: 400, cash: 5, organic: null,
  equity: 500, ebitda: 60, goodwill: 0, assets: 1000, periodEnd: `${year}-12-31`, currency: "CAD", sourceId: `s${year}`, ...o,
});
// Two distributions per year: 1.5 per unit a year from 2022, 1.0 in 2019.
const dist = (years: number[], amount: number, currency = "CAD"): Distribution[] =>
  years.flatMap((y) => [`${y}-06-30`, `${y}-12-15`].map((date) => ({ date, amount: amount / 2, currency, sourceId: "d" })));
const run = (rows: FinRow[], distributions: Distribution[]) =>
  reits.computeMetrics(rows, { ticker: "T", lookup: () => undefined, facts: [], distributions }).metrics;

describe("REIT metrics, from statements and distributions only", () => {
  const rows = [row(2022, { ocf: 40, revenue: 80 }), row(2023), row(2024), row(2025, { ocf: 60, revenue: 120 })];
  const m = run(rows, [...dist([2022], 1.2), ...dist([2023, 2024, 2025], 1.5)]);

  it("cash payout = distributions per unit ÷ operating cash flow per unit, latest fiscal year", () => {
    expect(m.cashPayout.value).toBeCloseTo(1.5 / 6);
    expect(m.cashPayout.period).toBe("FY2025");
  });
  it("debt ÷ total assets at the latest year end", () => {
    expect(m.debtToAssets.value).toBeCloseTo(0.4);
  });
  it("per-unit growth is a 3-year yearly rate", () => {
    expect(m.cashFlowPerUnitGrowth.value).toBeCloseTo(Math.pow(6 / 4, 1 / 3) - 1);
    expect(m.revenuePerUnitGrowth.value).toBeCloseTo(Math.pow(12 / 8, 1 / 3) - 1);
    expect(m.distributionGrowth.value).toBeCloseTo(Math.pow(1.5 / 1.2, 1 / 3) - 1);
    expect(m.cashFlowPerUnitGrowth.period).toBe("FY2022 → FY2025");
  });
  it("never compares distributions and statements in different currencies", () => {
    const x = run(rows, dist([2022, 2025], 1, "USD"));
    expect(x.cashPayout.value).toBeNull();
    expect(x.cashPayout.note).toMatch(/USD/);
  });
  it("uses no per-unit figures for currencies outside CAD and USD, but keeps the debt ratio", () => {
    const x = run(rows.map((r) => ({ ...r, currency: "ARS" })), []);
    expect(x.cashFlowPerUnitGrowth.value).toBeNull();
    expect(x.debtToAssets.value).toBeCloseTo(0.4);
  });
  it("missing years stay null with a note, never 0", () => {
    const x = run([row(2025)], dist([2025], 1));
    expect(x.cashFlowPerUnitGrowth.value).toBeNull();
    expect(x.cashFlowPerUnitGrowth.note).toMatch(/FY2022/);
  });
});
