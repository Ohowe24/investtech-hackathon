// The guide's wire format. The demo API (src/app/api/assistant/route.ts) streams these
// as newline-delimited JSON; the panel (src/components/assistant/) renders them.
// To swap in a real model later, keep these shapes and replace only the route.

/** The app's places. "companies" with a ticker in GuideContext means a company page. */
export type View = "start" | "recommendation" | "companies" | "map" | "index" | "test";

/** Where the person is in the app when they ask. */
export interface GuideContext {
  view: View;
  /** open company, if any */
  ticker?: string;
}

/** Something the guide can do in the app. */
export type Action =
  | { kind: "open"; ticker: string; label: string }
  /** focus: a ticker to highlight on the map */
  | { kind: "view"; view: View; label: string; focus?: string }
  /** target: a data-guide value on the page; ticker: open this company first; view: go to this view first */
  | { kind: "highlight"; target: string; ticker?: string; view?: View; label: string }
  | { kind: "filter"; tickers: string[]; title: string; label: string };

/** A visual answer card. Cards carry references only; the panel reads values from the same dataset. */
export type Block =
  | { kind: "company"; ticker: string }
  | { kind: "checks"; ticker: string }
  | { kind: "metric"; ticker: string; metricId: string }
  | { kind: "compare"; tickers: string[] }
  | { kind: "deals"; ticker: string; limit: number }
  | { kind: "ranking"; metricId: string; tickers: string[]; highlight?: string }
  | { kind: "list"; title: string; tickers: string[]; metricId?: string }
  /** additions: the full scenario (the model's picks plus any of yours); the panel recomputes it with completeIndex */
  | { kind: "whatif"; additions: { ticker: string; weightPct: number }[] }
  | { kind: "rules" };

/** One full answer, before it is streamed. */
export interface Reply {
  /** what the guide looked at, shown as a short trace */
  steps: string[];
  /** plain text. "[[CSU]]" renders as a ticker chip, "**x**" as bold, lines starting "• " as bullets, blank lines split paragraphs */
  text: string;
  blocks: Block[];
  /** ids from Dataset.sources, or INDEX_SOURCE for the organizers' index */
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
