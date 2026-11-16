// Downloads 5 years of annual statements from the Onesheet API into engine/raw/statements/ (git-ignored),
// plus distributions and reported KPIs for the REITs into engine/raw/dividends/ and engine/raw/kpis/.
// Run from the repo root:  node engine/fetch-statements.mjs
// Raw responses are saved untouched. engine/make-inputs.ts turns them into engine/input/*.csv.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";

process.loadEnvFile(".env.local");
const key = process.env.ONESHEET_API_KEY?.trim();
const base = process.env.ONESHEET_API_BASE_URL?.trim().replace(/\/+$/, "");
const authHeader = process.env.ONESHEET_AUTH_HEADER?.trim() || "X-API-Key";
if (!key || !base) throw new Error("ONESHEET_API_KEY / ONESHEET_API_BASE_URL missing in .env.local");

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
const force = process.argv.includes("--force");

/** GET one endpoint and save the response untouched. Skips files already saved with success; waits and retries when rate-limited. */
async function save(path, file, label) {
  if (existsSync(file) && !force && JSON.parse(readFileSync(file, "utf8")).success) return;
  let res, text;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${base}${path}`, { headers: { [authHeader]: key } });
    text = await res.text();
    if (res.status !== 429 || attempt >= 10) break;
    const wait = Number(res.headers.get("retry-after")) || 30;
    console.log(`${label}: rate limited, waiting ${wait}s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  let n = "?";
  try {
    const j = JSON.parse(text);
    n = Array.isArray(j.data) ? j.data.length : Array.isArray(j.data?.dividends) ? j.data.dividends.length : Array.isArray(j.data?.data) ? j.data.data.length : `no data (${j.error?.code ?? res.status})`;
  } catch {}
  writeFileSync(file, text);
  console.log(`${label.padEnd(24)} ${res.status} rows: ${n}`);
}

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
