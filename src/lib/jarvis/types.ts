// Jarvis's wire format. The browser runs the conversation loop: it sends the conversation to /api/jarvis,
// which streams one Claude turn back as these events; the browser runs any tools and sends the results back.

import type Anthropic from "@anthropic-ai/sdk";
import type { AnalysisQuery } from "@/lib/query";
import type { Cue } from "./cues";

export type Message = Anthropic.Beta.BetaMessageParam;

export interface StepRequest {
  messages: Message[];
  query?: AnalysisQuery;
  /** true: only warm the prompt cache (sent when a conversation starts), no answer */
  warm?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type StepEvent =
  /** a screen cue. Normally it belongs to the next "say" (run it when that sentence starts). now=true: it was
   *  written right after the sentence before, so it goes with that one (or runs at once if that one has started). */
  | { t: "cue"; cue: Cue; now?: boolean }
  /** one finished sentence. ok=false: a number in it traced to nothing, so it is never spoken */
  | { t: "say"; text: string; speech: string; ok: true }
  | { t: "say"; text: string; ok: false; unverified: number[] }
  /** the whole assistant message, to append to the conversation unchanged (thinking blocks included) */
  | { t: "end"; content: Anthropic.Beta.BetaContentBlock[]; stop: string | null; calls: ToolCall[] }
  | { t: "error"; message: string };
