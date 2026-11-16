import { describe, expect, it } from "vitest";
import { analyze } from "./analyze";
import { customId, customIndustries, customProfile } from "./industries/custom";
import type { FinRow } from "./industries/types";
import { median } from "./metrics";
import type { MarketEntry, Store, StoredCompany } from "./store";

const row = (year: number, o: Partial<FinRow> = {}): FinRow => ({
  year, revenue: 100, ocf: 20, capex: 5, acquisitions: 0, shares: 10, debt: 50, cash: 10, organic: null,
  equity: 100, ebitda: 25, goodwill: 0, assets: 200, periodEnd: `${year}-12-31`, currency: "CAD", sourceId: `s-${year}`, ...o,
});
/** Five years; revenue grows by `g` a year, operating cash flow is `ocfShare` of revenue. */
const company = (ticker: string, g: number, ocfShare = 0.2): StoredCompany => ({
  ticker, name: ticker, hqCountry: "CA", facts: [], distributions: [], extras: {},
  financials: [2021, 2022, 2023, 2024, 2025].map((y, i) => {
    const revenue = 100 * Math.pow(1 + g, i);
    return row(y, { revenue, ocf: revenue * ocfShare, sourceId: `${ticker}-${y}` });
  }),
});
const entry = (ticker: string, industry: string, country = "CA"): MarketEntry => ({
  ticker, symbol: `${ticker}.TO`, name: `${ticker} Inc.`, exchange: "TSX", sector: "Industrials", industry, country, marketCap: 1e9, etfs: ["ZCN.TO"], sourceId: `p-${ticker}`,
});

const store: Store = {
  isFake: false,
  companies: {
    AAA: company("AAA", 0.1), BBB: company("BBB", 0.05), CCC: company("CCC", 0.0), DDD: company("DDD", 0.02, -0.1),
    FOR: company("FOR", 0.3), HELD: company("HELD", 0.08), ONE: company("ONE", 0.1),
  },
  market: [
    entry("AAA", "Widgets"), entry("BBB", "Widgets"), entry("CCC", "Widgets"), entry("DDD", "Widgets"),
    entry("FOR", "Widgets", "US"), // not Canadian: never a candidate
    entry("NOSTMT", "Widgets"), // no statements: not offered
    entry("ONE", "Gadgets"), // too few companies for its own industry
  ],
  sources: [],
  decisions: {},
  warnings: [],
};

describe("choose-your-own industries", () => {
  it("lists only industries with enough Canadian companies that have statements", () => {
    const list = customIndustries(store);
    expect(list.map((c) => c.name)).toEqual(["Widgets"]);
    expect(list[0].count).toBe(4);
    expect(list[0].id).toBe(customId("Widgets"));
  });

  it("finds the Canadian companies in the industry as candidates", () => {
    const p = customProfile(customId("Widgets"), store, [])!;
    expect(p.universe.map((u) => u.ticker).sort()).toEqual(["AAA", "BBB", "CCC", "DDD"]);
    expect(customProfile("custom:nothing", store, [])).toBeNull();
  });

  it("sets each scored line at the median of every company tested, holdings included", () => {
    const without = customProfile(customId("Widgets"), store, [])!;
    const withHolding = customProfile(customId("Widgets"), store, ["HELD"])!;
    const line = (p: typeof without) => p.checks.find((k) => k.id === "revenueGrowth")!.threshold;
    // Revenue per share grows at each company's g (shares are flat): median of 10%, 5%, 0%, 2% = 3.5%.
    expect(line(without)).toBeCloseTo(median([0.1, 0.05, 0, 0.02])!);
    expect(line(withHolding)).toBeCloseTo(median([0.1, 0.05, 0, 0.02, 0.08])!);
    expect(without.checks.find((k) => k.kind === "gate")!.metricId).toBe("cashFromOperations");
  });

  it("fails the must-pass check when operating cash flow is negative, and ranks the rest", () => {
    const p = customProfile(customId("Widgets"), store, ["HELD"])!;
    const { dataset } = analyze(p, store, { holdings: ["HELD"], holdingsSource: "user" });
    const ddd = dataset.companies.find((c) => c.ticker === "DDD")!;
    expect(ddd.model!.checks.find((k) => k.id === "cashPositive")!.pass).toBe(false);
    expect(ddd.verdict).toBe("reject");
    expect(dataset.companies.find((c) => c.ticker === "AAA")!.model!.rank).toBe(1);
    expect(dataset.companies.find((c) => c.ticker === "HELD")!.inIndex).toBe(true);
  });
});
