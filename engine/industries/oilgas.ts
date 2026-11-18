// OIL & GAS EXPLORATION & PRODUCTION: the "choose your own" profile (custom.ts), with measures that fit a commodity producer.
//
// Why a variant: the generic profile compares single years and three-year growth. For producers, revenue and cash flow
// follow the oil and gas price, which peaked in FY2022 for most of these companies (see methodology.md, "Quality score").
// Single-year margins and growth from FY2022 mostly measure the price, not the company. So the profit, return and
// leverage measures here are taken over five years (or a three-year EBITDA average), which spans the peak and the years
// after it, and the growth measures keep only a small weight.
//
// Thresholds are still peer medians, set in custom.ts. Nothing here types a financial number.

import type { MetricDef, MetricValue } from "../../contract/types";
import { meanStrict, netDebtToEbitda, ratioOfPositive, sumStrict, freeCashFlow } from "../metrics";
import { cashReturnFor } from "../statements";
import type { FinRow, ScoreComponent } from "./types";

export const OIL_GAS_EP = "Oil & Gas Exploration & Production";

/** Years in the through-cycle window. */
const CYCLE_YEARS = 5;
/** Years of EBITDA averaged for leverage. */
const EBITDA_YEARS = 3;

/** Measures added for producers. They replace the generic single-year FCF margin, return on capital and leverage. */
export const oilGasMetricDefs: MetricDef[] = [
  {
    id: "fcfMarginCycle",
    short: "5-yr FCF margin",
    label: "Free cash flow ÷ revenue, last five fiscal years combined",
    unit: "pct",
    higherIsBetter: true,
    description: "Share of each sales dollar left after capital spending, across high and low prices.",
    formula: "Sum of (operating cash flow − capital spending) over the last five fiscal years ÷ sum of revenue over the same years.",
    why: "A low-cost producer keeps a margin when prices fall; a high-cost one only shows one at the peak. Five years spans the FY2022 peak and the years after it.",
  },
  {
    id: "cashReturnCycle",
    short: "4-yr return",
    label: "Free cash flow ÷ average debt and equity, mean of the last four fiscal years",
    unit: "pct",
    higherIsBetter: true,
    description: "Cash the business makes on the money invested in it, averaged over the cycle.",
    formula: "For each of the last four fiscal years: free cash flow ÷ average of (debt + equity) at the start and end of the year. The four results are averaged.",
    why: "Producers must keep spending to replace what they pump. Return on capital shows whether that spending earns its keep, and four years stop one price spike from deciding it.",
  },
  {
    id: "netDebtToAvgEbitda",
    short: "Net debt ÷ EBITDA",
    label: "Net debt ÷ average EBITDA of the last three fiscal years",
    unit: "multiple",
    higherIsBetter: false,
    description: "Years of average operating profit needed to repay debt net of cash.",
    formula: "(Total debt − cash), latest fiscal year ÷ average EBITDA of the last three fiscal years. Null if that average is not positive.",
    why: "Debt is what turns a price fall into a crisis for a producer. Averaging EBITDA stops a peak-price year from making the debt look small.",
  },
];

/** Generic metric ids the producer variant keeps, in display order. */
export const oilGasKeeps = ["cashFromOperations", "revenuePerShareGrowth", "cashFlowPerShareGrowth", "shareCountGrowth"] as const;

