// What the onboarding needs to know about each industry. Plain data, built on the server
// (src/lib/server/analysis.ts) and passed to the browser.

export interface TickerInfo {
  ticker: string;
  name: string;
  /** true when the engine has enough data to run at least one of the industry's checks */
  hasData: boolean;
}

export interface IndustryOption {
  id: string;
  name: string;
  tagline: string;
  question: string;
  checks: { id: string; label: string; kind: "gate" | "score"; rule: string }[];
  /** the Canadian candidates this industry tests */
  universe: (TickerInfo & { subSector: string; listedOn: string; why: string })[];
  /** the organizers' live index for this industry, if there is one */
  organizers: {
    name: string;
    currency: string;
    cashPct: number;
    totalValue: number;
    updatedAt: string;
    holdings: (TickerInfo & { weightPct: number; subSector: string; countryCode: string })[];
  } | null;
  /** cash to suggest when the user leaves weights blank */
  defaultCashPct: number;
  /** every ticker the engine has data for under this industry, plus well-known names, for suggestions */
  known: TickerInfo[];
  /** share of the index filled with additions, and the cap per addition */
  sleevePct: number;
  maxWeightPct: number;
}
