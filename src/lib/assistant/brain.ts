// The guide's "brain": scripted answers assembled only from data/companies.json and
// data/indexes.json. No model, no network, no invented numbers: every figure in a reply
// is formatted from a dataset value, a check, or a completeIndex() output.
// Pure functions, so the route can stream them and the tests can check them.

import type { Company, Dataset, Deal, IndexDef, IndexSnapshot, MetricDef } from "@contract/types";
import { formatValue, pct, recStyle, verdictStyle } from "@/lib/format";
import { ordinal, ranking, scoredMetrics } from "@/lib/rank";
import { completeIndex, sharePct, type Addition, type IndexState } from "@/lib/indexMath";
import { proveEngine } from "../../../engine/proof";
import type { Action, Block, GuideContext, Reply, View } from "./types";

/** Source id for the organizers' live index (data/indexes.json); it is not in Dataset.sources. */
export const INDEX_SOURCE = "@index";

// ───────────────────────── Shared helpers (the panel uses these too) ─────────────────────────

export function findIndex(ds: Dataset, snap: IndexSnapshot): IndexDef | undefined {
  return snap.indexes.find((i) => i.name === ds.indexName) ?? snap.indexes[0];
}

/** Companies the model tested, best rank first. */
export function testedCompanies(ds: Dataset): Company[] {
  return ds.companies.filter((c) => c.model).sort((a, b) => a.model!.rank - b.model!.rank);
}

/** The model's picks, as completeIndex additions. */
export function modelAdditions(ds: Dataset): Addition[] {
  return ds.companies
    .filter((c) => c.verdict === "add" && !c.inIndex && c.proposedWeightPct != null)
    .map((c) => ({ ticker: c.ticker, name: c.name, weightPct: c.proposedWeightPct!, countryCode: c.hqCountry, subSector: c.subSector }));
}

/** Our headquarters data corrects the organizers' country labels. */
export function countryOverrides(ds: Dataset): Record<string, string> {
  return Object.fromEntries(ds.companies.map((c) => [c.ticker, c.hqCountry]));
}

/** A weight in percent with trailing zeros dropped: 4.10 -> "4.1%". */
export function trimPct(v: number): string {
  return pct(v, 2).replace(/\.?0+%$/, "%");
}

/** Where a company sits on one metric among every tested company with data (1 = first in ranking order). */
export function rankOn(ds: Dataset, c: Company, def: MetricDef): { pos: number; n: number } | null {
  const withData = ranking(testedCompanies(ds), def).filter((x) => x.metrics[def.id]?.value != null);
  const i = withData.findIndex((x) => x.ticker === c.ticker);
  return i < 0 ? null : { pos: i + 1, n: withData.length };
}

/** "1st best of 19", or "3rd highest of 20" when the metric has no better direction. */
export function rankPhrase(def: MetricDef, r: { pos: number; n: number }): string {
  return `${ordinal(r.pos)} ${def.higherIsBetter == null ? "highest" : "best"} of ${r.n}`;
}

const ISO = /^\d{4}-\d{2}-\d{2}/;

/** When a deal happened, as the filing gives it. */
export function dealWhen(d: Deal): string {
  if (d.date && ISO.test(d.date)) return d.date.slice(0, 10);
  return d.periodLabel ?? d.date ?? (d.fiscalYear != null ? `FY${d.fiscalYear}` : "Undated");
}

/** A sortable key from an ISO date, "Q4 2026", "H1 2026", "9M 2025" or a fiscal year; "" when undated. */
function dealKey(d: Deal): string {
  if (d.date && ISO.test(d.date)) return d.date.slice(0, 10);
  const label = `${d.periodLabel ?? ""} ${d.date ?? ""}`;
  let m = label.match(/Q([1-4])\s*(\d{4})/i);
  if (m) return `${m[2]}-${String((Number(m[1]) - 1) * 3 + 1).padStart(2, "0")}-01`;
  m = label.match(/H([12])\s*(\d{4})/i);
  if (m) return `${m[2]}-${m[1] === "1" ? "01" : "07"}-01`;
  m = label.match(/(\d{4})/);
  if (m) return `${m[1]}-01-01`;
  return d.fiscalYear != null ? `${d.fiscalYear}-01-01` : "";
}

