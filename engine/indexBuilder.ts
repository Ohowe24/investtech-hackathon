// GENERATED INDEX: turn a group of companies into a $100,000 index, back-test it on real monthly prices,
// and project it forward.
//
// Pure functions. Prices come in (engine/prices-fetch.ts downloads them from Yahoo Finance), numbers come out.
// Nothing here is typed by hand: every figure is computed from the price history, and every parameter
// (the cap, the look-back, the minimum history) is declared below and explained in engine/methodology.md,
// section "Generated index".

import { median } from "./metrics";

// ---------------------------------------------------------------- declared parameters

/** The money the generated index starts with, in Canadian dollars. */
export const START_AMOUNT = 100_000;
/** With market-cap weights, no company may be more than this share of the index (when enough companies make that possible). */
export const CAP_SHARE = 0.25;
/** Back-test window: at most this many months of history. */
export const LOOKBACK_MONTHS = 240;
/** A month counts in the back-test once the companies with a price that month carry at least this share of the target weight. */
export const MIN_COVERAGE = 0.5;
/** Fewer months than this and the history is too short to project from. */
export const MIN_PROJECTION_MONTHS = 36;
/** The horizons the projection reports, in years. */
export const HORIZONS = [1, 3, 5, 10, 20, 30] as const;
/** Benchmark ETF: iShares Core S&P/TSX Capped Composite. */
export const BENCHMARK = { symbol: "XIC.TO", label: "TSX Composite" } as const;

// ---------------------------------------------------------------- inputs

/** Monthly prices for one listing, as Yahoo Finance gives them. */
export interface PriceSeries {
  ticker: string;
  symbol: string;
  /** listing currency, e.g. "CAD" */
  currency: string;
  /** "YYYY-MM", ascending, unique */
  months: string[];
  /** adjusted close (dividends and splits folded in) at the end of each month; the last month is month to date */
  close: number[];
  /** latest traded price, listing currency */
  price: number | null;
  /** ISO time of that price */
  priceAt: string | null;
  /** market capitalisation, listing currency */
  marketCap: number | null;
  /** where the market cap came from */
  marketCapSource: string | null;
  /** "live" when fetched for this request, else the date of the saved snapshot it came from */
  fetched: string;
}

/** Canadian dollars per one unit of a currency, month by month (same month keys as PriceSeries). */
export interface FxSeries {
  currency: string;
  months: string[];
  rate: number[];
  latest: number | null;
}

/** Everything the browser needs to build the index: one payload from /api/index-builder. */
export interface PricePayload {
  asOf: string;
  source: string;
  series: PriceSeries[];
  benchmark: PriceSeries | null;
  fx: FxSeries[];
  /** tickers with no price history, and why */
  missing: { ticker: string; note: string }[];
}

export type Weighting = "marketCap" | "equal" | "quality";

