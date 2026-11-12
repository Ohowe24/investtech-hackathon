// Quick Onesheet API probe (Max's lane). Not part of the engine build.
//
// Usage:
//   npm run onesheet -- /some/path          GET  <ONESHEET_API_BASE_URL>/some/path
//   npm run onesheet -- "/quote?symbol=CSU"  query strings work too
//
// Reads ONESHEET_API_KEY and ONESHEET_API_BASE_URL (https://api.onesheet.pro/v1) from .env.local.
// The key is never printed. It is sent in the X-API-Key header, per the API docs.
// The full response is saved to engine/raw/ (git-ignored) so you can look at the fields.
// Endpoint list: https://api.onesheet.pro/v1/docs (spec: https://api.onesheet.pro/v1/openapi.json)

import { mkdirSync, writeFileSync } from "node:fs";

try {
  process.loadEnvFile(".env.local");
} catch {
  console.error("Could not read .env.local in the repo root. Run this from the repo root.");
  process.exit(1);
}

const key = process.env.ONESHEET_API_KEY?.trim();
const base = process.env.ONESHEET_API_BASE_URL?.trim().replace(/\/+$/, "");
const authHeader = process.env.ONESHEET_AUTH_HEADER?.trim() || "X-API-Key";

console.log(`ONESHEET_API_KEY:      ${key ? `set (${key.length} chars)` : "MISSING"}`);
console.log(`ONESHEET_API_BASE_URL: ${base || "MISSING"}`);
if (!key || !base) process.exit(1);

const path = process.argv[2] ?? "/";
const url = base + (path.startsWith("/") ? path : `/${path}`);

const headers = { Accept: "application/json", [authHeader]: key };

console.log(`\nGET ${url}`);
const res = await fetch(url, { headers });
const type = res.headers.get("content-type") ?? "";
const body = await res.text();
console.log(`${res.status} ${res.statusText}  (${type || "no content-type"}, ${body.length} bytes)\n`);

let pretty = body;
if (type.includes("json")) {
  try {
    pretty = JSON.stringify(JSON.parse(body), null, 2);
  } catch {}
}
console.log(pretty.length > 3000 ? pretty.slice(0, 3000) + "\n… (truncated, full response saved below)" : pretty);

mkdirSync("engine/raw", { recursive: true });
const ext = type.includes("json") ? "json" : "txt";
const file = `engine/raw/onesheet-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;
writeFileSync(file, pretty);
console.log(`\nSaved: ${file}`);
