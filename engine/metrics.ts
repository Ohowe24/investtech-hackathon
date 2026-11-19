// Pure finance formulas. No data loading here, just math with careful edge cases.
// Every function returns null when the answer is undefined. Never fake a number.

export type N = number | null | undefined;

const isNum = (v: N): v is number => typeof v === "number" && Number.isFinite(v);

/** a / b, or null if either is missing or b is 0. */
export function safeDiv(a: N, b: N): number | null {
  if (!isNum(a) || !isNum(b) || b === 0) return null;
  return a / b;
}

/** Sum of values; null if any value is missing (strict, so gaps are visible). */
export function sumStrict(values: N[]): number | null {
  if (values.length === 0 || values.some((v) => !isNum(v))) return null;
  return (values as number[]).reduce((s, v) => s + v, 0);
}

/**
 * Net acquisition spending as a share of operating cash flow, both summed over the period.
 * Null if either sum is missing or operating cash flow is not positive (the ratio means nothing then).
 * A net seller (divestiture proceeds exceed acquisition spending) spent no net cash buying
 * businesses, so the answer is 0, not a negative ratio whose size only reflects how small OCF was.
 */
export function acquisitionIntensity(acqSum: N, ocfSum: N): number | null {
  if (!isNum(acqSum) || !isNum(ocfSum) || ocfSum <= 0) return null;
  if (acqSum <= 0) return 0;
  return acqSum / ocfSum;
}