// ---------------------------------------------------------------- months

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** "2026-01" -> "2025-12". */
export function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** "YYYY-MM" of an ISO date or Date, read in UTC. */
export function monthKey(d: string | Date): string {
  const t = typeof d === "string" ? new Date(d) : d;
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

const DAY = 86_400_000;

/**
 * The month a Yahoo monthly bar belongs to. Bars start at midnight on the 1st in the exchange's time zone, which in
 * UTC can fall on the evening of the last day of the previous month (London in summer: Oct 1 00:00 BST is Sept 30
 * 23:00 UTC), so a bar's month is read two days after its time. The live bar (stamped with the latest trade time,
 * not a month start) is read in the exchange's current time zone instead.
 */
export function barMonth(time: Date, liveTime: Date | null, gmtOffsetSec: number): string {
  const t = time.getTime();
  if (liveTime && Math.abs(t - liveTime.getTime()) < 60_000) return monthKey(new Date(t + gmtOffsetSec * 1000));
  return monthKey(new Date(t + 2 * DAY));
}

// ---------------------------------------------------------------- currency

/** CAD per unit for a currency in a month, from its FX series; 1 for CAD; null if unknown. */
function fxLookup(fx: FxSeries[]): (currency: string) => { at: (month: string) => number | null; latest: number | null } | null {
  const maps = new Map(fx.map((f) => [f.currency, { m: new Map(f.months.map((k, i) => [k, f.rate[i]])), latest: f.latest }]));
  return (currency) => {
    if (currency === "CAD") return { at: () => 1, latest: 1 };
    const f = maps.get(currency);
    return f ? { at: (month) => f.m.get(month) ?? null, latest: f.latest } : null;
  };
}

export interface CadSeries {
  ticker: string;
  /** month -> adjusted close in CAD */
  levels: Map<string, number>;
  /** latest price in CAD */
  price: number | null;
  /** market cap in CAD */
  marketCap: number | null;
}

/** A listing's prices and market cap in Canadian dollars. Null (with the reason) when its currency cannot be converted. */
export function toCad(s: PriceSeries, fx: FxSeries[]): CadSeries | { ticker: string; note: string } {
  const f = fxLookup(fx)(s.currency);
  if (!f) return { ticker: s.ticker, note: `Prices are in ${s.currency || "an unknown currency"}, with no exchange rate to CAD` };
  const levels = new Map<string, number>();
  s.months.forEach((m, i) => {
    const rate = f.at(m);
    const c = s.close[i];
    if (isNum(rate) && isNum(c) && c > 0) levels.set(m, c * rate);
  });
  const conv = (v: number | null) => (isNum(v) && isNum(f.latest) ? v * f.latest : null);
  return { ticker: s.ticker, levels, price: conv(s.price), marketCap: conv(s.marketCap) };
}

/** Month -> return, for every month whose previous calendar month also has a level. */
export function monthlyReturns(levels: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [m, v] of levels) {
    const p = levels.get(prevMonth(m));
    if (isNum(p) && p > 0 && isNum(v)) out.set(m, v / p - 1);
  }
  return out;
}

// ---------------------------------------------------------------- weights

/**
 * Scales raw scores to weights that add up to 1, with no weight above `cap`.
 * Weight taken off a capped company is shared among the others in proportion to their raw scores, repeated until
 * nobody is over. When there are too few companies for the cap to be possible (n × cap < 1), weights are left uncapped.
 */
export function capWeights(raw: Record<string, number>, cap: number): { weights: Record<string, number>; capped: string[] } {
  const keys = Object.keys(raw).filter((k) => isNum(raw[k]) && raw[k] > 0);
  const total = keys.reduce((s, k) => s + raw[k], 0);
  if (!keys.length || total <= 0) return { weights: {}, capped: [] };
  const weights: Record<string, number> = Object.fromEntries(keys.map((k) => [k, raw[k] / total]));
  if (keys.length * cap < 1 - 1e-9) return { weights, capped: [] };
  const fixed = new Set<string>();
  for (let round = 0; round < keys.length; round++) {
    const over = keys.filter((k) => !fixed.has(k) && weights[k] > cap + 1e-12);
    if (!over.length) break;
    over.forEach((k) => fixed.add(k));
    const free = keys.filter((k) => !fixed.has(k));
    const freeRaw = free.reduce((s, k) => s + raw[k], 0);
    const left = 1 - fixed.size * cap;
    for (const k of fixed) weights[k] = cap;
    for (const k of free) weights[k] = freeRaw > 0 ? (left * raw[k]) / freeRaw : 0;
  }
  return { weights, capped: [...fixed] };
}

export interface Member {
  ticker: string;
  /** CAD */
  marketCap: number | null;
  /** 0-1: the quality score out of 100, or the share of scored checks passed */
  quality: number | null;
}

/**
 * Target weights for the members.
 * - marketCap: in proportion to market value, no company above CAP_SHARE (the usual way an index is weighted).
 * - equal: the same weight for each.
 * - quality: in proportion to the engine's quality grade, so companies that pass more checks get more.
 * A member without the figure its weighting needs is left out, with the reason.
 */
export function targetWeights(members: Member[], method: Weighting, cap = CAP_SHARE): {
  weights: Record<string, number>;
  capped: string[];
  dropped: { ticker: string; note: string }[];
} {
  const dropped: { ticker: string; note: string }[] = [];
  const raw: Record<string, number> = {};
  for (const m of members) {
    if (method === "equal") raw[m.ticker] = 1;
    else if (method === "marketCap") {
      if (isNum(m.marketCap) && m.marketCap > 0) raw[m.ticker] = m.marketCap;
      else dropped.push({ ticker: m.ticker, note: "No market cap to weight by" });
    } else {
      if (isNum(m.quality) && m.quality > 0) raw[m.ticker] = m.quality;
      else dropped.push({ ticker: m.ticker, note: m.quality === 0 ? "Passed none of the scored checks, so gets no weight" : "No quality grade to weight by" });
    }
  }
  if (method === "marketCap") {
    const { weights, capped } = capWeights(raw, cap);
    return { weights, capped, dropped };
  }
  return { weights: capWeights(raw, 1).weights, capped: [], dropped };
}

