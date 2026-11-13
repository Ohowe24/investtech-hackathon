import { describe, expect, it } from "vitest";
import datasetJson from "@data/companies.json";
import snapshotJson from "@data/indexes.json";
import type { Dataset, IndexSnapshot } from "@contract/types";
import { formatValue, pct } from "@/lib/format";
import { completeIndex, countryMix, type Addition, type IndexState } from "@/lib/indexMath";
import { answer, findTickers, notice, sortedDeals, trimPct } from "./brain";
import type { GuideContext, Reply } from "./types";

const ds = datasetJson as unknown as Dataset;
const snap = snapshotJson as unknown as IndexSnapshot;
const index = snap.indexes.find((i) => i.name === ds.indexName) ?? snap.indexes[0];
const tested = ds.companies.filter((c) => c.model).sort((a, b) => a.model!.rank - b.model!.rank);
const by = (t: string) => ds.companies.find((c) => c.ticker === t)!;
const ask = (q: string, ctx: GuideContext = { view: "companies" }) => answer(ds, snap, q, ctx);

// Picked from the data, never typed, so the tests follow the data when the engine re-runs.
const pick = tested.find((c) => !c.inIndex && c.verdict === "add")!;
const watch = tested.find((c) => !c.inIndex && c.verdict === "watch")!;
const reject = tested.find((c) => !c.inIndex && c.verdict === "reject")!;
const held = tested.find((c) => c.inIndex)!;
const passWithFail = tested.find((c) => c.model!.recommendation === "pass" && c.model!.checks.some((k) => k.pass === false));
const withDeals = tested.find((c) => (c.deals?.length ?? 0) > 0)!;
const noDeals = tested.find((c) => !c.deals?.length && c.history?.length)!;

// ───────────── The number guard ─────────────
// Every percentage or multiple in a reply must be a dataset value formatted the site's way,
// a string from the data files, or an output of completeIndex for the scenario the reply shows.

const TOKEN = /\d+(?:\.\d+)?\s?[%×]/g;
const tokens = (s: string) => (s.match(TOKEN) ?? []).map((t) => t.replace(/\s/g, ""));

