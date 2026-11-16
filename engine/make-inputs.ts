// RAW -> CLEAN INPUTS.  Run:  npm run inputs   (after: node engine/fetch-statements.mjs)
//
// Reads   engine/raw/statements/*.json  (Onesheet API annual statements: the 20 acquirer-index companies and 35 REITs)
//         engine/raw/dividends/*.json   (Onesheet API distributions per unit, REITs)
//         engine/raw/kpis/*.json        (Onesheet API reported KPIs, REITs without a full company profile)
//         engine/raw/datapack/*.json    (Onesheet company profiles for the 5 Canadian candidates)
//         engine/raw/datapack/*-un.json (Onesheet company profiles for the 5 Canadian REITs)
// Writes  engine/input/financials.csv, facts.csv, distributions.csv, sources.csv, organic.csv, deals.json
//         engine/input/companies.csv    ONLY if it does not exist yet (it holds human decisions)
//
// No number is typed here. Every value is copied from a raw file; missing stays empty.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Deal } from "../contract/types";
import { reits } from "./industries/reits";

const root = process.cwd();
const rawDir = join(root, "engine", "raw");
const outDir = join(root, "engine", "input");
const indexes = JSON.parse(readFileSync(join(root, "data", "indexes.json"), "utf8"));
const INDEX_NAME = "Serial acquirers & consolidators";

// Names and listings are labels, not financial data.
const CANDIDATES: Record<string, { name: string; listedOn: string; subSector: string; symbol: string; pack: string }> = {
  CSU: { name: "Constellation Software", listedOn: "TSX", subSector: "Software serial acquirers", symbol: "CSU.TO", pack: "csu" },
  TOI: { name: "Topicus.com", listedOn: "TSXV", subSector: "Software serial acquirers", symbol: "TOI.V", pack: "toi" },
  WSP: { name: "WSP Global", listedOn: "TSX", subSector: "Engineering", symbol: "WSP.TO", pack: "wsp" },
  TFII: { name: "TFI International", listedOn: "TSX", subSector: "Trucking & logistics", symbol: "TFII.TO", pack: "tfii" },
  ARE: { name: "Aecon Group", listedOn: "TSX", subSector: "Construction", symbol: "ARE.TO", pack: "are" },
};
const HOLDING_NAMES: Record<string, string> = {
  BSP: "Bending Spoons", AME: "AMETEK", WCN: "Waste Connections", BRO: "Brown & Brown", IEX: "IDEX",
  ETN: "Eaton", ROP: "Roper Technologies", TDY: "Teledyne Technologies", TDG: "TransDigm Group", ACM: "AECOM",
  HEI: "HEICO", J: "Jacobs Solutions", POOL: "Pool Corporation", WSO: "Watsco", DHR: "Danaher",
};
// Our "what counts as Canadian" rule (methodology.md): HQ or incorporation, whatever the listing.
const HQ_OVERRIDE: Record<string, string> = { WCN: "CA" };

