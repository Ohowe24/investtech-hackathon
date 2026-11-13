import { describe, expect, it } from "vitest";
import type { IndexDef } from "@contract/types";
import { amountFor, completeIndex, countryMix, sharePct } from "./indexMath";

const index: IndexDef = {
  name: "Test index",
  currency: "USD",
  totalValue: 100,
  cash: 10,
  cashPct: 10,
  holdings: 2,
  method: "",
  positions: [
    { ticker: "AAA", country: "United States", countryCode: "US", subSector: "x", signal: "", signalDir: "up", shares: 1, marketValue: 60, weightPct: 60, pnlPct: 0 },
    { ticker: "WCN", country: "United States", countryCode: "US", subSector: "Waste", signal: "", signalDir: "up", shares: 1, marketValue: 30, weightPct: 30, pnlPct: 0 },
  ],
};

describe("completeIndex", () => {
  it("funds additions from cash first", () => {
    const { after } = completeIndex(index, [{ ticker: "CA1", name: "c", weightPct: 4, countryCode: "CA" }]);
    expect(after.cashPct).toBeCloseTo(6);
    expect(after.rows.find((r) => r.ticker === "AAA")?.weightPct).toBeCloseTo(60);
    const total = after.rows.reduce((s, r) => s + r.weightPct, 0) + after.cashPct;
    expect(total).toBeCloseTo(100);
  });

  it("trims existing positions proportionally when cash runs out", () => {
    const { after } = completeIndex(index, [{ ticker: "CA1", name: "c", weightPct: 19, countryCode: "CA" }]);
    expect(after.cashPct).toBe(0);
    // shortfall 9 over 90 invested -> scale 0.9
    expect(after.rows.find((r) => r.ticker === "AAA")?.weightPct).toBeCloseTo(54);
    const total = after.rows.reduce((s, r) => s + r.weightPct, 0) + after.cashPct;
    expect(total).toBeCloseTo(100);
  });

  it("applies country corrections and reports them", () => {
    const { before, relabels } = completeIndex(index, [], { WCN: "CA" });
    expect(relabels).toEqual([{ ticker: "WCN", labelled: "US", actual: "CA" }]);
    expect(sharePct(before, "CA")).toBeCloseTo(30);
    expect(countryMix(before)[0]).toEqual({ code: "US", pct: 60 });
  });
});

describe("amountFor", () => {
  it("turns a weight into money at the index's total value", () => {
    expect(amountFor(4.1, 100_000)).toBeCloseTo(4_100);
    expect(amountFor(0, 100_000)).toBe(0);
  });
});
