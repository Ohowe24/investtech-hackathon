// Downloads 5 years of annual statements from the Onesheet API into engine/raw/statements/ (git-ignored).
// Run from the repo root:  node engine/fetch-statements.mjs
// Raw responses are saved untouched. engine/make-inputs.ts turns them into engine/input/*.csv.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

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
};
const dir = "engine/raw/statements";
mkdirSync(dir, { recursive: true });
const force = process.argv.includes("--force");
for (const [ticker, symbol] of Object.entries(SYMBOLS)) {
  for (const st of ["income", "balance", "cash"]) {
    const file = `${dir}/${ticker}-${st}.json`;
    if (existsSync(file) && !force) continue;
    const res = await fetch(`${base}/financials/statements/${encodeURIComponent(symbol)}/${st}`, { headers: { [authHeader]: key } });
    const text = await res.text();
    let n = "?";
    try { const j = JSON.parse(text); n = Array.isArray(j.data) ? j.data.length : `no data (${j.error?.code ?? res.status})`; } catch {}
    writeFileSync(file, text);
    console.log(`${ticker.padEnd(5)} ${st.padEnd(8)} ${res.status} rows: ${n}`);
  }
}
