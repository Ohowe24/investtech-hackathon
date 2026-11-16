// The guide's demo API. No AI model and no API key: it streams scripted answers that
// src/lib/assistant/brain.ts assembles from the two data files, so it can never invent a number.
// To use a real model later, replace only this file and keep the StreamEvent shapes.

import datasetJson from "@data/companies.json";
import snapshotJson from "@data/indexes.json";
import type { Dataset, IndexSnapshot } from "@contract/types";
import { answer, notice } from "@/lib/assistant/brain";
import { fromSearch, toSearch, type AnalysisQuery } from "@/lib/query";
import { runAnalysis } from "@/lib/server/analysis";
import type { AskRequest, Reply, StreamEvent, View } from "@/lib/assistant/types";

const defaultDataset = datasetJson as unknown as Dataset;
const defaultSnapshot = snapshotJson as unknown as IndexSnapshot;
const VIEWS: View[] = ["start", "recommendation", "companies", "map", "index", "xray"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Splits text into small runs of words so it reads as if typed. Markers like [[CSU]] are never split. */
function chunks(text: string): string[] {
  const words = text.match(/\S+\s*|\s+/g) ?? [];
  const out: string[] = [];
  for (let i = 0; i < words.length; i += 3) out.push(words.slice(i, i + 3).join(""));
  return out;
}

async function* events(reply: Reply, quick: boolean): AsyncGenerator<StreamEvent> {
  for (const text of reply.steps) {
    yield { t: "step", text };
    await sleep(quick ? 0 : 260 + Math.random() * 220);
  }
  for (const text of chunks(reply.text)) {
    yield { t: "delta", text };
    await sleep(quick ? 8 : 22 + Math.random() * 26);
  }
  for (const block of reply.blocks) {
    yield { t: "block", block };
    await sleep(quick ? 0 : 140);
  }
  if (reply.sourceIds.length) yield { t: "sources", sourceIds: reply.sourceIds };
  if (reply.actions.length) yield { t: "actions", actions: reply.actions };
  if (reply.suggestions.length) yield { t: "suggest", prompts: reply.suggestions };
  yield { t: "done" };
}

export async function POST(request: Request) {
  let body: AskRequest;
  try {
    body = (await request.json()) as AskRequest;
  } catch {
    return Response.json({ error: "Send JSON: { mode, question?, context }" }, { status: 400 });
  }
  const view = VIEWS.includes(body?.context?.view) ? body.context.view : "companies";
  const ticker = typeof body?.context?.ticker === "string" ? body.context.ticker : undefined;
  const context = { view, ticker };

  // Answer about the holdings the page shows. The query is re-read through the same parser as the address,
  // so nothing in the body reaches the engine unchecked.
  const q = (body as AskRequest & { query?: AnalysisQuery }).query;
  const parsed = q && typeof q === "object" ? fromSearch(Object.fromEntries(new URLSearchParams(toSearch(q)))) : null;
  const run = parsed ? await runAnalysis(parsed) : null;
  const dataset = run?.ok ? run.dataset : defaultDataset;
  const snapshot = run?.ok ? run.snapshot : defaultSnapshot;

  const reply = body.mode === "notice"
    ? notice(dataset, snapshot, context)
    : answer(dataset, snapshot, typeof body.question === "string" ? body.question : "", context);

  // Industries without yearly statements (REITs) have no X-ray page: never offer a button that leads nowhere.
  if (reply && dataset.hasStatements === false) {
    reply.actions = reply.actions.filter((x) => !("view" in x && x.view === "xray"));
  }

  const encoder = new TextEncoder();
  const iterator = events(reply ?? { steps: [], text: "", blocks: [], sourceIds: [], actions: [], suggestions: [] }, body.mode === "notice");
  const stream = new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
