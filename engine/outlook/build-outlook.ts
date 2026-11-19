// npm run outlook: builds data/outlook.json for the Outlook engine tab. See docs/OUTLOOK_ENGINE.md and
// engine/methodology.md ("Outlook engine"). Run `npm run outlook:fetch` first (raw files are git-ignored).
//
//   Layer 1  deals (engine/input/deals.json) + labels (outlook-labels.csv); revenue mix from Onesheet segments
//            (engine/raw/segments/) mapped to industries in outlook-segments.csv
//   Layer 2  per industry (outlook-industry-map.csv): StatCan momentum, COPS and BLS projections, Onesheet street forecast
//   Layer 3  tailwind = revenue-weighted industry outlook
//   Layer 4  direction = outlook of recent deals vs the tailwind
//
// Copies values and runs the formulas in engine/metrics.ts. Never creates a number.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type {
  OutlookCompany,
  OutlookData,
  OutlookDeal,
  OutlookGeoRow,
  OutlookIndustry,
  OutlookMixRow,
  OutlookRules,
  OutlookSignal,
} from "../../contract/outlook";
import { parseCsv } from "../csv";
import { cagr, directionOf, industryOutlook, median, realGrowth, shares, sumStrict, trailingMomentum, trendOf, weightedOutlook } from "../metrics";
import { COMPANIES, LAYERS, SOURCES, THESIS } from "./plan";

const read = (p: string) => readFileSync(p, "utf8");
const need = (p: string) => {
  if (!existsSync(p)) throw new Error(`${p} is missing: run \`npm run outlook:fetch\` first`);
  return p;
};
const orNull = (s: string | undefined) => (s ? s : null);
const num = (s: string | undefined) => {
  if (s == null || s.trim() === "") return null;
  const v = Number(s.replace(/,/g, ""));
  return Number.isFinite(v) ? v : null;
};

// ---------------------------------------------------------------- declared rules (see methodology.md)

const RULES: OutlookRules = {
  minSignals: 2, // one source alone is an opinion; two agree or disagree visibly
  minCoverage: 0.5, // a tailwind must describe at least half the revenue (or half the deals)
  directionBand: 0.01, // ±1 point a year: smaller gaps are within the noise of the sources
  inflation: 0.02, // Bank of Canada inflation-control target; used only to put analyst revenue estimates in real terms
  dealYears: [], // filled below: the latest fiscal year with a deal and the two before it
  streetFrom: 2026, // fiscal year ending in the year of this build …
  streetTo: 2028, // … to two years later
  minPeers: 2,
  momentumYears: 3,
};

// ---------------------------------------------------------------- inputs

const industryMap = parseCsv(read("engine/input/outlook-industry-map.csv"));
const segmentMap = parseCsv(read("engine/input/outlook-segments.csv"));
const blsRows = parseCsv(read("engine/input/outlook-bls-ep.csv"));
const market = parseCsv(read("engine/input/market.csv"));
const nameOf = new Map(market.map((r) => [r.ticker, r.name]));

interface StatcanPoint {
  refPer: string;
  value: number | null;
}
const statcan = JSON.parse(read(need("engine/raw/outlook/statcan-36100434-data.json"))) as {
  cubeEndDate: string;
  fetchedAt: string;
  series: Record<string, { vectorId: number; vectorDataPoint: StatcanPoint[] }>;
};
const statcanMeta = JSON.parse(read(need("engine/raw/outlook/statcan-36100434-meta.json")))[0].object as {
  dimension: { dimensionNameEn: string; member: { classificationCode: string; memberNameEn: string }[] }[];
};
const statcanName = new Map(
  statcanMeta.dimension.find((d) => /NAICS/.test(d.dimensionNameEn))!.member.map((m) => [m.classificationCode, m.memberNameEn]),
);

// COPS: the GDP-levels file (the published growth-rate file is misaligned by one row; see methodology.md)
const copsLines = parseCsv(read(need("engine/raw/outlook/cops-gdp-2026-2035.csv")).replace(/^﻿/, ""));
const cops = new Map(copsLines.filter((r) => /^IN\d\d$/.test(r.IND_Code ?? "")).map((r) => [r.IND_Code, r]));

