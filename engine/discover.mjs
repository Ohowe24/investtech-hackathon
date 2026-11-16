// DISCOVER: map the Canadian market so any industry can find its own candidates.  Run:  npm run discover
//
// 1. Reads the holdings of the broad Canadian index ETFs (TSX composite + TSX small caps) from the Onesheet API.
// 2. Downloads each holding's company profile (name, sector, industry, country, market cap).
// 3. Downloads 5 years of annual statements for every company whose profile says it is Canadian.
// Raw responses are saved untouched in engine/raw/market/ and engine/raw/statements/ (git-ignored).
// engine/make-inputs.ts turns them into engine/input/market.csv and financials.csv. Takes ~30 minutes the
// first time (the API allows ~60 calls a minute); later runs only fetch what is missing.
import { mkdirSync } from "node:fs";
import { save, tickerOf } from "./onesheet-fetch.mjs";

/** Broad Canadian index ETFs whose holdings, together, are the market we search. */
export const MARKET_ETFS = ["ZCN.TO", "XCS.TO"];

for (const d of ["engine/raw/market", "engine/raw/market/profiles", "engine/raw/statements"]) mkdirSync(d, { recursive: true });

const symbols = new Set();
for (const etf of MARKET_ETFS) {
  const j = await save(`/stocks/etf/${encodeURIComponent(etf)}`, `engine/raw/market/etf-${etf}.json`, `ETF ${etf}`);
  for (const h of j?.data?.holdings ?? []) if (/\.(TO|V)$/.test(h.symbol)) symbols.add(h.symbol);
}
console.log(`${symbols.size} TSX symbols in ${MARKET_ETFS.join(" + ")}`);

const canadian = [];
for (const symbol of [...symbols].sort()) {
  const ticker = tickerOf(symbol);
  const p = await save(`/stocks/fundamentals/${encodeURIComponent(symbol)}/profile`, `engine/raw/market/profiles/${ticker}.json`, `${ticker} profile`);
  const d = p?.data;
  if (d && d.country === "CA" && !d.isEtf && !d.isFund) canadian.push([ticker, symbol]);
}
console.log(`${canadian.length} Canadian companies; downloading their statements`);

for (const [ticker, symbol] of canadian) {
  for (const st of ["income", "balance", "cash"]) {
    await save(`/financials/statements/${encodeURIComponent(symbol)}/${st}`, `engine/raw/statements/${ticker}-${st}.json`, `${ticker} ${st}`);
  }
}
console.log("Done. Next: npm run inputs && npm run engine");
