// Downloads 5 years of annual statements from the Onesheet API into engine/raw/statements/ (git-ignored),
// plus distributions and reported KPIs for the REITs into engine/raw/dividends/ and engine/raw/kpis/.
// Run from the repo root:  node engine/fetch-statements.mjs
// Raw responses are saved untouched. engine/make-inputs.ts turns them into engine/input/*.csv.
import { mkdirSync } from "node:fs";
import { save } from "./onesheet-fetch.mjs";

// ticker in our data -> symbol on the API
export const SYMBOLS = {
  CSU: "CSU.TO", TOI: "TOI.V", WSP: "WSP.TO", TFII: "TFII.TO", ARE: "ARE.TO",
  BSP: "BSP", AME: "AME", WCN: "WCN", BRO: "BRO", IEX: "IEX", ETN: "ETN", ROP: "ROP", TDY: "TDY",
  TDG: "TDG", ACM: "ACM", HEI: "HEI", J: "J", POOL: "POOL", WSO: "WSO", DHR: "DHR",
  // REITs: the Canadian universe (engine/industries/reits.ts) and the organizers' "REITs across borders" holdings
  ...Object.fromEntries(
    ["REI", "GRT", "FCR", "CAR", "CHP", "SRU", "DIR", "PMZ", "HR", "BEI", "KMP", "CRR", "CRT", "AP", "NXR", "SGR", "MRG", "MRT", "APR"]
      .map((t) => [`${t}.UN`, `${t}-UN.TO`]),
  ),
  ...Object.fromEntries("EGP O DLR SPG MAA IRS INVH AMT VICI KIM BXP CCI PLD PSA REXR LRE".split(" ").map((t) => [t, t])),
};
const REITS = new Set(Object.keys(SYMBOLS).filter((t) => t.endsWith(".UN") || "EGP O DLR SPG MAA IRS INVH AMT VICI KIM BXP CCI PLD PSA REXR LRE".split(" ").includes(t)));
for (const d of ["statements", "dividends", "kpis"]) mkdirSync(`engine/raw/${d}`, { recursive: true });
for (const [ticker, symbol] of Object.entries(SYMBOLS)) {
  const sym = encodeURIComponent(symbol);
  for (const st of ["income", "balance", "cash"]) await save(`/financials/statements/${sym}/${st}`, `engine/raw/statements/${ticker}-${st}.json`, `${ticker} ${st}`);
  if (!REITS.has(ticker)) continue;
  // REITs also need distributions per unit (the statements' dividendsPaid field is empty for them)
  // and the company-reported KPIs (occupancy) the API holds for companies without a full profile.
  await save(`/stocks/dividends/${sym}`, `engine/raw/dividends/${ticker}.json`, `${ticker} dividends`);
  await save(`/kpis/segments-and-kpis/${sym}`, `engine/raw/kpis/${ticker}.json`, `${ticker} kpis`);
}