// ---------------------------------------------------------------- Layer 2: signals

const fmtMonth = (refPer: string) =>
  new Date(refPer + "T00:00:00Z").toLocaleString("en-CA", { month: "short", year: "numeric", timeZone: "UTC" });

function momentumSignal(code: string): OutlookSignal {
  const s = statcan.series[code];
  const name = statcanName.get(code) ?? code;
  const base = { kind: "momentum" as const, label: "Recent momentum", geo: "Canada" as const, series: `StatCan 36-10-0434 · ${name} [${code}]`, sourceIds: ["statcan-36-10-0434"] };
  if (!s) return { ...base, value: null, note: "Series not fetched", period: "" };
  const pts = [...s.vectorDataPoint].sort((a, b) => a.refPer.localeCompare(b.refPer));
  const n = 12 * (RULES.momentumYears + 1);
  const last = pts.slice(-n);
  const value = trailingMomentum(last.map((p) => p.value), RULES.momentumYears);
  const period =
    last.length >= n ? `${fmtMonth(last[0].refPer)}–${fmtMonth(last[11].refPer)} → ${fmtMonth(last[n - 12].refPer)}–${fmtMonth(last[n - 1].refPer)}` : "";
  return { ...base, value, period, ...(value == null ? { note: "Fewer than 48 complete months" } : {}) };
}

function copsSignal(code: string): OutlookSignal {
  const r = cops.get(code);
  const base = { kind: "projection" as const, label: "Official projection", geo: "Canada" as const, sourceIds: ["esdc-cops-2026"], period: "2025 → 2035" };
  if (!r) return { ...base, series: `COPS 2026–2035 · ${code}`, value: null, note: "Industry not in the COPS file" };
  return { ...base, series: `COPS 2026–2035 · ${r.Industry} [${r.NAICS_SCIAN}]`, value: cagr(num(r["2025"]), num(r["2035"]), 10) };
}

function blsSignal(code: string): OutlookSignal {
  const r = blsRows.find((x) => x.bls_code === code);
  const base = { kind: "projection" as const, label: "Official projection", geo: "United States" as const, sourceIds: ["bls-ep-2-11"], period: "2025 → 2035" };
  if (!r) return { ...base, series: `BLS Table 2.11 · ${code}`, value: null, note: "Industry not in BLS Table 2.11" };
  return { ...base, series: `BLS Table 2.11 · ${r.title} [${code}]`, value: cagr(num(r.output_2025), num(r.output_2035), 10) };
}

interface Estimate {
  date: string;
  estimatedRevenueAvg: number | null;
  numberAnalystEstimatedRevenue: number | null;
}
function peerGrowth(ticker: string): number | null {
  const p = `engine/raw/outlook/estimates/${ticker}.json`;
  if (!existsSync(p)) return null;
  const rows = ((JSON.parse(read(p)) as { data?: Estimate[] }).data ?? []).filter((r) => (r.numberAnalystEstimatedRevenue ?? 0) >= 1);
  const inYear = (y: number) => rows.find((r) => Number(r.date.slice(0, 4)) === y)?.estimatedRevenueAvg ?? null;
  return cagr(inYear(RULES.streetFrom), inYear(RULES.streetTo), RULES.streetTo - RULES.streetFrom);
}

function streetSignal(peerList: string): OutlookSignal {
  const tickers = peerList ? peerList.split(" ") : [];
  const peers = tickers.map((t) => ({ ticker: t, name: nameOf.get(t) ?? t, growth: peerGrowth(t) }));
  const withData = peers.filter((p) => p.growth != null);
  const nominal = withData.length >= RULES.minPeers ? median(withData.map((p) => p.growth)) : null;
  const value = realGrowth(nominal, RULES.inflation);
  const note =
    tickers.length === 0
      ? "No listed Canadian peer outside the candidates"
      : withData.length < RULES.minPeers
        ? `Only ${withData.length} listed Canadian peer${withData.length === 1 ? "" : "s"} with estimates (need ${RULES.minPeers})`
        : undefined;
  return {
    kind: "street",
    label: "Street forecast",
    geo: "Canada",
    series: `Onesheet analyst estimates · median of ${withData.length} listed Canadian peer${withData.length === 1 ? "" : "s"}`,
    value,
    nominal,
    peers,
    period: `FY${RULES.streetFrom} → FY${RULES.streetTo}`,
    sourceIds: ["onesheet-estimates", "boc-inflation-target"],
    ...(note ? { note } : {}),
  };
}

