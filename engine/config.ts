// ENGINE SETTINGS (Max's lane)
// Every threshold here is a declared rule. The reason for each one is in methodology.md.

import type { MapConfig, MetricDef } from "../contract/types";

export const config = {
  /** must match an index name in data/indexes.json */
  indexName: "Serial acquirers & consolidators",
  currency: "USD",
  question: "Which Canadian companies truly belong in this index, and which only look like they do?",
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
    { id: "themeFit", kind: "gate", label: "Really an acquirer", metricId: "acqIntensity", op: ">=", threshold: 0.2,
      rule: "Spent at least 20% of its operating cash flow on acquisitions" },
    { id: "debtLimit", kind: "gate", label: "Debt under control", metricId: "netDebtToEbitda", op: "<=", threshold: 3,
      rule: "Net debt is at most 3× average EBITDA of the last three years" },
    { id: "ownersGain", kind: "score", label: "Owners gained", metricId: "fcfPerShareCagr", op: ">=", threshold: 0.07,
      rule: "Free cash flow per share grew at least 7% a year" },
    { id: "cashReturn", kind: "score", label: "Capital earns its keep", metricId: "cashReturn", op: ">=", threshold: 0.08,
      rule: "Free cash flow is at least 8% of the capital invested, goodwill included" },
    { id: "noDilution", kind: "score", label: "No dilution", metricId: "shareCountChange", op: "<=", threshold: 0.05,
      rule: "Share count grew by no more than 5% over the period" },
    { id: "selfFunded", kind: "score", label: "Self-funded deals", metricId: "acqIntensity", op: "<=", threshold: 1,
      rule: "Acquisition spending did not exceed operating cash flow" },
  ] as { id: string; kind: "gate" | "score"; label: string; metricId: string; op: ">=" | "<="; threshold: number; rule: string }[],

  metricDefs: [
    {
      id: "acqIntensity",
      label: "Acquisition intensity",
      unit: "pct",
      description: "Cash spent buying businesses as a share of operating cash flow, summed over the period.",
    },
    {
      id: "fcfPerShareCagr",
      label: "FCF per share growth / yr",
      unit: "pct",
      higherIsBetter: true,
      description: "Annual growth in free cash flow per diluted share: did owners get richer per share?",
    },
    {
      id: "revenueCagr",
      label: "Revenue growth / yr",
      unit: "pct",
      higherIsBetter: true,
      description: "Annual growth in total revenue: how much bigger the company got.",
    },
    {
      id: "shareCountChange",
      label: "Share count change",
      unit: "pct",
      higherIsBetter: false,
      description: "Change in diluted shares over the period. Positive means new shares were issued.",
    },
    {
      id: "cashReturn",
      label: "Cash return on capital",
      unit: "pct",
      higherIsBetter: true,
      description: "Free cash flow as a share of all the debt and equity invested, goodwill included (latest year).",
    },
    {
      id: "netDebtToEbitda",
      label: "Net debt / 3-yr EBITDA",
      unit: "multiple",
      higherIsBetter: false,
      description: "Latest net debt compared with average EBITDA over the last three years. Negative means more cash than debt.",
    },
    {
      id: "organicGrowth",
      label: "Organic growth (reported)",
      unit: "pct",
      higherIsBetter: true,
      description: "Growth excluding acquisitions, as reported by the company (latest year). Shown for context, not scored: only some companies report it in our data.",
    },
  ] satisfies MetricDef[],

  map: {
    x: "acqIntensity",
    y: "fcfPerShareCagr",
    xThreshold: 0.2, // same line as the "Really an acquirer" gate
    yThreshold: 0.07, // same line as the "Owners gained" check
    zones: {
      topRight: "Compounders",
      bottomRight: "Empire builders",
      topLeft: "Organic growers",
      bottomLeft: "Stalled",
    },
  } satisfies MapConfig,
};
