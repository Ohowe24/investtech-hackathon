// ENGINE: spreadsheets in -> data/store.json + data/companies.json out.  Run:  npm run engine [-- --industry <id>]
//
// Reads engine/input/ if it has companies.csv, otherwise engine/input-sample/ (FAKE).
// Writes data/store.json: every company's figures, which the website's server code reads to test any holdings.
// Writes data/companies.json: the default view, the profile's Canadian candidates against the organizers' live index.
// All the work is in analyze.ts (pure, shared with the website). This file only reads files and prints.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IndexSnapshot } from "../contract/types";
import { analyze } from "./analyze";
import { getIndustry } from "./industries";
import { storeFromInputs } from "./store";

const industryArg = process.argv.indexOf("--industry");
const profile = getIndustry(industryArg >= 0 ? process.argv[industryArg + 1] : undefined);

const root = process.cwd();
const realDir = join(root, "engine", "input");
const isFake = !existsSync(join(realDir, "companies.csv"));
const dir = isFake ? join(root, "engine", "input-sample") : realDir;

const store = storeFromInputs((file) => (existsSync(join(dir, file)) ? readFileSync(join(dir, file), "utf8") : null), isFake);
writeFileSync(join(root, "data", "store.json"), JSON.stringify(store) + "\n");

const snapshot = JSON.parse(readFileSync(join(root, "data", "indexes.json"), "utf8")) as IndexSnapshot;
const positions = snapshot.indexes.find((i) => i.name === profile.indexName)?.positions ?? [];
const { dataset, warnings } = analyze(profile, store, { holdings: positions.map((p) => p.ticker), holdingsSource: "organizers", positions });
writeFileSync(join(root, "data", "companies.json"), JSON.stringify(dataset, null, 2) + "\n");

const fmt = (v: number | null | undefined, unit: string) =>
  (v == null ? "—" : unit === "pct" ? `${(v * 100).toFixed(1)}%` : unit === "multiple" ? `${v.toFixed(1)}×` : v.toFixed(2)).padStart(9);
console.log(`
Built data/store.json (${Object.keys(store.companies).length} companies) and data/companies.json (${profile.id}) from ${isFake ? "engine/input-sample (FAKE)" : "engine/input"}
`);
console.log(`rank ticker ${profile.metricDefs.map((m) => (m.short ?? m.id).slice(0, 9).padStart(9)).join(" ")}  checks  model   verdict  weight`);
for (const c of [...dataset.companies].sort((a, b) => a.model!.rank - b.model!.rank)) {
  console.log(
    `${String(c.model!.rank).padStart(3)}  ${c.ticker.padEnd(6)} ${profile.metricDefs.map((m) => fmt(c.metrics[m.id]?.value, m.unit)).join(" ")}   ${c.model!.passed}/${c.model!.available}    ${c.model!.recommendation.padEnd(6)}  ${c.verdict.padEnd(8)} ${c.proposedWeightPct ?? ""}`,
  );
}
if (dataset.unmeasured?.length) console.log(`\nNot measured (no data): ${dataset.unmeasured.map((u) => u.ticker).join(", ")}`);
const all = [...store.warnings, ...warnings];
if (all.length) {
  console.log(`\n${all.length} warning(s):`);
  for (const w of all) console.log("  - " + w);
}
console.log("");
