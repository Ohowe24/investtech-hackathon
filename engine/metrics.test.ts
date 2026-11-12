import { describe, expect, it } from "vitest";
import {
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
