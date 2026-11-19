// Tests for the Outlook engine formulas in engine/metrics.ts (rules: engine/methodology.md, "Outlook engine").
import { describe, expect, it } from "vitest";
import { cagr, directionOf, industryOutlook, lagsEconomy, marketWeights, mixShift, realGrowth, shares, trailingMomentum, trendOf, weightedOutlook } from "./metrics";

describe("trailingMomentum", () => {
  const flat = (v: number, n: number) => Array.from({ length: n }, () => v);
  it("compares the latest 12-month average with the one ending 3 years earlier", () => {
    const series = [...flat(100, 12), ...flat(999, 24), ...flat(121, 12)]; // middle months don't matter
    expect(trailingMomentum(series, 3)).toBeCloseTo(Math.pow(1.21, 1 / 3) - 1, 10);
  });
  it("uses the last 48 points when the series is longer", () => {
    expect(trailingMomentum([5, 5, ...flat(100, 12), ...flat(1, 24), ...flat(100, 12)], 3)).toBeCloseTo(0, 10);
  });
  it("is null when a month in either window is missing", () => {
    const s: (number | null)[] = [...flat(100, 48)];
    s[47] = null;
    expect(trailingMomentum(s, 3)).toBeNull();
  });
  it("ignores a gap between the two windows", () => {
    const s: (number | null)[] = [...flat(100, 48)];
    s[20] = null;
    expect(trailingMomentum(s, 3)).toBeCloseTo(0, 10);
  });
  it("is null for too short a series or non-positive levels", () => {
    expect(trailingMomentum(flat(100, 47), 3)).toBeNull();
    expect(trailingMomentum([...flat(0, 12), ...flat(1, 36)], 3)).toBeNull();
  });
  it("can be negative", () => {
    expect(trailingMomentum([...flat(100, 36), ...flat(90, 12)], 3)).toBeCloseTo(Math.pow(0.9, 1 / 3) - 1, 10);
  });
});

describe("realGrowth", () => {
  it("removes inflation exactly, not by subtraction", () => {
    expect(realGrowth(0.0404, 0.02)).toBeCloseTo(0.02, 10);
    expect(realGrowth(0.02, 0.02)).toBeCloseTo(0, 10);
  });
  it("is null when the nominal rate is missing", () => {
    expect(realGrowth(null, 0.02)).toBeNull();
  });
});

describe("industryOutlook", () => {
  it("is the median of the signals that exist", () => {
    expect(industryOutlook([0.01, 0.03, 0.02], 2)).toBeCloseTo(0.02, 10);
    expect(industryOutlook([0.01, null, 0.03, 0.04], 2)).toBeCloseTo(0.03, 10);
    expect(industryOutlook([0.01, 0.03], 2)).toBeCloseTo(0.02, 10);
  });
  it("is null with fewer than the minimum number of signals", () => {
    expect(industryOutlook([0.05, null, null], 2)).toBeNull();
    expect(industryOutlook([], 1)).toBeNull();
  });
  it("one outlier cannot move it far (why median, not mean)", () => {
    expect(industryOutlook([0.02, 0.021, 0.5], 2)).toBeCloseTo(0.021, 10);
  });
});

describe("trendOf", () => {
  it("growing at or above the economy, stable between 0 and the economy, declining below 0", () => {
    expect(trendOf(0.02, 0.02)).toBe("growing");
    expect(trendOf(0.035, 0.02)).toBe("growing");
    expect(trendOf(0.019, 0.02)).toBe("stable");
    expect(trendOf(0, 0.02)).toBe("stable");
    expect(trendOf(-0.0001, 0.02)).toBe("declining");
  });
  it("is null when either figure is missing", () => {
    expect(trendOf(null, 0.02)).toBeNull();
    expect(trendOf(0.03, null)).toBeNull();
  });
});

describe("shares", () => {
  it("divides each value by the total", () => {
    expect(shares([3, 1])).toEqual([0.75, 0.25]);
  });
  it("is all null if any value is missing or negative, or the total is 0", () => {
    expect(shares([3, null])).toEqual([null, null]);
    expect(shares([3, -1])).toEqual([null, null]);
    expect(shares([0, 0])).toEqual([null, null]);
  });
});

describe("weightedOutlook", () => {
  it("weights each outlook by its share", () => {
    const r = weightedOutlook([{ weight: 0.75, outlook: 0.04 }, { weight: 0.25, outlook: 0 }], 0.5);
    expect(r.value).toBeCloseTo(0.03, 10);
    expect(r.coverage).toBe(1);
  });
  it("rescales over the rows with data and reports coverage", () => {
    const r = weightedOutlook([{ weight: 0.6, outlook: 0.02 }, { weight: 0.4, outlook: null }], 0.5);
    expect(r.value).toBeCloseTo(0.02, 10);
    expect(r.coverage).toBeCloseTo(0.6, 10);
  });
  it("is null when coverage is below the minimum", () => {
    const r = weightedOutlook([{ weight: 0.4, outlook: 0.02 }, { weight: 0.6, outlook: null }], 0.5);
    expect(r.value).toBeNull();
    expect(r.coverage).toBeCloseTo(0.4, 10);
  });
  it("equal weights give a plain average (deals)", () => {
    expect(weightedOutlook([{ weight: 1, outlook: 0.01 }, { weight: 1, outlook: 0.03 }], 0.5).value).toBeCloseTo(0.02, 10);
  });
  it("is null with no weight at all", () => {
    expect(weightedOutlook([], 0.5)).toEqual({ value: null, coverage: 0 });
  });
});

