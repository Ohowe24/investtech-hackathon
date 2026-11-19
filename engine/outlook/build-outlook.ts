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
  OutlookLens,
  OutlookMixRow,
  OutlookMixShift,
  OutlookRules,
  OutlookSignal,
} from "../../contract/outlook";
import { parseCsv } from "../csv";
import { cagr, directionOf, industryOutlook, marketWeights, median, mixShift, realGrowth, shares, sumStrict, trailingMomentum, trendOf, weightedOutlook } from "../metrics";
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
  mixFrom: 2022, // mix shift: FY2022, three fiscal years before the latest mix
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
const statcanMembers = statcanMeta.dimension.find((d) => /NAICS/.test(d.dimensionNameEn))!.member as {
  classificationCode: string;
  memberNameEn: string;
  memberId: number;
}[];
const statcanName = new Map(statcanMembers.map((m) => [m.classificationCode, m.memberNameEn]));
// guard: each stored series must be the industry it is filed under (StatCan answers out of order)
for (const [code, s] of Object.entries(statcan.series)) {
  const want = statcanMembers.find((m) => m.classificationCode === code)?.memberId;
  const got = Number((s as { coordinate?: string }).coordinate?.split(".")[3]);
  if (want !== got) throw new Error(`StatCan series filed under ${code} is industry member ${got}, expected ${want}: re-run npm run outlook:fetch`);
}

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
  if (!code) return { ...base, series: "COPS 2026–2035 · no matching series", value: null, note: "COPS publishes no series for this industry (see the industry note)" };
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
          markets: marketWeights((l?.markets ?? "").split(" ")).map((w) => ({
            code: w.market,
            title: w.market ? (industryOf.get(w.market)?.title ?? null) : null,
            weight: w.weight,
            outlook: w.market ? (industryOf.get(w.market)?.outlook ?? null) : null,
          })),
          marketsNote: orNull(l?.markets_note),
        };
      }),
  );

const latestDealYear = Math.max(...dealsBase.filter((d) => !d.exclude && d.fiscalYear != null).map((d) => d.fiscalYear as number));
RULES.dealYears = [latestDealYear - 2, latestDealYear - 1, latestDealYear];

const deals: OutlookDeal[] = dealsBase
  .map((d) => ({ ...d, recent: !d.exclude && d.fiscalYear != null && RULES.dealYears.includes(d.fiscalYear) }))
  .sort((a, b) => a.ticker.localeCompare(b.ticker) || (b.fiscalYear ?? 0) - (a.fiscalYear ?? 0) || b.date.localeCompare(a.date));

const missingIndustry = [
  ...new Set([...deals.map((d) => d.naics), ...deals.flatMap((d) => d.markets.map((m) => m.code))].filter((n): n is string => !!n && !industryOf.has(n))),
];
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

type MixFrom = { period: string; shares: (number | null)[] } | null;

function companyMix(ticker: string): { mix: OutlookMixRow[]; geography: OutlookGeoRow[]; period: string | null; from: MixFrom; notes: string[] } {
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
    market: orNull(r.market),
    marketTitle: r.market && industryOf.has(r.market) ? industryOf.get(r.market)!.title : null,
    marketNote: orNull(r.market_note),
    sourceIds: ["onesheet-segments", "onesheet-profile"],
  }));
  if (!p) notes.push("No annual period reports every revenue segment, so the mix is unknown.");

  // the same segments in the earlier year (rules.mixFrom), only if every one is reported
  const f = file.data.data.find(
    (q) => q.periodType === "Annual" && q.reportDate.startsWith(String(RULES.mixFrom)) && rows.every((r) => typeof q.metricsValues[r.metric_id] === "number"),
  );
  const from: MixFrom = f ? { period: `FY${RULES.mixFrom}`, shares: shares(rows.map((r) => f.metricsValues[r.metric_id])) } : null;

  const geoRows = segmentMap.filter((r) => r.ticker === ticker && r.kind === "geography");
  const g = geoRows.length ? latestComplete(file, geoRows.map((r) => r.metric_id)) : null;
  const gs = shares(geoRows.map((r) => (g ? g.metricsValues[r.metric_id] : null)));
  const geography: OutlookGeoRow[] = g
    ? geoRows.map((r, i) => ({ region: r.segment, share: gs[i], period: `FY${g.reportDate.slice(0, 4)}`, sourceIds: ["onesheet-segments"] }))
    : [];
  return { mix, geography, period, from, notes };
}

