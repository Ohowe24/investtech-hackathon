// Outlook engine, Layer 1: downloads reported segments and KPIs for the 5 serial acquirers from the Onesheet API
// into engine/raw/segments/ (git-ignored). Read-only. Run from the repo root:
//   npm run outlook:fetch   (add -- --fresh to re-download)
// The key is read from .env.local (ONESHEET_API_KEY) and never printed.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

const key = readFileSync(".env.local", "utf8").match(/^ONESHEET_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key) throw new Error("ONESHEET_API_KEY missing from .env.local");

const BASE = "https://api.onesheet.pro/v1";
const FRESH = process.argv.includes("--fresh");
const OUT = "engine/raw/segments";
mkdirSync(OUT, { recursive: true });

/** our ticker -> Onesheet symbol: the 5 Outlook companies, then every company the acquirer ranking scores
 *  (data/companies.json), with symbols from engine/input/market.csv; US holdings use their plain ticker. */
const SYMBOLS = { CSU: "CSU.TO", TOI: "TOI.V", WSP: "WSP.TO", TFII: "TFII.TO", ARE: "ARE.TO" };
const marketRows = readFileSync("engine/input/market.csv", "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
const symbolOf = new Map(marketRows.map((r) => [r[0], r[1]]));
const ranked = JSON.parse(readFileSync("data/companies.json", "utf8")).companies.map((c) => c.ticker);
for (const t of ranked) SYMBOLS[t] ??= symbolOf.get(t) ?? t.replace(".", "-");
const PROFILES = "engine/raw/outlook/profiles";
mkdirSync(PROFILES, { recursive: true });

async function get(path, out) {
  if (!FRESH && existsSync(out) && statSync(out).size > 50) return "cached";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(BASE + path, { headers: { "X-API-Key": key }, signal: AbortSignal.timeout(60000) });
      const body = await res.text();
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 8000));
        continue;
      }
      if (!res.ok) return `HTTP ${res.status} ${body.slice(0, 160)}`;
      writeFileSync(out, body);
      return `200 ${body.length}B`;
    } catch (e) {
      if (attempt === 3) return `ERR ${e.message}`;
    }
  }
  return "ERR rate limited";
}

for (const [ticker, sym] of Object.entries(SYMBOLS)) {
  const seg = await get(`/kpis/segments-and-kpis/${encodeURIComponent(sym)}`, `${OUT}/${ticker}.json`);
  // company profile: the segment and business descriptions quoted for each industry label
  const prof = await get(`/stocks/fundamentals/${encodeURIComponent(sym)}/profile`, `${PROFILES}/${ticker}.json`);
  console.log(ticker, sym, "segments", seg, "· profile", prof);
}
