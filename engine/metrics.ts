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
