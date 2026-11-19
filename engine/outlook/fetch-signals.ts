// Outlook engine, Layer 2: downloads the published industry signals into engine/raw/outlook/ (git-ignored).
// Read-only. Run from the repo root:   npm run outlook:fetch     (add --fresh to re-download)
//
//   1. Statistics Canada table 36-10-0434 (GDP at basic prices by industry, monthly, chained 2017 dollars,
//      seasonally adjusted at annual rates), latest 48 months for each industry in engine/input/outlook-industry-map.csv,
//      through the StatCan Web Data Service.
//   2. ESDC Canadian Occupational Projection System (COPS) 2026-2035: real GDP by industry, yearly levels (open.canada.ca).
//   3. Onesheet analyst estimates and company profiles for the listed Canadian peers named in the industry map.
//
// The US BLS projections (Table 2.11) cannot be fetched by a script (bls.gov refuses automated clients);
// they live in engine/input/outlook-bls-ep.csv, copied from the table and checked by fingerprint (see methodology.md).
// The Onesheet key is read from .env.local (ONESHEET_API_KEY) and never printed.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { parseCsv } from "../csv";

const FRESH = process.argv.includes("--fresh");
const OUT = "engine/raw/outlook";
for (const d of [OUT, `${OUT}/estimates`, `${OUT}/profiles`]) mkdirSync(d, { recursive: true });

const fresh = (path: string) => FRESH || !existsSync(path) || statSync(path).size < 50;

interface StatcanMember {
  memberId: number;
  classificationCode: string;
}
interface StatcanDimension {
  dimensionNameEn: string;
  member: StatcanMember[];
}

async function fetchText(url: string, init: RequestInit = {}): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(90000) });
      const body = await res.text();
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 8000));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${body.slice(0, 160)}`);
      return body;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error("rate limited");
}

async function main() {
const map = parseCsv(readFileSync("engine/input/outlook-industry-map.csv", "utf8"));

// ---------- 1. Statistics Canada, table 36-10-0434
const STATCAN_PID = 36100434;
const metaPath = `${OUT}/statcan-36100434-meta.json`;
if (fresh(metaPath)) {
  const body = await fetchText("https://www150.statcan.gc.ca/t1/wds/rest/getCubeMetadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ productId: STATCAN_PID }]),
  });
  writeFileSync(metaPath, body);
}
const meta = JSON.parse(readFileSync(metaPath, "utf8"))[0].object;
const members = (meta.dimension as StatcanDimension[]).find((d) => /NAICS/.test(d.dimensionNameEn))!.member;
const memberByCode = new Map(members.map((m) => [m.classificationCode, m]));

const statcanCodes = [...new Set(["T001", ...map.map((r) => r.statcan).filter(Boolean)])];
const dataPath = `${OUT}/statcan-36100434-data.json`;
if (fresh(dataPath)) {
  // coordinate: Geography=Canada(1) . Seasonal adjustment=SAAR(1) . Prices=Chained 2017 dollars(1) . NAICS member
  const req = statcanCodes.map((code) => {
    const m = memberByCode.get(code);
    if (!m) throw new Error(`StatCan 36-10-0434 has no industry with code ${code}`);
    return { productId: STATCAN_PID, coordinate: `1.1.1.${m.memberId}.0.0.0.0.0.0`, latestN: 48 };
  });
  const body = await fetchText("https://www150.statcan.gc.ca/t1/wds/rest/getDataFromCubePidCoordAndLatestNPeriods", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const parsed = JSON.parse(body);
  const bad = (parsed as { status: string }[]).filter((p) => p.status !== "SUCCESS");
  if (bad.length) throw new Error(`StatCan: ${bad.length} series failed`);
  // keep the industry code next to each series so the build never has to guess
  const byCode = Object.fromEntries(statcanCodes.map((code, i) => [code, parsed[i].object]));
  writeFileSync(dataPath, JSON.stringify({ productId: STATCAN_PID, cubeEndDate: meta.cubeEndDate, fetchedAt: new Date().toISOString(), series: byCode }, null, 1));
}
console.log(`StatCan 36-10-0434: ${statcanCodes.length} industries, data to ${meta.cubeEndDate}`);

// ---------- 2. COPS 2026-2035 real GDP by industry
const COPS_URL =
  "https://open.canada.ca/data/dataset/e80851b8-de68-43bd-a85c-c72e1b3a3890/resource/22ac3c9f-aa82-4bd4-9d4e-8d17074b2136/download/industrial_gdp_pib_par_secteur_2026_2035.csv";
const copsPath = `${OUT}/cops-gdp-2026-2035.csv`;
if (fresh(copsPath)) writeFileSync(copsPath, await fetchText(COPS_URL));
console.log("COPS GDP by industry: saved");

// ---------- 3. Onesheet estimates + profiles for the peers named in the map
const key = readFileSync(".env.local", "utf8").match(/^ONESHEET_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key) throw new Error("ONESHEET_API_KEY missing from .env.local");
const market = parseCsv(readFileSync("engine/input/market.csv", "utf8"));
const symbolOf = new Map(market.map((r) => [r.ticker, r.symbol]));
const peers = [...new Set(map.flatMap((r) => (r.peers ? r.peers.split(" ") : [])))];
let ok = 0;
for (const t of peers) {
  const sym = symbolOf.get(t);
  if (!sym) throw new Error(`peer ${t} is not in engine/input/market.csv`);
  for (const [kind, path] of [
    ["estimates", `/stocks/fundamentals/${encodeURIComponent(sym)}/estimates`],
    ["profiles", `/stocks/fundamentals/${encodeURIComponent(sym)}/profile`],
  ]) {
    const out = `${OUT}/${kind}/${t}.json`;
    if (!fresh(out)) continue;
    writeFileSync(out, await fetchText(`https://api.onesheet.pro/v1${path}`, { headers: { "X-API-Key": key } }));
  }
  ok++;
}
console.log(`Onesheet: estimates and profiles for ${ok} peers`);

// ---------- 4. latest earnings-call transcript of each candidate (narrative: quoted, never scored)
mkdirSync(`${OUT}/transcripts`, { recursive: true });
const CANDIDATES: Record<string, string> = { CSU: "CSU.TO", TOI: "TOI.V", WSP: "WSP.TO", TFII: "TFII.TO", ARE: "ARE.TO" };
for (const [t, sym] of Object.entries(CANDIDATES)) {
  const out = `${OUT}/transcripts/${t}.json`;
  if (!fresh(out)) continue;
  const dates = JSON.parse(await fetchText(`https://api.onesheet.pro/v1/financials/transcripts/${encodeURIComponent(sym)}/dates`, { headers: { "X-API-Key": key } }));
  const rows: unknown[] = Array.isArray(dates) ? dates : (dates?.data ?? []);
  const periods = rows
    .map((r) => (Array.isArray(r) ? { quarter: Number(r[0]), year: Number(r[1]) } : { quarter: Number((r as { quarter?: number }).quarter), year: Number((r as { year?: number }).year) }))
    .filter((p) => p.year && p.quarter)
    .sort((a, b) => b.year - a.year || b.quarter - a.quarter);
  if (!periods[0]) {
    console.log(`${t}: no transcript`);
    continue;
  }
  writeFileSync(out, await fetchText(`https://api.onesheet.pro/v1/financials/transcripts/${encodeURIComponent(sym)}/${periods[0].year}/${periods[0].quarter}`, { headers: { "X-API-Key": key } }));
  console.log(`${t}: transcript ${periods[0].year} Q${periods[0].quarter}`);
}
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