/** How the mix moved from rules.mixFrom to the latest mix, read by industry (naics) or by client market (market). */
function mixShiftOf(mix: OutlookMixRow[], from: MixFrom, codeOf: (r: OutlookMixRow) => string | null): OutlookMixShift | null {
  if (!mix.length || !mix[0].period) return null;
  const outlookOf = (code: string | null) => (code && industryOf.has(code) ? industryOf.get(code)!.outlook : null);
  const rows = mix.map((r, i) => {
    const code = codeOf(r);
    return { segment: r.segment, code, title: code ? (industryOf.get(code)?.title ?? null) : null, from: from ? from.shares[i] : null, to: r.share };
  });
  const m = mixShift(rows.map((r) => ({ from: r.from, to: r.to, outlook: outlookOf(r.code) })), RULES.minCoverage);
  const read = new Set(rows.filter((r) => outlookOf(r.code) != null).map((r) => r.code));
  const left = rows.filter((r) => outlookOf(r.code) == null).map((r) => r.segment);
  const note = !from
    ? `Not every segment is reported for FY${RULES.mixFrom}, so the mix cannot be compared.`
    : read.size === 1
      ? "All revenue is read as one industry, so the mix cannot shift between industries."
      : left.length
        ? `${left.join(", ")} has no outlook here and is left out of both years.`
        : null;
  return {
    from: `FY${RULES.mixFrom}`,
    to: mix[0].period,
    rows,
    tailwindFrom: m.from,
    tailwindTo: m.to,
    shift: m.shift,
    direction: directionOf(m.to, m.from, RULES.directionBand),
    note,
  };
}

// ---------------------------------------------------------------- Layer 2: narrative (quoted, never scored)