const csvCell = (v: unknown) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header: string[], rows: unknown[][]) => [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const flip = (v: unknown) => (n(v) == null ? null : -(v as number)); // API reports cash outflows as negatives

type Stmt = Record<string, unknown>[];
const loadStmt = (ticker: string, st: string): Stmt => {
  const file = join(rawDir, "statements", `${ticker}-${st}.json`);
  if (!existsSync(file)) return [];
  const j = JSON.parse(readFileSync(file, "utf8"));
  return Array.isArray(j.data) ? j.data : [];
};

const holdings: { ticker: string; countryCode: string; subSector: string }[] =
  indexes.indexes.find((i: { name: string }) => i.name === INDEX_NAME)?.positions ?? [];
// REITs: the profile's Canadian universe and the organizers' REIT index. Statements only; their KPIs come further down.
const reitHoldings: { ticker: string }[] = indexes.indexes.find((i: { name: string }) => i.name === reits.indexName)?.positions ?? [];
const REIT_TICKERS = [...reits.universe.map((u) => u.ticker), ...reitHoldings.map((h) => h.ticker)];
/** The API's symbol: TSX units are "KMP-UN.TO"; US listings are the plain ticker. */
const reitSymbol = (t: string) => (t.endsWith(".UN") ? `${t.replace(/\.UN$/, "")}-UN.TO` : t);
const tickers = [...Object.keys(CANDIDATES), ...holdings.map((h) => h.ticker), ...REIT_TICKERS];

const finRows: unknown[][] = [];
const sourceRows: unknown[][] = [];
const organicRows: unknown[][] = [];
const deals: Record<string, Deal[]> = {};
const warnings: string[] = [];

for (const ticker of tickers) {
  const symbol = CANDIDATES[ticker]?.symbol ?? (REIT_TICKERS.includes(ticker) ? reitSymbol(ticker) : ticker);
  const income = loadStmt(ticker, "income");
  const balance = loadStmt(ticker, "balance");
  const cash = loadStmt(ticker, "cash");
  const years = [...new Set(income.map((r) => String(r.date).slice(0, 4)))].sort();
  if (years.length === 0) warnings.push(`${ticker}: no statements in engine/raw/statements (run node engine/fetch-statements.mjs)`);
  for (const y of years) {
    const inc = income.find((r) => String(r.date).startsWith(y));
    const bal = balance.find((r) => String(r.date).startsWith(y));
    const cf = cash.find((r) => String(r.date).startsWith(y));
    const sourceId = `os-${ticker}-FY${y}`;
    sourceRows.push([sourceId, `Onesheet API · ${symbol} annual statements, FY${y}`, "", ""]);
    finRows.push([
      ticker, y, inc?.reportedCurrency ?? bal?.reportedCurrency ?? cf?.reportedCurrency ?? "",
      n(inc?.revenue), n(cf?.operatingCashFlow), flip(cf?.capitalExpenditure), flip(cf?.acquisitionsNet),
      n(inc?.weightedAverageShsOutDil), n(bal?.totalDebt), n(bal?.cashAndCashEquivalents),
      n(bal?.totalEquity), n(inc?.ebitda), n(bal?.goodwill), n(bal?.totalAssets), String(inc?.date ?? ""), sourceId,
    ]);
  }

  const pack = CANDIDATES[ticker]?.pack;
  if (!pack) continue;
  const packFile = join(rawDir, "datapack", `${pack}.json`);
  if (!existsSync(packFile)) {
    warnings.push(`${ticker}: data pack file missing (${pack}.json)`);
    continue;
  }
  const doc = JSON.parse(readFileSync(packFile, "utf8")).document;
  const periods: Record<string, unknown>[] = Array.isArray(doc.data) ? doc.data : Object.values(doc.data);

  // Reported organic growth: the company-wide metric only, latest annual period that has it.
  const organicIds = (doc.metrics as { metricId: string; metricName: string }[])
    .filter((m) => /^organic (net revenue )?growth growth %$/i.test(m.metricName))
    .map((m) => m.metricId);
  const annual = periods
    .filter((p) => p.periodType === "Annual" && String(p.reportDate) <= "2026-11-12")
    .sort((a, b) => Number(b.fiscalYear) - Number(a.fiscalYear));
  const quarterly = periods
    .filter((p) => p.periodType === "Quarterly" && String(p.reportDate) <= "2026-11-12")
    .sort((a, b) => String(b.reportDate).localeCompare(String(a.reportDate)));
  // Prefer the latest full year; fall back to the latest quarter if no annual figure is reported.
  for (const p of [...annual, ...quarterly]) {
    const mv = organicIds.map((id) => (p.metricValues as Record<string, { value: unknown; sources?: { formType: string; filedOn: string; quote: string }[] }>)[id]).find((v) => v && n(v.value) != null);
    if (!mv) continue;
    const src = mv.sources?.[0];
    const periodLabel = p.periodType === "Annual" ? `FY${p.fiscalYear}` : `Q${p.fiscalQuarter} ${p.fiscalYear}`;
    const sourceId = `sedar-${ticker}-organic-${periodLabel.replace(" ", "-")}`;
    sourceRows.push([sourceId, src ? `SEDAR ${src.formType}, filed ${src.filedOn}` : "Onesheet company profile", "", src?.quote ?? ""]);
    organicRows.push([ticker, periodLabel, mv.value, sourceId]);
    break;
  }

  deals[ticker] = dealsFrom(doc);
}

/** Deals: acquisitions and divestitures exactly as a company profile lists them. */
function dealsFrom(doc: { events?: unknown[] }): Deal[] {
  type Ev = { type: string; status: string; date?: { occurredOn?: string; expectedBy?: string; periodLabel?: string }; summary: string;
    attributes?: { counterparty?: string }; sources?: { source: string; formType: string; filedOn: string; quote: string }[] };
  return ((doc.events ?? []) as Ev[])
    .filter((e) => e.type === "acquisition" || e.type === "divestiture")
    .map((e): Deal => {
      const date = e.date?.occurredOn ?? e.date?.expectedBy ?? undefined;
      const label = e.date?.periodLabel ?? undefined;
      const yearText = date?.slice(0, 4) ?? label?.match(/(20\d\d)/)?.[1];
      return {
        type: e.type as Deal["type"],
        status: e.status,
        ...(date ? { date } : {}),
        ...(label ? { periodLabel: label } : {}),
        ...(yearText ? { fiscalYear: Number(yearText) } : {}),
        ...(e.attributes?.counterparty ? { counterparty: e.attributes.counterparty } : {}),
        summary: e.summary,
        quotes: (e.sources ?? []).filter((s) => s.quote).map((s) => ({ label: `${s.source.toUpperCase()} ${s.formType}, filed ${s.filedOn}`, quote: s.quote })),
      };
    })
    .sort((a, b) => (b.date ?? `${b.fiscalYear ?? 0}`).localeCompare(a.date ?? `${a.fiscalYear ?? 0}`));
}

// ---- REITs: company-reported figures (FFO, AFFO, payout, leverage, occupancy...) from the data pack ----
// Copied value for value into facts.csv, each with its own filing quote. Which ones the REIT profile
// uses, and how, is decided in engine/industries/reits.ts, never here.
const REIT_PACKS: Record<string, string> = { "CAR.UN": "car-un", "GRT.UN": "grt-un", "KMP.UN": "kmp-un", "NXR.UN": "nxr-un", "REI.UN": "rei-un" };
const REIT_METRICS = [
  "revenue", "operating_cash_flow", "noi", "same_store_noi", "same_store_noi_change_pct", "noi_change_pct",
  "ffo", "ffo_per_share", "affo", "affo_per_share", "affo_ratio", "affo_payout_ratio", "ffo_payout_ratio",
  "adjusted_ffo_payout_ratio", "distributions_per_unit", "debt", "debt_ratio", "total_debt_to_gross_book_value_ratio",
  "adjusted_debt", "adjusted_ebitda", "cash", "occupancy", "occupancy_pct", "committed_occupancy_pct",
  "diluted_nav_per_unit", "distribution_per_unit", "total_indebtedness_ratio", "apartment_occupancy", "industrial_occupancy_pct",
  "committed_occupancy", "canada_occupancy", "adjusted_spot_debt_to_adjusted_ebitda_ratio", "adjusted_adjusted_debt_to_adjusted_ebitda_ratio",
];
const PERIOD_TAG: Record<string, string> = { Annual: "FY", Quarterly: "Q", SemiAnnual: "6M", NineMonths: "9M", PointInTime: "AT" };
const factRows: unknown[][] = [];
for (const [ticker, pack] of Object.entries(REIT_PACKS)) {
  const packFile = join(rawDir, "datapack", `${pack}.json`);
  if (!existsSync(packFile)) {
    warnings.push(`${ticker}: data pack file missing (${pack}.json)`);
    continue;
  }
  const doc = JSON.parse(readFileSync(packFile, "utf8")).document;
  const reitDeals = dealsFrom(doc);
  if (reitDeals.length) deals[ticker] = reitDeals;
  const periods: Record<string, unknown>[] = Array.isArray(doc.data) ? doc.data : Object.values(doc.data);
  for (const p of periods) {
    // Periods that end after the build date are forecasts or placeholders: never used.
    if (String(p.reportDate) > "2026-11-12") continue;
    const type = String(p.periodType);
    const tag = PERIOD_TAG[type];
    if (!tag) continue;
    const label = type === "PointInTime" ? `at ${p.reportDate}` : type === "Annual" ? `FY${p.fiscalYear}` : type === "Quarterly" ? `Q${p.fiscalQuarter} ${p.fiscalYear}` : `${tag} ${p.fiscalYear}`;
    const values = p.metricValues as Record<string, { value: unknown; sources?: { formType: string; filedOn: string; quote: string }[] }>;
    for (const metric of REIT_METRICS) {
      const mv = values[metric];
      if (!mv || n(mv.value) == null) continue;
      const src = mv.sources?.[0];
      const sourceId = `sedar-${ticker}-${metric}-${String(p.periodId).split("_").slice(1).join("-")}`;
      sourceRows.push([sourceId, `${ticker} ${metric.replace(/_/g, " ")}, ${label}${src ? ` · SEDAR ${src.formType}, filed ${src.filedOn}` : " · Onesheet company profile"}`, "", src?.quote ?? ""]);
      factRows.push([ticker, metric, type, p.fiscalYear, p.fiscalQuarter ?? "", p.reportDate, mv.value, sourceId]);
    }
  }
}

// ---- REITs without a data-pack profile: occupancy from the API's reported KPIs ----
// Only company-wide occupancy fields (segment or regional ones are skipped). Stored as "kpi_<field>"; percentages
// become decimals, the same convention as facts.csv. Which ones are used is decided in reits.ts.
const KPI_OCCUPANCY = [
  "occupancy_percentage", "period_end_occupancy_rate", "average_occupancy", "occupancy_of_properties_owned",
  "total_average_physical_occupancy", "combined_shopping_center_portfolio_property_occupancy", "average_same_store_occupancy",
];
const KPI_PERIODS: Record<string, string> = { Annual: "Annual", Quarterly: "Quarterly" };
for (const ticker of REIT_TICKERS) {
  if (REIT_PACKS[ticker]) continue;
  const file = join(rawDir, "kpis", `${ticker}.json`);
  if (!existsSync(file)) continue;
  const j = JSON.parse(readFileSync(file, "utf8"));
  if (!j.success) continue;
  const defs = new Map((j.data.metrics as { metricId: string; metricName: string; metricFormat: string }[]).map((m) => [m.metricId, m]));
  for (const p of j.data.data as { periodType: string; reportDate: string; calendarYear: number; calendarQuarter: number; metricsValues: Record<string, unknown> }[]) {
    const type = KPI_PERIODS[p.periodType];
    if (!type || p.reportDate > "2026-11-12") continue;
    for (const id of KPI_OCCUPANCY) {
      const v = n(p.metricsValues?.[id]);
      const def = defs.get(id);
      if (v == null || !def) continue;
      const label = type === "Annual" ? `FY${p.calendarYear}` : `Q${p.calendarQuarter} ${p.calendarYear}`;
      const sourceId = `os-kpi-${ticker}-${id}-${p.reportDate}-${type}`;
      sourceRows.push([sourceId, `Onesheet API · ${reitSymbol(ticker)} reported KPI "${def.metricName}", ${label}`, "", ""]);
      factRows.push([ticker, `kpi_${id}`, type, p.calendarYear, type === "Quarterly" ? p.calendarQuarter : "", p.reportDate, def.metricFormat === "%" ? +(v / 100).toPrecision(12) : v, sourceId]);
    }
  }
}

// ---- REITs: distributions per unit, as the market data lists them ----
// The statements' dividendsPaid field is empty for REITs, so the payout fallback in reits.ts uses these.
// Currency is the listing's: TSX units pay in CAD, US listings in USD.
const distRows: unknown[][] = [];
for (const ticker of REIT_TICKERS) {
  const file = join(rawDir, "dividends", `${ticker}.json`);
  if (!existsSync(file)) continue;
  const j = JSON.parse(readFileSync(file, "utf8"));
  const list = (j.data?.dividends ?? []) as { date: string; dividend: unknown }[];
  if (!list.length) continue;
  const sourceId = `os-div-${ticker}`;
  sourceRows.push([sourceId, `Onesheet API · ${reitSymbol(ticker)} distribution history`, "", ""]);
  for (const d of list) {
    if (!d.date || d.date > "2026-11-12" || n(d.dividend) == null) continue;
    distRows.push([ticker, d.date, d.dividend, ticker.endsWith(".UN") ? "CAD" : "USD", sourceId]);
  }
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "distributions.csv"), csv(["ticker", "date", "amount", "currency", "source_id"], distRows));
writeFileSync(join(outDir, "facts.csv"), csv(["ticker", "metric", "period_type", "fiscal_year", "fiscal_quarter", "report_date", "value", "source_id"], factRows));
writeFileSync(join(outDir, "financials.csv"), csv(
  ["ticker", "fiscal_year", "currency", "revenue", "operating_cash_flow", "capex", "acquisitions", "diluted_shares", "total_debt", "cash", "total_equity", "ebitda", "goodwill", "total_assets", "period_end", "source_id"],
  finRows,
));
writeFileSync(join(outDir, "sources.csv"), csv(["id", "label", "url", "quote"], sourceRows));
writeFileSync(join(outDir, "organic.csv"), csv(["ticker", "period", "organic_growth_pct", "source_id"], organicRows));
writeFileSync(join(outDir, "deals.json"), JSON.stringify(deals, null, 2) + "\n");

const companiesFile = join(outDir, "companies.csv");
if (!existsSync(companiesFile)) {
  // verdict left EMPTY for candidates = "let the model's declared rules decide". Type a verdict + reason to override.
  const rows: unknown[][] = [
    ...Object.entries(CANDIDATES).map(([t, c]) => [t, c.name, "CA", c.listedOn, c.subSector, "false", "", "", ""]),
    ...holdings.map((h) => [h.ticker, HOLDING_NAMES[h.ticker] ?? h.ticker, HQ_OVERRIDE[h.ticker] ?? h.countryCode, "", h.subSector, "true", "existing", "", ""]),
  ];
  writeFileSync(companiesFile, csv(["ticker", "name", "hq_country", "listed_on", "sub_sector", "in_index", "verdict", "proposed_weight_pct", "reason"], rows));
  console.log("Created engine/input/companies.csv (verdicts empty = model decides)");
} else console.log("Kept existing engine/input/companies.csv (human decisions are never overwritten)");

console.log(`financials: ${finRows.length} rows · facts: ${factRows.length} · distributions: ${distRows.length} · sources: ${sourceRows.length} · organic: ${organicRows.length} · deals: ${Object.values(deals).flat().length}`);
for (const w of warnings) console.log("  - " + w);
