// SERIAL ACQUIRERS profile (Max's lane)
// Every threshold here is a declared rule. The reason for each one is in methodology.md.

import type { MetricDef, MetricValue } from "../../contract/types";
import { num } from "../csv";
import { acquisitionIntensity, cagr, freeCashFlow, meanStrict, netDebtToEbitda, pctChange, perShare, sumStrict } from "../metrics";
import { cashReturnFor } from "../statements";
import type { CheckDef, FinRow, IndustryProfile, MetricContext } from "./types";

const settings = {
  id: "acquirers",
  /** must match an index name in data/indexes.json */
  indexName: "Serial acquirers & consolidators",
  currency: "USD",
  question: "Which Canadian companies should be added to the serial acquirers index?",
  /** share of the index we fill with additions. Organizers said the ~18% cash could drop toward 15%. */
  sleevePct: 15,
  /** no single addition above the index's own top-tier weight (five holdings sit at about 8.2%) */
  maxWeightPct: 8.2,
  /** related companies share one slot. Constellation controls Topicus, so both together count once. */
  relatedGroups: [["CSU", "TOI"]] as string[][],
  /** how check results become a recommendation (see tally() in metrics.ts) */
  scoring: { passShare: 0.75, mixedShare: 0.5, minAvailable: 3 },

  /** Research figures in metricDefs[].facts are copied from reports/Serial acquirer evaluation variables.md, which links each source. */

  /** The declared test. "gate" checks must pass; "score" checks count toward the score. */
  checks: [
    { id: "themeFit", kind: "gate", label: "Acquisitions ≥ 20% of cash flow", metricId: "acqIntensity", op: ">=", threshold: 0.2,
      rule: "Cash spent on acquisitions is at least 20% of operating cash flow" },
    { id: "debtLimit", kind: "gate", label: "Net debt ≤ 3× EBITDA", metricId: "netDebtToEbitda", op: "<=", threshold: 3,
      rule: "Net debt is at most 3 times average EBITDA of the last 3 years" },
    { id: "ownersGain", kind: "score", label: "Free cash flow per share ≥ 7%/yr", metricId: "fcfPerShareCagr", op: ">=", threshold: 0.07,
      rule: "Free cash flow per share grew at least 7% a year" },
    { id: "cashReturn", kind: "score", label: "Return on capital ≥ 8%", metricId: "cashReturn", op: ">=", threshold: 0.08,
      rule: "Free cash flow is at least 8% of the debt and equity invested" },
    { id: "noDilution", kind: "score", label: "Share count up ≤ 5%", metricId: "shareCountChange", op: "<=", threshold: 0.05,
      rule: "Diluted share count rose no more than 5% over the period" },
    { id: "selfFunded", kind: "score", label: "Acquisitions ≤ 100% of cash flow", metricId: "acqIntensity", op: "<=", threshold: 1,
      rule: "Cash spent on acquisitions did not exceed operating cash flow" },
  ] satisfies CheckDef[],

  metricDefs: [
    {
      id: "acqIntensity",
      short: "Acquisition spend",
      label: "Acquisitions ÷ operating cash flow",
      unit: "pct",
      description: "Share of operating cash spent buying companies.",
      formula: "Acquisitions (net of disposals) ÷ operating cash flow, all years summed. Net seller = 0%.",
      why: "Below 20%, acquisitions are not what drives the company, so it does not fit this index. Above 100%, outside money paid for the deals.",
      facts: [
        "Steady acquirers win: programmatic acquirers earned 2.1% a year more than the market; other approaches earned zero or less (McKinsey).",
        "Frequent acquirers returned 10.1–11.0% a year, against 5.1% for 'selective large bets', the worst group (Bain).",
        "Big one-off deals are the danger: 2.1% of 1998–2001 deals lost $397bn while all the others gained $157bn (NBER w10200).",
      ],
    },
    {
      id: "fcfPerShareCagr",
      short: "FCF per share",
      label: "Free cash flow per share, growth per year",
      unit: "pct",
      higherIsBetter: true,
      description: "Growth in cash earned per share.",
      formula: "(Operating cash flow − capital spending) ÷ diluted shares. Yearly growth rate, first year to last.",
      why: "It rises only if deals add more cash than they cost in new shares and interest. 7% a year is a plain hurdle for a stock investor.",
      facts: [
        "Constellation's founder Mark Leonard, April 2018 letter: asked for one measure of value growth, he chose the increase in free cash flow per share.",
        "Reported profit misleads: in FY2025 Constellation's free cash flow rose 14% while net income fell about 30%.",
        "Topicus, same year: free cash flow up 23%, net income down 53%.",
      ],
    },
    {
      id: "revenueCagr",
      short: "Revenue growth",
      label: "Revenue growth per year",
      unit: "pct",
      higherIsBetter: true,
      description: "Growth in sales.",
      formula: "Yearly growth rate of revenue, first year to last.",
      why: "Size alone. Getting bigger is not scored, because growth by itself does not reward owners.",
      facts: [
        "Fast asset growth predicts lower stock returns for up to five years (Cooper, Gulen & Schill).",
        "A screen of 187 listed serial acquirers found revenue growth and deal count do not separate winners (Aktagon).",
      ],
    },
    {
      id: "shareCountChange",
      short: "Share count",
      label: "Share count change",
      unit: "pct",
      higherIsBetter: false,
      description: "Change in the number of shares.",
      formula: "Last year's diluted shares ÷ first year's − 1. Positive = new shares issued.",
      why: "How deals are paid for is the most replicated finding in merger research. Above 5%, growth is being bought with the owners' stake.",
      facts: [
        "Acquirers that paid in stock earned 25.0% less than the market over the next five years (Loughran & Vijh).",
        "Among companies making five or more deals, returns were negative when public targets were paid for in stock (Fuller, Netter & Stegemoller).",
      ],
    },
    {
      id: "cashReturn",
      short: "Return on capital",
      label: "Return on capital (free cash flow)",
      unit: "pct",
      higherIsBetter: true,
      description: "Cash earned on all money invested.",
      formula: "Latest free cash flow ÷ average (debt + equity) over that year.",
      why: "The money that paid for acquisitions, goodwill included, stays in the count, so overpaying shows up. 8% is a basic cost of capital.",
      facts: [
        "Of 187 listed serial acquirers, only 59 earn more than 12% on capital once goodwill is included (Aktagon).",
        "Where goodwill is over 40% of assets, only 24% clear that bar (Aktagon).",
        "Skill persists: which company is buying explains about as much of acquirer returns as all deal and company traits combined (Golubov, Yawson & Zhang).",
      ],
    },
    {
      id: "netDebtToEbitda",
      short: "Net debt",
      label: "Net debt ÷ EBITDA",
      unit: "multiple",
      higherIsBetter: false,
      description: "Years of profit needed to repay debt.",
      formula: "(Debt − cash) ÷ 3-year average EBITDA (profit before interest, tax, depreciation, amortization). Negative = net cash.",
      why: "Debt-funded buying is what sinks acquirers in a downturn. It is a limit, not a score, because no large study settles how much debt is too much.",
      facts: [
        "3× is the cap Lifco, a model serial acquirer, sets for itself. WSP targets 1.0–2.0×.",
        "One date misleads: WSP showed 0.9× in December 2025 and 2.3× by June 2026. Hence the 3-year average.",
      ],
    },
    {
      id: "organicGrowth",
      short: "Organic growth",
      label: "Organic growth (company-reported)",
      unit: "pct",
      higherIsBetter: true,
      description: "Growth without acquisitions.",
      formula: "As reported by the company, latest year.",
      why: "Shows whether acquired businesses keep growing on their own after the deal. Not scored: too few companies report it.",
      facts: [
        "Leonard's favourite metric from 2007 was return on capital plus organic growth: 43% in 2011, 33% in 2017.",
        "Halma, a UK serial acquirer, targets more than 5% organic growth.",
        "A company that stops disclosing it is a listed red flag (REQ Capital).",
      ],
    },
  ] satisfies MetricDef[],

  map: {
    x: "acqIntensity",
    y: "fcfPerShareCagr",
    xThreshold: 0.2, // same line as the "Really an acquirer" gate
    yThreshold: 0.07, // same line as the "Owners gained" check
    zones: {
      topRight: "Acquirer · strong per-share growth",
      bottomRight: "Acquirer · weak per-share growth",
      topLeft: "Light acquirer · strong per-share growth",
      bottomLeft: "Light acquirer · weak per-share growth",
    },
  },
};

