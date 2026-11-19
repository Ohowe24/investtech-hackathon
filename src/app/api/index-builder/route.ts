// Prices for the generated index. POST { tickers: string[] } -> PricePayload.
// Fetched live from Yahoo Finance (kept in memory for a few hours), with the saved snapshot (data/prices.json,
// npm run prices) for any ticker Yahoo does not answer for. The browser does the index math with
// engine/indexBuilder.ts, so changing members or weights needs no new request.

import storeJson from "@data/store.json";
import snapshotJson from "@data/prices.json";
import type { FxSeries, PricePayload, PriceSeries } from "../../../../engine/indexBuilder";
import { fetchBenchmark, fetchFx, fetchSeries, sinceDate, SOURCE } from "../../../../engine/prices-fetch";
import type { Store } from "../../../../engine/store";

export const maxDuration = 60;

const store = storeJson as unknown as Store;
const snapshot = snapshotJson as unknown as {
  asOf: string;
  benchmark: PriceSeries | null;
  fx: FxSeries[];
  series: Record<string, PriceSeries>;
};

const TTL = 6 * 60 * 60 * 1000;
const MAX_TICKERS = 120;
const TICKER = /^[A-Z0-9][A-Z0-9.\-]{0,11}$/;

/** Live results, per ticker, for this server process. */
const cache = new Map<string, { at: number; series: PriceSeries | null }>();
let extras: { at: number; benchmark: PriceSeries | null; fx: FxSeries[] } | null = null;

const fresh = (at: number) => Date.now() - at < TTL;

export async function POST(request: Request) {
  let body: { tickers?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send JSON: { tickers: string[] }" }, { status: 400 });
  }
  const tickers = Array.isArray(body.tickers) ? [...new Set(body.tickers.filter((t): t is string => typeof t === "string" && TICKER.test(t)))] : [];
  if (!tickers.length) return Response.json({ error: "No valid tickers" }, { status: 400 });
  if (tickers.length > MAX_TICKERS) return Response.json({ error: `At most ${MAX_TICKERS} tickers` }, { status: 413 });

  const since = sinceDate();
  const todo = tickers.filter((t) => !(cache.has(t) && fresh(cache.get(t)!.at)));
  let liveOk = true;
  try {
    const [{ series }, more] = await Promise.all([
      todo.length ? fetchSeries(todo, store, since) : Promise.resolve({ series: [] as PriceSeries[] }),
      extras && fresh(extras.at) ? Promise.resolve(null) : fetchBenchmark(since).then((benchmark) => ({ benchmark })),
    ]);
    const now = Date.now();
    for (const t of todo) cache.set(t, { at: now, series: series.find((s) => s.ticker === t) ?? null });
    if (more) extras = { at: now, benchmark: more.benchmark, fx: extras?.fx ?? [] };
  } catch {
    liveOk = false;
  }

  // Live where Yahoo answered, else the snapshot.
  const series: PriceSeries[] = [];
  const missing: PricePayload["missing"] = [];
  let usedSnapshot = false;
  for (const t of tickers) {
    const live = cache.get(t)?.series;
    const saved = snapshot.series[t];
    if (live) series.push(live);
    else if (saved) { series.push(saved); usedSnapshot = true; }
    else missing.push({ ticker: t, note: "Yahoo Finance has no price history for it" });
  }

  // Exchange rates for every currency in play (live, else the snapshot's).
  const currencies = [...new Set(series.map((s) => s.currency))].filter((c) => c && c !== "CAD");
  const known = new Set((extras?.fx ?? []).map((f) => f.currency));
  const need = currencies.filter((c) => !known.has(c));
  if (need.length && liveOk) {
    try {
      const got = await fetchFx(need, since);
      extras = { at: extras?.at ?? Date.now(), benchmark: extras?.benchmark ?? null, fx: [...(extras?.fx ?? []), ...got] };
    } catch {
      // the snapshot's rates below
    }
  }
  const fx = currencies.map((c) => extras?.fx.find((f) => f.currency === c) ?? snapshot.fx.find((f) => f.currency === c)).filter((f): f is FxSeries => !!f);
  const benchmark = extras?.benchmark ?? snapshot.benchmark;
  if (!extras?.benchmark && snapshot.benchmark) usedSnapshot = true;

  const payload: PricePayload = {
    asOf: usedSnapshot && !series.some((s) => s.fetched === "live") ? snapshot.asOf : new Date().toISOString(),
    source: usedSnapshot ? `${SOURCE}. Some series from the saved snapshot of ${snapshot.asOf.slice(0, 10)}.` : SOURCE,
    series,
    benchmark,
    fx,
    missing,
  };
  return Response.json(payload);
}