export interface Position {
  ticker: string;
  weight: number;
  /** CAD set aside for it: amount × weight */
  target: number;
  /** latest price in CAD */
  price: number | null;
  /** whole shares the target buys at that price */
  shares: number | null;
  /** CAD actually spent on those shares */
  cost: number | null;
}

/** Buys whole shares with each company's share of `amount`. What whole shares cannot use stays as cash. */
export function allocate(weights: Record<string, number>, amount: number, priceCad: Record<string, number | null>): { positions: Position[]; cash: number } {
  const positions: Position[] = Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .map(([ticker, weight]) => {
      const target = amount * weight;
      const price = priceCad[ticker] ?? null;
      const shares = isNum(price) && price > 0 ? Math.floor(target / price + 1e-9) : null;
      return { ticker, weight, target, price, shares, cost: shares != null && price != null ? shares * price : null };
    });
  // A position with no price is kept as cash: nothing could be bought.
  const spent = positions.reduce((s, p) => s + (p.cost ?? 0), 0);
  return { positions, cash: amount - spent };
}

// ---------------------------------------------------------------- back-test

export interface Backtest {
  /** month before the first return: the starting point, value 1 */
  start: string;
  /** months with a return, ascending */
  months: string[];
  returns: number[];
  /** growth of 1 at each month end, index 0 = start (so one longer than months) */
  levels: number[];
  /** share of the target weight that had a price, each month */
  coverage: number[];
}

/**
 * The index month by month, rebalanced to the target weights every month (dividends reinvested, no fees or taxes).
 * Each month's return is the weighted average of the members that have a return that month; the weights of members
 * not yet listed are shared among the others. The test starts at the first month where members with a return carry
 * at least `minCoverage` of the weight, and looks back at most `maxMonths`.
 */
export function backtest(
  returns: Record<string, Map<string, number>>,
  weights: Record<string, number>,
  { maxMonths = LOOKBACK_MONTHS, minCoverage = MIN_COVERAGE }: { maxMonths?: number; minCoverage?: number } = {},
): Backtest | null {
  const tickers = Object.keys(weights).filter((t) => weights[t] > 0 && returns[t]);
  const all = [...new Set(tickers.flatMap((t) => [...returns[t].keys()]))].sort();
  const window = all.slice(-maxMonths);
  const months: string[] = [];
  const rets: number[] = [];
  const coverage: number[] = [];
  for (const m of window) {
    let cov = 0;
    let sum = 0;
    for (const t of tickers) {
      const r = returns[t].get(m);
      if (isNum(r)) { cov += weights[t]; sum += weights[t] * r; }
    }
    if (!months.length && cov < minCoverage - 1e-9) continue; // not started yet
    if (cov <= 0) continue; // a month nobody traded (should not happen once started)
    months.push(m);
    rets.push(sum / cov);
    coverage.push(cov);
  }
  if (!months.length) return null;
  const levels = [1];
  for (const r of rets) levels.push(levels[levels.length - 1] * (1 + r));
  return { start: prevMonth(months[0]), months, returns: rets, levels, coverage };
}

// ---------------------------------------------------------------- statistics

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const sampleSd = (v: number[]) => {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
};

/** Largest fall from a peak to a later trough, as a negative decimal (−0.35 = fell 35%). 0 if it never fell. */
export function maxDrawdown(levels: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of levels) {
    peak = Math.max(peak, v);
    if (peak > 0) worst = Math.min(worst, v / peak - 1);
  }
  return worst;
}

