// The look-ups Claude can make beyond the briefing. They run in the browser, against the dataset on screen.
// Screen moves are not tools: they are cues written inside the answer (src/lib/jarvis/cues.ts), so a reply
// never waits on a round trip to move the screen.

import type Anthropic from "@anthropic-ai/sdk";

const ticker = { type: "string", description: "Ticker as the data lists it, e.g. CSU" } as const;

export const TOOL_DEFS: Anthropic.Tool[] = [
  {
    name: "get_history",
    description: "A company's yearly statement figures: revenue, operating and free cash flow, free cash flow per share, acquisitions, return on capital, shares.",
    input_schema: { type: "object", properties: { ticker }, required: ["ticker"], additionalProperties: false },
  },
  {
    name: "get_deals",
    description: "A company's recorded acquisitions and divestitures, newest first, with filing quotes.",
    input_schema: { type: "object", properties: { ticker }, required: ["ticker"], additionalProperties: false },
  },
  {
    name: "explain_metric",
    description: "What a metric means, its formula, why it matters, and the check that uses it.",
    input_schema: { type: "object", properties: { metric_id: { type: "string" } }, required: ["metric_id"], additionalProperties: false },
  },
  {
    name: "get_company",
    description: "One company in full detail, including notes and periods behind each figure. The briefing usually has enough; use this only for detail it lacks.",
    input_schema: { type: "object", properties: { ticker }, required: ["ticker"], additionalProperties: false },
  },
];
