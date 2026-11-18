// Jarvis's brain: one Claude turn per request, streamed back one checked sentence at a time.
// The browser owns the conversation and runs the tools (it has the dataset and the screen); this route
// holds the API key, the instructions and the number check.

import Anthropic from "@anthropic-ai/sdk";
import datasetJson from "@data/companies.json";
import type { Dataset } from "@contract/types";
import { fromSearch, toSearch } from "@/lib/query";
import { runAnalysis } from "@/lib/server/analysis";
import { briefing } from "@/lib/jarvis/data";
import { CueStream, type Cue } from "@/lib/jarvis/cues";
import { forSpeech, Ground, takeSentences } from "@/lib/jarvis/grounding";
import { JARVIS_SYSTEM } from "@/lib/jarvis/prompt";
import { TOOL_DEFS } from "@/lib/jarvis/toolDefs";
import type { Message, StepEvent, StepRequest, ToolCall } from "@/lib/jarvis/types";

export const maxDuration = 60;

const MODEL = process.env.JARVIS_MODEL || "claude-sonnet-5-5";
const EFFORT = (process.env.JARVIS_EFFORT || "low") as "low" | "medium" | "high";

/** The briefing for each analysis, so a conversation doesn't re-run the engine on every turn. */
const briefs = new Map<string, Promise<{ brief: string; names: Record<string, string> }>>();
function briefFor(query: StepRequest["query"]) {
  const parsed = query && typeof query === "object" ? fromSearch(Object.fromEntries(new URLSearchParams(toSearch(query)))) : null;
  const key = parsed ? toSearch(parsed) : "";
  let p = briefs.get(key);
  if (!p) {
    p = (async () => {
      const run = parsed ? await runAnalysis(parsed) : null;
      const ds = run?.ok ? run.dataset : (datasetJson as unknown as Dataset);
      return { brief: briefing(ds), names: Object.fromEntries(ds.companies.map((c) => [c.ticker, c.name])) };
    })();
    if (briefs.size > 50) briefs.clear();
    briefs.set(key, p);
  }
  return p;
}

/** Every piece of text the person, the screen or a tool gave Jarvis this conversation: numbers in it may be spoken. */
function groundFrom(messages: Message[], brief: string): Ground {
  const g = new Ground();
  g.add(brief);
  for (const m of messages) {
    if (m.role !== "user") continue;
    if (typeof m.content === "string") g.add(m.content);
    else for (const b of m.content) {
      if (b.type === "text") g.add(b.text);
      else if (b.type === "tool_result") g.add(typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? ""));
    }
  }
  return g;
}

function valid(messages: unknown): messages is Message[] {
  return Array.isArray(messages) && messages.length > 0 && messages.length <= 120
    && messages.every((m) => m && (m.role === "user" || m.role === "assistant") && (typeof m.content === "string" || Array.isArray(m.content)))
    && messages[0].role === "user" && messages[messages.length - 1].role === "user";
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 501 });
  const raw = await request.text();
  if (raw.length > 1_500_000) return Response.json({ error: "Conversation too long" }, { status: 413 });
  let body: StepRequest;
  try {
    body = JSON.parse(raw) as StepRequest;
  } catch {
    return Response.json({ error: "Send JSON: { messages, query }" }, { status: 400 });
  }
  if (!valid(body.messages)) return Response.json({ error: "messages must alternate, starting and ending with the person" }, { status: 400 });

  const { brief, names } = await briefFor(body.query);
  const ground = groundFrom(body.messages, brief);
  const client = new Anthropic();
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: JARVIS_SYSTEM, cache_control: { type: "ephemeral" } },
    { type: "text", text: brief, cache_control: { type: "ephemeral" } },
  ];

  // Warm-up: write the instructions and briefing to the prompt cache so the first real answer starts fast.
  if (body.warm) {
    try {
      // Same model, effort, tools and system as a real turn, so the cached prefix matches; not streamed (max_tokens 0 requires that).
      await client.beta.messages.create({ model: MODEL, max_tokens: 0, output_config: { effort: EFFORT }, system, tools: TOOL_DEFS, messages: [{ role: "user", content: "Hello." }] });
    } catch (err) {
      console.error("[jarvis] warm", err instanceof Anthropic.APIError ? err.status : err);
    }
    return Response.json({ warmed: true });
  }
  const encoder = new TextEncoder();

  const out = new ReadableStream({
    async start(controller) {
      const send = (e: StepEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      let buf = "";
      const cues = new CueStream();
      let waiting: Cue[] = []; // cues written in the sentence being assembled
      let said = 0; // sentences sent so far
      const sendCue = (cue: Cue, now?: boolean) => {
        // A graphic's title is shown on screen, so it gets the same number check as speech.
        if (cue.attrs.title && ground.unverified(cue.attrs.title).length) delete cue.attrs.title;
        for (const k of Object.keys(cue.attrs)) cue.attrs[k] = cue.attrs[k].slice(0, 80);
        send(now ? { t: "cue", cue, now: true } : { t: "cue", cue });
      };
      const flush = (final: boolean) => {
        const { sentences, rest } = takeSentences(final ? `${buf}\n` : buf);
        buf = final ? "" : rest;
        for (const s of sentences) {
          waiting.forEach((c) => sendCue(c));
          waiting = [];
          said++;
          const bad = ground.unverified(s);
          send(bad.length ? { t: "say", text: s, ok: false, unverified: bad } : { t: "say", text: s, speech: forSpeech(s, names), ok: true });
        }
        if (final) { waiting.forEach((c) => sendCue(c)); waiting = []; }
      };
      const take = (pieces: ReturnType<CueStream["feed"]>) => {
        for (const p of pieces) {
          if (!("cue" in p)) { buf += p.text; continue; }
          // Written at a sentence boundary (nothing of the next sentence yet): it goes with the sentence just said.
          if (!buf.trim() && said > 0) sendCue(p.cue, true);
          else waiting.push(p.cue);
        }
      };
      try {
        const stream = client.beta.messages.stream(
          {
            model: MODEL,
            max_tokens: 16000,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            output_config: { effort: EFFORT },
            cache_control: { type: "ephemeral" },
            system,
            tools: TOOL_DEFS,
            messages: body.messages,
          },
          { signal: request.signal },
        );
        stream.on("text", (delta) => {
          take(cues.feed(delta));
          flush(false);
        });
        const message = await stream.finalMessage();
        take(cues.flush());
        flush(true);
        const calls: ToolCall[] = message.stop_reason === "tool_use"
          ? message.content
            .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
            .map((b) => ({ id: b.id, name: b.name, input: b.input && typeof b.input === "object" ? (b.input as Record<string, unknown>) : {} }))
          : [];
        if (message.stop_reason === "refusal") send({ t: "say", text: "I'm afraid I can't help with that one.", speech: "I'm afraid I can't help with that one.", ok: true });
        send({ t: "end", content: message.content, stop: message.stop_reason, calls });
      } catch (err) {
        if (!request.signal.aborted) {
          console.error("[jarvis]", err);
          send({ t: "error", message: err instanceof Anthropic.APIError ? `Claude API error ${err.status ?? ""}: ${err.message}` : "Something went wrong on my side." });
        }
      }
      controller.close();
    },
  });
  return new Response(out, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