export interface ReturnStats {
  months: number;
  /** growth a year, compounded: (end ÷ start)^(12 / months) − 1 */
  annualReturn: number;
  /** standard deviation of monthly returns × √12 */
  volatility: number;
  /** mean and sample standard deviation of monthly log returns: what the projection uses */
  muLog: number;
  sdLog: number;
  maxDrawdown: number;
  /** worst and best return over any 12 months in a row */
  worst12m: number | null;
  best12m: number | null;
  /** the median monthly return, for a plain-language check against the mean */
  medianMonth: number | null;
}

/** Summary of a run of monthly returns. Null with fewer than 12 months. */
export function returnStats(returns: number[]): ReturnStats | null {
  if (returns.length < 12 || returns.some((r) => !isNum(r) || r <= -1)) return null;
  const logs = returns.map((r) => Math.log1p(r));
  const levels = [1];
  for (const r of returns) levels.push(levels[levels.length - 1] * (1 + r));
  const rolling: number[] = [];
  for (let i = 12; i < levels.length; i++) rolling.push(levels[i] / levels[i - 12] - 1);
  return {
    months: returns.length,
    annualReturn: Math.pow(levels[levels.length - 1], 12 / returns.length) - 1,
    volatility: sampleSd(returns) * Math.sqrt(12),
    muLog: mean(logs),
    sdLog: sampleSd(logs),
    maxDrawdown: maxDrawdown(levels),
    worst12m: rolling.length ? Math.min(...rolling) : null,
    best12m: rolling.length ? Math.max(...rolling) : null,
    medianMonth: median(returns),
  };
}

// ---------------------------------------------------------------- projection

/** Standard normal cumulative distribution (Abramowitz & Stegun 7.1.26, error under 1.5e-7). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** Standard normal quantiles for the bands the projection reports. */
export const Z = { p10: -1.2815515655446004, p25: -0.6744897501960817, p50: 0, p75: 0.6744897501960817, p90: 1.2815515655446004 } as const;

export interface ProjectionPoint {
  years: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  /** chance of ending below the starting amount */
  lossChance: number;
}

/**
 * Where `start` could be after `years`, if monthly log returns keep the mean and spread they had in the back-test.
 * Log value after T months is normal with mean T·μ and variance σ²·T + σ²·T²/n: the first term is the month-to-month
 * ups and downs; the second is the uncertainty in μ itself, estimated from only n months (its standard error is σ/√n,
 * and it compounds over T months). So a short history gives honestly wide bands far out.
 */
export function projectAt(start: number, stats: Basis, years: number): ProjectionPoint {
  const T = years * 12;
  const m = stats.muLog * T;
  const s = Math.sqrt(stats.sdLog ** 2 * T + (stats.sdLog ** 2 * T * T) / stats.months);
  const at = (z: number) => start * Math.exp(m + z * s);
  return {
    years,
    p10: at(Z.p10),
    p25: at(Z.p25),
    p50: at(Z.p50),
    p75: at(Z.p75),
    p90: at(Z.p90),
    lossChance: s > 0 ? normalCdf(-m / s) : m < 0 ? 1 : 0,
  };
}

/** What a projection needs: the average and spread of monthly log returns, and how many months they were measured over. */
export type Basis = Pick<ReturnStats, "muLog" | "sdLog" | "months">;

/**
 * A cautious basis: the index's own ups and downs, at the benchmark's average pace. It does not assume the index keeps
 * beating (or trailing) the market; the uncertainty in that average comes from the benchmark's months.
 */
export function marketPace(index: ReturnStats | null, market: ReturnStats | null): Basis | null {
  if (!index || !market) return null;
  return { muLog: market.muLog, sdLog: index.sdLog, months: market.months };
}

/** Projection at each horizon. Null when the history is shorter than MIN_PROJECTION_MONTHS. */
export function project(start: number, stats: Basis | null, horizons: readonly number[] = HORIZONS): ProjectionPoint[] | null {
  if (!stats || stats.months < MIN_PROJECTION_MONTHS) return null;
  return horizons.map((y) => projectAt(start, stats, y));
}

// ---------------------------------------------------------------- the whole build

export interface BuildInput {
  payload: PricePayload;
  members: Member[];
  method: Weighting;
  amount?: number;
}

