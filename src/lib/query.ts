// The onboarding's answer, carried in the address: which industry, which holdings (with optional weights),
// how much cash, and the index's value. Pure functions, used by the onboarding (browser) and /analyze (server).

export interface HoldingEntry {
  ticker: string;
  /** percent of the index, e.g. 10.76; absent = share the rest equally */
  weightPct?: number;
}

export interface AnalysisQuery {
  industry: string;
  holdings: HoldingEntry[];
  /** cash as percent of the index; used only when some weights are blank */
  cashPct?: number;
  /** total index value, for dollar amounts */
  value?: number;
}

const EXCHANGE_PREFIX = /^(TSX|TSXV|TSX-V|CVE|NYSE|NASDAQ|NYSEARCA|AMEX|BATS|LON|XTSE|XTSX)\s*:\s*/;
const EXCHANGE_SUFFIX = /\.(TO|V|TSX|TSXV|CN|NE)$/;

/**
 * A quote page link -> its ticker, or "" when the text is not a link. Reads the common shapes:
 *   finance.yahoo.com/quote/CSU.TO   google.com/finance/quote/CSU:TSE   money.tmx.com/en/quote/CSU
 *   any link with ?symbol=CSU, ?s=CSU or ?ticker=CSU
 */
export function tickerFromLink(raw: string): string {
  const s = raw.trim();
  if (!/^(https?:\/\/|www\.)/i.test(s)) return "";
  let url: URL;
  try { url = new URL(/^www\./i.test(s) ? `https://${s}` : s); } catch { return ""; }
  // Google writes CSU:TSE, others TSX:CSU; keep the side that is not an exchange.
  const strip = (seg: string) => {
    const bits = seg.split(":");
    return normalizeTicker(bits.length === 2 && /^(TSE|TSX|TSXV|CVE|NYSE|NASDAQ|NYSEARCA|AMEX|BATS)$/i.test(bits[0]) ? bits[1] : bits[0]);
  };
  for (const k of ["symbol", "s", "ticker", "qm_symbol"]) {
    const v = url.searchParams.get(k);
    if (v) return strip(v);
  }
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const i = parts.findIndex((p) => /^(quote|quotes|stock|stocks|symbol|company|equities)$/i.test(p));
  const seg = i >= 0 ? parts[i + 1] : parts[parts.length - 1];
  return seg ? strip(seg) : "";
}

/** "csu.to" -> "CSU", "CAR-UN" -> "CAR.UN", "TSX:GRT.UN" -> "GRT.UN", "ccl b" -> "CCL.B". Empty if it cannot be a ticker. */
export function normalizeTicker(raw: string): string {
  let t = raw.trim().toUpperCase().replace(EXCHANGE_PREFIX, "");
  t = t.replace(/[\s_-]+(UN|U|A|B)$/, ".$1");
  while (EXCHANGE_SUFFIX.test(t) && t.replace(EXCHANGE_SUFFIX, "").length > 0) t = t.replace(EXCHANGE_SUFFIX, "");
  t = t.replace(/-/g, ".");
  return /^[A-Z0-9][A-Z0-9.]{0,11}$/.test(t) ? t : "";
}

/**
 * Reads holdings typed or pasted in any common shape:
 *   "EGP, O, PLD"   "EGP 10.76\nO 10.39"   "EGP:10.76%"   "EGP\t10.76%" (a spreadsheet column pair)
 * Later duplicates are dropped. Returns what could not be read, so the screen can say so.
 */