/** The producer measures for one company. Rows are oldest first. */
export function oilGasMetrics(rows: FinRow[]): Record<string, MetricValue> {
  const none = (note: string): MetricValue => ({ value: null, sourceIds: [], note });
  const last = rows[rows.length - 1];
  if (!last) return Object.fromEntries(oilGasMetricDefs.map((d) => [d.id, none("No annual statements for this company")]));

  // The last N fiscal years, only if they run back without a gap.
  const window = (n: number): FinRow[] | null => {
    const w = rows.slice(-n);
    if (w.length < n || w.some((r, i) => r.year !== last.year - (n - 1 - i))) return null;
    if (w.some((r) => r.currency !== last.currency)) return null;
    return w;
  };
  const span = (w: FinRow[]) => `FY${w[0].year}–FY${w[w.length - 1].year}`;
  const ids = (w: FinRow[]) => w.map((r) => r.sourceId).filter(Boolean);

  const cycle = window(CYCLE_YEARS);
  // A five-year margin needs sales in each of the five years; otherwise it is really the margin of the years with sales.
  const salesEveryYear = cycle != null && cycle.every((r) => r.revenue != null && r.revenue > 0);
  const fcfMarginCycle = cycle && salesEveryYear
    ? ratioOfPositive(sumStrict(cycle.map((r) => freeCashFlow(r.ocf, r.capex))), sumStrict(cycle.map((r) => r.revenue)))
    : null;

  // Four yearly returns need five balance sheets: the four years plus the one before.
  const returns = cycle ? cycle.slice(1).map((r) => cashReturnFor(rows, rows.indexOf(r))) : [];
  const cashReturnCycle = cycle ? meanStrict(returns) : null;

  const lev = window(EBITDA_YEARS);
  const avgEbitda = lev ? meanStrict(lev.map((r) => r.ebitda)) : null;
  const leverage = lev ? netDebtToEbitda(last.debt, last.cash, avgEbitda) : null;

  return {
    fcfMarginCycle: fcfMarginCycle == null
      ? none(!cycle ? `Needs ${CYCLE_YEARS} consecutive fiscal years in one currency`
          : !salesEveryYear ? `Revenue is zero or missing in at least one year of ${span(cycle)}, so a five-year margin would rest on fewer years`
          : `Missing cash flow or capital spending in ${span(cycle)}`)
      : { value: fcfMarginCycle, period: span(cycle!), sourceIds: ids(cycle!) },
    cashReturnCycle: cashReturnCycle == null
      ? none(cycle ? `Needs free cash flow, debt and equity in every year of ${span(cycle)}` : `Needs ${CYCLE_YEARS} consecutive fiscal years in one currency`)
      : { value: cashReturnCycle, period: `FY${cycle![1].year}–FY${last.year}`, sourceIds: ids(cycle!) },
    netDebtToAvgEbitda: leverage == null
      ? none(lev ? (avgEbitda != null && avgEbitda <= 0 ? "Average EBITDA not positive, so the ratio is meaningless" : `Missing debt, cash or EBITDA in ${span(lev)}`) : `Needs ${EBITDA_YEARS} consecutive fiscal years in one currency`)
      : { value: leverage, period: `FY${last.year} debt, ${span(lev!)} EBITDA`, sourceIds: ids(lev!) },
  };
}

/**
 * Quality score weights for producers, out of 100. Points follow each company's position among the companies tested
 * (the checks compare with the peer median too). Reasoning in methodology.md, "Quality score".
 */
export const oilGasScore: { components: ScoreComponent[]; minCoverage: number } = {
  minCoverage: 0.6,
  components: [
    // Return on capital and FCF margin rank companies almost the same way (rank correlation 0.89 on the 31 producers with both),
    // so together they get 45, not 50, and return on capital, which also counts the capital tied up, takes the larger share.
    // Leverage moves independently of both (about 0) and is what decides survival in a price fall: 30.
    { metricId: "cashReturnCycle", weight: 30, scale: { kind: "peers" } },
    { metricId: "netDebtToAvgEbitda", weight: 30, scale: { kind: "peers" } },
    { metricId: "fcfMarginCycle", weight: 15, scale: { kind: "peers" } },
    { metricId: "shareCountGrowth", weight: 15, scale: { kind: "peers" } },
    { metricId: "cashFlowPerShareGrowth", weight: 5, scale: { kind: "peers" } },
    { metricId: "revenuePerShareGrowth", weight: 5, scale: { kind: "peers" } },
  ],
};