function allowedFromData(): Set<string> {
  const set = new Set<string>();
  const add = (s: string) => tokens(s).forEach((t) => set.add(t));
  const walk = (v: unknown): void => {
    if (typeof v === "string") add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(ds);
  walk(snap);
  for (const c of ds.companies) for (const d of ds.metricDefs) add(formatValue(c.metrics[d.id]?.value, d.unit));
  const unitOf = (id: string) => ds.metricDefs.find((d) => d.id === id)?.unit ?? "pct";
  add(formatValue(ds.map.xThreshold, unitOf(ds.map.x)));
  add(formatValue(ds.map.yThreshold, unitOf(ds.map.y)));
  const weight = (v: number) => [pct(v), pct(v, 2), trimPct(v)].forEach(add);
  for (const c of ds.companies) if (c.proposedWeightPct != null) weight(c.proposedWeightPct);
  for (const i of snap.indexes) {
    weight(i.cashPct);
    i.positions.forEach((p) => weight(p.weightPct));
  }
  return set;
}

function allowedFromScenario(additions: { ticker: string; weightPct: number }[]): Set<string> {
  const set = new Set<string>();
  const weight = (v: number) => [pct(v), pct(v, 2), trimPct(v)].forEach((s) => tokens(s).forEach((t) => set.add(t)));
  const overrides = Object.fromEntries(ds.companies.map((c) => [c.ticker, c.hqCountry]));
  const toAdd = (a: { ticker: string; weightPct: number }): Addition => ({ ticker: a.ticker, name: a.ticker, weightPct: a.weightPct, countryCode: by(a.ticker).hqCountry });
  const modelPicks = ds.companies.filter((c) => c.verdict === "add" && !c.inIndex && c.proposedWeightPct != null).map((c) => toAdd({ ticker: c.ticker, weightPct: c.proposedWeightPct! }));
  const states: IndexState[] = [];
  for (const adds of [[], modelPicks, additions.map(toAdd)]) {
    const r = completeIndex(index, adds, overrides);
    states.push(r.before, r.after);
  }
  for (const s of states) {
    weight(s.cashPct);
    s.rows.forEach((r) => weight(r.weightPct));
    countryMix(s).forEach((m) => weight(m.pct));
  }
  additions.forEach((a) => weight(a.weightPct));
  return set;
}

const DATA_TOKENS = allowedFromData();

function strays(r: Reply): string[] {
  const scenario = r.blocks.flatMap((b) => (b.kind === "whatif" ? b.additions : []));
  const extra = allowedFromScenario(scenario);
  return [r.text, ...r.steps, ...r.suggestions].flatMap(tokens).filter((t) => !DATA_TOKENS.has(t) && !extra.has(t));
}

const CONTEXTS: GuideContext[] = [
  { view: "start" },
  { view: "recommendation" },
  { view: "companies" },
  { view: "map" },
  { view: "index" },
  { view: "test" },
  ...tested.map((c) => ({ view: "companies" as const, ticker: c.ticker })),
];

const QUESTIONS = [
  "", "help", "What can you do?",
  "How does the model work?", "How is the weight set?",
  "What's in the index?", "What's the Canadian share?",
  "Which companies pass the model?", "Which holdings fail the model?", "Show me the rejected ones", "What does the model add?",
  "Who is on watch?", "Who sits top-right?", "Explain the map", "Show the Canadian candidates",
  "Who fails on debt?", "Who passes on return on capital?", "Top 5 on FCF per share", "Bottom 3 on share count", "Lowest net debt",
  "What is net debt?", "What does acquisition spend mean?", "Explain organic growth",
  "Why?", "Tell me more", "Deals?", "What about debt?", "Where is it on the map?", "Should I buy it?",
  "What if we add a company at 5%?", "Tell me about MSFT", "What's the weather?",
  ...tested.flatMap((c) => [
    c.ticker,
    `Why is ${c.ticker} rated that way?`,
    `Show ${c.ticker}'s deals`,
    `Where is ${c.ticker} on the map?`,
    `What is ${c.ticker}'s return on capital?`,
    `How much does ${c.ticker} spend on acquisitions?`,
    `Should I buy ${c.ticker}?`,
    `What if we add ${c.ticker}?`,
    `What if we add ${c.ticker} at ${trimPct(pick.proposedWeightPct!)}?`,
    `What if we add ${c.ticker} at 30%?`,
    `Compare ${c.ticker} and ${pick.ticker}`,
  ]),
];

describe("number guard", () => {
  it("every % and × in every answer comes from the data or completeIndex", () => {
    const bad: string[] = [];
    for (const ctx of [{ view: "companies" } as GuideContext, { view: "companies", ticker: watch.ticker } as GuideContext]) {
      for (const q of QUESTIONS) {
        const s = strays(answer(ds, snap, q, ctx));
        if (s.length) bad.push(`${q} @${ctx.ticker ?? ctx.view}: ${s.join(", ")}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("every % and × in every notice comes from the data or completeIndex", () => {
    const bad: string[] = [];
    for (const ctx of CONTEXTS) {
      const r = notice(ds, snap, ctx);
      const s = r ? strays(r) : [];
      if (s.length) bad.push(`${ctx.ticker ?? ctx.view}: ${s.join(", ")}`);
    }
    expect(bad).toEqual([]);
  });

  it("catches a number that is not in the data", () => {
    const fake: Reply = { steps: [], text: "Margin is 12.345% and debt 9.87×", blocks: [], sourceIds: [], actions: [], suggestions: [] };
    expect(strays(fake)).toEqual(["12.345%", "9.87×"]);
  });

  it("every source id points at Dataset.sources or the index", () => {
    const ids = new Set([...ds.sources.map((s) => s.id), "@index"]);
    for (const q of QUESTIONS.slice(0, 60)) for (const id of ask(q).sourceIds) expect(ids.has(id)).toBe(true);
  });
});

describe("reading the question", () => {
  it("matches tickers that are everyday words only in capitals", () => {
    expect(findTickers(ds, "Are there any toi companies? j/k")).toEqual([]);
    const caps = ["ARE", "J", "TOI"].filter((t) => ds.companies.some((c) => c.ticker === t));
    for (const t of caps) expect(findTickers(ds, `Why is ${t} rated that way?`)).toEqual([t]);
  });

  it("matches company names and keeps the order they were typed", () => {
    expect(findTickers(ds, `Compare ${pick.name} with ${watch.ticker}`)).toEqual([pick.ticker, watch.ticker]);
  });
});

describe("intents", () => {
  it("help explains it is scripted", () => {
    const r = ask("What can you do?");
    expect(r.text).toMatch(/no AI model/i);
    expect(r.suggestions.length).toBeGreaterThanOrEqual(3);
  });

  it("refuses investment advice, then says how the model rates it", () => {
    const r = ask(`Should I buy ${pick.ticker}?`);
    expect(r.text).toMatch(/can't give investment advice/);
    expect(r.text).toContain(`[[${pick.ticker}]]`);
    expect(r.blocks).toEqual([{ kind: "checks", ticker: pick.ticker }]);
  });

  it("explains the rules from the dataset", () => {
    const r = ask("How does the model work?");
    expect(r.blocks).toEqual([{ kind: "rules" }]);
    if (ds.rules) expect(r.text).toContain(ds.rules.result);
  });

  it("what-if: adds the name on top of the model's picks", () => {
    const w = pick.proposedWeightPct!;
    const r = ask(`What if we add ${watch.ticker} at ${trimPct(w)}?`);
    const block = r.blocks.find((b) => b.kind === "whatif");
    expect(block).toBeDefined();
    if (block?.kind !== "whatif") return;
    expect(block.additions).toContainEqual({ ticker: watch.ticker, weightPct: w });
    expect(block.additions.map((a) => a.ticker)).toContain(pick.ticker);
    expect(r.text).toMatch(/Canadian share/);
    expect(r.text).toMatch(/Cash/);
  });

  it("what-if: a holding is already held at its index weight", () => {
    const pos = index.positions.find((p) => p.ticker === held.ticker)!;
    const r = ask(`What if we add ${held.ticker} at 3%?`);
    expect(r.text).toContain(`already held at ${pct(pos.weightPct, 2)}`);
    expect(r.blocks.some((b) => b.kind === "whatif")).toBe(false);
  });

  it("what-if: no weight and none proposed asks for one", () => {
    const r = ask(`What if we add ${watch.ticker}?`);
    expect(r.text).toMatch(/What weight should I try/);
    expect(r.blocks.some((b) => b.kind === "whatif")).toBe(false);
    expect(r.suggestions[0]).toBe(`What if we add ${watch.ticker} at ${trimPct(pick.proposedWeightPct!)}?`);
  });

  it("what-if: a big weight trims holdings", () => {
    const r = ask(`What if we add ${watch.ticker} at 30%?`);
    expect(r.text).toMatch(/trimmed in proportion/);
  });

  it("index summary counts relabelled holdings as their real country", () => {
    const r = ask("What's in the index?");
    const relabelled = index.positions.find((p) => by(p.ticker)?.hqCountry && by(p.ticker).hqCountry !== p.countryCode);
    if (relabelled) expect(r.text).toContain(`[[${relabelled.ticker}]]`);
    expect(r.blocks[0]?.kind).toBe("whatif");
  });

  it("compare names a leader per scored metric and quotes the weight rule when it names both", () => {
    const other = tested.find((c) => c.verdict === "add" && !c.inIndex && c.ticker !== pick.ticker);
    const r = ask(`Compare ${pick.ticker} and ${(other ?? watch).ticker}`);
    expect(r.blocks[0]).toEqual({ kind: "compare", tickers: [pick.ticker, (other ?? watch).ticker] });
    expect(r.text).toMatch(/leads/);
    const sentence = ds.rules?.weight.split(/(?<=\.)\s+/).find((s) => s.includes(pick.ticker) && other && s.includes(other.ticker));
    if (sentence) expect(r.text).toContain(sentence);
  });

  it("deals: counts unique records and names the newest, including non-ISO dates", () => {
    const r = ask(`Show ${withDeals.ticker}'s deals`);
    const list = sortedDeals(withDeals);
    expect(r.text).toContain(`${list.length} deal records`);
    expect(r.blocks[0]).toEqual({ kind: "deals", ticker: withDeals.ticker, limit: 5 });
  });

  it("deals: drops exact repeats", () => {
    for (const c of ds.companies) {
      const keys = sortedDeals(c).map((d) => `${d.type}|${d.date ?? d.periodLabel}|${d.counterparty}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("deals: a quarter label sorts after an earlier ISO date in the same year", () => {
    const fake = { ...withDeals, deals: [
      { type: "acquisition" as const, status: "done", date: "2026-02-01", summary: "a", quotes: [] },
      { type: "acquisition" as const, status: "done", periodLabel: "Q4 2026", date: "Q4 2026", summary: "b", quotes: [] },
      { type: "acquisition" as const, status: "done", summary: "c", quotes: [] },
    ] };
    expect(sortedDeals(fake).map((d) => d.summary)).toEqual(["b", "a", "c"]);
  });

  it("deals: a company without a deal list points to the by-year chart", () => {
    const r = ask(`Show ${noDeals.ticker}'s deals`);
    expect(r.text).toMatch(/no deal list/);
    expect(r.actions).toContainEqual({ kind: "highlight", target: "deals", ticker: noDeals.ticker, label: "Show the chart" });
  });

  it("map: places the company and offers to show it", () => {
    const r = ask(`Where is ${pick.ticker} on the map?`);
    expect(r.text).toContain(pick.zone);
    expect(r.actions).toContainEqual({ kind: "view", view: "map", focus: pick.ticker, label: `Show ${pick.ticker} on the map` });
  });

  it("explains a metric from its definition", () => {
    const def = ds.metricDefs.find((d) => d.id === "netDebtToEbitda")!;
    const r = ask("What is net debt?");
    expect(r.text).toContain(def.description);
    if (def.formula) expect(r.text).toContain(def.formula);
  });

  it("screens: who fails a metric's check, with a filter action", () => {
    const r = ask("Who fails on debt?");
    const expected = tested.filter((c) => c.model!.checks.some((k) => k.metricId === "netDebtToEbitda" && k.pass === false)).map((c) => c.ticker);
    expect(r.blocks[0]).toMatchObject({ kind: "list", tickers: expected });
    expect(r.actions[0]).toMatchObject({ kind: "filter", tickers: expected });
  });

  it("screens: passes the model, verdicts, top N", () => {
    expect(ask("Which companies pass the model?").blocks[0]).toMatchObject({ tickers: tested.filter((c) => c.model!.recommendation === "pass").map((c) => c.ticker) });
    expect(ask("Show me the rejected ones").blocks[0]).toMatchObject({ tickers: tested.filter((c) => !c.inIndex && c.verdict === "reject").map((c) => c.ticker) });
    const top = ask("Top 3 on return on capital").blocks[0];
    expect(top).toMatchObject({ kind: "ranking", metricId: "cashReturn" });
    if (top.kind === "ranking") expect(top.tickers).toHaveLength(3);
  });

  it("why: explains the verdict with the failed checks", () => {
    const r = ask(`Why is ${watch.ticker} on watch?`);
    expect(r.blocks).toEqual([{ kind: "checks", ticker: watch.ticker }]);
    for (const k of watch.model!.checks.filter((k) => k.pass === false)) expect(r.text).toContain(k.label);
  });

  it("why: a pass that still fails a scored check says so", () => {
    if (!passWithFail) return;
    const r = ask(`Why does ${passWithFail.ticker} pass?`);
    expect(r.text).toMatch(/still passes/);
  });

  it("why: a failed must-pass check is called out", () => {
    const r = ask(`Why is ${reject.ticker} rejected?`);
    const gate = reject.model!.checks.find((k) => k.kind === "gate" && k.pass === false);
    if (gate) expect(r.text).toMatch(/must-pass/);
  });

  it("uses the open company when the question names none", () => {
    expect(ask("Why?", { view: "companies", ticker: watch.ticker }).blocks).toEqual([{ kind: "checks", ticker: watch.ticker }]);
    expect(ask("What about debt?", { view: "companies", ticker: pick.ticker }).blocks).toEqual([{ kind: "metric", ticker: pick.ticker, metricId: "netDebtToEbitda" }]);
  });

  it("a company alone gives an overview card", () => {
    expect(ask(pick.ticker).blocks).toEqual([{ kind: "company", ticker: pick.ticker }]);
  });

  it("says when it can't answer, and names tickers it doesn't know", () => {
    expect(ask("What's the weather?").text).toMatch(/can't answer that from this data/);
    expect(ask("Tell me about MSFT").text).toMatch(/MSFT\*\* isn't in this data/);
  });
});

describe("notices", () => {
  it("a company note gives result, rank and a Show me action", () => {
    const r = notice(ds, snap, { view: "companies", ticker: pick.ticker })!;
    expect(r.text).toContain(`ranked 1st of ${tested.length}`.replace("1st", ["1st", "2nd", "3rd"][pick.model!.rank - 1] ?? `${pick.model!.rank}th`));
    expect(r.actions[0]).toMatchObject({ kind: "highlight", label: "Show me" });
  });

  it("flags a holding the index labels with the wrong country", () => {
    const relabelled = index.positions.find((p) => by(p.ticker) && by(p.ticker).hqCountry !== p.countryCode);
    if (!relabelled) return;
    expect(notice(ds, snap, { view: "companies", ticker: relabelled.ticker })!.text).toMatch(/labels/);
  });

  it("every view but the start page has a note with a Show me action", () => {
    for (const view of ["recommendation", "companies", "map", "index", "test"] as const) {
      expect(notice(ds, snap, { view })!.actions[0].label).toBe("Show me");
    }
    expect(notice(ds, snap, { view: "start" })).toBeNull();
  });
});
