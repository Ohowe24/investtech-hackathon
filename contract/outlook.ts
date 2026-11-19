// Shape of data/outlook.json: the Outlook engine (see docs/OUTLOOK_ENGINE.md).
// Shared by engine/outlook/build-outlook.ts and src/components/OutlookEngine.tsx. Change both sides together.

export type StepStatus = "planned" | "in-progress" | "done";

export interface OutlookStep {
  id: string;
  label: string;
  status: StepStatus;
  /** one plain line: what this step produces */
  detail: string;
}

export interface OutlookLayer {
  id: "mix" | "signals" | "tailwind" | "direction";
  title: string;
  question: string;
  steps: OutlookStep[];
}

export interface OutlookSource {
  id: string;
  label: string;
  url?: string;
  /** "planned" sources are listed for the plan and hold no data yet */
  status: "planned" | "fetched";
}

/** One disclosed acquisition and its industry label (Layer 1). */
export interface OutlookDeal {
  ticker: string;
  /** ISO date, or the period label (e.g. "Q3 2026") when the filing gives no date */
  date: string;
  fiscalYear: number | null;
  counterparty: string;
  summary: string;
  /** SEDAR quote behind the deal */
  quote: string | null;
  /** NAICS 2022 code; null until labelled */
  naics: string | null;
  naicsTitle: string | null;
  /** the deal text that justifies the label, verbatim */
  naicsQuote: string | null;
  /** where naicsQuote comes from: "SEDAR quote", "Onesheet deal summary" or "Onesheet company profile" */
  naicsQuoteSource: string | null;
  /** customer markets the deal text names (e.g. "travel" for a travel software business); text, never scored */
  serves: string | null;
  labelStatus: "unlabelled" | "proposed" | "approved";
  /** why this row is left out of the deal mix (duplicate, minority stake, not completed…); null = counts */
  exclude: string | null;
  /** reviewer note on the label */
  labelNote: string | null;
}

/** A company's revenue in one industry (Layer 1, from segments). */
export interface OutlookMixRow {
  segment: string;
  naics: string | null;
  /** share of revenue, decimal; null if not reported */
  share: number | null;
  period: string;
  sourceIds: string[];
}

/** One published signal about one industry (Layer 2). */
export interface OutlookSignal {
  kind: "projection" | "momentum" | "street" | "narrative";
  label: string;
  /** decimal yearly rate; null + note when missing. Never typed by hand. */
  value: number | null;
  note?: string;
  period: string;
  sourceIds: string[];
  /** for narrative: the quoted text, shown, never scored */
  text?: string;
}

export interface OutlookIndustry {
  naics: string;
  title: string;
  signals: OutlookSignal[];
  /** blended outlook (Layer 3 formula in engine/metrics.ts); null until computed */
  outlook: number | null;
  trend: "growing" | "stable" | "declining" | null;
}

export interface OutlookCompany {
  ticker: string;
  name: string;
  mix: OutlookMixRow[];
  /** Layer 3; null until computed */
  tailwind: number | null;
  /** share of revenue the tailwind covers */
  coverage: number | null;
  /** Layer 4; null until computed */
  direction: "toward" | "steady" | "away" | null;
  notes: string[];
}

export interface OutlookData {
  generatedAt: string;
  status: "planned" | "partial" | "complete";
  thesis: string;
  layers: OutlookLayer[];
  sources: OutlookSource[];
  companies: OutlookCompany[];
  deals: OutlookDeal[];
  industries: OutlookIndustry[];
}
