// The guide's wire format. The demo API (src/app/api/assistant/route.ts) streams these
// as newline-delimited JSON; the panel (src/components/assistant/) renders them.
// To swap in a real model later, keep these shapes and replace only the route.

export type View = "companies" | "map" | "index";

/** Where the person is in the app when they ask. */
export interface GuideContext {
  view: View;
  /** open company, if any */
  ticker?: string;
}

/** Something the guide can do in the app. */
export type Action =
  | { kind: "open"; ticker: string; label: string }
  | { kind: "view"; view: View; label: string; focus?: string }
  | { kind: "highlight"; target: string; ticker?: string; label: string }
  | { kind: "filter"; tickers: string[]; title: string; label: string };

/** A visual answer card. Cards carry references only; the panel reads values from the same dataset. */
export type Block =
  | { kind: "company"; ticker: string }
  | { kind: "checks"; ticker: string }
  | { kind: "metric"; ticker: string; metricId: string }
  | { kind: "compare"; tickers: string[] }
  | { kind: "deals"; ticker: string; limit: number }
  | { kind: "ranking"; metricId: string; tickers: string[]; highlight?: string }
  | { kind: "whatif"; additions: { ticker: string; weightPct: number }[] }
  | { kind: "rules" };

/** One full answer, before it is streamed. */
export interface Reply {
  /** what the guide looked at, shown as a short trace */
  steps: string[];
  text: string;
  blocks: Block[];
  /** ids from Dataset.sources */
  sourceIds: string[];
  actions: Action[];
  suggestions: string[];
}

export type StreamEvent =
  | { t: "step"; text: string }
  | { t: "delta"; text: string }
  | { t: "block"; block: Block }
  | { t: "sources"; sourceIds: string[] }
  | { t: "actions"; actions: Action[] }
  | { t: "suggest"; prompts: string[] }
  | { t: "done" };

export interface AskRequest {
  /** "ask" answers a question; "notice" is the guide pointing something out as you move around */
  mode: "ask" | "notice";
  question?: string;
  context: GuideContext;
}