/** Compound annual growth rate. Null if either end is <= 0 (undefined across sign changes). */
export function cagr(start: N, end: N, years: number): number | null {
  if (!isNum(start) || !isNum(end) || years <= 0) return null;
  if (start <= 0 || end <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

/** end / start - 1. Null if start <= 0. */
export function pctChange(start: N, end: N): number | null {
  if (!isNum(start) || !isNum(end) || start <= 0) return null;
  return end / start - 1;
}

/** Operating cash flow minus capital expenditure (capex given as a positive amount spent). */
export function freeCashFlow(operatingCashFlow: N, capex: N): number | null {
  if (!isNum(operatingCashFlow) || !isNum(capex)) return null;
  return operatingCashFlow - capex;
}

/** value / shares, or null if shares <= 0. */
export function perShare(value: N, shares: N): number | null {
  if (!isNum(value) || !isNum(shares) || shares <= 0) return null;
  return value / shares;
}

/** (debt - cash) / FCF. Null if FCF <= 0 (the ratio is meaningless then). */
export function netDebtToFcf(debt: N, cash: N, fcf: N): number | null {
  if (!isNum(debt) || !isNum(cash) || !isNum(fcf) || fcf <= 0) return null;
  return (debt - cash) / fcf;
}

export interface Zones {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
}

/** Which quadrant of the map a company falls in. */
export function quadrant(x: N, y: N, xThreshold: number, yThreshold: number, zones: Zones): string {
  if (!isNum(x) || !isNum(y)) return "Not enough data";
  const right = x >= xThreshold;
  const top = y >= yThreshold;
  if (top) return right ? zones.topRight : zones.topLeft;
  return right ? zones.bottomRight : zones.bottomLeft;
}

/**
 * Cash return on invested capital: free cash flow / average (debt + equity).
 * Goodwill is counted because the debt and equity that paid for acquisitions stay in the denominator.
 * Null if anything is missing or average capital <= 0.
 */
export function cashReturnOnCapital(fcf: N, debtStart: N, equityStart: N, debtEnd: N, equityEnd: N): number | null {
  if (!isNum(fcf) || !isNum(debtStart) || !isNum(equityStart) || !isNum(debtEnd) || !isNum(equityEnd)) return null;
  const avg = (debtStart + equityStart + debtEnd + equityEnd) / 2;
  if (avg <= 0) return null;
  return fcf / avg;
}

/** Mean of values; null if any value is missing (strict, so gaps are visible). */
export function meanStrict(values: N[]): number | null {
  const s = sumStrict(values);
  return s == null ? null : s / values.length;
}

/** (debt - cash) / EBITDA. Null if EBITDA <= 0. Negative means net cash. */
export function netDebtToEbitda(debt: N, cash: N, ebitda: N): number | null {
  if (!isNum(debt) || !isNum(cash) || !isNum(ebitda) || ebitda <= 0) return null;
  return (debt - cash) / ebitda;
}

/** debt - cash. Null if either is missing. Negative means net cash. */
export function netDebt(debt: N, cash: N): number | null {
  if (!isNum(debt) || !isNum(cash)) return null;
  return debt - cash;
}

/** part / base, only when base is positive (margins, shares of cash flow). Null otherwise. */
export function ratioOfPositive(part: N, base: N): number | null {
  if (!isNum(part) || !isNum(base) || base <= 0) return null;
  return part / base;
}

/**
 * Sum of distributions per unit recorded in the year that ends on `periodEnd` (after the same date a year earlier,
 * up to and including it). Null if none fall in that window. Dates are ISO strings.
 */
export function distributionsInYear(distributions: { date: string; amount: number }[], periodEnd: string): number | null {
  const end = periodEnd.slice(0, 10);
  const start = `${Number(end.slice(0, 4)) - 1}${end.slice(4)}`;
  const inYear = distributions.filter((d) => d.date > start && d.date <= end);
  return inYear.length ? sumStrict(inYear.map((d) => d.amount)) : null;
}

/** Distributions per unit ÷ operating cash flow per unit. Null if cash flow per unit is not positive. */
export function cashPayoutRatio(distributionsPerUnit: N, operatingCashFlow: N, units: N): number | null {
  return ratioOfPositive(distributionsPerUnit, perShare(operatingCashFlow, units));
}

/** One threshold test. Null value -> null (unknown), never a fail. */
export function passes(value: N, op: ">=" | "<=", threshold: number): boolean | null {
  if (!isNum(value)) return null;
  return op === ">=" ? value >= threshold : value <= threshold;
}

export interface Tally {
  passed: number;
  available: number;
  total: number;
  recommendation: "pass" | "mixed" | "fail";
}

/**
 * Turns check results into a recommendation.
 * - Any gate that fails -> "fail".
 * - "pass" needs every gate to pass (unknown gates don't count as passed), at least `minAvailable`
 *   scored checks with data, and at least `passShare` of those passed.
 * - "fail" also if fewer than `mixedShare` of scored checks with data pass.
 * - Everything else is "mixed".
 */
export function tally(
  gates: (boolean | null)[],
  scored: (boolean | null)[],
  rules: { passShare: number; mixedShare: number; minAvailable: number },
): Tally {
  const known = scored.filter((s) => s !== null);
  const passed = known.filter(Boolean).length;
  const available = known.length;
  const base = { passed, available, total: scored.length };
  if (gates.some((g) => g === false)) return { ...base, recommendation: "fail" };
  const share = available > 0 ? passed / available : 0;
  if (available > 0 && share < rules.mixedShare) return { ...base, recommendation: "fail" };
  const gatesOk = gates.every((g) => g === true);
  if (gatesOk && available >= rules.minAvailable && share >= rules.passShare) return { ...base, recommendation: "pass" };
  return { ...base, recommendation: "mixed" };
}

/**
 * Equal-weight split of a sleeve across groups of related companies.
 * Each group gets min(cap, sleeve / groups); members of a group share it equally.
 * Returns ticker -> weight in percent.
 */
export function equalWeights(groups: string[][], sleevePct: number, capPct: number): Record<string, number> {
  const out: Record<string, number> = {};
  const live = groups.filter((g) => g.length > 0);
  if (live.length === 0 || sleevePct <= 0) return out;
  const perGroup = Math.min(capPct, sleevePct / live.length);
  // Rounded down to 0.01%, so the additions never add up to more than the sleeve (9 × 1.67% would be 15.03%).
  for (const g of live) for (const t of g) out[t] = Math.floor((perGroup / g.length) * 100 + 1e-9) / 100;
  return out;
}

/** Apply declared screening rules without changing metrics or saved investment decisions. */
export function evaluateScreen(
  metrics: Record<string, { value: number | null }>,
  checks: { id: string; metricId: string; kind: "gate" | "score"; op: ">=" | "<="; threshold: number }[],
  rules: { passShare: number; mixedShare: number; minAvailable: number },
) {
  const results = checks.map((check) => ({ ...check, pass: passes(metrics[check.metricId]?.value, check.op, check.threshold) }));
  return {
    checks: results,
    ...tally(results.filter((c) => c.kind === "gate").map((c) => c.pass), results.filter((c) => c.kind === "score").map((c) => c.pass), rules),
  };
}

/** Median of the values present (nulls skipped). Null if none. Used for "your index median" comparisons. */
export function median(values: N[]): number | null {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// ---------------------------------------------------------------- quality score (0-100)

/**
 * Grade 0-1 on a straight line between two declared points. `zero` earns 0, `full` earns 1, values beyond are clamped.
 * Works both ways: full > zero when higher is better, full < zero when lower is better. Null if the value is missing.
 */
export function rampGrade(value: N, zero: number, full: number): number | null {
  if (!isNum(value) || zero === full) return null;
  const g = (value - zero) / (full - zero);
  return Math.min(1, Math.max(0, g));
}

/**
 * Grade 0-1 by position among peers (the value itself is one of `peers`): 0 = worst, 1 = best, ties share the
 * average position, the median company gets 0.5. Null if the value is missing or fewer than 3 peers have the figure.
 */
export function peerGrade(value: N, peers: N[], higherIsBetter: boolean): number | null {
  const v = peers.filter(isNum);
  if (!isNum(value) || v.length < 3) return null;
  const below = v.filter((p) => p < value).length;
  const equal = v.filter((p) => p === value).length; // includes the company itself
  const pos = (below + (Math.max(equal, 1) - 1) / 2) / (v.length - 1);
  return higherIsBetter ? pos : 1 - pos;
}

/**
 * Weighted score out of 100 from graded parts. Parts without data drop out and the remaining weights are rescaled,
 * but only if the parts with data carry at least `minCoverage` of the total weight; otherwise the score is null.
 * Coverage is the share of total weight that had data (0-1). The score is rounded to a whole number.
 */
export function weightedScore(parts: { weight: number; grade: number | null }[], minCoverage: number): { value: number | null; coverage: number } {
  const total = parts.reduce((s, p) => s + Math.max(0, p.weight), 0);
  if (total <= 0) return { value: null, coverage: 0 };
  const known = parts.filter((p) => p.grade != null && p.weight > 0);
  const knownWeight = known.reduce((s, p) => s + p.weight, 0);
  const coverage = knownWeight / total;
  if (knownWeight <= 0 || coverage < minCoverage) return { value: null, coverage };
  const value = known.reduce((s, p) => s + p.weight * (p.grade as number), 0) / knownWeight;
  return { value: Math.round(value * 100), coverage };
}

// ---------------------------------------------------------------- outlook engine (context, never a scored check)
// Plain-language rules: engine/methodology.md, "Outlook engine". All growth rates are decimals per year.

/**
 * Recent momentum of a monthly series: the average of the latest 12 months against the average of the 12 months
 * ending `years` years earlier, as a yearly rate. Needs at least 12 × (years + 1) points, oldest first; null if any
 * month in either window is missing or not positive. 12-month averages smooth out single-month noise.
 */
export function trailingMomentum(monthly: N[], years: number): number | null {
  const need = 12 * (years + 1);
  if (years <= 0 || monthly.length < need) return null;
  const recent = monthly.slice(-12);
  const earlier = monthly.slice(-need, -need + 12);
  const a = meanStrict(earlier);
  const b = meanStrict(recent);
  if (a == null || b == null) return null;
  return cagr(a, b, years);
}

/**
 * Turn a growth rate that includes inflation into one that does not: (1 + nominal) / (1 + inflation) − 1.
 * Used only for analyst revenue estimates (in dollars of the day), so they line up with the official
 * figures, which are already after inflation (chained dollars).
 */
export function realGrowth(nominal: N, inflation: number): number | null {
  if (!isNum(nominal) || !Number.isFinite(inflation) || inflation <= -1) return null;
  return (1 + nominal) / (1 + inflation) - 1;
}

/** An industry's outlook: the median of the published signals that exist. Null if fewer than `minSignals` exist. */
export function industryOutlook(signals: N[], minSignals: number): number | null {
  if (signals.filter(isNum).length < Math.max(1, minSignals)) return null;
  return median(signals);
}

export type Trend = "growing" | "stable" | "declining";

/**
 * Growing: at least as fast as the whole economy measured the same way. Stable: growing, but slower than the economy.
 * Declining: shrinking (below 0). Null if either figure is missing.
 */
export function trendOf(outlook: N, economy: N): Trend | null {
  if (!isNum(outlook) || !isNum(economy)) return null;
  if (outlook < 0) return "declining";
  return outlook >= economy ? "growing" : "stable";
}

/** Each value's share of the total. Null for all if any value is missing or negative, or the total is not positive. */
export function shares(values: N[]): (number | null)[] {
  if (values.length === 0 || values.some((v) => !isNum(v) || (v as number) < 0)) return values.map(() => null);
  const total = (values as number[]).reduce((s, v) => s + v, 0);
  if (total <= 0) return values.map(() => null);
  return (values as number[]).map((v) => v / total);
}

/**
 * Weighted average outlook. Rows without an outlook or a weight drop out and the remaining weights are rescaled,
 * but only if the rows with data carry at least `minCoverage` of the total weight; otherwise the value is null.
 * Coverage is the share of total weight that had an outlook (0-1). Used for the company tailwind (weights = revenue
 * shares) and for the outlook of recent deals (equal weights).
 */
export function weightedOutlook(rows: { weight: N; outlook: N }[], minCoverage: number): { value: number | null; coverage: number } {
  const total = rows.reduce((s, r) => s + (isNum(r.weight) && r.weight > 0 ? r.weight : 0), 0);
  if (total <= 0) return { value: null, coverage: 0 };
  const known = rows.filter((r) => isNum(r.weight) && r.weight > 0 && isNum(r.outlook)) as { weight: number; outlook: number }[];
  const knownWeight = known.reduce((s, r) => s + r.weight, 0);
  const coverage = knownWeight / total;
  if (knownWeight <= 0 || coverage < minCoverage) return { value: null, coverage };
  return { value: known.reduce((s, r) => s + r.weight * r.outlook, 0) / knownWeight, coverage };
}

export type Direction = "toward" | "steady" | "away";

/**
 * Are recent deals in stronger or weaker industries than the business already owned?
 * toward: deals' outlook is more than `band` above the base; away: more than `band` below; else steady.
 */
export function directionOf(dealOutlook: N, baseOutlook: N, band: number): Direction | null {
  if (!isNum(dealOutlook) || !isNum(baseOutlook) || !(band >= 0)) return null;
  const gap = dealOutlook - baseOutlook;
  if (gap > band) return "toward";
  if (gap < -band) return "away";
  return "steady";
}

/**
 * Client-market weights of one deal. A deal counts once: if its text names k client markets, each gets 1/k.
 * A market named but not placeable ("?") keeps its share with no market, so it lowers coverage instead of
 * vanishing. A deal that names no market is one row with no market.
 */
export function marketWeights(markets: string[]): { market: string | null; weight: number }[] {
  const named = markets.map((m) => m.trim()).filter(Boolean);
  if (named.length === 0) return [{ market: null, weight: 1 }];
  return named.map((m) => ({ market: m === "?" ? null : m, weight: 1 / named.length }));
}
