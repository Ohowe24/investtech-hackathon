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
  /** what was taken and when, in one line */
  detail?: string;
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
  /** counted in the recent-deals window (rules.dealYears) and not excluded */
  recent: boolean;
  /** outlook of the deal's industry; null if unlabelled or the industry has no outlook */
  outlook: number | null;
}

export type Trend = "growing" | "stable" | "declining";
export type Direction = "toward" | "steady" | "away";

/** A company's revenue in one reported segment, mapped to an industry (Layer 1). */
export interface OutlookMixRow {
  segment: string;
  naics: string | null;
  naicsTitle: string | null;
  /** reported segment revenue, copied as reported */
  revenue: number | null;
  currency: string;
  /** share of the reported segments' total, decimal; null if not reported */
  share: number | null;
  /** fiscal period of the figure, e.g. "FY2025" */
  period: string;
  /** the text that justifies the industry, verbatim */
  quote: string | null;
  quoteSource: string | null;
  /** the markets the segment's clients are in, when the text names them; context, never scored */
  serves: string | null;
  note: string | null;
  sourceIds: string[];
}

/** A company's revenue by reported region, copied with its share; context for how far the signals (Canada, US) apply. */
export interface OutlookGeoRow {
  region: string;
  share: number | null;
  period: string;
  sourceIds: string[];
}

/** One published signal about one industry (Layer 2). */
export interface OutlookSignal {
  kind: "momentum" | "projection" | "street" | "narrative";
  /** short name shown in tables, e.g. "Recent momentum" */
  label: string;
  geo: "Canada" | "United States" | null;
  /** the published series used, e.g. "StatCan 36-10-0434 · Software publishers [5132]" */
  series: string;
  /** decimal yearly rate after inflation; null + note when missing. Never typed by hand. */
  value: number | null;
  note?: string;
  period: string;
  sourceIds: string[];
  /** street only: the median analyst rate before removing inflation, and the peers it came from */
  nominal?: number | null;
  peers?: { ticker: string; name: string; growth: number | null }[];
  /** for narrative: the quoted text, shown, never scored */
  text?: string;
}

export interface OutlookIndustry {
  naics: string;
  title: string;
  signals: OutlookSignal[];
  /** median of the signals that exist (engine/metrics.ts industryOutlook); null if fewer than rules.minSignals */
  outlook: number | null;
  trend: Trend | null;
  /** how the published series line up with this code (from engine/input/outlook-industry-map.csv) */
  note: string | null;
}

export interface OutlookCompany {
  ticker: string;
  name: string;
  /** fiscal period of the revenue mix */
  mixPeriod: string | null;
  mix: OutlookMixRow[];
  /** the mix summed by industry (segments in the same industry together), largest first */
  industryMix: { naics: string; title: string; share: number | null; segments: string[] }[];
  geography: OutlookGeoRow[];
  /** Layer 3: revenue-weighted industry outlook; null if less than rules.minCoverage of revenue has an outlook */
  tailwind: number | null;
  /** share of revenue the tailwind covers */
  coverage: number | null;
  /** tailwind compared with the whole economy, same rule as an industry's trend */
  trend: Trend | null;
  /** share of revenue in industries whose outlook is declining (the red flag); null if not computable */
  decliningShare: number | null;
  /** Layer 4: equal-weighted outlook of the recent deals that have an industry and an outlook */
  dealOutlook: number | null;
  /** recent deals counted (after exclusions), and how many have an industry with an outlook */
  dealCount: number;
  dealsWithOutlook: number;
  /** dealOutlook − tailwind, decimal */
  directionGap: number | null;
  direction: Direction | null;
  /** what management said about its markets on the latest earnings call: verbatim quotes with a one-line
   *  summary written by Claude. Shown as text, never scored. */
  narrative: { speaker: string | null; quote: string; summary: string; call: string; sourceIds: string[] }[];
  notes: string[];
}

/** Declared constants of the engine, shown on the page. Changing one changes every result. */
export interface OutlookRules {
  /** an industry needs at least this many signals for an outlook */
  minSignals: number;
  /** tailwind and deal outlook need at least this share of weight with an outlook */
  minCoverage: number;
  /** direction is steady within ± this many (decimal) of the base */
  directionBand: number;
  /** used only to remove inflation from analyst revenue estimates (Bank of Canada target) */
  inflation: number;
  /** recent deals: fiscal years counted for direction */
  dealYears: number[];
  /** street forecast: fiscal year ending in this calendar year to two years later */
  streetFrom: number;
  streetTo: number;
  /** street forecast needs at least this many peers with estimates */
  minPeers: number;
  /** recent momentum: years between the two 12-month windows */
  momentumYears: number;
}

export interface OutlookData {
  generatedAt: string;
  status: "planned" | "partial" | "complete";
  thesis: string;
  layers: OutlookLayer[];
  sources: OutlookSource[];
  rules: OutlookRules;
  /** the whole economy measured the same way: the bar for "growing" */
  economy: { signals: OutlookSignal[]; outlook: number | null };
  companies: OutlookCompany[];
  deals: OutlookDeal[];
  industries: OutlookIndustry[];
}