/** Deals newest first, with exact repeats (same type, date and counterparty) dropped. */
export function sortedDeals(c: Company): Deal[] {
  const seen = new Set<string>();
  const unique: Deal[] = [];
  for (const d of c.deals ?? []) {
    const k = `${d.type}|${dealWhen(d)}|${(d.counterparty ?? "").trim().toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(d);
  }
  return unique
    .map((d, i) => ({ d, i, k: dealKey(d) }))
    .sort((a, b) => (a.k === b.k ? a.i - b.i : a.k === "" ? 1 : b.k === "" ? -1 : a.k < b.k ? 1 : -1))
    .map((x) => x.d);
}

export function dealTitle(d: Deal): string {
  return d.counterparty ?? (d.type === "divestiture" ? "Divestiture, buyer not named" : "Acquisition, target not named");
}

// ───────────────────────── Reading the question ─────────────────────────

/** Tickers that are also everyday words (English or French) match only when typed in capitals. */
const COMMON_WORDS = new Set(["a", "i", "are", "j", "toi", "bro", "pool", "ame", "it", "on", "in", "at", "be", "all", "any", "one", "now", "see", "key", "win", "has", "for", "can", "new", "low", "top", "big", "so", "or", "and", "the"]);
const NAME_STOP = new Set(["pool", "waste", "brown", "bending", "global", "group"]);
const NAME_SUFFIX = /\b(group|international|global|corporation|corp|incorporated|inc|technologies|technology|solutions|software|holdings|limited|ltd|plc|company)\b\.?/g;
/** Capitalised words that are not tickers, so "FCF" is never reported as an unknown company. */
const ACRONYMS = new Set(["FCF", "EBITDA", "ROIC", "ROE", "ROA", "CAGR", "TSX", "NYSE", "NASDAQ", "USD", "CAD", "EUR", "CA", "US", "IT", "IE", "AI", "OK", "MD", "ETF", "CEO", "CFO", "IPO", "ESG", "EPS", "PE", "FY", "YOY", "TTM", "API", "SEDAR", "LTM", "GAAP", "IFRS", "EV", "DCF", "WACC", "NAV", "UK", "USA", "FAQ", "CSV", "PDF", "HQ", "MA"]);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function aliases(c: Company): string[] {
  const full = c.name.toLowerCase();
  const out = new Set([full, full.replace(/ & /g, " and ")]);
  const core = full.replace(/\.com\b/, "").replace(NAME_SUFFIX, "").replace(/\s+/g, " ").trim();
  if (core.length >= 3 && !NAME_STOP.has(core)) out.add(core);
  return [...out];
}

/** Companies named in the question, by ticker or name, in the order they appear. */
export function findTickers(ds: Dataset, raw: string): string[] {
  const lower = raw.toLowerCase();
  const hits: [number, string][] = [];
  for (const c of ds.companies) {
    const exact = COMMON_WORDS.has(c.ticker.toLowerCase());
    let at = raw.search(new RegExp(`(?<![A-Za-z0-9])${esc(c.ticker)}(?![A-Za-z0-9])`, exact ? "" : "i"));
    for (const a of aliases(c)) {
      const m = lower.search(new RegExp(`(?<![a-z0-9])${esc(a)}(?![a-z0-9])`));
      if (m >= 0 && (at < 0 || m < at)) at = m;
    }
    if (at >= 0) hits.push([at, c.ticker]);
  }
  return hits.sort((a, b) => a[0] - b[0]).map(([, t]) => t);
}

/** Capitalised words that look like tickers but are not in the data. */
function unknownTickers(ds: Dataset, raw: string): string[] {
  const known = new Set(ds.companies.map((c) => c.ticker));
  return [...new Set((raw.match(/\b[A-Z]{2,5}\b/g) ?? []).filter((t) => !known.has(t) && !ACRONYMS.has(t) && !COMMON_WORDS.has(t.toLowerCase())))];
}

const METRIC_HINTS: [RegExp, string][] = [
  [/\borganic\b/, "organicGrowth"],
  [/\bacquisition (spend|spending|intensity|pace)\b|\bintensity\b|\bspend(s|ing)?\b.*\bacquisitions?\b|\bacquisitions? ÷|\bhow much\b.*\bspend/, "acqIntensity"],
  [/\bshare count\b|\bdilut|\bshares? (issued|outstanding)\b|\bbuybacks?\b|\bnew shares\b/, "shareCountChange"],
  [/\b(fcf|free cash flow)\b|\bper.share\b|\bowners?\b/, "fcfPerShareCagr"],
  [/\bnet debt\b|\bdebt\b|\bleverage\b|\bebitda\b|\bborrow/, "netDebtToEbitda"],
  [/\breturn on capital\b|\broic\b|\bcash return\b|\breturns?\b/, "cashReturn"],
  [/\brevenue\b|\bsales\b|\btop.line\b/, "revenueCagr"],
];

/** The metric a question is about: a label from the data first, then everyday words. */
export function findMetric(ds: Dataset, lower: string): MetricDef | null {
  const byLabel = ds.metricDefs
    .flatMap((d) => [d.label, d.short].filter((s): s is string => !!s).map((s) => ({ d, s: s.toLowerCase() })))
    .filter(({ s }) => lower.includes(s))
    .sort((a, b) => b.s.length - a.s.length)[0];
  if (byLabel) return byLabel.d;
  for (const [re, id] of METRIC_HINTS) {
    const d = ds.metricDefs.find((m) => m.id === id);
    if (d && re.test(lower)) return d;
  }
  return null;
}

/** A weight the person typed: "4.1%", or "at 4.1". */
export function findWeight(raw: string): number | null {
  const m = raw.match(/(\d+(?:\.\d+)?)\s*%/) ?? raw.match(/\b(?:at|with|weight(?:ed)?(?: of)?)\s+(\d+(?:\.\d+)?)\b/i);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

const RE = {
  help: /^(help|\?+|hi|hello|hey)\W*$|\bwhat can (you|i)\b|\bhow (do|does|can) (i|you) (use|ask)\b|\bwho are you\b|\bwhat are you\b/,
  advice: /\bshould (i|we)\b.*\b(buy|sell|invest|hold|own|short|get)\b|\b(is|are)\b.*\b(a )?(good |great |bad |strong )?(buy|sell|investment)\b|\bbuy or sell\b|\bworth (buying|investing|owning)\b|\bprice target\b|\bwill\b.*\b(go up|rise|fall|drop|crash)\b|\b(under|over)valued\b|\binvestment advice\b/,
  rules: /\bhow (does|do) (the|your|this) (model|scor|rank|rat)|\bhow (is|are) .*\b(scored|ranked|rated|decided|chosen|picked|weighted|set)\b|\brules?\b|\bmethodology\b|\bcriteria\b|\bscoring\b|\bhow does (it|this) work\b|\bhow (do|did) you (decide|pick|choose|score|rank)\b|\bwhat are the checks\b|\bhow .*\bweights?\b/,
  whatIf: /\bwhat if\b|\bwhat happens if\b|\bsimulate\b|\bscenario\b/,
  addVerb: /\b(add|adding|include|including)\b/,
  why: /\bwhy\b|\breasons?\b|\bverdict\b|\brated?\b|\bresult\b|\bon watch\b|\brejected?\b|\bfail(s|ed|ing)?\b|\bpass(es|ed|ing)?\b|\bchecks?\b|\bscored?\b|\bscores\b/,
  compare: /\bcompare\b|\bvs\.?\b|\bversus\b|\bbetter\b|\bdifference\b|\bagainst\b|\bwith\b/,
  deals: /\bdeals?\b|\bbought\b|\bacquired\b|\bpurchas|\bm&a\b|\bdivest|\btakeovers?\b|\b(latest|recent|last|biggest|newest|which|what|list)\b.*\bacquisitions?\b|\bacquisitions?\b.*\b(made|done|did|has|list)\b|\btimeline\b/,
  map: /\bmap\b|\bzones?\b|\bquadrant\b|\bscatter\b|\b(top|bottom).(right|left)\b|\bwhere (does|do|is|are|did)\b/,
  explain: /\bwhat (is|are|does)\b|\bwhat's\b|\bexplain\b|\bdefine\b|\bdefinition\b|\bmean(s|ing)?\b|\bhow (is|are) .*\b(calculated|computed|measured|worked out)\b|\bformula\b/,
  index: /\bindex\b|\bportfolio\b|\bholdings\b|\bcanadian (share|weight|exposure)\b|\bcash (level|position|left|weight)\b/,
  overview: /\boverview\b|\bsummar|\btell me\b|\babout\b|\bmore\b|\bprofile\b|\bsnapshot\b|\bhow('s| is) (it|this|that)\b|\bdoing\b|\bshow me\b/,
  pronoun: /\b(it|its|it's|this|they|their|them)\b/,
  collective: /\b(which|who|list|show|any|companies|names|ones|stocks|top|best|worst|bottom|leaders?|holdings|candidates|everyone|all)\b/,
  rank: /\b(top|best|highest|lowest|worst|bottom|leaders?|leads?|leading|rank(ing|ed)?)\b/,
};

// ───────────────────────── Building a reply ─────────────────────────

interface W {
  ds: Dataset;
  snap: IndexSnapshot;
  index: IndexDef | undefined;
  tested: Company[];
  by: Map<string, Company>;
}

function world(ds: Dataset, snap: IndexSnapshot): W {
  return { ds, snap, index: findIndex(ds, snap), tested: testedCompanies(ds), by: new Map(ds.companies.map((c) => [c.ticker, c])) };
}

class Out {
  steps: string[] = [];
  paras: string[] = [];
  blocks: Block[] = [];
  src = new Set<string>();
  actions: Action[] = [];
  suggestions: string[] = [];
  step(s: string) { this.steps.push(s); return this; }
  say(...lines: (string | false | null | undefined)[]) {
    const l = lines.filter((x): x is string => !!x);
    if (l.length) this.paras.push(l.join("\n"));
    return this;
  }
  block(b: Block) { this.blocks.push(b); return this; }
  sources(ids: Iterable<string>) { for (const id of ids) this.src.add(id); return this; }
  act(a: Action | null | undefined) { if (a && !this.actions.some((x) => JSON.stringify(x) === JSON.stringify(a))) this.actions.push(a); return this; }
  suggest(list: string[], asked = "") {
    const seen = new Set([asked.trim().toLowerCase()]);
    for (const s of list) {
      const k = s.toLowerCase();
      if (!seen.has(k)) { seen.add(k); this.suggestions.push(s); }
    }
    this.suggestions = this.suggestions.slice(0, 4);
    return this;
  }
  done(): Reply {
    return { steps: this.steps, text: this.paras.join("\n\n"), blocks: this.blocks, sourceIds: [...this.src], actions: this.actions, suggestions: this.suggestions };
  }
}

const chip = (t: string) => `[[${t}]]`;
const b = (s: string) => `**${s}**`;
const chips = (ts: string[]) => joinAnd(ts.map(chip));
function joinAnd(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
const defOf = (w: W, id: string) => w.ds.metricDefs.find((d) => d.id === id);
const val = (w: W, c: Company, id: string) => formatValue(c.metrics[id]?.value, defOf(w, id)?.unit ?? "pct");
const recLabel = (c: Company) => (c.model ? recStyle[c.model.recommendation].label : "Not tested");

function metricSources(c: Company, ids?: string[]): string[] {
  const keys = ids ?? Object.keys(c.metrics);
  return [...new Set(keys.flatMap((k) => c.metrics[k]?.sourceIds ?? []))];
}

function checkSources(c: Company): string[] {
  return metricSources(c, [...new Set(c.model?.checks.map((k) => k.metricId) ?? [])]);
}

/** "Passes, rank 1 of 20, 4 of 4 scored checks passed" */
function modelLine(w: W, c: Company): string {
  const m = c.model;
  if (!m) return "not tested by the model";
  return `${b(recLabel(c))}, rank ${m.rank} of ${w.tested.length}, ${m.passed} of ${m.available} scored checks passed`;
}

function verdictLine(w: W, c: Company): string {
  if (c.inIndex) {
    const pos = w.index?.positions.find((p) => p.ticker === c.ticker);
    return pos ? `Already held in the index at ${pct(pos.weightPct, 2)}.` : "Already held in the index.";
  }
  const v = verdictStyle[c.verdict].label;
  const who = c.verdictSource === "human" ? "set by a person" : "set by the model";
  if (c.verdict === "add" && c.proposedWeightPct != null) return `Verdict: ${b(v)} at ${trimPct(c.proposedWeightPct)} of the index (${who}).`;
  return `Verdict: ${b(v)} (${who}).`;
}

function failedChecks(w: W, c: Company): string[] {
  return (c.model?.checks ?? []).filter((k) => k.pass === false).map((k) => `${k.label} (${val(w, c, k.metricId)})`);
}

/** The scored metric (with a better direction) where the company ranks highest. */
function strongest(w: W, c: Company): { def: MetricDef; r: { pos: number; n: number } } | null {
  let best: { def: MetricDef; r: { pos: number; n: number } } | null = null;
  for (const def of scoredMetrics(w.ds).filter((d) => d.higherIsBetter != null)) {
    const r = rankOn(w.ds, c, def);
    if (r && (!best || r.pos < best.r.pos)) best = { def, r };
  }
  return best;
}

/** One full slot: the largest model weight (companies that share a slot each get a fraction of it). */
function slotWeight(w: W): number | undefined {
  const weights = modelAdditions(w.ds).map((a) => a.weightPct).filter((x): x is number => x != null);
  return weights.length ? Math.max(...weights) : undefined;
}

function whyQuestion(c: Company): string {
  if (!c.inIndex && c.verdict === "watch") return `Why is ${c.ticker} on watch?`;
  if (!c.inIndex && c.verdict === "reject") return `Why is ${c.ticker} rejected?`;
  if (!c.inIndex && c.verdict === "add") return `Why does the model add ${c.ticker}?`;
  const r = c.model?.recommendation;
  return r === "pass" ? `Why does ${c.ticker} pass?` : r === "fail" ? `Why does ${c.ticker} fail?` : `Why is ${c.ticker} mixed?`;
}

/** The closest-ranked company in the same group (candidates with candidates, holdings with holdings). */
function peerOf(w: W, c: Company): Company | undefined {
  const group = w.tested.filter((x) => x.inIndex === c.inIndex && x.ticker !== c.ticker);
  const r = c.model?.rank ?? 0;
  return [...group].sort((a, b) => Math.abs(a.model!.rank - r) - Math.abs(b.model!.rank - r))[0];
}

function companySuggestions(w: W, c: Company): string[] {
  const s = [whyQuestion(c)];
  s.push(c.deals?.length ? `Show ${c.ticker}'s deals` : `Where is ${c.ticker} on the map?`);
  const peer = peerOf(w, c);
  if (peer) s.push(`Compare ${c.ticker} and ${peer.ticker}`);
  const slot = slotWeight(w);
  if (!c.inIndex && c.verdict !== "add" && slot != null) s.push(`What if we add ${c.ticker} at ${trimPct(slot)}?`);
  else s.push(`Where is ${c.ticker} on the map?`);
  return s;
}

function viewSuggestions(w: W, view: View): string[] {
  const watch = w.ds.companies.find((c) => !c.inIndex && c.verdict === "watch");
  const reject = w.ds.companies.find((c) => !c.inIndex && c.verdict === "reject");
  const add = w.ds.companies.find((c) => !c.inIndex && c.verdict === "add");
  const slot = slotWeight(w);
  const growth = scoredMetrics(w.ds).find((d) => d.higherIsBetter === true);
  const xDef = defOf(w, w.ds.map.x);
  const whatIf = watch && slot != null ? `What if we add ${watch.ticker} at ${trimPct(slot)}?` : null;
  const lists: Record<View, (string | null | undefined)[]> = {
    start: [add && whyQuestion(add), "How does the model work?", whatIf, "Which companies pass the model?"],
    recommendation: [add && whyQuestion(add), "How is the weight set?", whatIf, "How does the model work?"],
    companies: ["Which companies pass the model?", watch && whyQuestion(watch), growth && `Top 5 on ${growth.short ?? growth.label}`, "How does the model work?"],
    map: ["Who sits top-right?", add && `Where is ${add.ticker} on the map?`, xDef && `What is ${(xDef.short ?? xDef.label).toLowerCase()}?`, "Explain the map"],
    index: [whatIf, "Which holdings fail the model?", "How is the weight set?", "What's in the index?"],
    xray: [reject && whyQuestion(reject), add && whyQuestion(add), "How does the model work?", "Which companies pass the model?"],
  };
  return lists[view].filter((x): x is string => !!x);
}

function contextSuggestions(w: W, ctx: GuideContext): string[] {
  const here = ctx.ticker ? w.by.get(ctx.ticker) : undefined;
  return here ? companySuggestions(w, here) : viewSuggestions(w, ctx.view);
}

// ───────────────────────── Intents ─────────────────────────

function help(w: W, ctx: GuideContext, asked: string): Reply {
  return new Out()
    .step("Read what I can answer from")
    .say(`I'm the Guide, a scripted demo. Every answer is assembled from this site's own data: the ${w.ds.companies.length} companies in the dataset and the organizers' live index. There is no AI model behind me, so I can't invent a number.`)
    .say(
      "You can ask me:",
      "• About one company: why it got its result, one of its metrics, its deals, where it sits on the map",
      "• To compare two or three companies",
      "• For a list: who passes, who fails a check, the top names on a metric",
      "• What if: add a company at a weight and see the index change",
      "• How the model works, or what a metric means",
    )
    .say("I follow you around the site and point things out as you go. Press ⌘K to open or close me.")
    .suggest([...contextSuggestions(w, ctx), "How does the model work?"], asked)
    .done();
}

function advice(w: W, c: Company | undefined, ctx: GuideContext, asked: string): Reply {
  const o = new Out().step("Spotted a request for investment advice");
  o.say("I can't give investment advice: I'm a demo that explains what this site's model says, not whether to buy or sell anything.");
  if (c) {
    o.step(`Read ${c.ticker}'s ${c.model?.checks.length ?? 0} checks`);
    o.say(`Here is how the model rates ${chip(c.ticker)}: ${modelLine(w, c)}.`, verdictLine(w, c));
    o.block({ kind: "checks", ticker: c.ticker }).sources(checkSources(c));
    o.suggest([whyQuestion(c), "How does the model work?", ...companySuggestions(w, c)], asked);
  } else {
    o.suggest(["How does the model work?", ...contextSuggestions(w, ctx)], asked);
  }
  return o.done();
}

function rules(w: W, ctx: GuideContext, asked: string): Reply {
  const checks = w.tested[0]?.model?.checks ?? [];
  const gates = checks.filter((k) => k.kind === "gate");
  const scored = checks.filter((k) => k.kind === "score");
  const o = new Out().step("Read the model's declared rules").step(`Listed its ${checks.length} checks`);
  o.say(`The model tests every company against the same ${checks.length} checks, read from the engine's config.`);
  if (gates.length) o.say(`Must pass (${gates.length}):`, ...gates.map((k) => `• ${k.label}`));
  if (scored.length) o.say(`Scored (${scored.length}):`, ...scored.map((k) => `• ${k.label}`));
  if (w.ds.rules) o.say(`${b("Results.")} ${w.ds.rules.result}`).say(`${b("Weights.")} ${w.ds.rules.weight}`);
  o.block({ kind: "rules" });
  o.act({ kind: "view", view: "companies", label: "See every result" });
  o.suggest([...contextSuggestions(w, ctx), "Which companies pass the model?"], asked);
  return o.done();
}

function modelView(w: W, c: Company): string {
  const failed = failedChecks(w, c);
  const v = c.inIndex ? "already held" : `verdict ${b(verdictStyle[c.verdict].label)}`;
  return `The model's view of ${chip(c.ticker)}: ${b(recLabel(c))}, rank ${c.model?.rank ?? "–"} of ${w.tested.length}, ${v}.${failed.length ? ` Failed: ${failed.join("; ")}.` : " Failed checks: none."}`;
}

function whatIf(w: W, c: Company, weight: number | null, ctx: GuideContext, asked: string): Reply {
  const o = new Out();
  const index = w.index;
  if (!index) return o.say("I can't find the organizers' index in the data, so I can't run that.").done();
  o.step(`Read the organizers' index (${index.positions.length} holdings)`);
  o.sources([INDEX_SOURCE]);
  const slot = slotWeight(w);
  const picks = modelAdditions(w.ds);

  const held = index.positions.find((p) => p.ticker === c.ticker);
  if (held) {
    o.say(`${chip(c.ticker)} is already held at ${pct(held.weightPct, 2)} of the index, so there is nothing to add.`, modelView(w, c));
    o.block({ kind: "checks", ticker: c.ticker }).sources(checkSources(c));
    const cand = w.ds.companies.find((x) => !x.inIndex && x.verdict !== "add");
    o.suggest([cand && slot != null ? `What if we add ${cand.ticker} at ${trimPct(slot)}?` : "What's in the index?", whyQuestion(c), "How is the weight set?"], asked);
    return o.done();
  }

  const isPick = picks.find((p) => p.ticker === c.ticker);
  const wt = weight ?? isPick?.weightPct ?? null;
  if (wt == null) {
    o.step(`Read ${c.ticker}'s model result`);
    o.say(
      `What weight should I try for ${chip(c.ticker)}? The model proposes no weight for it.`,
      slot != null ? `Each of the model's picks gets ${trimPct(slot)}; try that, or type your own.` : "Type a weight, like the ones on the Index page.",
    );
    o.say(modelView(w, c));
    o.sources(checkSources(c));
    o.suggest([slot != null ? `What if we add ${c.ticker} at ${trimPct(slot)}?` : "How is the weight set?", whyQuestion(c), "How is the weight set?"], asked);
    return o.done();
  }
  if (!(wt > 0) || wt > 100) {
    o.say(`That weight doesn't work: it has to be more than zero and no more than the whole index.`);
    o.suggest(slot != null ? [`What if we add ${c.ticker} at ${trimPct(slot)}?`] : [], asked);
    return o.done();
  }

  const overrides = countryOverrides(w.ds);
  const mine: Addition = { ticker: c.ticker, name: c.name, weightPct: wt, countryCode: c.hqCountry, subSector: c.subSector };
  const scenario = [...picks.filter((p) => p.ticker !== c.ticker), mine];
  const base = completeIndex(index, [], overrides);
  const model = completeIndex(index, picks, overrides);
  const yours = completeIndex(index, scenario, overrides);
  const ca = (s: IndexState) => pct(sharePct(s, "CA"));
  const trimmed = yours.after.cashPct === 0 && scenario.reduce((s, a) => s + a.weightPct, 0) > index.cashPct;
  o.step(`Ran completeIndex: the model's ${picks.length} picks, then with ${c.ticker} at ${trimPct(wt)}`);

  const pickNames = picks.length ? `${chips(picks.map((p) => p.ticker))} at ${joinAnd([...new Set(picks.map((p) => trimPct(p.weightPct)))])}${picks.length > 1 ? " each" : ""}` : "none";
  if (isPick) {
    o.say(`${chip(c.ticker)} is already one of the model's picks at ${trimPct(isPick.weightPct)}. Here it is at ${trimPct(wt)}, with the other picks unchanged.`);
  } else {
    o.say(`Here is the index with ${chip(c.ticker)} added at ${trimPct(wt)}, on top of the model's picks (${pickNames}).`);
  }
  o.say(
    `• Canadian share: ${ca(base.before)} today → ${ca(model.after)} with the model's picks → ${ca(yours.after)} with yours.`,
    `• Cash: ${pct(base.before.cashPct)} → ${pct(model.after.cashPct)} → ${pct(yours.after.cashPct)}.`,
    trimmed
      ? "• Cash runs out, so every current holding is trimmed in proportion to pay for it."
      : "• Cash covers it: no current holding is trimmed.",
  );
  o.say(modelView(w, c));
  if (base.relabels.length) {
    o.say(`"Today" already counts ${joinAnd(base.relabels.map((r) => `${chip(r.ticker)} as ${r.actual}: the index labels it ${r.labelled}`))}.`);
  }
  o.block({ kind: "whatif", additions: scenario.map((a) => ({ ticker: a.ticker, weightPct: a.weightPct })) });
  o.sources(checkSources(c));
  o.act({ kind: "view", view: "index", label: "Open the Index page" });
  o.act({ kind: "open", ticker: c.ticker, label: `Open ${c.ticker}` });
  o.suggest([whyQuestion(c), `Compare ${c.ticker} and ${picks[0]?.ticker ?? peerOf(w, c)?.ticker ?? c.ticker}`, "How is the weight set?", ...contextSuggestions(w, ctx)], asked);
  return o.done();
}

function indexSummary(w: W, ctx: GuideContext, asked: string): Reply {
  const o = new Out();
  const index = w.index;
  if (!index) return o.say("I can't find the organizers' index in the data.").done();
  const overrides = countryOverrides(w.ds);
  const picks = modelAdditions(w.ds);
  const { before, after, relabels } = completeIndex(index, picks, overrides);
  o.step(`Read the organizers' index (${index.positions.length} holdings)`).step(`Ran completeIndex with the model's ${picks.length} picks`);
  const caRows = before.rows.filter((r) => r.countryCode === "CA").map((r) => r.ticker);
  const top = [...index.positions].sort((a, b) => b.weightPct - a.weightPct).slice(0, 3);
  o.say(`The organizers' ${b(index.name)} index holds ${index.positions.length} positions and ${pct(index.cashPct)} cash (holdings as of ${new Date(w.snap.updatedAt).toLocaleDateString("en-CA")}).`);
  o.say(
    `• Canadian today: ${pct(sharePct(before, "CA"))}${caRows.length ? ` (${chips(caRows)})` : ""}.`,
    picks.length
      ? `• With the model's picks (${chips(picks.map((p) => p.ticker))}): Canadian ${pct(sharePct(after, "CA"))}, cash ${pct(after.cashPct)}.`
      : "• The model adds no company.",
    `• Largest holdings: ${top.map((p) => `${chip(p.ticker)} ${pct(p.weightPct, 2)}`).join(", ")}.`,
  );
  if (relabels.length) o.say(relabels.map((r) => `The index labels ${chip(r.ticker)} ${r.labelled}, but it is headquartered in ${r.actual}, so I count it as ${r.actual}.`).join(" "));
  o.block({ kind: "whatif", additions: picks.map((a) => ({ ticker: a.ticker, weightPct: a.weightPct })) });
  o.sources([INDEX_SOURCE]);
  o.act({ kind: "highlight", target: "index", view: "index", label: "Show me" });
  o.suggest([...viewSuggestions(w, "index"), ...contextSuggestions(w, ctx)], asked);
  return o.done();
}

function compare(w: W, tickers: string[], ctx: GuideContext, asked: string): Reply {
  const cs = tickers.map((t) => w.by.get(t)).filter((c): c is Company => !!c).slice(0, 3);
  const o = new Out().step(`Read ${joinAnd(cs.map((c) => c.ticker))} side by side`).step(`Ranked them against ${w.tested.length} companies`);
  // Who leads on each scored metric that has a better direction. The card below shows every value.
  const leads = new Map<string, string[]>();
  const level: string[] = [];
  for (const def of scoredMetrics(w.ds)) {
    const have = cs.filter((c) => c.metrics[def.id]?.value != null);
    if (def.higherIsBetter == null || have.length < 2) continue;
    const name = def.short ?? def.label;
    const sign = def.higherIsBetter ? -1 : 1;
    const sorted = [...have].sort((a, b) => sign * (a.metrics[def.id].value! - b.metrics[def.id].value!));
    const lead = sorted[0];
    if (formatValue(sorted[1].metrics[def.id].value, def.unit) === formatValue(lead.metrics[def.id].value, def.unit)) level.push(name);
    else leads.set(lead.ticker, [...(leads.get(lead.ticker) ?? []), name]);
  }
  o.say(
    `${joinAnd(cs.map((c) => chip(c.ticker)))}, side by side:`,
    ...cs.filter((c) => leads.has(c.ticker)).map((c) => `• ${chip(c.ticker)} leads on ${joinAnd(leads.get(c.ticker)!)}.`),
    ...cs.filter((c) => !leads.has(c.ticker)).map((c) => `• ${chip(c.ticker)} leads on none of the scored metrics.`),
    level.length ? `• Level on ${joinAnd(level)}.` : "",
  );
  o.say(`Model ranks: ${cs.map((c) => `${chip(c.ticker)} ${c.model ? `${ordinal(c.model.rank)} (${recLabel(c)})` : "not tested"}`).join(", ")}.`);
  const weightRule = w.ds.rules?.weight
    .split(/(?<=\.)\s+/)
    .find((s) => cs.length >= 2 && cs.every((c) => new RegExp(`(?<![A-Za-z])${esc(c.ticker)}(?![A-Za-z])`).test(s)));
  if (weightRule) o.say(`From the weight rule: "${weightRule}"`);
  o.block({ kind: "compare", tickers: cs.map((c) => c.ticker) });
  for (const c of cs) o.sources(checkSources(c));
  for (const c of cs) if (c.ticker !== ctx.ticker) o.act({ kind: "open", ticker: c.ticker, label: `Open ${c.ticker}` });
  o.suggest([...cs.map(whyQuestion), ...companySuggestions(w, cs[0])], asked);
  return o.done();
}

function deals(w: W, c: Company, ctx: GuideContext, asked: string): Reply {
  const list = sortedDeals(c);
  const o = new Out();
  if (!list.length) {
    o.step(`Looked for ${c.ticker}'s deal list`);
    o.say(
      `The data pack has no deal list for ${chip(c.ticker)}: deal-by-deal filing quotes cover the Canadian candidates only.`,
      c.history?.length ? "Its yearly spending on acquisitions is in the Acquisitions by year chart on its page." : "",
    );
    if (c.history?.length) o.act({ kind: "highlight", target: "deals", ticker: c.ticker, label: "Show the chart" });
    o.sources(metricSources(c, ["acqIntensity"]));
    o.suggest(companySuggestions(w, c), asked);
    return o.done();
  }
  o.step(`Read ${c.ticker}'s ${list.length} deal records`).step("Sorted them newest first");
  const buys = list.filter((d) => d.type === "acquisition").length;
  const sells = list.length - buys;
  const latest = list[0];
  o.say(
    `${chip(c.ticker)} has ${list.length} deal records in its filings: ${buys} acquisition${buys === 1 ? "" : "s"}${sells ? ` and ${sells} divestiture${sells === 1 ? "" : "s"}` : ""}.`,
    `Latest: ${b(dealTitle(latest))}, ${dealWhen(latest)} (${latest.type}, ${latest.status}).`,
  );
  o.say(`Below are the ${Math.min(5, list.length)} most recent. Open one to read the filing word for word.`);
  o.block({ kind: "deals", ticker: c.ticker, limit: 5 });
  o.sources(metricSources(c, ["acqIntensity"]));
  if (c.ticker !== ctx.ticker) o.act({ kind: "open", ticker: c.ticker, label: `Open ${c.ticker}` });
  o.act({ kind: "highlight", target: "deals", ticker: c.ticker, label: "Show acquisitions by year" });
  o.suggest([`How much does ${c.ticker} spend on acquisitions?`, ...companySuggestions(w, c)], asked);
  return o.done();
}

function zoneOf(w: W, c: Company): keyof Dataset["map"]["zones"] | null {
  const z = Object.entries(w.ds.map.zones).find(([, label]) => label === c.zone);
  return (z?.[0] as keyof Dataset["map"]["zones"]) ?? null;
}

function mapCompany(w: W, c: Company, ctx: GuideContext, asked: string): Reply {
  const { map } = w.ds;
  const xDef = defOf(w, map.x);
  const yDef = defOf(w, map.y);
  const o = new Out().step(`Read ${c.ticker}'s two map metrics`).step("Placed it against the two pass lines");
  if (!xDef || !yDef) return o.say("The map's metrics are missing from the data.").done();
  const zone = zoneOf(w, c);
  if (!zone) {
    const missing = [xDef, yDef].filter((d) => c.metrics[d.id]?.value == null);
    o.say(`${chip(c.ticker)} is not on the map: ${b(c.zone)}.`, ...missing.map((d) => `• ${d.short ?? d.label}: ${c.metrics[d.id]?.note ?? "missing"}`));
  } else {
    const same = w.ds.companies.filter((x) => x.zone === c.zone && x.ticker !== c.ticker).map((x) => x.ticker);
    o.say(
      `${chip(c.ticker)} sits in ${b(c.zone)}.`,
      `• Across, ${xDef.short ?? xDef.label}: ${val(w, c, xDef.id)} (line at ${formatValue(map.xThreshold, xDef.unit)}).`,
      `• Up, ${yDef.short ?? yDef.label}: ${val(w, c, yDef.id)} (line at ${formatValue(map.yThreshold, yDef.unit)}).`,
    );
    if (same.length) o.say(`Also there: ${chips(same)}.`);
  }
  o.sources(metricSources(c, [map.x, map.y]));
  o.act({ kind: "view", view: "map", focus: c.ticker, label: `Show ${c.ticker} on the map` });
  o.suggest(companySuggestions(w, c).filter((s) => !/on the map/.test(s)).concat(["Who sits top-right?"]), asked);
  return o.done();
}

function mapGeneral(w: W, ctx: GuideContext, asked: string): Reply {
  const { map } = w.ds;
  const xDef = defOf(w, map.x);
  const yDef = defOf(w, map.y);
  const o = new Out().step("Read the map's axes and pass lines").step(`Placed ${w.ds.companies.length} companies in their zones`);
  if (!xDef || !yDef) return o.say("The map's metrics are missing from the data.").done();
  const tr = w.ds.companies.filter((c) => c.zone === map.zones.topRight).map((c) => c.ticker);
  o.say(
    `The map plots every company on two numbers:`,
    `• Across: ${b(xDef.label)}, with a line at ${formatValue(map.xThreshold, xDef.unit)}. ${xDef.description}`,
    `• Up: ${b(yDef.label)}, with a line at ${formatValue(map.yThreshold, yDef.unit)}. ${yDef.description}`,
  );
  o.say(`Top-right, ${b(map.zones.topRight)}, is where a serial acquirer should be: ${tr.length ? chips(tr) : "nobody"} (${tr.length}).`);
  o.block({ kind: "list", title: map.zones.topRight, tickers: tr, metricId: map.y });
  o.act({ kind: "highlight", target: "map", view: "map", label: "Show me" });
  if (tr.length) o.act({ kind: "filter", tickers: tr, title: map.zones.topRight, label: "Filter table" });
  o.suggest([...viewSuggestions(w, "map"), ...contextSuggestions(w, ctx)], asked);
  return o.done();
}

function explainMetric(w: W, def: MetricDef, here: Company | undefined, ctx: GuideContext, asked: string): Reply {
  const checks = (w.tested[0]?.model?.checks ?? []).filter((k) => k.metricId === def.id);
  const o = new Out().step(`Read the definition of ${def.short ?? def.label}`).step(`Listed the ${checks.length} check${checks.length === 1 ? "" : "s"} on it`);
  o.say(`${b(def.label)}: ${def.description}`);
  o.say(def.formula && `${b("How.")} ${def.formula}`, def.why && `${b("Why it matters.")} ${def.why}`);
  o.say(
    checks.length
      ? `Checks on it: ${checks.map((k) => `${k.label} (${k.kind === "gate" ? "must pass" : "scored"})`).join("; ")}.`
      : "No check uses it: it is shown for context.",
  );
  const order = ranking(w.tested, def).filter((c) => c.metrics[def.id]?.value != null);
  if (here) {
    const r = rankOn(w.ds, here, def);
    o.say(`On ${chip(here.ticker)}: ${val(w, here, def.id)}${r ? `, ${rankPhrase(def, r)}` : here.metrics[def.id]?.note ? `. ${here.metrics[def.id]!.note}` : ""}.`);
    o.act({ kind: "highlight", target: `metric:${def.id}`, ticker: here.ticker, label: "Show me" });
    o.sources(metricSources(here, [def.id]));
  }
  o.block({ kind: "ranking", metricId: def.id, tickers: order.map((c) => c.ticker), highlight: here?.ticker });
  o.suggest([`Top 5 on ${def.short ?? def.label}`, `Who fails on ${(def.short ?? def.label).toLowerCase()}?`, ...contextSuggestions(w, ctx)], asked);
  return o.done();
}

function why(w: W, c: Company, ctx: GuideContext, asked: string): Reply {
  const m = c.model;
  const o = new Out();
  if (!m) return o.say(`The model did not test ${chip(c.ticker)}.`).done();
  o.step(`Read ${c.ticker}'s ${m.checks.length} checks`).step(`Ranked it against ${w.tested.length} companies`);
  const gates = m.checks.filter((k) => k.kind === "gate");
  const failedGates = gates.filter((k) => k.pass === false);
  const failed = m.checks.filter((k) => k.pass === false && k.kind === "score");
  const noData = m.checks.filter((k) => k.pass === null);
  o.say(
    c.inIndex
      ? `${chip(c.ticker)} is already held in the index. The model still tests it: ${modelLine(w, c)}.`
      : `${chip(c.ticker)}: ${verdictLine(w, c).replace(/^Verdict: /, "verdict ")} The model's result: ${modelLine(w, c)}.`,
  );
  if (failedGates.length) {
    o.say(`It fails a must-pass check, and that alone fails it:`, ...failedGates.map((k) => `• ${k.label}: ${val(w, c, k.metricId)}`));
  } else if (gates.length) {
    o.say(gates.length === 2 ? "Both must-pass checks pass." : "Every must-pass check passes.");
  }
  if (failed.length) o.say(`Failed scored check${failed.length === 1 ? "" : "s"}:`, ...failed.map((k) => `• ${k.label}: ${val(w, c, k.metricId)}`));
  if (noData.length) o.say(`No data, so not counted as a fail: ${noData.map((k) => k.label).join("; ")}.`);
  if (m.recommendation === "pass" && failed.length && w.ds.rules) {
    o.say(`It still passes because of how results are set: ${w.ds.rules.result.split(/(?<=\.)\s+/)[0]}`);
  }
  if (c.verdictSource === "human" && c.reason && !c.inIndex) o.say(`Reason given: ${c.reason}`);
  o.block({ kind: "checks", ticker: c.ticker });
  o.sources(checkSources(c));
  o.act({ kind: "highlight", target: "checks", ticker: c.ticker, label: "Show me" });
  o.act({ kind: "view", view: "xray", focus: c.ticker, label: `X-ray ${c.ticker}` });
  o.suggest([...companySuggestions(w, c).filter((s) => s !== whyQuestion(c)), "How does the model work?"], asked);
  return o.done();
}

function companyMetric(w: W, c: Company, def: MetricDef, ctx: GuideContext, asked: string): Reply {
  const mv = c.metrics[def.id];
  const checks = c.model?.checks.filter((k) => k.metricId === def.id) ?? [];
  const r = rankOn(w.ds, c, def);
  const o = new Out().step(`Read ${c.ticker}'s ${def.short ?? def.label}`);
  if (r) o.step(`Ranked it against ${r.n} companies with data`);
  if (mv?.value == null) {
    o.say(`${chip(c.ticker)} · ${b(def.label)}: missing.`, mv?.note ?? "", "Missing data is never counted as a fail.");
  } else {
    o.say(
      `${chip(c.ticker)} · ${b(def.label)}: ${b(val(w, c, def.id))}${mv.period ? ` (${mv.period})` : ""}.`,
      r ? `It ranks ${rankPhrase(def, r)}${def.higherIsBetter === false ? " (lowest first)" : ""}.` : "",
      mv.note ?? "",
    );
  }
  o.say(checks.length ? checks.map((k) => `Check: ${k.label}, ${k.pass === null ? "no data" : k.pass ? "passed" : "failed"}${k.kind === "gate" ? " (must pass)" : ""}.`).join("\n") : "No check uses this metric.");
  o.block({ kind: "metric", ticker: c.ticker, metricId: def.id });
  o.sources(metricSources(c, [def.id]));
  o.act({ kind: "highlight", target: `metric:${def.id}`, ticker: c.ticker, label: "Show me" });
  o.suggest([`What is ${(def.short ?? def.label).toLowerCase()}?`, `Top 5 on ${def.short ?? def.label}`, ...companySuggestions(w, c)], asked);
  return o.done();
}

function overview(w: W, c: Company, ctx: GuideContext, asked: string): Reply {
  const o = new Out().step(`Read ${c.ticker}'s metrics and ${c.model?.checks.length ?? 0} checks`).step(`Ranked it against ${w.tested.length} companies`);
  const s = strongest(w, c);
  const nDeals = sortedDeals(c).length;
  o.say(
    `${chip(c.ticker)} · ${b(c.name)} (${[c.subSector, `HQ ${c.hqCountry}`, c.listedOn].filter(Boolean).join(", ")}). ${c.inIndex ? "Held in the index." : "Candidate."}`,
  );
  o.say(
    `Model: ${modelLine(w, c)}.`,
    verdictLine(w, c),
    s ? `Strongest metric: ${s.def.short ?? s.def.label}, ${rankPhrase(s.def, s.r)}.` : "",
    `Map zone: ${c.zone}.${nDeals ? ` ${nDeals} deal records in its filings.` : ""}`,
  );
  o.block({ kind: "company", ticker: c.ticker });
  o.sources(metricSources(c));
  if (c.ticker !== ctx.ticker) o.act({ kind: "open", ticker: c.ticker, label: `Open ${c.ticker}` });
  else o.act({ kind: "highlight", target: "summary", ticker: c.ticker, label: "Show me" });
  o.act({ kind: "view", view: "map", focus: c.ticker, label: "Show on map" });
  o.suggest(companySuggestions(w, c), asked);
  return o.done();
}

// ───────────────────────── Screens: lists with no company named ─────────────────────────

function screen(w: W, lower: string, metric: MetricDef | null, ctx: GuideContext, asked: string): Reply | null {
  let pop = w.tested;
  let popName = "companies";
  if (/\bholdings\b|\bin the index\b|\bheld\b/.test(lower)) { pop = pop.filter((c) => c.inIndex); popName = "index holdings"; }
  else if (/\bcanadian\b/.test(lower)) { pop = pop.filter((c) => !c.inIndex && c.hqCountry === "CA"); popName = "Canadian candidates"; }
  else if (/\bcandidates?\b/.test(lower)) { pop = pop.filter((c) => !c.inIndex); popName = "candidates"; }

  const o = new Out();
  const finish = (title: string, tickers: string[], intro: string, opts: { metricId?: string; ranking?: boolean } = {}) => {
    o.step(`Checked ${pop.length} ${popName}`);
    if (tickers.length) {
      o.say(intro);
      o.block(opts.ranking && opts.metricId
        ? { kind: "ranking", metricId: opts.metricId, tickers, highlight: ctx.ticker }
        : { kind: "list", title, tickers, metricId: opts.metricId });
      o.act({ kind: "filter", tickers, title, label: "Filter table" });
    } else {
      o.say(`None of the ${pop.length} ${popName}: nobody matches "${title}".`);
    }
    if (opts.metricId) for (const t of tickers) { const c = w.by.get(t); if (c) o.sources(metricSources(c, [opts.metricId])); }
    o.suggest([...(tickers[0] ? [whyQuestion(w.by.get(tickers[0])!)] : []), ...contextSuggestions(w, ctx)], asked);
    return o.done();
  };

  // Zones of the map
  const zoneWord = lower.match(/\b(top|bottom).(right|left)\b/);
  if (zoneWord) {
    const key = `${zoneWord[1]}${zoneWord[2][0].toUpperCase()}${zoneWord[2].slice(1)}` as keyof Dataset["map"]["zones"];
    const label = w.ds.map.zones[key];
    const ts = pop.filter((c) => c.zone === label).map((c) => c.ticker);
    o.step("Read the map's zones");
    o.act({ kind: "highlight", target: "map", view: "map", label: "Show the map" });
    return finish(label, ts, `${b(label)}: ${chips(ts)} (${ts.length} of ${pop.length} ${popName}).`, { metricId: w.ds.map.y });
  }

  // Top / bottom on a metric
  if (metric && RE.rank.test(lower)) {
    const n = Number(lower.match(/\b(?:top|bottom|best|worst)\s+(\d{1,2})\b/)?.[1] ?? lower.match(/\b(\d{1,2})\s+(?:best|worst|top|highest|lowest)\b/)?.[1] ?? 5);
    const withData = ranking(pop, metric).filter((c) => c.metrics[metric.id]?.value != null);
    let order = withData;
    let how = metric.higherIsBetter == null ? "highest first" : metric.higherIsBetter ? "best first, highest" : "best first, lowest";
    if (/\bhighest\b/.test(lower)) { order = [...withData].sort((a, b) => b.metrics[metric.id].value! - a.metrics[metric.id].value!); how = "highest first"; }
    else if (/\blowest\b/.test(lower)) { order = [...withData].sort((a, b) => a.metrics[metric.id].value! - b.metrics[metric.id].value!); how = "lowest first"; }
    else if (/\b(worst|bottom)\b/.test(lower)) { order = [...withData].reverse(); how = "worst first"; }
    const ts = order.slice(0, Math.max(1, Math.min(n, order.length))).map((c) => c.ticker);
    o.step(`Ranked ${withData.length} ${popName} on ${metric.short ?? metric.label}`);
    const title = `${metric.short ?? metric.label}, ${how}`;
    return finish(title, ts, `${ts.length} ${popName} on ${b(metric.label)} (${how}): ${ts.map((t) => `${chip(t)} ${val(w, w.by.get(t)!, metric.id)}`).join(", ")}.`, { metricId: metric.id, ranking: true });
  }

  // Pass / fail on one metric's check
  const failWord = /\bfail(s|ed|ing)?\b/.test(lower);
  const passWord = /\bpass(es|ed|ing)?\b/.test(lower);
  if (metric && (failWord || passWord)) {
    const want = failWord ? false : true;
    const hits = pop.filter((c) => c.model?.checks.some((k) => k.metricId === metric.id && k.pass === want));
    const checkNames = [...new Set(w.tested[0]?.model?.checks.filter((k) => k.metricId === metric.id).map((k) => k.label) ?? [])];
    if (!checkNames.length) {
      o.step(`Looked for checks on ${metric.short ?? metric.label}`);
      return o.say(`No check uses ${b(metric.label)}, so nobody passes or fails on it. It is shown for context.`).suggest(contextSuggestions(w, ctx), asked).done();
    }
    const title = `${want ? "Pass" : "Fail"} on ${metric.short ?? metric.label}`;
    const detail = hits.map((c) => {
      const ks = c.model!.checks.filter((k) => k.metricId === metric.id && k.pass === want).map((k) => k.label);
      return `${chip(c.ticker)} ${val(w, c, metric.id)}${checkNames.length > 1 ? ` (${ks.join("; ")})` : ""}`;
    });
    return finish(title, hits.map((c) => c.ticker), `${hits.length} of ${pop.length} ${popName} ${want ? "pass" : "fail"} ${checkNames.length > 1 ? "a check" : "the check"} on ${b(metric.short ?? metric.label)} (${checkNames.join("; ")}): ${detail.join(", ")}.`, { metricId: metric.id });
  }

  // The model's overall result
  const mixed = /\bmixed\b/.test(lower);
  if (passWord || failWord || mixed) {
    const rec = mixed ? "mixed" : failWord ? "fail" : "pass";
    const ts = pop.filter((c) => c.model?.recommendation === rec).map((c) => c.ticker);
    const title = `${recStyle[rec].label}: ${popName}`;
    o.step("Read every company's model result");
    return finish(title, ts, `${ts.length} of ${pop.length} ${popName} get ${b(recStyle[rec].label)} from the model: ${chips(ts)}.`);
  }

  // Verdicts on candidates
  const verdict = /\breject/.test(lower) ? "reject" : /\bwatch/.test(lower) ? "watch" : /\b(adds|added|add|picks?|additions?)\b/.test(lower) ? "add" : null;
  if (verdict) {
    const cands = pop.filter((c) => !c.inIndex);
    const ts = cands.filter((c) => c.verdict === verdict).map((c) => c.ticker);
    const title = `Verdict: ${verdictStyle[verdict].label}`;
    o.step("Read every candidate's verdict");
    const extra = verdict === "add" ? ts.map((t) => { const c = w.by.get(t)!; return c.proposedWeightPct != null ? `${chip(t)} at ${trimPct(c.proposedWeightPct)}` : chip(t); }) : ts.map((t) => { const f = failedChecks(w, w.by.get(t)!); return `${chip(t)}${f.length ? ` (failed: ${f.join("; ")})` : ""}`; });
    pop = cands;
    return finish(title, ts, `${ts.length} of ${cands.length} candidates get ${b(verdictStyle[verdict].label)}: ${extra.join(", ")}.`);
  }

  // Just a group, e.g. "Canadian candidates"
  if (popName !== "companies" && popName !== "index holdings" && !/\b(share|weight|exposure)\b/.test(lower)) {
    const ts = pop.map((c) => c.ticker);
    return finish(popName, ts, `${ts.length} ${popName}, best rank first: ${ts.map((t) => { const c = w.by.get(t)!; return `${chip(t)} ${recLabel(c)}${c.inIndex ? "" : `, ${verdictStyle[c.verdict].label}`}`; }).join("; ")}.`);
  }
  return null;
}

function fallback(w: W, raw: string, ctx: GuideContext, asked: string): Reply {
  const unknown = unknownTickers(w.ds, raw);
  const o = new Out().step("Looked for a company, a metric or a list in your question");
  if (unknown.length) {
    o.say(`${joinAnd(unknown.map(b))} ${unknown.length === 1 ? "isn't" : "aren't"} in this data, so I can't answer about ${unknown.length === 1 ? "it" : "them"}.`);
    o.say(`I cover ${w.ds.companies.length} companies: ${chips(w.tested.map((c) => c.ticker))}.`);
  } else {
    o.say("I can't answer that from this data.");
    o.say(`I only know what this site shows: ${w.ds.companies.length} companies, their ${w.ds.metricDefs.length} metrics and model checks, their deals, the map and the organizers' index. Try one of these:`);
  }
  o.suggest([...contextSuggestions(w, ctx), "What can you do?"], asked);
  return o.done();
}

function askWhich(w: W, what: "deals" | "result" | "what-if", ctx: GuideContext, asked: string): Reply {
  const eg = (what === "what-if" ? w.ds.companies.find((c) => !c.inIndex && c.verdict === "watch") : null)
    ?? w.ds.companies.find((c) => c.deals?.length) ?? w.tested[0];
  const slot = slotWeight(w);
  const q = what === "deals" ? `Show ${eg.ticker}'s deals` : what === "result" ? whyQuestion(eg) : slot != null ? `What if we add ${eg.ticker} at ${trimPct(slot)}?` : `What if we add ${eg.ticker}?`;
  return new Out()
    .step("Looked for a company in your question")
    .say(what === "what-if"
      ? `Which company should I add? Name one, like ${chip(eg.ticker)}.`
      : `Which company's ${what}? Name one, like ${chip(eg.ticker)}, or open a company page and ask again.`)
    .suggest([q, ...contextSuggestions(w, ctx)], asked)
    .done();
}

// ───────────────────────── Entry points ─────────────────────────

/** Answers one question from the data. Never invents: if the data can't answer, it says so. */
export function answer(ds: Dataset, snap: IndexSnapshot, question: string, ctx: GuideContext): Reply {
  const w = world(ds, snap);
  const raw = question.trim().slice(0, 500);
  const lower = raw.toLowerCase();
  const tickers = findTickers(ds, raw);
  const metric = findMetric(ds, lower);
  const weight = findWeight(raw);
  const here = ctx.ticker ? w.by.get(ctx.ticker) : undefined;
  const pronoun = RE.pronoun.test(lower);
  const named = tickers[0] ? w.by.get(tickers[0]) : undefined;

  if (!raw || RE.help.test(lower)) return help(w, ctx, raw);
  if (RE.advice.test(lower)) return advice(w, named ?? here, ctx, raw);
  if (!tickers.length && RE.rules.test(lower) && !(here && pronoun)) return rules(w, ctx, raw);

  const wantsWhatIf = !RE.why.test(lower.replace(/\bpass(es|ed|ing)?\b|\bchecks?\b|\bscored?\b|\bresult\b/g, "")) &&
    (RE.whatIf.test(lower) || (RE.addVerb.test(lower) && (tickers.length > 0 || weight != null)));
  if (wantsWhatIf) {
    const target = named ?? (RE.whatIf.test(lower) || pronoun ? here : undefined);
    if (target) return whatIf(w, target, weight, ctx, raw);
    if (unknownTickers(ds, raw).length) return fallback(w, raw, ctx, raw);
    return askWhich(w, "what-if", ctx, raw);
  }

  if (tickers.length >= 2) return compare(w, tickers, ctx, raw);
  if (tickers.length === 1 && here && here.ticker !== tickers[0] && RE.compare.test(lower) && !RE.deals.test(lower)) {
    return compare(w, [here.ticker, tickers[0]], ctx, raw);
  }

  if (!tickers.length) {
    if (metric && RE.explain.test(lower) && !pronoun && !RE.collective.test(lower) && !RE.rank.test(lower)) return explainMetric(w, metric, here, ctx, raw);
    const aboutHere = here && (pronoun || ((RE.why.test(lower) || !!metric || RE.deals.test(lower)) && !RE.collective.test(lower)));
    if (!aboutHere) {
      const s = screen(w, lower, metric, ctx, raw);
      if (s) return s;
      if (RE.index.test(lower) || /\bcanadian\b.*\b(share|weight|exposure)\b/.test(lower)) return indexSummary(w, ctx, raw);
      if (metric && (RE.explain.test(lower) || !here)) return explainMetric(w, metric, here, ctx, raw);
      if (RE.map.test(lower) && !(here && /\bwhere\b/.test(lower))) return mapGeneral(w, ctx, raw);
    }
  }

  const c = named ?? here;
  if (c) {
    if (metric?.id === "acqIntensity" && /\bspend/.test(lower)) return companyMetric(w, c, metric, ctx, raw);
    if (RE.deals.test(lower)) return deals(w, c, ctx, raw);
    if (RE.map.test(lower)) return mapCompany(w, c, ctx, raw);
    if (RE.why.test(lower)) return why(w, c, ctx, raw);
    if (metric) return companyMetric(w, c, metric, ctx, raw);
    if (named || RE.overview.test(lower) || pronoun) return overview(w, c, ctx, raw);
  } else if (RE.deals.test(lower)) {
    return askWhich(w, "deals", ctx, raw);
  } else if (RE.why.test(lower) && /\bwhy\b/.test(lower)) {
    return askWhich(w, "result", ctx, raw);
  }
  return fallback(w, raw, ctx, raw);
}

/** A short note when the person arrives somewhere new. null when there is nothing worth saying. */
export function notice(ds: Dataset, snap: IndexSnapshot, ctx: GuideContext): Reply | null {
  const w = world(ds, snap);
  const o = new Out();
  const here = ctx.ticker ? w.by.get(ctx.ticker) : undefined;

  if (here) {
    const c = here;
    const m = c.model;
    const s = strongest(w, c);
    const failed = failedChecks(w, c);
    const nDeals = sortedDeals(c).length;
    o.say(
      `Now on ${chip(c.ticker)}${m ? `: ${b(recLabel(c))}, ranked ${ordinal(m.rank)} of ${w.tested.length}` : ""}.`,
      s ? `Strongest metric: ${s.def.short ?? s.def.label}, ${rankPhrase(s.def, s.r)}.` : "",
      m ? `Failed checks: ${failed.length ? failed.join("; ") : "none"}.` : "",
      `Map zone: ${c.zone}.${nDeals ? ` ${nDeals} deal records with filing quotes.` : ""}`,
    );
    const pos = w.index?.positions.find((p) => p.ticker === c.ticker);
    if (pos && pos.countryCode !== c.hqCountry) {
      o.say(`Heads up: the index labels ${chip(c.ticker)} ${pos.countryCode}, but it is headquartered in ${c.hqCountry}. I count it as ${c.hqCountry}.`);
    }
    o.sources(metricSources(c));
    o.act({ kind: "highlight", target: "summary", ticker: c.ticker, label: "Show me" });
    o.act({ kind: "view", view: "xray", focus: c.ticker, label: `X-ray ${c.ticker}` });
    o.suggest(companySuggestions(w, c));
    return o.done();
  }

  switch (ctx.view) {
    case "companies": {
      const cands = w.tested.filter((c) => !c.inIndex);
      const n = (r: "pass" | "mixed" | "fail") => cands.filter((c) => c.model!.recommendation === r).length;
      const by = (v: string) => cands.filter((c) => c.verdict === v).map((c) => c.ticker);
      o.say(
        `The table ranks all ${w.tested.length} companies by the model, best first. Of the ${cands.length} candidates, ${n("pass")} pass, ${n("mixed")} ${n("mixed") === 1 ? "is" : "are"} mixed and ${n("fail")} fail.`,
        [by("add").length && `Add: ${chips(by("add"))}.`, by("watch").length && `Watch: ${chips(by("watch"))}.`, by("reject").length && `Reject: ${chips(by("reject"))}.`].filter(Boolean).join(" "),
      );
      o.act({ kind: "highlight", target: "table", view: "companies", label: "Show me" });
      break;
    }
    case "map": {
      const { map } = ds;
      const xDef = defOf(w, map.x);
      const yDef = defOf(w, map.y);
      if (!xDef || !yDef) return null;
      const tr = ds.companies.filter((c) => c.zone === map.zones.topRight).map((c) => c.ticker);
      o.say(
        `Across: ${xDef.short ?? xDef.label} (line at ${formatValue(map.xThreshold, xDef.unit)}). Up: ${yDef.short ?? yDef.label} (line at ${formatValue(map.yThreshold, yDef.unit)}).`,
        `Top-right, ${b(map.zones.topRight)}: ${tr.length ? chips(tr) : "nobody"}.`,
      );
      o.act({ kind: "highlight", target: "map", view: "map", label: "Show me" });
      break;
    }
    case "index": {
      const index = w.index;
      if (!index) return null;
      const picks = modelAdditions(ds);
      const { before, after } = completeIndex(index, picks, countryOverrides(ds));
      o.say(
        `Canadian share goes from ${pct(sharePct(before, "CA"))} to ${pct(sharePct(after, "CA"))} with the model's picks${picks.length ? ` (${chips(picks.map((p) => p.ticker))})` : ""}, and cash from ${pct(before.cashPct)} to ${pct(after.cashPct)}.`,
      );
      o.sources([INDEX_SOURCE]);
      o.act({ kind: "highlight", target: "index", view: "index", label: "Show me" });
      break;
    }
    case "recommendation": {
      const picks = modelAdditions(ds);
      if (!picks.length) return null;
      const weights = [...new Set(picks.map((p) => trimPct(p.weightPct)))];
      o.say(`The answer on one page: add ${chips(picks.map((p) => p.ticker))} at ${joinAnd(weights)}${picks.length > 1 && weights.length === 1 ? " each" : ""}.`);
      const rule = ds.rules?.weight.split(/(?<=\.)\s+/).find((s) => picks.every((p) => new RegExp(`(?<![A-Za-z])${esc(p.ticker)}(?![A-Za-z])`).test(s)));
      if (rule) o.say(`Why the weight: "${rule}"`);
      o.act({ kind: "highlight", target: "recommendation", view: "recommendation", label: "Show me" });
      break;
    }
    case "xray": {
      const p = proveEngine(ds);
      const parts: [string, { matched: number; total: number }][] = [["metric values", p.metrics], ["checks", p.checks], ["results", p.results], ["weights", p.weights]];
      const off = parts.filter(([, x]) => x.matched !== x.total);
      o.say(
        `X-ray re-runs the engine's own code on the figures it published, for all ${p.companies} companies, and compares each answer with what the engine stored.`,
        off.length
          ? `${off.map(([n, x]) => `${x.total - x.matched} of ${x.total} ${n}`).join(", ")} do not match. Those show in red.`
          : `All ${parts.map(([n, x]) => `${x.total} ${n}`).join(", ")} reproduce exactly.`,
      );
      o.act({ kind: "highlight", target: "xray", view: "xray", label: "Show me" });
      break;
    }
    default:
      return null;
  }
  o.suggest(viewSuggestions(w, ctx.view));
  return o.done();
}