function computeMetrics(rows: FinRow[], ctx: MetricContext): { metrics: Record<string, MetricValue>; warnings: string[] } {
  const warnings: string[] = [];
  if (rows.length < 2) {
    warnings.push(`${ctx.ticker}: needs at least 2 fiscal years in financials.csv (has ${rows.length})`);
  }
  const first = rows[0];
  const last = rows[rows.length - 1];
  const years = first && last ? last.year - first.year : 0;
  const period = first && last ? `FY${first.year}–FY${last.year}` : undefined;
  const allSources = [...new Set(rows.map((r) => r.sourceId).filter(Boolean))];
  const endSources = [...new Set([first?.sourceId, last?.sourceId].filter(Boolean) as string[])];

  const mv = (value: number | null, ids: string[], note?: string, p = period): MetricValue => ({
    value,
    period: p,
    sourceIds: ids,
    ...(value == null ? { note: note ?? "Missing or not computable from the data provided" } : note ? { note } : {}),
  });

  const fcfFirst = first ? freeCashFlow(first.ocf, first.capex) : null;
  const fcfLast = last ? freeCashFlow(last.ocf, last.capex) : null;
  const fcfpsFirst = first ? perShare(fcfFirst, first.shares) : null;
  const fcfpsLast = last ? perShare(fcfLast, last.shares) : null;

  const acqSum = sumStrict(rows.map((r) => r.acquisitions));
  const ocfSum = sumStrict(rows.map((r) => r.ocf));

  const metrics: Record<string, MetricValue> = {
    acqIntensity: mv(
      acquisitionIntensity(acqSum, ocfSum),
      allSources,
      acqSum == null
        ? "Acquisition spending missing for at least one year"
        : ocfSum == null || ocfSum <= 0
          ? "Operating cash flow missing or not positive"
          : acqSum <= 0
            ? "Net seller over the period: divestiture proceeds exceeded acquisition spending, so net acquisition spending is zero"
            : undefined,
    ),
    fcfPerShareCagr: mv(
      cagr(fcfpsFirst, fcfpsLast, years),
      endSources,
      fcfpsFirst != null && fcfpsFirst <= 0 ? "Starting FCF per share was zero or negative, so growth is undefined" : undefined,
    ),
    revenueCagr: mv(cagr(first?.revenue, last?.revenue, years), endSources),
    shareCountChange: mv(pctChange(first?.shares, last?.shares), endSources),
    cashReturn: mv(
      cashReturnFor(rows, rows.length - 1),
      [...new Set([rows[rows.length - 2]?.sourceId, last?.sourceId].filter(Boolean) as string[])],
      rows.length < 2 ? "Needs two consecutive years" : undefined,
      last ? `FY${last.year}` : undefined,
    ),
    netDebtToEbitda: (() => {
      // Latest net debt against average EBITDA of the last three years, so one good year
      // at the top of a cycle cannot make the debt look small.
      const lastThree = rows.slice(-3);
      const avgEbitda = lastThree.length === 3 ? meanStrict(lastThree.map((r) => r.ebitda)) : null;
      return mv(
        last ? netDebtToEbitda(last.debt, last.cash, avgEbitda) : null,
        [...new Set(lastThree.map((r) => r.sourceId).filter(Boolean))],
        lastThree.length < 3
          ? "Needs three years of EBITDA"
          : avgEbitda != null && avgEbitda <= 0
            ? "Average EBITDA not positive, so the ratio is meaningless"
            : undefined,
        last ? `FY${last.year} debt, FY${lastThree[0].year}–FY${last.year} EBITDA` : undefined,
      );
    })(),
    organicGrowth: (() => {
      const o = ctx.lookup("organic.csv");
      const v = o ? num(o.organic_growth_pct) : null;
      return mv(v, o?.source_id ? [o.source_id] : [], v == null ? "Not reported in the data provided" : undefined, o?.period || (last ? `FY${last.year}` : undefined));
    })(),
  };
  return { metrics, warnings };
}

export const acquirers: IndustryProfile = {
  ...settings,
  rankTiebreak: "fcfPerShareCagr",
  ruleControls: [
    { id: "debtLimit", label: "Maximum net debt / EBITDA", min: 1, max: 5, step: 0.1, unit: "multiple", why: "How much leverage will you tolerate while a company keeps acquiring?" },
    { id: "ownersGain", label: "Minimum FCF per share growth", min: 0, max: 0.15, step: 0.01, unit: "pct", why: "How much annual cash growth should reach each share?" },
    { id: "cashReturn", label: "Minimum cash return on capital", min: 0, max: 0.2, step: 0.01, unit: "pct", why: "How much cash should the company earn on its invested debt and equity?" },
  ],
  extraInputs: ["organic.csv"],
  computeMetrics,
};