// the whole economy, measured the same way (no street forecast: there is no "peer group" for everything)
const economySignals = [momentumSignal("T001"), copsSignal("IN00"), blsSignal("TE1000")];
const economyOutlook = industryOutlook(economySignals.map((s) => s.value), RULES.minSignals);

const industries: OutlookIndustry[] = industryMap.map((m) => {
  const signals = [momentumSignal(m.statcan), copsSignal(m.cops), blsSignal(m.bls), streetSignal(m.peers)];
  const outlook = industryOutlook(signals.map((s) => s.value), RULES.minSignals);
  return { naics: m.naics, title: m.title, signals, outlook, trend: trendOf(outlook, economyOutlook), note: orNull(m.note) };
});
const industryOf = new Map(industries.map((i) => [i.naics, i]));

// ---------------------------------------------------------------- Layer 1: deals and labels

interface RawDeal {
  type: string;
  date?: string;
  periodLabel?: string;
  fiscalYear?: number;
  counterparty?: string;
  summary?: string;
  quotes?: { label: string; quote: string }[];
}

const LABELS = "engine/input/outlook-labels.csv";
const dealKey = (ticker: string, date: string, counterparty: string) => `${ticker}|${date}|${counterparty}`;
const labels = new Map(parseCsv(read(LABELS)).map((r) => [dealKey(r.ticker, r.date, r.counterparty), r]));

const raw = JSON.parse(read("engine/input/deals.json")) as Record<string, RawDeal[]>;
const tickers = new Set(COMPANIES.map((c) => c.ticker));

const dealsBase = Object.entries(raw)
  .filter(([t]) => tickers.has(t))
  .flatMap(([ticker, list]) =>
    list
      .filter((d) => d.type === "acquisition")
      .map((d) => {
        const date = d.date ?? d.periodLabel ?? "";
        const counterparty = d.counterparty ?? "";
        const l = labels.get(dealKey(ticker, date, counterparty));
        const naics = orNull(l?.naics);
        return {
          ticker,
          date,
          // the filing's fiscal year; for undated rows, the year their own text names (labels CSV, with a note)
          fiscalYear: d.fiscalYear ?? num(l?.fiscal_year),
          counterparty,
          summary: d.summary ?? "",
          quote: d.quotes?.[0]?.quote ?? null,
          naics,
          naicsTitle: orNull(l?.naics_title),
          naicsQuote: orNull(l?.quote),
          naicsQuoteSource: orNull(l?.quote_source),
          serves: orNull(l?.serves),
          labelStatus: (l?.status === "approved" ? "approved" : l ? "proposed" : "unlabelled") as OutlookDeal["labelStatus"],
          exclude: orNull(l?.exclude),
          labelNote: orNull(l?.note),
          outlook: naics ? (industryOf.get(naics)?.outlook ?? null) : null,
        };
      }),
  );

const latestDealYear = Math.max(...dealsBase.filter((d) => !d.exclude && d.fiscalYear != null).map((d) => d.fiscalYear as number));
RULES.dealYears = [latestDealYear - 2, latestDealYear - 1, latestDealYear];

const deals: OutlookDeal[] = dealsBase
  .map((d) => ({ ...d, recent: !d.exclude && d.fiscalYear != null && RULES.dealYears.includes(d.fiscalYear) }))
  .sort((a, b) => a.ticker.localeCompare(b.ticker) || (b.fiscalYear ?? 0) - (a.fiscalYear ?? 0) || b.date.localeCompare(a.date));

const missingIndustry = [...new Set(deals.map((d) => d.naics).filter((n): n is string => !!n && !industryOf.has(n)))];
if (missingIndustry.length) throw new Error(`NAICS codes used by deals but missing from outlook-industry-map.csv: ${missingIndustry.join(", ")}`);

