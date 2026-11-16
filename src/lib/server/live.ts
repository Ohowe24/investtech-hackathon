// Live Onesheet fetch for holdings the cache does not have, used by "choose your own" industries.
// Downloads a holding's annual statements when the analysis runs, converts them exactly as `npm run inputs`
// does (engine/statement-rows.ts), and returns a copy of the store with those companies added. Nothing is
// written to disk. Results are kept in memory for the life of the server process.
//
// Needs ONESHEET_API_KEY and ONESHEET_API_BASE_URL (and optionally ONESHEET_AUTH_HEADER) in the server's
// environment: .env.local locally, the project's environment variables on Vercel. Without them, holdings that
// are not cached simply show as "no data".

import type { Source } from "@contract/types";
import type { FinRow } from "../../../engine/industries/types";
import { yearsFromStatements, type StatementRow } from "../../../engine/statement-rows";
import type { Store, StoredCompany } from "../../../engine/store";

/** Stop starting new downloads after this long, so a run never hangs on a slow or rate-limited API. */
const BUDGET_MS = 45_000;
const CONCURRENCY = 3;

interface Fetched {
  company: StoredCompany;
  sources: Source[];
}
/** ticker -> statements, or null when Onesheet has none. Holdings the API could not answer for are not cached. */
const cache = new Map<string, Fetched | null>();
const names = new Map<string, string>();

type Body = { success?: boolean; data?: unknown };
/** Thrown when the API could not answer (rate limit, timeout, network, key): the holding is unknown, not missing. */
class Unavailable extends Error {}

function api() {
  const key = process.env.ONESHEET_API_KEY?.trim();
  const base = process.env.ONESHEET_API_BASE_URL?.trim().replace(/\/+$/, "");
  const header = process.env.ONESHEET_AUTH_HEADER?.trim() || "X-API-Key";
  return key && base ? { key, base, header } : null;
}

/** One GET. Null when the API answers that it has no such data; throws Unavailable when it could not answer. */
async function getJson(path: string): Promise<Body | null> {
  const a = api();
  if (!a) throw new Unavailable("no API key");
  let res: Response;
  try {
    res = await fetch(`${a.base}${path}`, { headers: { [a.header]: a.key }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Unavailable(path);
  }
  if (res.status === 429 || res.status === 401 || res.status === 403) throw new Unavailable(path);
  if (!res.ok) return null;
  try {
    return (await res.json()) as Body;
  } catch {
    return null;
  }
}

/** Symbols to try for a ticker: as typed (US listings), with class dots as dashes, then as a TSX listing. */
function symbolsFor(ticker: string): string[] {
  const dashed = ticker.replace(/\./g, "-");
  return [...new Set([ticker, dashed, `${dashed}.TO`])];
}

const rows = (x: Body | null) => (x?.success && Array.isArray(x.data) ? (x.data as StatementRow[]) : []);

/** The holding's statements, null if Onesheet has none for it. Throws Unavailable if the API could not answer. */
async function fetchOne(ticker: string): Promise<Fetched | null> {
  for (const symbol of symbolsFor(ticker)) {
    const s = encodeURIComponent(symbol);
    const income = await getJson(`/financials/statements/${s}/income`);
    if (rows(income).length === 0) continue;
    const [balance, cash] = await Promise.all([getJson(`/financials/statements/${s}/balance`), getJson(`/financials/statements/${s}/cash`)]);
    const years = yearsFromStatements(ticker, symbol, rows(income), rows(balance), rows(cash), " (fetched live)");
    if (years.length === 0) return null;
    const financials: FinRow[] = years.map((y) => ({
      year: y.year, revenue: y.revenue, ocf: y.ocf, capex: y.capex, acquisitions: y.acquisitions, shares: y.shares,
      debt: y.debt, cash: y.cash, organic: null, equity: y.equity, ebitda: y.ebitda, goodwill: y.goodwill,
      assets: y.assets, periodEnd: y.periodEnd, currency: y.currency, sourceId: y.sourceId,
    }));
    return {
      company: { ticker, name: ticker, hqCountry: "", financials, facts: [], distributions: [], extras: {} },
      sources: years.map((y) => ({ id: y.sourceId, label: y.sourceLabel })),
    };
  }
  return null;
}

/** Company names from one quote call. Labels only; a failed call leaves the ticker as the name. */
async function namesFor(tickers: string[]): Promise<Record<string, string>> {
  const ask = tickers.filter((t) => !names.has(t)).slice(0, 50);
  if (ask.length) {
    const j = await getJson(`/stocks/quotes?symbols=${encodeURIComponent(ask.join(","))}`).catch(() => null);
    for (const q of (Array.isArray(j?.data) ? j.data : []) as { symbol?: string; name?: string }[]) {
      if (q.symbol && q.name) names.set(q.symbol, q.name);
    }
  }
  return Object.fromEntries(tickers.filter((t) => names.has(t)).map((t) => [t, names.get(t)!]));
}

/**
 * Adds every holding the store has no statements for, fetched live from Onesheet, and fills in names for
 * holdings the store knows only by ticker. Returns the extended store, which tickers were fetched, and which
 * are still missing (they stay "no data").
 */
export async function withLiveHoldings(store: Store, tickers: string[]): Promise<{ store: Store; fetched: string[]; missing: string[] }> {
  if (!api()) return { store, fetched: [], missing: tickers.filter((t) => !store.companies[t]?.financials.length) };
  const wanted = tickers.filter((t) => !store.companies[t]?.financials.length);

  const deadline = Date.now() + BUDGET_MS;
  const queue = wanted.filter((t) => !cache.has(t));
  const worker = async () => {
    while (queue.length && Date.now() < deadline) {
      const t = queue.shift()!;
      try {
        cache.set(t, await fetchOne(t));
      } catch (e) {
        if (!(e instanceof Unavailable)) throw e; // unknown, not missing: tried again on the next run
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const found = wanted.filter((t) => cache.get(t));
  const companies = { ...store.companies };
  const sources = [...store.sources];
  for (const t of found) {
    companies[t] = { ...cache.get(t)!.company };
    sources.push(...cache.get(t)!.sources);
  }
  const unnamed = tickers.filter((t) => companies[t] && companies[t].name === t);
  const got = await namesFor(unnamed);
  for (const t of unnamed) if (got[t]) companies[t] = { ...companies[t], name: got[t] };

  return { store: { ...store, companies, sources }, fetched: found, missing: wanted.filter((t) => !cache.get(t)) };
}
