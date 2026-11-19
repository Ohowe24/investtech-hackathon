// Tests for the Outlook engine formulas in engine/metrics.ts (rules: engine/methodology.md, "Outlook engine").
import { describe, expect, it } from "vitest";
import { cagr, correlationStrength, demean, persistence, directionOf, industryOutlook, marketWeights, mixShift, pearson, realGrowth, shares, spearman, trailingMomentum, trendOf, weightedOutlook, yearlyMeans } from "./metrics";

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

describe("pearson and spearman", () => {
  it("are 1 for a perfect positive relation and -1 for a perfect negative one", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12);
    expect(spearman([1, 2, 3, 4], [10, 9, 1, 0])).toBeCloseTo(-1, 12);
  });
  it("spearman only cares about order, so one huge value cannot dominate", () => {
    expect(spearman([1, 2, 3, 4], [1, 2, 3, 1000])).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3, 4], [1, 2, 3, 1000])).toBeLessThan(0.8);
  });
  it("ties share the average rank", () => {
    // x ranks 1.5,1.5,3,4 vs y ranks 1,2,3,4
    const r = spearman([5, 5, 6, 7], [1, 2, 3, 4]) as number;
    expect(r).toBeCloseTo(pearson([1.5, 1.5, 3, 4], [1, 2, 3, 4]) as number, 12);
  });
  it("skip pairs with a missing value and need at least 3 pairs", () => {
    expect(spearman([1, null, 3, 4], [1, 2, 3, 4])).toBeCloseTo(1, 12);
    expect(spearman([1, 2], [1, 2])).toBeNull();
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });
});

describe("demean", () => {
  it("subtracts the mean of the values present", () => {
    expect(demean([1, null, 3])).toEqual([-1, null, 1]);
    expect(demean([null])).toEqual([null]);
  });
});

describe("yearlyMeans", () => {
  const months = (y: number, v: number) => Array.from({ length: 12 }, (_, m) => ({ period: `${y}-${String(m + 1).padStart(2, "0")}-01`, value: v }));
  it("averages complete calendar years only", () => {
    const pts = [...months(2020, 10), ...months(2021, 20).slice(0, 11)];
    expect(yearlyMeans(pts)).toEqual({ 2020: 10, 2021: null });
  });
  it("a missing month makes the year null", () => {
    const pts = months(2020, 10).map((p, i) => (i === 3 ? { ...p, value: null } : p));
    expect(yearlyMeans(pts)[2020]).toBeNull();
  });
});

describe("persistence", () => {
  const r = (past: number, next: number) => ({ past, next, econPast: 0.02, econNext: 0.02 });
  it("counts how often shrinking industries keep lagging, against the base rate", () => {
    const p = persistence([r(-0.01, 0.0), r(-0.02, 0.03), r(0.03, 0.04), r(0.01, 0.0), { past: null, next: 0, econPast: 0, econNext: 0 }]);
    expect(p.n).toBe(4);
    expect(p.shrinking).toBe(2);
    expect(p.stillLagging).toBeCloseTo(0.5, 12); // one of two kept lagging
    expect(p.baseLagging).toBeCloseTo(0.5, 12); // two of four lagged overall
    expect(p.ahead).toBe(1);
    expect(p.stillAhead).toBe(1);
    expect(p.baseAhead).toBeCloseTo(0.5, 12);
  });
  it("shares are null when a group is empty", () => {
    expect(persistence([r(0.03, 0.03)]).stillLagging).toBeNull();
  });
});

describe("correlationStrength", () => {
  it("names the size of a correlation, either sign", () => {
    expect(correlationStrength(0.05)).toBe("none");
    expect(correlationStrength(-0.2)).toBe("weak");
    expect(correlationStrength(0.3)).toBe("moderate");
    expect(correlationStrength(-0.7)).toBe("strong");
    expect(correlationStrength(null)).toBeNull();
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
