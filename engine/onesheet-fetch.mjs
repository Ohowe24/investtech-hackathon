// Shared Onesheet API download helper for the fetch scripts (engine/fetch-statements.mjs, engine/discover.mjs).
// Saves each response untouched. Skips files already saved with success unless --force. Waits and retries when
// the API rate-limits a burst (it allows about 60 calls a minute), instead of saving an error.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

process.loadEnvFile(".env.local");
const key = process.env.ONESHEET_API_KEY?.trim();
const base = process.env.ONESHEET_API_BASE_URL?.trim().replace(/\/+$/, "");
const authHeader = process.env.ONESHEET_AUTH_HEADER?.trim() || "X-API-Key";
if (!key || !base) throw new Error("ONESHEET_API_KEY / ONESHEET_API_BASE_URL missing in .env.local");

export const force = process.argv.includes("--force");

/** True when `file` already holds a successful response. */
export function saved(file) {
  if (!existsSync(file)) return false;
  try {
    return JSON.parse(readFileSync(file, "utf8")).success === true;
  } catch {
    return false;
  }
}

/** GET `path` and save the response to `file`. Returns the parsed body (from disk when already saved). */
export async function save(path, file, label = path) {
  if (!force && saved(file)) return JSON.parse(readFileSync(file, "utf8"));
  let res, text;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${base}${path}`, { headers: { [authHeader]: key } });
    text = await res.text();
    if (res.status !== 429 || attempt >= 12) break;
    const wait = Number(res.headers.get("retry-after")) || 30;
    console.log(`${label}: rate limited, waiting ${wait}s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  let body = null;
  let n = "?";
  try {
    body = JSON.parse(text);
    const d = body.data;
    n = Array.isArray(d) ? d.length : Array.isArray(d?.dividends) ? d.dividends.length : Array.isArray(d?.holdings) ? d.holdings.length : Array.isArray(d?.data) ? d.data.length : d ? "ok" : `no data (${body.error?.code ?? res.status})`;
  } catch {}
  writeFileSync(file, text);
  console.log(`${label.padEnd(28)} ${res.status} ${n}`);
  return body;
}

/** API symbol -> our ticker: "TECK-B.TO" -> "TECK.B", "KMP-UN.TO" -> "KMP.UN", "CSU.TO" -> "CSU". */
export function tickerOf(symbol) {
  return symbol.replace(/\.(TO|V)$/, "").replace(/-/g, ".");
}
