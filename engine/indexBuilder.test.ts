import { describe, expect, it } from "vitest";
import {
  allocate, backtest, barMonth, marketPace, buildIndex, capWeights, maxDrawdown, monthKey, monthlyReturns, normalCdf, prevMonth, project, projectAt,
  returnStats, targetWeights, toCad, MIN_PROJECTION_MONTHS, type PricePayload, type PriceSeries,
} from "./indexBuilder";

const months = (from: string, n: number) => {
  const out = [from];
  for (let i = 1; i < n; i++) {
    const [y, m] = out[i - 1].split("-").map(Number);
    out.push(m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`);
  }
  return out;
};

const series = (ticker: string, from: string, close: number[], extra: Partial<PriceSeries> = {}): PriceSeries => ({
  ticker, symbol: `${ticker}.TO`, currency: "CAD", months: months(from, close.length), close,
  price: close[close.length - 1], priceAt: null, marketCap: 1000, marketCapSource: "test", fetched: "live", ...extra,
});

describe("months", () => {
  it("steps back across a year end", () => {
    expect(prevMonth("2026-01")).toBe("2025-12");
    expect(prevMonth("2026-11")).toBe("2026-10");
  });
  it("puts a bar stamped late on the 30th (London summer time) in the next month", () => {
    expect(barMonth(new Date("2007-09-30T23:00:00Z"), null, 0)).toBe("2007-10");
    expect(barMonth(new Date("2015-11-01T04:00:00Z"), null, -18000)).toBe("2015-11");
  });
  it("reads the live bar in the exchange's time zone", () => {
    const live = new Date("2026-12-01T02:00:00Z"); // Nov 30, 9pm in Toronto
    expect(barMonth(live, live, -18000)).toBe("2026-11");
  });
  it("reads month keys in UTC", () => {
    expect(monthKey("2015-11-01T04:00:00.000Z")).toBe("2015-11");
    expect(monthKey("2026-11-19T17:21:15.000Z")).toBe("2026-11");
  });
});

describe("toCad and monthlyReturns", () => {
  it("converts USD prices with that month's rate", () => {
    const s = series("AME", "2024-01", [10, 11], { currency: "USD", price: 11, marketCap: 100 });
    const fx = [{ currency: "USD", months: ["2024-01", "2024-02"], rate: [1.3, 1.4], latest: 1.5 }];
    const c = toCad(s, fx);
    if ("note" in c) throw new Error(c.note);
    expect(c.levels.get("2024-01")).toBeCloseTo(13);
    expect(c.levels.get("2024-02")).toBeCloseTo(15.4);
    expect(c.price).toBeCloseTo(16.5);
    expect(c.marketCap).toBeCloseTo(150);
  });
  it("refuses a currency with no rate", () => {
    expect(toCad(series("X", "2024-01", [1, 2], { currency: "EUR" }), [])).toHaveProperty("note");
  });
  it("only makes a return when the previous calendar month exists", () => {
    const r = monthlyReturns(new Map([["2024-01", 100], ["2024-02", 110], ["2024-04", 121]]));
    expect([...r.keys()]).toEqual(["2024-02"]);
    expect(r.get("2024-02")).toBeCloseTo(0.1);
  });
});

describe("capWeights", () => {
  it("normalizes when no one is over the cap", () => {
    const { weights, capped } = capWeights({ A: 1, B: 1, C: 1, D: 1, E: 1 }, 0.25);
    expect(weights.A).toBeCloseTo(0.2);
    expect(capped).toEqual([]);
  });
  it("caps the giant and shares the rest in proportion", () => {
    const { weights, capped } = capWeights({ A: 90, B: 4, C: 3, D: 2, E: 1 }, 0.25);
    expect(capped).toContain("A");
    expect(weights.A).toBeCloseTo(0.25);
    const sum = Object.values(weights).reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1);
    for (const w of Object.values(weights)) expect(w).toBeLessThanOrEqual(0.25 + 1e-9);
    // B stays bigger than C, in the ratio of their raw scores (unless capped too)
    if (!capped.includes("B")) expect(weights.B / weights.C).toBeCloseTo(4 / 3);
  });
  it("repeats until nobody is over (a second company crosses after the first redistribution)", () => {
    const { weights, capped } = capWeights({ A: 60, B: 20, C: 10, D: 5, E: 5 }, 0.25);
    expect(capped.sort()).toEqual(["A", "B"]);
    expect(weights.C).toBeCloseTo(0.5 * 10 / 20);
  });
  it("leaves weights uncapped when the cap is impossible", () => {
    const { weights, capped } = capWeights({ A: 3, B: 1 }, 0.25);
    expect(weights.A).toBeCloseTo(0.75);
    expect(capped).toEqual([]);
  });
});

describe("targetWeights", () => {
  const members = [
    { ticker: "A", marketCap: 300, quality: 0.5 },
    { ticker: "B", marketCap: 100, quality: 1 },
    { ticker: "C", marketCap: null, quality: 0 },
  ];
  it("market cap drops a member with no cap", () => {
    const r = targetWeights(members, "marketCap", 1);
    expect(r.weights.A).toBeCloseTo(0.75);
    expect(r.dropped.map((d) => d.ticker)).toEqual(["C"]);
  });
  it("equal gives everyone the same", () => {
    const r = targetWeights(members, "equal");
    expect(r.weights.C).toBeCloseTo(1 / 3);
  });
  it("quality follows the grade and drops a zero", () => {
    const r = targetWeights(members, "quality");
    expect(r.weights.B).toBeCloseTo(2 / 3);
    expect(r.dropped[0].note).toMatch(/none of the scored checks/);
  });
});

describe("allocate", () => {
  it("buys whole shares and keeps the rest as cash", () => {
    const { positions, cash } = allocate({ A: 0.5, B: 0.5 }, 1000, { A: 300, B: null });
    expect(positions[0]).toMatchObject({ ticker: "A", shares: 1, cost: 300 });
    expect(positions[1].shares).toBeNull();
    expect(cash).toBe(700);
  });
});

describe("backtest", () => {
  it("averages by weight, sharing a missing member's weight", () => {
    const a = new Map([["2024-02", 0.1], ["2024-03", 0.1]]);
    const b = new Map([["2024-03", -0.1]]);
    const bt = backtest({ A: a, B: b }, { A: 0.6, B: 0.4 }, { minCoverage: 0.5 })!;
    expect(bt.start).toBe("2024-01");
    expect(bt.months).toEqual(["2024-02", "2024-03"]);
    expect(bt.returns[0]).toBeCloseTo(0.1); // only A had a return
    expect(bt.returns[1]).toBeCloseTo(0.6 * 0.1 + 0.4 * -0.1);
    expect(bt.levels[2]).toBeCloseTo(1.1 * 1.02);
  });
  it("waits until enough of the weight has a price", () => {
    const a = new Map([["2024-02", 0.1], ["2024-03", 0.1]]);
    const b = new Map([["2024-03", -0.1]]);
    const bt = backtest({ A: a, B: b }, { A: 0.3, B: 0.7 }, { minCoverage: 0.5 })!;
    expect(bt.months).toEqual(["2024-03"]);
  });
  it("looks back at most maxMonths", () => {
    const a = new Map(months("2000-01", 50).map((m) => [m, 0.01]));
    expect(backtest({ A: a }, { A: 1 }, { maxMonths: 12 })!.months).toHaveLength(12);
  });
});

describe("returnStats", () => {
  it("needs a year of data", () => {
    expect(returnStats(Array(11).fill(0.01))).toBeNull();
  });
  it("compounds a steady 1% a month to 12.68% a year with no volatility", () => {
    const s = returnStats(Array(24).fill(0.01))!;
    expect(s.annualReturn).toBeCloseTo(Math.pow(1.01, 12) - 1);
    expect(s.volatility).toBeCloseTo(0);
    expect(s.muLog).toBeCloseTo(Math.log(1.01));
    expect(s.maxDrawdown).toBe(0);
  });
  it("finds the drawdown and the worst 12 months", () => {
    expect(maxDrawdown([1, 2, 1, 1.5])).toBeCloseTo(-0.5);
    const r = [...Array(12).fill(0.05), ...Array(12).fill(-0.05)];
    const s = returnStats(r)!;
    expect(s.worst12m).toBeCloseTo(Math.pow(0.95, 12) - 1);
    expect(s.best12m).toBeCloseTo(Math.pow(1.05, 12) - 1);
  });
});

describe("projection", () => {
  it("normalCdf matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.2815515655446004)).toBeCloseTo(0.9, 5);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
  it("with no volatility, every band is the compounded value", () => {
    const p = projectAt(100_000, { muLog: Math.log(1.01), sdLog: 0, months: 120 }, 10);
    expect(p.p10).toBeCloseTo(100_000 * Math.pow(1.01, 120), 2);
    expect(p.p90).toBeCloseTo(p.p10, 2);
    expect(p.lossChance).toBe(0);
  });
  it("median is start × e^(μT); bands widen with the estimation term", () => {
    const st = { muLog: 0.007, sdLog: 0.05, months: 120 };
    const p = projectAt(100, st, 20);
    expect(p.p50).toBeCloseTo(100 * Math.exp(0.007 * 240));
    const s = Math.sqrt(0.0025 * 240 + (0.0025 * 240 * 240) / 120);
    expect(p.p90).toBeCloseTo(100 * Math.exp(0.007 * 240 + 1.2815515655446004 * s));
    expect(p.lossChance).toBeCloseTo(normalCdf(-(0.007 * 240) / s));
    // a longer history narrows the long-run band
    expect(projectAt(100, { ...st, months: 240 }, 20).p90).toBeLessThan(p.p90);
  });
  it("market pace keeps the index's spread but the market's average", () => {
    const idx = returnStats(Array.from({ length: 120 }, (_, i) => (i % 2 ? 0.08 : -0.04)))!;
    const mkt = returnStats(Array(240).fill(0.005))!;
    const b = marketPace(idx, mkt)!;
    expect(b.muLog).toBeCloseTo(mkt.muLog);
    expect(b.sdLog).toBeCloseTo(idx.sdLog);
    expect(b.months).toBe(240);
    expect(marketPace(idx, null)).toBeNull();
  });
  it("refuses to project from too little history", () => {
    const s = returnStats(Array(MIN_PROJECTION_MONTHS - 1).fill(0.01));
    expect(project(100, s)).toBeNull();
    expect(project(100, returnStats(Array(MIN_PROJECTION_MONTHS).fill(0.01)))).toHaveLength(6);
  });
});

describe("buildIndex", () => {
  const grow = (n: number, g: number) => Array.from({ length: n }, (_, i) => 10 * Math.pow(1 + g, i));
  const payload: PricePayload = {
    asOf: "2026-11-19", source: "test",
    series: [
      series("A", "2016-01", grow(60, 0.01), { marketCap: 3000 }),
      series("B", "2016-01", grow(60, 0.02), { marketCap: 1000 }),
      series("U", "2016-01", grow(60, 0.0), { currency: "USD", marketCap: 1000 }),
    ],
    benchmark: series("XIC", "2016-01", grow(60, 0.005)),
    fx: [{ currency: "USD", months: months("2016-01", 60), rate: Array(60).fill(1.25), latest: 1.4 }],
    missing: [{ ticker: "Z", note: "No price history found" }, { ticker: "NOTMEMBER", note: "x" }],
  };
  const members = ["A", "B", "U", "Z"].map((t) => ({ ticker: t, marketCap: null, quality: 0.5 }));

  it("weights by CAD market cap, back-tests and projects", () => {
    const r = buildIndex({ payload, members, method: "marketCap" });
    const w = Object.fromEntries(r.positions.map((p) => [p.ticker, p.weight]));
    // A 3000, B 1000, U 1000 USD × 1.4 = 1400 CAD
    expect(w.A).toBeCloseTo(3000 / 5400);
    expect(w.U).toBeCloseTo(1400 / 5400);
    expect(r.dropped.map((d) => d.ticker)).toEqual(["Z"]);
    expect(r.backtest!.months).toHaveLength(59);
    expect(r.projection).toHaveLength(6);
    expect(r.pace!.basis.muLog).toBeCloseTo(r.benchmark!.stats!.muLog);
    expect(r.pace!.projection![3].p50).toBeCloseTo(100_000 * Math.exp(r.benchmark!.stats!.muLog * 120));
    expect(r.benchmark!.samePeriod!.months).toBe(59);
    expect(r.benchmark!.sameLevels).toHaveLength(60);
    expect(r.benchmark!.sameLevels![59]).toBeCloseTo(Math.pow(1.005, 59));
    const spent = r.positions.reduce((s, p) => s + (p.cost ?? 0), 0);
    expect(spent + r.cash).toBeCloseTo(100_000);
    expect(r.positions.find((p) => p.ticker === "B")!.annualReturn).toBeCloseTo(Math.pow(1.02, 12) - 1);
  });
});