interface Transcript {
  year: number;
  quarter: number;
  date: string;
  content: string;
}
const narrativeRows = parseCsv(read("engine/input/outlook-narrative.csv"));
function transcriptOf(ticker: string): Transcript | null {
  const p = `engine/raw/outlook/transcripts/${ticker}.json`;
  if (!existsSync(p)) return null;
  const j = JSON.parse(read(p)) as { data?: Transcript | Transcript[] } & Transcript;
  const d = j.data ?? j;
  return Array.isArray(d) ? (d[0] ?? null) : d;
}
function narrativeOf(ticker: string): { items: OutlookCompany["narrative"]; note: string | null } {
  const t = transcriptOf(ticker);
  const rows = narrativeRows.filter((r) => r.ticker === ticker);
  if (!t) return { items: [], note: "No earnings-call transcript fetched." };
  const call = `Q${t.quarter} ${t.year} earnings call, ${t.date.slice(0, 10)}`;
  if (rows.length === 0)
    return { items: [], note: `No narrative: the latest earnings-call transcript in Onesheet is from ${t.year} (Q${t.quarter}), too old to describe today's markets.` };
  const items = rows.map((r) => {
    const at = t.content.indexOf(r.quote);
    if (at < 0) throw new Error(`outlook-narrative.csv: quote for ${ticker} is not verbatim in its transcript: "${r.quote.slice(0, 60)}…"`);
    // speaker = the last "Name:" turn marker before the quote
    const before = t.content.slice(0, at);
    const marks = [...before.matchAll(/(?:^|\n)(\p{Lu}[\p{L}.'\- ]{2,40}):\s/gu)];
    return { speaker: marks.length ? marks[marks.length - 1][1].trim() : null, quote: r.quote, summary: r.summary, call, sourceIds: ["onesheet-transcripts"] };
  });
  return { items, note: null };
}

// ---------------------------------------------------------------- Layers 3 and 4: per company

/** "Who they sell to": the same tailwind and direction, read by the client markets of each segment and deal. */
function customerLens(mix: OutlookMixRow[], from: MixFrom, recent: OutlookDeal[], own: Omit<OutlookLens, "base">): OutlookLens {
  const bad = mix.filter((r) => r.market && !["economy", "same"].includes(r.market) && !industryOf.has(r.market));
  if (bad.length) throw new Error(`outlook-segments.csv: client market not in the industry map: ${bad.map((r) => r.market).join(", ")}`);

  // transport and construction: what they do is what their clients buy
  if (mix.length && mix.every((r) => r.market === "same"))
    return { ...own, base: "same", notes: ["What it does is what its clients buy (freight hauled, projects built), so this view equals “What they do”.", ...own.notes] };

  const notes: string[] = [];
  let tw: { value: number | null; coverage: number };
  let decliningShare: number | null = null;
  let industryMix: OutlookLens["industryMix"];
  let base: OutlookLens["base"];
  if (mix.length && mix.every((r) => r.market === "economy")) {
    base = "economy";
    tw = { value: economyOutlook, coverage: 1 };
    industryMix = [{ naics: "economy", title: "Whole economy", share: sumStrict(mix.map((r) => r.share)), segments: mix.map((r) => r.segment) }];
    notes.push(mix[0].marketNote ?? "Revenue by client market is not reported, so the base is the whole economy.");
  } else {
    base = "segments";
    const outlookOf = (code: string | null) => (code && industryOf.has(code) ? industryOf.get(code)!.outlook : null);
    tw = weightedOutlook(mix.map((r) => ({ weight: r.share, outlook: outlookOf(r.market) })), RULES.minCoverage);
    const withTrend = mix.filter((r) => r.share != null && r.market && industryOf.get(r.market)?.trend);
    decliningShare = withTrend.length
      ? sumStrict(withTrend.map((r) => (industryOf.get(r.market!)!.trend === "declining" ? r.share : 0)))
      : null;
    const codes = [...new Set(mix.map((r) => r.market ?? ""))];
    industryMix = codes
      .map((code) => {
        const rows = mix.filter((r) => (r.market ?? "") === code);
        return { naics: code, title: code ? (industryOf.get(code)?.title ?? code) : "No single client market", share: sumStrict(rows.map((r) => r.share)), segments: rows.map((r) => r.segment) };
      })
      .sort((a, b) => (a.naics ? 0 : 1) - (b.naics ? 0 : 1) || (b.share ?? -1) - (a.share ?? -1));
    const uncovered = mix.filter((r) => !r.market);
    if (uncovered.length)
      notes.push(`${uncovered.map((r) => r.segment).join(", ")} has no single client market and is left out of this view (${Math.round((1 - tw.coverage) * 100)}% of revenue).`);
  }

  const dw = weightedOutlook(recent.flatMap((d) => d.markets.map((m) => ({ weight: m.weight, outlook: m.outlook }))), RULES.minCoverage);
  const naming = recent.filter((d) => d.markets.some((m) => m.outlook != null)).length;
  if (recent.length && dw.value == null)
    notes.push(`Direction needs client markets for at least half of the recent deals: the filings name them for ${naming} of ${recent.length}.`);
  else if (recent.length && dw.coverage < 1 - 1e-9)
    notes.push(`Direction rests on the client markets named for ${naming} of ${recent.length} recent deals (${Math.round(dw.coverage * 100)}% of their weight).`);
  if (base === "economy" && dw.value != null) notes.push("Deals are compared with the whole economy, the base for a company with clients in every sector.");

  return {
    base,
    tailwind: tw.value,
    coverage: tw.coverage,
    trend: base === "economy" ? null : trendOf(tw.value, economyOutlook),
    decliningShare,
    dealOutlook: dw.value,
    dealCoverage: dw.coverage,
    directionGap: dw.value != null && tw.value != null ? dw.value - tw.value : null,
    direction: directionOf(dw.value, tw.value, RULES.directionBand),
    industryMix,
    mixShift: base === "economy" ? null : mixShiftOf(mix, from, (r) => r.market),
    notes,
  };
}

const companies: OutlookCompany[] = COMPANIES.map((c) => {
  const { mix, geography, period, from, notes } = companyMix(c.ticker);
  const shift = mixShiftOf(mix, from, (r) => r.naics);
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

  // plain notes, computed from the data (direction notes belong to the "what they do" view)
  const ownNotes: string[] = [];
  if (recent.length === 0) notes.push(`No disclosed acquisition in fiscal ${RULES.dealYears[0]}–${RULES.dealYears[2]}.`);
  else if (dw.value == null)
    ownNotes.push(`Direction needs at least half of the recent deals to have an industry: ${dealsWithOutlook} of ${recent.length} do. The filings don't say what the others are.`);
  else if (dealsWithOutlook < recent.length)
    ownNotes.push(`Direction rests on ${dealsWithOutlook} of ${recent.length} recent deals; the filings don't say what the other${recent.length - dealsWithOutlook === 1 ? " is" : "s are"}.`);
  const baseCodes = new Set(mix.map((r) => r.naics && industryOf.get(r.naics) ? industryOf.get(r.naics)!.signals.map((s) => s.series).join("|") : null));
  const dealCodes = new Set(recent.filter((d) => d.outlook != null).map((d) => industryOf.get(d.naics!)!.signals.map((s) => s.series).join("|")));
  if (dw.value != null && baseCodes.size === 1 && dealCodes.size === 1 && [...dealCodes][0] === [...baseCodes][0])
    ownNotes.push("Every recent deal is in the same industry as the existing business, so direction can only be steady. The markets those businesses serve are listed with each deal.");
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

  const narrative = narrativeOf(c.ticker);
  if (narrative.note) notes.push(narrative.note);

  const own = {
    tailwind: tw.value,
    coverage: tw.coverage,
    trend: trendOf(tw.value, economyOutlook),
    decliningShare,
    dealOutlook: dw.value,
    dealCoverage: dw.coverage,
    directionGap: dw.value != null && tw.value != null ? dw.value - tw.value : null,
    direction,
    industryMix,
    mixShift: shift,
    notes: ownNotes,
  };

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
    mixShift: shift,
    narrative: narrative.items,
    directionNotes: ownNotes,
    customer: customerLens(mix, from, recent, own),
    notes,
  };
});

// only the industries something points at, in a stable order
const usedCodes = new Set(
  [
    ...companies.flatMap((c) => c.mix.flatMap((r) => [r.naics, r.market])),
    ...deals.flatMap((d) => [d.naics, ...d.markets.map((m) => m.code)]),
  ].filter((x): x is string => !!x && industryOf.has(x)),
);

const out: OutlookData = {
  generatedAt: new Date().toISOString(),
  status: "complete", // every layer computes; deal labels still await a person's approval (shown on the page)
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
    `  ${c.ticker.padEnd(5)} clients: base ${c.customer.base} ${pct(c.customer.tailwind)} (${c.customer.trend ?? "—"}, coverage ${pct(c.customer.coverage)}) · deals ${pct(c.customer.dealOutlook)} (coverage ${pct(c.customer.dealCoverage)}) · ${c.customer.direction ?? "—"}`,
  );
for (const c of companies)
  console.log(
    `  ${c.ticker.padEnd(5)} tailwind ${pct(c.tailwind)} (${c.trend ?? "—"}, coverage ${pct(c.coverage)}) · deals ${pct(c.dealOutlook)} on ${c.dealsWithOutlook}/${c.dealCount} · ${c.direction ?? "—"}`,
  );
