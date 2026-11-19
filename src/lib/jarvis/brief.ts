// The company briefing: "Jarvis, explain Parex Resources" gets a choreographed rundown instead of a free answer.
// A polite greeting, then what the company is, its key strengths and soft spot, its quality score, what analysts
// say, a pass over the charts, and the figures by year at the bottom of the page. Each beat is one spoken passage
// with places on the page to spotlight and a callout to animate. Every figure is read from the dataset and
// formatted the way the site formats it; nothing here types a number.

import type { CheckResult, Company, Dataset, MetricDef } from "@contract/types";
import { formatValue } from "@/lib/format";

/** Who Jarvis is talking to in a briefing: the two of us presenting. */
export const ADDRESSEE = "Max and Oscar";

/** How the briefing hands back to us, and Jarvis's last word once we say we're done. */
export const CLOSING_QUESTION = "Is there anything else I can do for you, sirs?";
export const FAREWELL = "Very well. Go win that hackathon, boys.";

/** "No, that's all, Jarvis. Thank you." and the like: we're done. */
export function isSignOff(said: string): boolean {
  const s = said.toLowerCase();
  return /\b(that'?s all|that is all|that'?ll be all|that will be all|nothing else|no,? thank(s| you)|all good|we'?re (good|done|all set))\b/.test(s);
}

/** Where on the company page a beat points. "find" is a panel or chart by its heading. */
export type BriefTarget =
  | { kind: "head" }
  | { kind: "stats" }
  | { kind: "breakdown" }
  | { kind: "metric"; metricId: string }
  | { kind: "find"; text: string };

export interface StrengthItem {
  metricId: string;
  label: string;
  value: string;
  /** the pass line, e.g. "≥ 7.4%" */
  target?: string;
  /** points earned in the quality score, as the site shows them, e.g. "28.1 / 30" */
  points?: string;
  /** 0..1: position among the companies tested */
  grade: number;
  /** when to reveal it, in ms after the passage starts: as the voice reaches it */
  at: number;
}

export type Callout =
  | { kind: "intro"; ticker: string; listedOn?: string; name: string; chips: string[] }
  | { kind: "company"; chips: string[]; figures: { label: string; value: string; at: number }[] }
  | { kind: "strengths"; items: StrengthItem[] }
  | { kind: "weak"; items: StrengthItem[] }
  | { kind: "clean"; passed: number; available: number }
  | { kind: "score"; score: number | null; passed: number; available: number; checks: (boolean | null)[] }
  | { kind: "analysts"; levels: { label: string; n: number; tone: string }[]; total: number; sentiment: string | null; buys: number }
  | { kind: "tour"; title: string; items: string[] }
  | { kind: "note"; title: string; chips: string[] };

/** One stop within a beat: the frame moves there as the voice reaches it. */
export interface BriefStep {
  target: BriefTarget;
  /** ms after the passage starts */
  at: number;
}

export interface Beat {
  id: string;
  /** label on the progress rail */
  label: string;
  /** the caption */
  text: string;
  /** what the voice reads */
  speech: string;
  target: BriefTarget;
  /** further stops within the passage (the charts tour); the first is the target itself */
  steps?: BriefStep[];
  callout: Callout;
}

export interface Brief {
  ticker: string;
  name: string;
  beats: Beat[];
}

// ───────────────────────── Is this a briefing request? ─────────────────────────

const ASK = /\b(explain|brief me|briefing|tell me (?:about|more about)|walk me through|talk me through|run me through|rundown|run-down|overview|introduce|break down|what about|what do you (?:think|make) of|what(?:'s| is) the story|give me the (?:story|rundown|picture)|go over|cover)\b/i;
/** Specific questions go to the full analyst, not the briefing. */
const SPECIFIC = /\b(why|compare|compared|versus|vs\.?|against|than|fail(?:s|ed)?|pass(?:es|ed)?|weight|buy it|sell it|should i)\b/i;
const GENERIC = new Set(["inc", "ltd", "corp", "corporation", "limited", "the", "co", "company", "group", "holdings", "trust", "reit", "plc", "and", "of", "resources", "energy", "oil", "gas", "international", "canada", "canadian"]);

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

function distance(a: string, b: string): number {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** The company a spoken request asks to be briefed on, or null when it is some other kind of question. */
export function briefRequest(said: string, ds: Dataset): Company | null {
  if (!ASK.test(said) || SPECIFIC.test(said)) return null;
  const heard = words(said);
  // Spelled-out tickers ("P X T") count too.
  const letters = heard.filter((w) => w.length === 1).join("");
  let best: { c: Company; d: number } | null = null;
  for (const c of ds.companies) {
    if (!c.model) continue;
    const t = c.ticker.toLowerCase().replace(/\./g, "");
    if (t.length >= 2 && (heard.includes(t) || (letters.length >= 2 && letters.includes(t)))) return c;
    const name = words(c.name);
    const key = name.find((w) => !GENERIC.has(w) && w.length >= 3);
    if (!key) continue;
    for (let i = 0; i < heard.length; i++) {
      let d = distance(heard[i], key);
      // A near miss counts when the next word confirms it ("Paris Resources" for "Parex Resources").
      const next = name[name.indexOf(key) + 1];
      const confirmed = next && heard[i + 1] === next;
      const allowed = key.length >= 5 ? (confirmed ? 2 : 1) : 0;
      if (d > allowed) continue;
      if (confirmed) d -= 0.5;
      if (!best || d < best.d) best = { c, d };
    }
  }
  return best?.c ?? null;
}

// ───────────────────────── The script ─────────────────────────

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const countWord = (n: number) => COUNT_WORDS[n] ?? String(n);
const tally = (n: number, what: string) => `${countWord(n)} ${what}${n === 1 ? "" : "s"}`;

/** "Parex Resources Inc." -> "Parex Resources" */
export function spokenName(name: string): string {
  return name.replace(/[,\s]+(Inc|Incorporated|Ltd|Limited|Corp|Corporation|Co|Plc|LP|L\.P|Trust)\.?$/i, "").trim();
}

const fmt = (c: Company, def: MetricDef) => formatValue(c.metrics[def.id]?.value, def.unit);
/** A percentage said without its sign, for "down 19.9% a year". */
const fmtAbs = (v: number, def: MetricDef) => formatValue(Math.abs(v), def.unit);

/** What a passed check says about the company, as a clause after "It". */
function strengthClause(c: Company, def: MetricDef): string {
  const v = c.metrics[def.id]?.value ?? 0;
  const s = fmt(c, def);
  switch (def.id) {
    case "cashReturnCycle":
    case "returnOnCapital":
    case "cashReturn":
      return `earns ${s} on capital`;
    case "netDebtToAvgEbitda":
    case "netDebtToEbitda":
    case "leverage":
      return v <= 0 ? "has more cash than debt" : `keeps net debt to ${s.replace("×", " times")} earnings`;
    case "fcfMarginCycle":
    case "fcfMargin":
      return `keeps ${s} of sales as free cash`;
    case "cashFromOperations":
      return `turns ${s} of sales into operating cash`;
    case "shareCountGrowth":
    case "shareCountChange":
      return v < 0 ? `shrinks its share count ${fmtAbs(v, def)} a year` : `keeps dilution to ${s} a year`;
    case "cashFlowPerShareGrowth":
      return v >= 0 ? `grows cash flow per share ${s} a year` : "holds cash flow per share up better than most";
    case "revenuePerShareGrowth":
      return v >= 0 ? `grows revenue per share ${s} a year` : "holds revenue per share up better than most";
    default:
      return `clears the bar on ${(def.short ?? def.label).toLowerCase()} at ${s}`;
  }
}

/** What a failed check says, as a short noun phrase. The figure itself is on screen, in the callout. */
function weakPhrase(c: Company, def: MetricDef): string {
  const v = c.metrics[def.id]?.value ?? 0;
  switch (def.id) {
    case "cashFlowPerShareGrowth":
      return v < 0 ? "falling cash flow per share" : "slow growth in cash flow per share";
    case "revenuePerShareGrowth":
      return v < 0 ? "falling revenue per share" : "slow growth in revenue per share";
    case "shareCountGrowth":
    case "shareCountChange":
      return "share dilution";
    case "netDebtToAvgEbitda":
    case "netDebtToEbitda":
      return "its debt load";
    case "fcfMarginCycle":
    case "fcfMargin":
      return "a thin free cash margin";
    case "cashReturnCycle":
    case "returnOnCapital":
      return "a low return on capital";
    case "cashFromOperations":
      return "weak operating cash";
    default:
      return `its ${(def.short ?? def.label).toLowerCase()}`;
  }
}

const joinAnd = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")}${xs.length > 2 ? "," : ""} and ${xs[xs.length - 1]}`);

/** Roughly where in a passage the voice reaches a phrase, in ms (it reads about 13 characters a second). */
const CHARS_PER_SECOND = 13;
const reach = (passage: string, phrase: string) => Math.max(0, Math.round((passage.indexOf(phrase) / CHARS_PER_SECOND) * 1000));

const COUNTRY: Record<string, string> = { CA: "Canada", US: "the United States", GB: "the United Kingdom", AU: "Australia", BM: "Bermuda" };
/** "a Canadian oil and gas producer": one word where we have it, "based in …" where we don't. */
const DEMONYM: Record<string, string> = { CA: "Canadian", US: "American", GB: "British", AU: "Australian" };
const CURRENCY: Record<string, string> = { USD: "US dollars", CAD: "Canadian dollars", EUR: "euros", GBP: "pounds" };
const MAGNITUDE: Record<string, string> = { K: "thousand", M: "million", B: "billion", T: "trillion" };

/** Text to speech: symbols, abbreviations and short money forms the voice would stumble on, in words. */
export const speakable = (s: string) => s
  .replace(/(\d)\s*×/g, "$1 times")
  .replace(/≥/g, "at least")
  .replace(/≤/g, "at most")
  .replace(/\bFY\s?(\d{4})\b/g, "fiscal $1")
  .replace(/(\d(?:\.\d+)?)([KMBT])\b/g, (_, n: string, u: string) => `${n} ${MAGNITUDE[u]}`)
  .replace(/\b(USD|CAD|EUR|GBP)\b/g, (c: string) => CURRENCY[c] ?? c);

/** "Parex Resources" -> "Parex": the short name, when the rest is a generic word. */
function shortName(name: string): string {
  const parts = spokenName(name).split(/\s+/);
  return parts.length === 2 && GENERIC.has(parts[1].toLowerCase()) ? parts[0] : spokenName(name);
}

/** Short spoken names for long sub-sectors. */
const KIND: Record<string, string> = { "Oil & Gas Exploration & Production": "oil and gas producer" };

/** "Oil & Gas Exploration & Production" -> "an oil and gas producer"; otherwise "a <sub-sector> company". */
function whatItIs(c: Company): string {
  const kind = KIND[c.subSector ?? ""] ?? `${(c.subSector ?? "").replace(/\s*&\s*/g, " and ").toLowerCase().trim()} company`.trim();
  if (kind === "company") return "a company";
  return `${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind}`;
}

/** The briefing for one company. null when the model did not test it. */
export function buildBrief(ds: Dataset, c: Company, addressee = ADDRESSEE): Brief | null {
  const m = c.model;
  if (!m) return null;
  const name = spokenName(c.name);
  const short = shortName(c.name);
  const beats: Beat[] = [];
  const def = (id: string) => ds.metricDefs.find((d) => d.id === id);
  const beat = (b: Omit<Beat, "speech">) => beats.push({ ...b, speech: speakable(b.text) });
  const history = c.history ?? [];
  const first = history[0];
  const last = history[history.length - 1];
  const cur = c.reportingCurrency ? ` ${c.reportingCurrency}` : "";
  const money = (v: number | null | undefined) => (v == null ? null : `${formatValue(v, "money")}${cur}`);

  // 1. The greeting.
  beat({
    id: "intro",
    label: "Intro",
    text: `Of course, ${addressee}. Here is ${name}.`,
    target: { kind: "head" },
    callout: {
      kind: "intro",
      ticker: c.ticker,
      listedOn: c.listedOn,
      name: c.name,
      chips: [c.subSector, c.hqCountry ? `HQ ${c.hqCountry}` : undefined, c.listedOn ? `Listed on ${c.listedOn}` : undefined].filter((x): x is string => !!x),
    },
  });

  // 2. What the company is, and its size in its latest year.
  {
    const demonym = c.hqCountry ? DEMONYM[c.hqCountry] : undefined;
    const what = demonym ? `${/^[AEIOU]/.test(demonym) ? "an" : "a"} ${demonym} ${whatItIs(c).replace(/^an? /, "")}` : whatItIs(c);
    const where = !demonym && c.hqCountry ? ` based in ${COUNTRY[c.hqCountry] ?? c.hqCountry}` : "";
    const revenue = money(last?.revenue);
    const text = `${short} is ${what}${where}${revenue ? ` with ${revenue} in FY${last!.fiscalYear} revenue` : ""}.`;
    const figures = [
      { label: "Revenue", value: revenue, phrase: "with" },
      { label: "EBITDA", value: money(last?.ebitda), phrase: "" },
      { label: "Free cash flow", value: money(last?.freeCashFlow), phrase: "" },
    ].filter((f): f is { label: string; value: string; phrase: string } => !!f.value);
    const end = reach(text, ".") + 600;
    beat({
      id: "company",
      label: "Company",
      text,
      target: last ? { kind: "find", text: `FY${last.fiscalYear} at a glance` } : { kind: "head" },
      callout: {
        kind: "company",
        chips: [c.subSector, c.hqCountry ? `HQ ${c.hqCountry}` : undefined, c.listedOn].filter((x): x is string => !!x),
        figures: figures.map((f, i) => ({ label: last ? `${f.label}, FY${last.fiscalYear}` : f.label, value: f.value, at: f.phrase ? reach(text, f.phrase) : end + i * 350 })),
      },
    });
  }

  // 3. Key strengths: the passed checks that brought in the most points.
  const scored = m.checks.filter((k) => k.kind === "score");
  const parts = new Map((m.score?.parts ?? []).map((p) => [p.metricId, p]));
  const pointsOf = (id: string) => {
    const p = parts.get(id);
    return p?.grade == null ? undefined : `${Math.round(p.grade * p.weight * 10) / 10} / ${p.weight}`;
  };
  const item = (k: CheckResult, d: MetricDef, passage = "", phrase = ""): StrengthItem => ({
    metricId: d.id,
    label: d.short ?? d.label,
    value: formatValue(c.metrics[d.id]?.value, d.unit),
    // Net cash reads better as an amount than as "-0.0×".
    ...(/netDebt/.test(d.id) && (c.metrics[d.id]?.value ?? 1) <= 0 && last?.netDebt != null && last.netDebt < 0
      ? { label: `Net cash, FY${last.fiscalYear}`, value: money(-last.netDebt)! }
      : {}),
    target: k.target,
    points: pointsOf(d.id),
    grade: parts.get(d.id)?.grade ?? 0,
    at: phrase ? reach(passage, phrase) : 0,
  });
  const passed = scored
    .filter((k) => k.pass === true && def(k.metricId) && c.metrics[k.metricId]?.value != null)
    .sort((a, b) => {
      const w = (k: CheckResult) => { const p = parts.get(k.metricId); return p ? (p.grade ?? 0) * p.weight : 0; };
      return w(b) - w(a);
    })
    .slice(0, 3);
  if (passed.length) {
    const clauses = passed.map((k) => strengthClause(c, def(k.metricId)!));
    // Two said out loud; the third joins the callout as the sentence ends.
    const text = `It ${joinAnd(clauses.slice(0, 2))}.`;
    beat({
      id: "strengths",
      label: "Strengths",
      text,
      target: m.score ? { kind: "breakdown" } : { kind: "metric", metricId: passed[0].metricId },
      callout: {
        kind: "strengths",
        items: passed.map((k, i) => (i < 2 ? item(k, def(k.metricId)!, text, clauses[i]) : { ...item(k, def(k.metricId)!), at: reach(text, ".") + 300 })),
      },
    });
  }

  // 4. The soft spot, or a clean sheet.
  const failed = m.checks.filter((k) => k.pass === false && def(k.metricId) && c.metrics[k.metricId]?.value != null);
  if (failed.length) {
    const phrases = failed.slice(0, 2).map((k) => weakPhrase(c, def(k.metricId)!));
    const text = failed.length === 1 ? `Its soft spot: ${phrases[0]}.` : `Its soft spots: ${joinAnd(phrases)}.`;
    beat({
      id: "weak",
      label: "Soft spot",
      text,
      target: { kind: "metric", metricId: failed[0].metricId },
      callout: { kind: "weak", items: failed.slice(0, 2).map((k, i) => item(k, def(k.metricId)!, text, phrases[i])) },
    });
  } else if (m.available > 0) {
    beat({
      id: "weak",
      label: "Checks",
      text: "It clears every check it was tested on.",
      target: { kind: "stats" },
      callout: { kind: "clean", passed: m.passed, available: m.available },
    });
  }

  // 5. The quality score. Not the rank or the verdict: the briefing describes the company, it doesn't pitch it.
  const score = m.score?.value ?? null;
  beat({
    id: "score",
    label: "Score",
    text: score != null
      ? `Its quality score: ${score} out of 100.`
      : `It passes ${countWord(m.passed)} of the ${countWord(m.available)} checks it could be tested on.`,
    target: { kind: "stats" },
    callout: { kind: "score", score, passed: m.passed, available: m.available, checks: scored.map((k) => k.pass) },
  });

  // 6. The analysts: shown on the page, never part of the verdict.
  const a = c.analyst;
  if (a && a.total > 0) {
    const buys = a.strongBuy + a.buy;
    const sells = a.sell + a.strongSell;
    const lean = a.sentiment === "bullish" ? "Analysts lean bullish" : a.sentiment === "bearish" ? "Analysts lean bearish" : a.sentiment === "neutral" ? "Analysts are mixed" : "Few analysts cover it";
    beat({
      id: "analysts",
      label: "Analysts",
      // Holds are in the callout; the sentence keeps to the two ends.
      text: `${lean}: ${tally(buys, "buy")}, ${tally(sells, "sell")}.`,
      target: { kind: "find", text: "What analysts say" },
      callout: {
        kind: "analysts",
        total: a.total,
        buys,
        sentiment: a.sentiment,
        levels: [
          { label: "Strong buy", n: a.strongBuy, tone: "sb" },
          { label: "Buy", n: a.buy, tone: "b" },
          { label: "Hold", n: a.hold, tone: "h" },
          { label: "Sell", n: a.sell, tone: "s" },
          { label: "Strong sell", n: a.strongSell, tone: "ss" },
        ],
      },
    });
  }

  // 7. A light pass over the charts: each one lit as it's named, no figures read out.
  if (first && last && first !== last) {
    const text = "The charts cover revenue, margins, cash flow, shares and debt.";
    const tour = [
      { title: "Revenue and growth", phrase: "revenue" },
      { title: "Margins", phrase: "margins" },
      { title: "Cash in, cash out", phrase: "cash flow" },
      { title: "Share count", phrase: "shares" },
      { title: "Debt load", phrase: "debt" },
    ];
    // Timed on the spoken words (FY2021 is read "fiscal 2021", which is longer).
    const said = speakable(text);
    beat({
      id: "charts",
      label: "Charts",
      text,
      target: { kind: "find", text: tour[0].title },
      steps: tour.map((t, i) => ({ target: { kind: "find", text: t.title }, at: i === 0 ? 0 : reach(said, t.phrase) })),
      callout: { kind: "tour", title: `FY${first.fiscalYear}–FY${last.fiscalYear}`, items: tour.map((t) => t.title) },
    });

    // 8. The figures by year, and a close.
    beat({
      id: "table",
      label: "By year",
      text: `Below that, every figure by year. ${CLOSING_QUESTION}`,
      target: { kind: "find", text: "All figures by year" },
      callout: {
        kind: "note",
        title: "All figures by year",
        chips: [`FY${first.fiscalYear}–FY${last.fiscalYear}`, `${countWord(history.length)} fiscal years`, c.reportingCurrency ? `Reported in ${c.reportingCurrency}` : "", "Annual statements"].filter(Boolean),
      },
    });
  }

  return { ticker: c.ticker, name: c.name, beats };
}
