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
  for (const g of live) for (const t of g) out[t] = Math.round((perGroup / g.length) * 100) / 100;
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
