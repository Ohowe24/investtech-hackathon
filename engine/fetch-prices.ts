// SNAPSHOT OF PRICES: npm run prices
//
// Downloads monthly prices (20 years), market caps and exchange rates from Yahoo Finance for every company the
// engine knows (the Canadian market map plus the statements cache) and the benchmark, and writes data/prices.json.
// The generated index fetches prices live; this file is what it falls back on when Yahoo cannot be reached.
// Prices are rounded to 6 significant figures to keep the file small (well under a basis point of any return).

import { readFileSync, writeFileSync } from "node:fs";
import type { PriceSeries } from "./indexBuilder";
import { fetchBenchmark, fetchFx, fetchSeries, sinceDate, SOURCE } from "./prices-fetch";
import type { Store } from "./store";

async function main() {
  const store = JSON.parse(readFileSync("data/store.json", "utf8")) as Store;
  const tickers = [...new Set([...store.market.map((m) => m.ticker), ...Object.keys(store.companies)])].sort();
  const since = sinceDate();
  console.log(`Fetching ${tickers.length} tickers from ${since}…`);

  const t0 = Date.now();
  const { series, failed } = await fetchSeries(tickers, store, since);
  const benchmark = await fetchBenchmark(since);
  const fx = await fetchFx(series.map((s) => s.currency), since);
  const asOf = new Date().toISOString();

  const round = (v: number) => Number(v.toPrecision(6));
  const slim = (s: PriceSeries): PriceSeries => ({ ...s, close: s.close.map(round), fetched: asOf.slice(0, 10) });

  const out = {
    asOf,
    source: SOURCE,
    since,
    benchmark: benchmark ? slim(benchmark) : null,
    fx: fx.map((f) => ({ ...f, rate: f.rate.map(round) })),
    series: Object.fromEntries(series.map((s) => [s.ticker, slim(s)])),
    failed,
  };
  writeFileSync("data/prices.json", JSON.stringify(out));
  console.log(`${series.length} series, ${failed.length} not found (${failed.join(" ")}), benchmark ${benchmark ? "ok" : "missing"}, fx ${fx.map((f) => f.currency).join(" ") || "none"}, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
