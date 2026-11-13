// ENGINE SETTINGS (Max's lane)
// Every threshold here is a declared rule. The reason for each one is in methodology.md.

import type { MapConfig, MetricDef } from "../contract/types";

export const config = {
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
  ] as { id: string; kind: "gate" | "score"; label: string; metricId: string; op: ">=" | "<="; threshold: number; rule: string }[],

  metricDefs: [
    {
      id: "acqIntensity",
      short: "Acquisition spend",
      label: "Acquisitions ÷ operating cash flow",
      unit: "pct",
      description: "Share of the cash the business generated that went into buying companies.",
      formula: "Cash paid for acquisitions minus cash from selling businesses, all years added up, ÷ operating cash flow, all years added up. A net seller shows 0%.",
    },
    {
      id: "fcfPerShareCagr",
      short: "FCF per share",
      label: "Free cash flow per share, growth per year",
      unit: "pct",
      higherIsBetter: true,
      description: "Whether each share earned more cash over time.",
      formula: "Free cash flow = operating cash flow − capital spending. Divide by diluted shares. Average yearly growth from the first year to the last.",
    },
    {
      id: "revenueCagr",
      short: "Revenue growth",
      label: "Revenue growth per year",
      unit: "pct",
      higherIsBetter: true,
      description: "How much bigger the company got.",
      formula: "Average yearly growth in revenue from the first year to the last.",
    },
    {
      id: "shareCountChange",
      short: "Share count",
      label: "Share count change",
      unit: "pct",
      higherIsBetter: false,
      description: "Whether owners were diluted by new shares.",
      formula: "Diluted shares in the last year ÷ diluted shares in the first year − 1. Positive means new shares were issued.",
    },
    {
      id: "cashReturn",
      short: "Return on capital",
      label: "Return on capital (free cash flow)",
      unit: "pct",
      higherIsBetter: true,
      description: "Cash earned on all the money invested in the company, including what it paid for acquisitions.",
      formula: "Last year's free cash flow ÷ average of (debt + equity) at the start and end of that year.",
    },
    {
      id: "netDebtToEbitda",
      short: "Net debt",
      label: "Net debt ÷ EBITDA",
      unit: "multiple",
      higherIsBetter: false,
      description: "How many years of operating profit it would take to pay off the debt.",
      formula: "(Debt − cash) at the last year-end ÷ average EBITDA of the last 3 years. EBITDA = profit before interest, tax, depreciation and amortization. Negative means more cash than debt.",
    },
    {
      id: "organicGrowth",
      short: "Organic growth",
      label: "Organic growth (company-reported)",
      unit: "pct",
      higherIsBetter: true,
      description: "Revenue growth not counting acquisitions.",
      formula: "Taken as reported by the company, latest year. Not scored, because only some companies report it.",
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
  } satisfies MapConfig,
};
