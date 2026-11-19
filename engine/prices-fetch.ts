// PRICES: monthly total-return prices, market caps and exchange rates from Yahoo Finance (yahoo-finance2).
// Used live by /api/index-builder, and by `npm run prices` to save a snapshot (data/prices.json) the site falls
// back on when Yahoo cannot be reached. Prices are kept exactly as Yahoo gives them; nothing is computed here
// except the month each bar belongs to. All index math is in engine/indexBuilder.ts.

import YahooFinance from "yahoo-finance2";
import { barMonth, BENCHMARK, type FxSeries, type PriceSeries } from "./indexBuilder";
import type { Store } from "./store";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const SOURCE = "Yahoo Finance: monthly adjusted close (dividends reinvested), latest quote and market cap";

/** The first month a fetch asks for: 20 years and a month back, so the look-back window is full. */
export function sinceDate(now = new Date()): string {
  return `${now.getUTCFullYear() - 20}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * The Yahoo symbol(s) to try for a ticker. The market map stores the exact symbol; a TSX company in the statements
 * cache gets ".TO" (".V" on the venture exchange); anything else is tried as a US listing first, then on the TSX.
 * Yahoo writes class shares and units with a dash: "ACO.X" -> "ACO-X.TO".
 */
export function yahooSymbols(ticker: string, store: Pick<Store, "market" | "companies">): string[] {
  const m = store.market.find((x) => x.ticker === ticker);
  if (m?.symbol) return [m.symbol];
  const dash = ticker.replace(/\./g, "-");
  const listed = store.companies[ticker]?.listedOn;
  if (listed === "TSX") return [`${dash}.TO`];
  if (listed === "TSXV") return [`${dash}.V`];
  return store.companies[ticker]?.hqCountry === "CA" ? [`${dash}.TO`, dash] : [dash, `${dash}.TO`];
}

/** One listing's monthly bars, a bar per month (the last one is month to date). Null if Yahoo has nothing. */
export async function fetchChart(symbol: string, since: string): Promise<{ currency: string; months: string[]; close: number[]; price: number | null; priceAt: string | null } | null> {
  const r = await yf.chart(symbol, { period1: since, interval: "1mo" });
  const t = r.meta.regularMarketTime;
  const live = t ? new Date(t) : null;
  const byMonth = new Map<string, number>();
  for (const q of r.quotes ?? []) {
    const v = q.adjclose ?? q.close;
    // a later bar in the same month wins (the live bar after the month-to-date one)
    if (typeof v === "number" && Number.isFinite(v) && v > 0) byMonth.set(barMonth(new Date(q.date), live, r.meta.gmtoffset ?? 0), v);
  }
  if (!byMonth.size) return null;
  const months = [...byMonth.keys()].sort();
  return {
    currency: r.meta.currency ?? "",
    months,
    close: months.map((k) => byMonth.get(k)!),
    price: typeof r.meta.regularMarketPrice === "number" ? r.meta.regularMarketPrice : null,
    priceAt: t ? new Date(t).toISOString() : null,
  };
}

/** Market caps for many symbols in one call. Missing symbols are simply absent. */
export async function fetchMarketCaps(symbols: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < symbols.length; i += 100) {
    const batch = symbols.slice(i, i + 100);
    try {
      const q = await yf.quote(batch, { fields: ["marketCap"] }, { validateResult: false });
      for (const x of (Array.isArray(q) ? q : [q]) as { symbol?: string; marketCap?: number }[]) {
        if (x?.symbol && typeof x.marketCap === "number" && x.marketCap > 0) out.set(x.symbol, x.marketCap);
      }
    } catch {
      // caps then come from the Onesheet profile, where there is one
    }
  }
  return out;
}

/** Runs `fn` over `items`, at most `limit` at a time. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

/**
 * Price series for tickers, live from Yahoo. Each ticker tries its candidate symbols in order.
 * Market caps: Yahoo's quote, else the Onesheet profile in the market map (TSX listings, so CAD).
 */
export async function fetchSeries(
  tickers: string[],
  store: Pick<Store, "market" | "companies">,
  since = sinceDate(),
): Promise<{ series: PriceSeries[]; failed: string[] }> {
  const charts = await pool(tickers, 8, async (ticker) => {
    for (const symbol of yahooSymbols(ticker, store)) {
      try {
        const c = await fetchChart(symbol, since);
        if (c) return { ticker, symbol, ...c };
      } catch {
        // try the next symbol
      }
    }
    return null;
  });
  const found = charts.filter((c): c is NonNullable<typeof c> => c != null);
  const caps = await fetchMarketCaps(found.map((c) => c.symbol));
  const series: PriceSeries[] = found.map((c) => {
    const yahooCap = caps.get(c.symbol);
    const profile = store.market.find((m) => m.ticker === c.ticker);
    const profileCap = profile?.marketCap != null && c.currency === "CAD" ? profile.marketCap : null;
    return {
      ticker: c.ticker,
      symbol: c.symbol,
      currency: c.currency,
      months: c.months,
      close: c.close,
      price: c.price,
      priceAt: c.priceAt,
      marketCap: yahooCap ?? profileCap,
      marketCapSource: yahooCap != null ? "Yahoo Finance quote" : profileCap != null ? "Onesheet company profile" : null,
      fetched: "live",
    };
  });
  return { series, failed: tickers.filter((t) => !found.some((c) => c.ticker === t)) };
}

/** Canadian dollars per unit of each currency, monthly. Yahoo's pair for USD is "CAD=X" (longer history than "USDCAD=X"). */
export async function fetchFx(currencies: string[], since = sinceDate()): Promise<FxSeries[]> {
  const wanted = [...new Set(currencies)].filter((c) => c && c !== "CAD");
  const out = await pool(wanted, 4, async (currency): Promise<FxSeries | null> => {
    try {
      const c = await fetchChart(currency === "USD" ? "CAD=X" : `${currency}CAD=X`, since);
      return c ? { currency, months: c.months, rate: c.close, latest: c.price ?? c.close[c.close.length - 1] ?? null } : null;
    } catch {
      return null;
    }
  });
  return out.filter((f): f is FxSeries => f != null);
}

/** The benchmark's series (no market cap needed). */
export async function fetchBenchmark(since = sinceDate()): Promise<PriceSeries | null> {
  try {
    const c = await fetchChart(BENCHMARK.symbol, since);
    if (!c) return null;
    return { ticker: BENCHMARK.symbol, symbol: BENCHMARK.symbol, ...c, marketCap: null, marketCapSource: null, fetched: "live" };
  } catch {
    return null;
  }
}
