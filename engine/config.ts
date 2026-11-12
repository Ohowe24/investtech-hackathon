// ENGINE SETTINGS (Max's lane)
// Change these at the 17:20 go / no-go once the real data is visible.
// Thresholds below are PLACEHOLDERS. Set them on purpose and write why in methodology.md.

import type { MapConfig, MetricDef } from "../contract/types";

export const config = {
  /** must match an index name in data/indexes.json */
  indexName: "Serial acquirers & consolidators",
  currency: "USD",
  question: "Which Canadian companies truly belong in this index, and which only look like they do?",
  /** used when a company has verdict "add" but no proposed_weight_pct */
  defaultAddWeightPct: 2.5,

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
      id: "netDebtToFcf",
      label: "Net debt / FCF",
      unit: "multiple",
      higherIsBetter: false,
      description: "Years of free cash flow needed to pay off net debt (latest year).",
    },
    {
      id: "organicGrowth",
      label: "Organic growth (reported)",
      unit: "pct",
      higherIsBetter: true,
      description: "Growth excluding acquisitions, as reported by the company (latest year). Missing if not disclosed.",
    },
  ] satisfies MetricDef[],

  map: {
    x: "acqIntensity",
    y: "fcfPerShareCagr",
    xThreshold: 0.5, // PLACEHOLDER: "acquisition-led" if it spends >= 50% of operating cash flow on deals
    yThreshold: 0.05, // PLACEHOLDER: "owners got richer" if FCF/share grows >= 5% a year
    zones: {
      topRight: "Compounders",
      bottomRight: "Empire builders",
      topLeft: "Organic growers",
      bottomLeft: "Stalled",
    },
  } satisfies MapConfig,
};