// ---------------------------------------------------------------- Layer 1: revenue mix from segments

interface SegPeriod {
  periodType: string;
  reportDate: string;
  calendarYear: number;
  metricsValues: Record<string, number | null>;
}
interface SegFile {
  data: { currency: string; data: SegPeriod[] };
}

/** latest annual period in which every listed metric is reported */
function latestComplete(file: SegFile, metricIds: string[]): SegPeriod | null {
  return (
    file.data.data
      .filter((p) => p.periodType === "Annual" && metricIds.every((m) => typeof p.metricsValues[m] === "number"))
      .sort((a, b) => b.reportDate.localeCompare(a.reportDate))[0] ?? null
  );
}

function companyMix(ticker: string): { mix: OutlookMixRow[]; geography: OutlookGeoRow[]; period: string | null; notes: string[] } {
  const notes: string[] = [];
  const file = JSON.parse(read(need(`engine/raw/segments/${ticker}.json`))) as SegFile;
  const rows = segmentMap.filter((r) => r.ticker === ticker && r.kind === "industry");
  const p = latestComplete(file, rows.map((r) => r.metric_id));
  const period = p ? `FY${p.reportDate.slice(0, 4)}` : null;
  const values = rows.map((r) => (p ? p.metricsValues[r.metric_id] : null));
  const s = shares(values);
  const mix: OutlookMixRow[] = rows.map((r, i) => ({
    segment: r.segment,
    naics: orNull(r.naics),
    naicsTitle: r.naics ? (industryOf.get(r.naics)?.title ?? null) : null,
    revenue: values[i] ?? null,
    currency: file.data.currency,
    share: s[i],
    period: period ?? "",
    quote: orNull(r.quote),
    quoteSource: orNull(r.quote_source),
    serves: orNull(r.serves),
    note: orNull(r.note),
    sourceIds: ["onesheet-segments", "onesheet-profile"],
  }));
  if (!p) notes.push("No annual period reports every revenue segment, so the mix is unknown.");

  const geoRows = segmentMap.filter((r) => r.ticker === ticker && r.kind === "geography");
  const g = geoRows.length ? latestComplete(file, geoRows.map((r) => r.metric_id)) : null;
  const gs = shares(geoRows.map((r) => (g ? g.metricsValues[r.metric_id] : null)));
  const geography: OutlookGeoRow[] = g
    ? geoRows.map((r, i) => ({ region: r.segment, share: gs[i], period: `FY${g.reportDate.slice(0, 4)}`, sourceIds: ["onesheet-segments"] }))
    : [];
  return { mix, geography, period, notes };
}

// ---------------------------------------------------------------- Layers 3 and 4: per company