export interface BuiltIndex {
  method: Weighting;
  amount: number;
  positions: (Position & { annualReturn: number | null; since: string | null })[];
  cash: number;
  capped: string[];
  /** members left out, and why */
  dropped: { ticker: string; note: string }[];
  backtest: Backtest | null;
  stats: ReturnStats | null;
  projection: ProjectionPoint[] | null;
  /** the cautious alternative: the index's spread at the benchmark's average pace (see marketPace) */
  pace: { basis: Basis; projection: ProjectionPoint[] | null } | null;
  benchmark: {
    backtest: Backtest | null;
    stats: ReturnStats | null;
    projection: ProjectionPoint[] | null;
    /** the benchmark over exactly the index's back-test months: its statistics, and growth of 1 (same length as backtest.levels) */
    samePeriod: ReturnStats | null;
    sameLevels: number[] | null;
  } | null;
}

/** Members -> weights -> positions -> back-test -> projection, plus the same back-test and projection for the benchmark. */
export function buildIndex({ payload, members, method, amount = START_AMOUNT }: BuildInput): BuiltIndex {
  const wanted = new Set(members.map((m) => m.ticker));
  const dropped: { ticker: string; note: string }[] = payload.missing.filter((m) => wanted.has(m.ticker));
  const bySeries = new Map(payload.series.map((s) => [s.ticker, s]));
  const cad = new Map<string, CadSeries>();
  for (const m of members) {
    const s = bySeries.get(m.ticker);
    if (!s) {
      if (!dropped.some((d) => d.ticker === m.ticker)) dropped.push({ ticker: m.ticker, note: "No price history found" });
      continue;
    }
    const c = toCad(s, payload.fx);
    if ("note" in c) dropped.push(c);
    else if (c.levels.size < 2) dropped.push({ ticker: m.ticker, note: "Fewer than two months of prices" });
    else cad.set(m.ticker, c);
  }
  const priced = members
    .filter((m) => cad.has(m.ticker))
    .map((m) => ({ ...m, marketCap: cad.get(m.ticker)!.marketCap ?? m.marketCap }));
  const tw = targetWeights(priced, method);
  dropped.push(...tw.dropped);

  const returns: Record<string, Map<string, number>> = {};
  for (const [t, c] of cad) returns[t] = monthlyReturns(c.levels);
  const { positions, cash } = allocate(tw.weights, amount, Object.fromEntries([...cad].map(([t, c]) => [t, c.price])));
  const bt = backtest(returns, tw.weights);
  const stats = bt ? returnStats(bt.returns) : null;

  // Each member's own record over the same window, for the holdings table.
  const own = (t: string) => {
    const r = returns[t];
    if (!r) return { annualReturn: null, since: null };
    const ms = [...r.keys()].sort().slice(-LOOKBACK_MONTHS);
    const st = returnStats(ms.map((m) => r.get(m)!));
    return { annualReturn: st?.annualReturn ?? null, since: ms.length ? prevMonth(ms[0]) : null };
  };

  let benchmark: BuiltIndex["benchmark"] = null;
  if (payload.benchmark) {
    const c = toCad(payload.benchmark, payload.fx);
    if (!("note" in c)) {
      const r = monthlyReturns(c.levels);
      const bbt = backtest({ b: r }, { b: 1 });
      const bstats = bbt ? returnStats(bbt.returns) : null;
      // The benchmark over exactly the index's months, so the two can be compared fairly.
      const same = bt ? bt.months.map((m) => r.get(m)) : [];
      const complete = bt != null && same.every(isNum);
      const samePeriod = complete ? returnStats(same as number[]) : null;
      let sameLevels: number[] | null = null;
      if (complete) {
        sameLevels = [1];
        for (const x of same as number[]) sameLevels.push(sameLevels[sameLevels.length - 1] * (1 + x));
      }
      benchmark = { backtest: bbt, stats: bstats, projection: project(amount, bstats), samePeriod, sameLevels };
    }
  }

  return {
    method,
    amount,
    positions: positions.map((p) => ({ ...p, ...own(p.ticker) })),
    cash,
    capped: tw.capped,
    dropped,
    backtest: bt,
    stats,
    projection: project(amount, stats),
    pace: (() => {
      const basis = stats && stats.months >= MIN_PROJECTION_MONTHS ? marketPace(stats, benchmark?.stats ?? null) : null;
      return basis ? { basis, projection: project(amount, basis) } : null;
    })(),
    benchmark,
  };
}
