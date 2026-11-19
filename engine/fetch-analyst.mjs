// ANALYST RATINGS: buy / hold / sell counts from Yahoo Finance.  Run:  npm run fetch-analyst
//
// Covers every company in engine/input/companies.csv and every TSX name in engine/input/market.csv.
// Writes engine/input/analyst.csv: the counts exactly as Yahoo gives them for the current month ("0m"), nothing computed.
// No API key. Yahoo's endpoint is unofficial and can change, so the result is saved to a file and the site never calls it.
import { readFileSync, writeFileSync } from "node:fs";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const inputDir = "engine/input";
const asOf = new Date().toISOString().slice(0, 10);

/** Minimal CSV reader for our own input files (quoted fields allowed). */
function readCsv(file) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const text = readFileSync(file, "utf8");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

/** Our ticker -> Yahoo's symbol. TSX: "KMP.UN" -> "KMP-UN.TO"; TSXV adds ".V"; anything else is the plain US ticker. */
const yahooSymbol = (ticker, listedOn) => {
  const base = ticker.replace(/\./g, "-");
  if (listedOn === "TSX") return `${base}.TO`;
  if (listedOn === "TSXV") return `${base}.V`;
  return ticker;
};

const targets = new Map(); // ticker -> { symbol, name }
for (const c of readCsv(`${inputDir}/companies.csv`)) targets.set(c.ticker, { symbol: yahooSymbol(c.ticker, c.listed_on), name: c.name });
// market.csv symbols use Onesheet's form ("KMP-UN.TO"), which is also Yahoo's.
for (const m of readCsv(`${inputDir}/market.csv`)) if (!targets.has(m.ticker)) targets.set(m.ticker, { symbol: m.symbol, name: m.name });

/** Words that identify a company, without the legal and filler words every name shares. */
const FILLER = new Set(["inc", "corp", "corporation", "ltd", "limited", "group", "the", "company", "co", "plc", "holdings", "trust", "fund", "of", "and", "sa", "nv", "se", "ag"]);
const words = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !FILLER.has(w));
/** Same company if the first identifying word of our name appears in Yahoo's name (guards against a ticker reused elsewhere). */
const sameCompany = (ours, theirs) => {
  const first = words(ours)[0];
  return !first || words(theirs).some((w) => w.startsWith(first.slice(0, 5)));
};

const out = [];
const missing = [];
let i = 0;
for (const [ticker, { symbol, name }] of targets) {
  i++;
  try {
    const r = await yf.quoteSummary(symbol, { modules: ["recommendationTrend", "price"] });
    const yahooName = r.price?.longName || r.price?.shortName || "";
    if (!sameCompany(name, yahooName)) {
      missing.push(`${ticker} (${symbol}): Yahoo's ${symbol} is "${yahooName}", not ${name}`);
      continue;
    }
    const t = r.recommendationTrend?.trend?.find((x) => x.period === "0m");
    const counts = t && [t.strongBuy, t.buy, t.hold, t.sell, t.strongSell];
    if (!counts || counts.some((n) => typeof n !== "number") || counts.every((n) => n === 0)) {
      missing.push(`${ticker} (${symbol}): no ratings`);
      continue;
    }
    out.push([ticker, symbol, asOf, ...counts, `yahoo-analyst-${ticker}`]);
  } catch (e) {
    missing.push(`${ticker} (${symbol}): ${String(e.message).split("\n")[0].slice(0, 80)}`);
  }
  if (i % 25 === 0) console.log(`${i}/${targets.size}`);
  await new Promise((r) => setTimeout(r, 150));
}

const header = ["ticker", "symbol", "as_of", "strong_buy", "buy", "hold", "sell", "strong_sell", "source_id"];
writeFileSync(`${inputDir}/analyst.csv`, [header, ...out].map((r) => r.join(",")).join("\n") + "\n");
console.log(`Wrote ${inputDir}/analyst.csv: ${out.length} of ${targets.size} companies have ratings (as of ${asOf}).`);
if (missing.length) console.log(`No ratings for ${missing.length}:\n  ${missing.join("\n  ")}`);