describe("directionOf", () => {
  it("toward / away beyond the band, steady within it", () => {
    expect(directionOf(0.035, 0.02, 0.01)).toBe("toward");
    expect(directionOf(0.005, 0.02, 0.01)).toBe("away");
    expect(directionOf(0.029, 0.02, 0.01)).toBe("steady");
    expect(directionOf(0.011, 0.02, 0.01)).toBe("steady");
  });
  it("is null when either side is missing", () => {
    expect(directionOf(null, 0.02, 0.01)).toBeNull();
    expect(directionOf(0.02, undefined, 0.01)).toBeNull();
  });
});

describe("BLS Table 2.11 cross-check", () => {
  it("our 10-year rate from the published output levels rounds to the published rate", async () => {
    const { readFileSync } = await import("node:fs");
    const { parseCsv } = await import("./csv");
    for (const r of parseCsv(readFileSync("engine/input/outlook-bls-ep.csv", "utf8"))) {
      const ours = cagr(Number(r.output_2025), Number(r.output_2035), 10);
      expect(ours, r.bls_code).not.toBeNull();
      expect(Math.abs((ours as number) * 100 - Number(r.published_cagr_pct)), r.bls_code).toBeLessThanOrEqual(0.05 + 1e-9);
    }
  });
});

describe("marketWeights", () => {
  it("splits one deal equally across the markets it names", () => {
    expect(marketWeights(["621", "531"])).toEqual([{ market: "621", weight: 0.5 }, { market: "531", weight: 0.5 }]);
  });
  it("keeps an unplaceable market's share with no market, so coverage drops", () => {
    const w = marketWeights(["621", "?"]);
    expect(w).toEqual([{ market: "621", weight: 0.5 }, { market: null, weight: 0.5 }]);
    expect(weightedOutlook(w.map((x) => ({ weight: x.weight, outlook: x.market ? 0.03 : null })), 0).coverage).toBeCloseTo(0.5, 10);
  });
  it("a deal that names no market is one row with no market", () => {
    expect(marketWeights([])).toEqual([{ market: null, weight: 1 }]);
    expect(marketWeights([" ", ""])).toEqual([{ market: null, weight: 1 }]);
  });
  it("each deal still counts once in total", () => {
    const sum = (xs: { weight: number }[]) => xs.reduce((s, x) => s + x.weight, 0);
    expect(sum(marketWeights(["441", "?", "91", "325", "621", "5411"]))).toBeCloseTo(1, 12);
  });
});

describe("mixShift", () => {
  it("measures the tailwind change from the mix alone, outlooks fixed", () => {
    // 50/50 -> 80/20 between a 4% and a 1% industry: 2.5% -> 3.4%, shift +0.9 pt
    const r = mixShift([{ from: 0.5, to: 0.8, outlook: 0.04 }, { from: 0.5, to: 0.2, outlook: 0.01 }], 0.5);
    expect(r.from).toBeCloseTo(0.025, 10);
    expect(r.to).toBeCloseTo(0.034, 10);
    expect(r.shift).toBeCloseTo(0.009, 10);
  });
  it("is zero when every segment is in one industry", () => {
    expect(mixShift([{ from: 0.7, to: 0.2, outlook: 0.03 }, { from: 0.3, to: 0.8, outlook: 0.03 }], 0.5).shift).toBeCloseTo(0, 12);
  });
  it("is negative when revenue moves toward the weaker industry", () => {
    expect(mixShift([{ from: 0.8, to: 0.5, outlook: 0.04 }, { from: 0.2, to: 0.5, outlook: 0.01 }], 0.5).shift).toBeCloseTo(-0.009, 10);
  });
  it("is null when either year lacks coverage", () => {
    const r = mixShift([{ from: 0.6, to: 0.3, outlook: null }, { from: 0.4, to: 0.7, outlook: 0.02 }], 0.5);
    expect(r.from).toBeNull();
    expect(r.to).toBeCloseTo(0.02, 10);
    expect(r.shift).toBeNull();
  });
  it("is null when a year has no shares", () => {
    expect(mixShift([{ from: null, to: 1, outlook: 0.02 }], 0.5)).toEqual({ from: null, to: 0.02, shift: null });
  });
});

describe("lagsEconomy", () => {
  it("only flags a tailwind more than the band below the economy", () => {
    expect(lagsEconomy(0.0188, 0.0192, 0.01)).toBe(false); // 0.04 pt below: noise, not lagging
    expect(lagsEconomy(0.0091, 0.0192, 0.01)).toBe(true); // 1.01 pt below
    expect(lagsEconomy(0.0092, 0.0192, 0.01)).toBe(false); // exactly 1 pt below: within the band
    expect(lagsEconomy(0.05, 0.0192, 0.01)).toBe(false);
  });
  it("is null when a value is missing", () => {
    expect(lagsEconomy(null, 0.02, 0.01)).toBeNull();
    expect(lagsEconomy(0.02, null, 0.01)).toBeNull();
  });
});
