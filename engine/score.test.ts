import { describe, expect, it } from "vitest";
import { analyze } from "./analyze";
import { acquirers } from "./industries/acquirers";
import { customId, customProfile } from "./industries/custom";
import { OIL_GAS_EP, oilGasMetrics, oilGasScore } from "./industries/oilgas";
import type { FinRow } from "./industries/types";
import { peerGrade, rampGrade, weightedScore } from "./metrics";
import type { MarketEntry, Store, StoredCompany } from "./store";

describe("rampGrade", () => {
  it("runs from 0 at `zero` to 1 at `full`, clamped", () => {
    expect(rampGrade(0.075, 0, 0.15)).toBeCloseTo(0.5);
    expect(rampGrade(-0.1, 0, 0.15)).toBe(0);
    expect(rampGrade(1.13, 0, 0.15)).toBe(1);
  });
  it("works when lower is better", () => {
    expect(rampGrade(2.5, 4, 1)).toBeCloseTo(0.5);
    expect(rampGrade(0.5, 4, 1)).toBe(1);
    expect(rampGrade(8, 4, 1)).toBe(0);
  });
  it("is null for a missing value", () => {
    expect(rampGrade(null, 0, 1)).toBeNull();
  });
});

describe("peerGrade", () => {
  const peers = [1, 2, 3, 4, 5];
  it("gives best 1, median 0.5, worst 0", () => {
    expect(peerGrade(5, peers, true)).toBe(1);
    expect(peerGrade(3, peers, true)).toBe(0.5);
    expect(peerGrade(1, peers, true)).toBe(0);
  });
  it("flips when lower is better", () => {
    expect(peerGrade(1, peers, false)).toBe(1);
  });
  it("shares positions on ties", () => {
    expect(peerGrade(2, [2, 2, 4], true)).toBe(0.25);
  });
  it("is null with fewer than 3 peers or no value", () => {
    expect(peerGrade(1, [1, 2], true)).toBeNull();
    expect(peerGrade(null, peers, true)).toBeNull();
  });
});

describe("weightedScore", () => {
  it("is the weighted mean of grades, out of 100", () => {
    expect(weightedScore([{ weight: 30, grade: 1 }, { weight: 70, grade: 0.5 }], 0.6)).toEqual({ value: 65, coverage: 1 });
  });
  it("rescales the other weights when a part has no data", () => {
    expect(weightedScore([{ weight: 30, grade: null }, { weight: 70, grade: 0.5 }], 0.6)).toEqual({ value: 50, coverage: 0.7 });
  });
  it("is null when the parts with data carry too little weight", () => {
    expect(weightedScore([{ weight: 50, grade: null }, { weight: 50, grade: 1 }], 0.6).value).toBeNull();
  });
});

describe("declared weights", () => {
  it("add up to 100 in every industry with a score", () => {
    for (const s of [acquirers.score!, oilGasScore]) expect(s.components.reduce((t, c) => t + c.weight, 0)).toBe(100);
  });
});

const row = (year: number, o: Partial<FinRow> = {}): FinRow => ({
  year, revenue: 100, ocf: 40, capex: 20, acquisitions: 0, shares: 10, debt: 50, cash: 10, organic: null,
  equity: 100, ebitda: 40, goodwill: 0, assets: 200, periodEnd: `${year}-12-31`, currency: "CAD", sourceId: `s-${year}`, ...o,
});
const years = [2021, 2022, 2023, 2024, 2025];

describe("oil & gas producer measures", () => {
  it("takes the free cash flow margin over five years combined", () => {
    // Revenue 100, 300 (price spike), 100, 100, 100; FCF 20 each year except 120 in the spike year.
    const rows = years.map((y) => (y === 2022 ? row(y, { revenue: 300, ocf: 140 }) : row(y)));
    const m = oilGasMetrics(rows);
    expect(m.fcfMarginCycle.value).toBeCloseTo((20 * 4 + 120) / 700);
    expect(m.fcfMarginCycle.period).toBe("FY2021–FY2025");
  });
  it("leaves the five-year margin empty when a year has no sales", () => {
    const rows = years.map((y) => (y < 2025 ? row(y, { revenue: 0 }) : row(y)));
    const m = oilGasMetrics(rows);
    expect(m.fcfMarginCycle.value).toBeNull();
    expect(m.fcfMarginCycle.note).toMatch(/Revenue is zero/);
  });
  it("divides latest net debt by three-year average EBITDA", () => {
    const rows = years.map((y) => row(y, { ebitda: y === 2025 ? 100 : 10 }));
    expect(oilGasMetrics(rows).netDebtToAvgEbitda.value).toBeCloseTo(40 / 40); // (10 + 10 + 100) / 3 = 40
  });
  it("averages four yearly cash returns", () => {
    const rows = years.map((y) => row(y));
    // FCF 20 on average capital (50 + 100) = 150 every year.
    expect(oilGasMetrics(rows).cashReturnCycle.value).toBeCloseTo(20 / 150);
  });
  it("needs five consecutive years", () => {
    expect(oilGasMetrics([row(2024), row(2025)]).fcfMarginCycle.value).toBeNull();
  });
});

describe("quality score in a run", () => {
  const company = (ticker: string, ocf: number, debt: number): StoredCompany => ({
    ticker, name: ticker, hqCountry: "CA", facts: [], distributions: [], extras: {},
    financials: years.map((y) => row(y, { ocf, debt, sourceId: `${ticker}-${y}` })),
  });
  const entry = (ticker: string): MarketEntry => ({
    ticker, symbol: `${ticker}.TO`, name: ticker, exchange: "TSX", sector: "Energy", industry: OIL_GAS_EP, country: "CA", marketCap: 1e9, etfs: [], sourceId: `p-${ticker}`,
  });
  const store: Store = {
    isFake: false,
    companies: { GOOD: company("GOOD", 60, 10), MID: company("MID", 40, 50), BAD: company("BAD", 25, 150) },
    market: [entry("GOOD"), entry("MID"), entry("BAD")],
    sources: [], decisions: {}, warnings: [],
  };

  it("uses the producer measures and scores every company out of 100", () => {
    const p = customProfile(customId(OIL_GAS_EP), store, [])!;
    expect(p.metricDefs.map((d) => d.id)).toContain("fcfMarginCycle");
    expect(p.map.x).toBe("netDebtToAvgEbitda");
    const { dataset } = analyze(p, store, { holdings: [], holdingsSource: "user" });
    const score = (t: string) => dataset.companies.find((c) => c.ticker === t)!.model!.score!.value!;
    expect(score("GOOD")).toBeGreaterThan(score("MID"));
    expect(score("MID")).toBeGreaterThan(score("BAD"));
    expect(dataset.metricDefs.find((d) => d.id === "netDebtToAvgEbitda")!.weight).toBe(30);
    expect(dataset.rules!.score).toMatch(/Out of 100/);
  });

  it("other choose-your-own industries keep the generic measures and have no score", () => {
    const other: Store = { ...store, market: store.market.map((m) => ({ ...m, industry: "Widgets" })) };
    const p = customProfile(customId("Widgets"), other, [])!;
    expect(p.score).toBeUndefined();
    expect(p.metricDefs.map((d) => d.id)).toContain("fcfMargin");
  });
});