const companies: OutlookCompany[] = COMPANIES.map((c) => {
  const { mix, geography, period, notes } = companyMix(c.ticker);
  const outlookOf = (naics: string | null) => (naics ? (industryOf.get(naics)?.outlook ?? null) : null);
  const tw = weightedOutlook(mix.map((r) => ({ weight: r.share, outlook: outlookOf(r.naics) })), RULES.minCoverage);

  // red flag: share of revenue in declining industries (only over revenue whose industry has a trend)
  const withTrend = mix.filter((r) => r.share != null && r.naics && industryOf.get(r.naics)?.trend);
  const decliningShare = withTrend.length
    ? withTrend.filter((r) => industryOf.get(r.naics!)!.trend === "declining").reduce((sum, r) => sum + (r.share as number), 0)
    : null;

  const recent = deals.filter((d) => d.ticker === c.ticker && d.recent);
  const dw = weightedOutlook(recent.map((d) => ({ weight: 1, outlook: d.outlook })), RULES.minCoverage);
  const dealsWithOutlook = recent.filter((d) => d.outlook != null).length;
  const direction = directionOf(dw.value, tw.value, RULES.directionBand);

  // plain notes, computed from the data
  if (recent.length === 0) notes.push(`No disclosed acquisition in fiscal ${RULES.dealYears[0]}–${RULES.dealYears[2]}.`);
  else if (dw.value == null)
    notes.push(`Direction needs at least half of the recent deals to have an industry: ${dealsWithOutlook} of ${recent.length} do. The filings don't say what the others are.`);
  else if (dealsWithOutlook < recent.length)
    notes.push(`Direction rests on ${dealsWithOutlook} of ${recent.length} recent deals; the filings don't say what the other${recent.length - dealsWithOutlook === 1 ? " is" : "s are"}.`);
  const baseCodes = new Set(mix.map((r) => r.naics && industryOf.get(r.naics) ? industryOf.get(r.naics)!.signals.map((s) => s.series).join("|") : null));
  const dealCodes = new Set(recent.filter((d) => d.outlook != null).map((d) => industryOf.get(d.naics!)!.signals.map((s) => s.series).join("|")));
  if (dw.value != null && baseCodes.size === 1 && dealCodes.size === 1 && [...dealCodes][0] === [...baseCodes][0])
    notes.push("Every recent deal is in the same industry as the existing business, so direction can only be steady. The markets those businesses serve are listed with each deal.");
  if (recent.some((d) => d.labelStatus !== "approved")) notes.push("Deal industry labels are proposed and awaiting approval.");
  if (geography.length === 0) notes.push("Revenue by region is not in the Onesheet segment data; the signals describe Canada and the United States.");
  else {
    const outside = sumStrict(geography.filter((g) => !/Canada|United States|Americas/.test(g.region)).map((g) => g.share));
    if (outside != null && outside >= 1 - 1e-9)
      notes.push("All reported revenue is outside North America, while the signals describe Canada and the United States: read the outlook as indicative.");
    else if (outside != null && outside >= 0.1)
      notes.push(`${Math.round(outside * 100)}% of revenue is earned outside Canada and the Americas; the signals describe Canada and the United States.`);
  }

  const industryMix = [...new Set(mix.map((r) => r.naics).filter(Boolean) as string[])]
    .map((naics) => {
      const rows = mix.filter((r) => r.naics === naics);
      return { naics, title: industryOf.get(naics)?.title ?? naics, share: sumStrict(rows.map((r) => r.share)), segments: rows.map((r) => r.segment) };
    })
    .sort((a, b) => (b.share ?? -1) - (a.share ?? -1));

  return {
    ticker: c.ticker,
    name: c.name,
    mixPeriod: period,
    mix,
    industryMix,
    geography,
    tailwind: tw.value,
    coverage: tw.coverage,
    trend: trendOf(tw.value, economyOutlook),
    decliningShare,
    dealOutlook: dw.value,
    dealCount: recent.length,
    dealsWithOutlook,
    directionGap: dw.value != null && tw.value != null ? dw.value - tw.value : null,
    direction,
    notes,
  };
});

// only the industries something points at, in a stable order
const usedCodes = new Set([...companies.flatMap((c) => c.mix.map((r) => r.naics)), ...deals.map((d) => d.naics)].filter(Boolean) as string[]);

const out: OutlookData = {
  generatedAt: new Date().toISOString(),
  status: "partial", // narrative (Layer 2, never scored) not built; labels awaiting approval
  thesis: THESIS,
  layers: LAYERS,
  sources: SOURCES.map((s) =>
    s.id === "statcan-36-10-0434" ? { ...s, detail: `Monthly data to ${fmtMonth(statcan.cubeEndDate)}, fetched ${statcan.fetchedAt.slice(0, 10)}` } : s,
  ),
  rules: RULES,
  economy: { signals: economySignals, outlook: economyOutlook },
  companies,
  deals,
  industries: industries.filter((i) => usedCodes.has(i.naics)),
};

writeFileSync("data/outlook.json", JSON.stringify(out, null, 2) + "\n");

const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
console.log(`data/outlook.json: ${deals.length} deals, ${out.industries.length} industries, economy ${pct(economyOutlook)}/yr`);
for (const c of companies)
  console.log(
    `  ${c.ticker.padEnd(5)} tailwind ${pct(c.tailwind)} (${c.trend ?? "—"}, coverage ${pct(c.coverage)}) · deals ${pct(c.dealOutlook)} on ${c.dealsWithOutlook}/${c.dealCount} · ${c.direction ?? "—"}`,
  );