export function parseHoldingsText(text: string): { entries: HoldingEntry[]; rejected: string[] } {
  const entries: HoldingEntry[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  const add = (rawTicker: string, weight?: number) => {
    const ticker = tickerFromLink(rawTicker) || normalizeTicker(rawTicker);
    if (!ticker) return rejected.push(rawTicker.trim());
    if (seen.has(ticker)) return;
    seen.add(ticker);
    entries.push(weight == null ? { ticker } : { ticker, weightPct: weight });
  };
  for (const token of text.split(/[\n,;\s]+(?=https?:\/\/|www\.)|[\n,;]+/)) {
    const s = token.trim();
    if (!s) continue;
    if (/^(https?:\/\/|www\.)/i.test(s)) {
      add(s.split(/\s+/)[0]);
      continue;
    }
    const withWeight = s.match(/^(.+?)[\s:=]+(\d+(?:\.\d+)?)\s*%?$/);
    if (withWeight && normalizeTicker(withWeight[1])) {
      add(withWeight[1], Number(withWeight[2]));
      continue;
    }
    // Several tickers separated by spaces, none of them a number.
    const words = s.split(/\s+/);
    if (words.length > 1 && words.every((w) => !/^\d/.test(w)) && !/^[A-Za-z0-9]+[\s_-]+(UN|U|A|B)$/i.test(s)) words.forEach((w) => add(w));
    else add(s);
  }
  return { entries, rejected };
}

/**
 * Turns typed weights into a full index. Typed weights are kept as given. If every weight is typed, cash is
 * what is left of 100%. Otherwise cash is `cashPct` and the holdings without a weight share the rest equally.
 */
export function resolveWeights(
  holdings: HoldingEntry[],
  cashPct: number,
): { ok: true; weights: Record<string, number>; cashPct: number; rule: string } | { ok: false; error: string } {
  if (holdings.length === 0) return { ok: false, error: "Add at least one holding." };
  const typed = holdings.filter((h) => h.weightPct != null);
  const typedSum = typed.reduce((s, h) => s + h.weightPct!, 0);
  const round = (v: number) => Math.round(v * 100) / 100;
  if (typed.length === holdings.length) {
    if (typedSum > 100.0001) return { ok: false, error: `Weights add up to ${round(typedSum)}%, more than 100%.` };
    return { ok: true, weights: Object.fromEntries(holdings.map((h) => [h.ticker, h.weightPct!])), cashPct: round(100 - typedSum), rule: "Weights as you entered them; cash is the rest." };
  }
  if (!(cashPct >= 0 && cashPct < 100)) return { ok: false, error: "Cash must be between 0% and 100%." };
  const rest = 100 - cashPct - typedSum;
  if (rest < 0) return { ok: false, error: `Typed weights (${round(typedSum)}%) plus cash (${cashPct}%) are more than 100%.` };
  const blanks = holdings.length - typed.length;
  const each = rest / blanks;
  return {
    ok: true,
    weights: Object.fromEntries(holdings.map((h) => [h.ticker, h.weightPct ?? each])),
    cashPct,
    rule: typed.length
      ? `Weights you typed are kept; the other ${blanks} share the remaining ${round(rest)}% equally.`
      : `No weights entered, so the ${blanks} holdings are equal weight (${round(each)}% each) with ${cashPct}% cash.`,
  };
}

export function toSearch(q: AnalysisQuery): string {
  const p = new URLSearchParams();
  p.set("industry", q.industry);
  if (q.holdings.length) p.set("h", q.holdings.map((h) => (h.weightPct == null ? h.ticker : `${h.ticker}:${h.weightPct}`)).join(","));
  if (q.cashPct != null) p.set("cash", String(q.cashPct));
  if (q.value != null) p.set("value", String(q.value));
  return p.toString().replace(/%2C/g, ",").replace(/%3A/g, ":");
}

type Params = Record<string, string | string[] | undefined>;

export function fromSearch(params: Params): AnalysisQuery | null {
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const industry = one("industry");
  // Holdings are optional: without them the engine just ranks the industry's Canadian candidates.
  const h = one("h") ?? "";
  if (!industry) return null;
  const holdings: HoldingEntry[] = [];
  const seen = new Set<string>();
  for (const part of h.split(",").filter(Boolean)) {
    const [rawTicker, rawWeight] = part.split(":");
    const ticker = normalizeTicker(rawTicker ?? "");
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    const w = rawWeight == null || rawWeight === "" ? undefined : Number(rawWeight);
    holdings.push(w != null && Number.isFinite(w) && w >= 0 ? { ticker, weightPct: w } : { ticker });
  }
  const num = (k: string) => {
    const v = one(k);
    const n = v == null || v === "" ? NaN : Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return { industry, holdings, cashPct: num("cash"), value: num("value") };
}
