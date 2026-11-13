import { describe, expect, it } from "vitest";
import {
  cashReturnOnCapital,
  equalWeights,
  netDebtToEbitda,
  passes,
  tally,
  cagr,
  freeCashFlow,
  netDebtToFcf,
  pctChange,
  perShare,
  quadrant,
  safeDiv,
  sumStrict,
} from "./metrics";

const zones = {
  topLeft: "Organic growers",
  topRight: "Compounders",
  bottomLeft: "Stalled",
  bottomRight: "Empire builders",
};

describe("cagr", () => {
  it("computes compound growth", () => {
    expect(cagr(100, 121, 2)).toBeCloseTo(0.1, 10);
  });
  it("is null when an end is zero or negative", () => {
    expect(cagr(-5, 10, 3)).toBeNull();
    expect(cagr(0, 10, 3)).toBeNull();
    expect(cagr(10, -1, 3)).toBeNull();
  });
  it("is null for missing values or zero years", () => {
    expect(cagr(null, 10, 3)).toBeNull();
    expect(cagr(10, 20, 0)).toBeNull();
  });
});

describe("per-share example: bigger is not better", () => {
  it("total cash flow +20% but shares +30% means per-share down ~7.7%", () => {
    const before = perShare(100, 100);
    const after = perShare(120, 130);
    expect(before).toBe(1);
    expect(pctChange(before, after)).toBeCloseTo(-0.0769, 3);
  });
});

describe("helpers", () => {
  it("safeDiv guards zero and missing", () => {
    expect(safeDiv(1, 0)).toBeNull();
    expect(safeDiv(null, 2)).toBeNull();
    expect(safeDiv(6, 3)).toBe(2);
  });
  it("sumStrict refuses to hide gaps", () => {
    expect(sumStrict([1, 2, 3])).toBe(6);
    expect(sumStrict([1, null, 3])).toBeNull();
    expect(sumStrict([])).toBeNull();
  });
  it("freeCashFlow subtracts capex", () => {
    expect(freeCashFlow(300, 30)).toBe(270);
    expect(freeCashFlow(300, null)).toBeNull();
  });
  it("perShare needs positive shares", () => {
    expect(perShare(10, 0)).toBeNull();
  });
  it("netDebtToFcf is null when FCF is not positive", () => {
    expect(netDebtToFcf(500, 100, 200)).toBe(2);
    expect(netDebtToFcf(500, 100, 0)).toBeNull();
    expect(netDebtToFcf(500, 100, -50)).toBeNull();
  });
});

describe("quadrant", () => {
  it("places companies in the right zone", () => {
    expect(quadrant(0.8, 0.1, 0.5, 0.05, zones)).toBe("Compounders");
    expect(quadrant(0.8, 0.0, 0.5, 0.05, zones)).toBe("Empire builders");
    expect(quadrant(0.1, 0.1, 0.5, 0.05, zones)).toBe("Organic growers");
    expect(quadrant(0.1, 0.0, 0.5, 0.05, zones)).toBe("Stalled");
    expect(quadrant(null, 0.1, 0.5, 0.05, zones)).toBe("Not enough data");
  });
});

describe("cashReturnOnCapital", () => {
  it("divides FCF by average debt + equity", () => {
    expect(cashReturnOnCapital(100, 400, 600, 500, 500)).toBeCloseTo(0.1);
  });
  it("is null when anything is missing or capital is not positive", () => {
    expect(cashReturnOnCapital(100, null, 600, 500, 500)).toBeNull();
    expect(cashReturnOnCapital(100, 0, -10, 0, -10)).toBeNull();
  });
});

describe("netDebtToEbitda", () => {
  it("computes (debt - cash) / EBITDA, negative for net cash", () => {
    expect(netDebtToEbitda(300, 100, 100)).toBeCloseTo(2);
    expect(netDebtToEbitda(50, 100, 100)).toBeCloseTo(-0.5);
  });
  it("is null when EBITDA is not positive", () => {
    expect(netDebtToEbitda(300, 100, 0)).toBeNull();
    expect(netDebtToEbitda(300, 100, -5)).toBeNull();
  });
});

describe("passes", () => {
  it("compares against the threshold, inclusive", () => {
    expect(passes(0.07, ">=", 0.07)).toBe(true);
    expect(passes(0.06, ">=", 0.07)).toBe(false);
    expect(passes(0.05, "<=", 0.05)).toBe(true);
  });
  it("returns null for missing values, never false", () => {
    expect(passes(null, ">=", 0)).toBeNull();
  });
});

describe("tally", () => {
  const rules = { passShare: 0.75, mixedShare: 0.5, minAvailable: 3 };
  it("fails when a gate fails, whatever the score", () => {
    expect(tally([true, false], [true, true, true, true], rules).recommendation).toBe("fail");
  });
  it("passes with all gates and enough scored checks", () => {
    const t = tally([true, true], [true, true, true, false, null], rules);
    expect(t).toEqual({ passed: 3, available: 4, total: 5, recommendation: "pass" });
  });
  it("does not count missing data as a fail", () => {
    expect(tally([true], [true, true, true, null, null], rules).recommendation).toBe("pass");
  });
  it("is mixed when a gate is unknown or data is thin", () => {
    expect(tally([true, null], [true, true, true, true], rules).recommendation).toBe("mixed");
    expect(tally([true], [true, true, null, null], rules).recommendation).toBe("mixed");
  });
  it("fails when most scored checks fail", () => {
    expect(tally([true], [true, false, false, false], rules).recommendation).toBe("fail");
  });
});

describe("equalWeights", () => {
  it("splits the sleeve equally, capped per group", () => {
    expect(equalWeights([["A"], ["B"], ["C"]], 15, 8.2)).toEqual({ A: 5, B: 5, C: 5 });
    expect(equalWeights([["A"]], 15, 8.2)).toEqual({ A: 8.2 });
  });
  it("makes related companies share one slot", () => {
    expect(equalWeights([["A", "B"], ["C"]], 15, 8.2)).toEqual({ A: 3.75, B: 3.75, C: 7.5 });
  });
  it("returns nothing when there is nothing to add", () => {
    expect(equalWeights([], 15, 8.2)).toEqual({});
  });
});
