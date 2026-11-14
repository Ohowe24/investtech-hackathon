// REITs profile
// Judged on company-reported figures (FFO, AFFO, payout, leverage, occupancy) from SEDAR filings, via the
// Onesheet company profiles in the data pack. Every threshold is a declared rule; the research behind each one
// is in reports/REIT evaluation variables.md, and the formulas are in methodology.md.

import type { MetricDef, MetricValue } from "../../contract/types";
import { latestFact, periodLabel, samePeriodRatio, yearOverYear, type FactFilter } from "../facts";
import type { CheckDef, FinRow, IndustryProfile, MetricContext, UniverseEntry } from "./types";

// Which reported fields hold which figure. The quote filters make sure a field is only used when its filing
// quote names that figure: the same field id holds different figures at different REITs (see the research note,
// "Mislabelled fields": CAPREIT's affo_ratio is its ACFO payout, Granite's is capex per square foot, RioCan's
// recent debt_ratio is its floating-rate share, Killam's debt-to-EBITDA field holds a % change).
const F = {
  affoPayout: { metrics: ["affo_payout_ratio", "affo_ratio"], quote: /AFFO payout/i, exclude: /ACFO/i, min: 0.05, max: 3 },
  distributions: { metrics: ["distributions_per_unit", "distribution_per_unit"], quote: /distribution/i, min: 0 },
  affoPerUnit: { metrics: ["affo_per_share"], min: 0 },
  ffoPerUnit: { metrics: ["ffo_per_share"] },
  sameProperty: { metrics: ["same_store_noi_change_pct"], min: -1, max: 1 },
  debtRatio: {
    metrics: ["total_debt_to_gross_book_value_ratio", "total_indebtedness_ratio", "debt_ratio"],
    quote: /gross book value|indebtedness|percentage of assets|total assets/i, exclude: /floating|variable|mortgages/i, min: 0.05, max: 0.95,
  },
  debtToEbitda: {
    metrics: ["adjusted_spot_debt_to_adjusted_ebitda_ratio", "adjusted_adjusted_debt_to_adjusted_ebitda_ratio"],
    quote: /debt to (adjusted |normalized )?EBITDA/i, exclude: /change/i, min: 1, max: 30,
  },
  occupancy: {
    metrics: ["occupancy_pct", "occupancy", "apartment_occupancy", "industrial_occupancy_pct", "committed_occupancy", "canada_occupancy"],
    quote: /occupan/i, min: 0.3, max: 1,
  },
} satisfies Record<string, FactFilter>;

const settings = {
  id: "reits",
  name: "REITs",
  tagline: "Landlords that pay out most of their cash. Is the distribution covered, is cash per unit growing, and is the debt safe?",
  indexName: "REITs across borders",
  currency: "USD",
  question: "Which Canadian REITs should be added to the REIT index?",
  /** same sleeve as the acquirer index: the organizers said each fund's open slice could drop toward 15% */
  sleevePct: 15,
  /** the REIT index's most common weight: five holdings sit at 3.42% */
  maxWeightPct: 3.42,
  relatedGroups: [] as string[][],
  scoring: { passShare: 0.75, mixedShare: 0.5, minAvailable: 3 },

  /** Research and sources for every line: reports/REIT evaluation variables.md */
  checks: [
    { id: "payoutCovered", kind: "gate", label: "AFFO payout ≤ 100%", metricId: "affoPayout", op: "<=", threshold: 1,
      rule: "Distributions are covered by recurring cash flow: AFFO payout is at most 100%" },
    { id: "debtLimit", kind: "gate", label: "Debt ≤ 60% of assets", metricId: "debtRatio", op: "<=", threshold: 0.6,
      rule: "Debt is at most 60% of gross book value or total assets" },
    { id: "payoutCushion", kind: "score", label: "AFFO payout ≤ 90%", metricId: "affoPayout", op: "<=", threshold: 0.9,
      rule: "The payout leaves at least 10% of AFFO in the business" },
    { id: "debtToEbitda", kind: "score", label: "Debt ≤ 9× EBITDA", metricId: "debtToEbitda", op: "<=", threshold: 9,
      rule: "Debt is at most 9 times adjusted EBITDA (company-reported)" },
    { id: "organicNoi", kind: "score", label: "Same-property NOI ≥ 2%", metricId: "samePropertyNoi", op: ">=", threshold: 0.02,
      rule: "Same-property NOI grew at least 2%, in line with the inflation target" },
    { id: "ffoGrowth", kind: "score", label: "FFO per unit not falling", metricId: "ffoPerUnitGrowth", op: ">=", threshold: 0,
      rule: "FFO per unit did not fall year over year (like-for-like periods)" },
    { id: "occupancy", kind: "score", label: "Occupancy ≥ 93.8%", metricId: "occupancy", op: ">=", threshold: 0.938,
      rule: "Occupancy is at or above the US REIT industry level (93.8%)" },
  ] satisfies CheckDef[],

  metricDefs: [
    {
      id: "affoPayout",
      short: "AFFO payout",
      label: "AFFO payout ratio",
      unit: "pct",
      higherIsBetter: false,
      description: "Share of recurring cash flow paid out as distributions.",
      formula: "The REIT's own AFFO payout ratio, from its latest fiscal year (the longest period reported in it). If it reports none, distributions per unit ÷ AFFO per unit for the same period.",
      why: "Above 100%, the distribution is paid with something other than recurring cash: new debt, new units or asset sales. Below 90% leaves a margin.",
      facts: [
        "REALPAC defines AFFO as \"a recurring economic earnings measure\" (REALPAC FFO & AFFO white paper, January 2022).",
        "CAPREIT's credit facility caps its FFO payout at 100%; Nexus guides to a payout \"below 100%\".",
        "The 90% margin is a common income-investor rule of thumb, not a studied threshold.",
      ],
    },
    {
      id: "debtRatio",
      short: "Debt ratio",
      label: "Debt ÷ gross book value",
      unit: "pct",
      higherIsBetter: false,
      description: "Share of the property portfolio funded with debt.",
      formula: "Total debt ÷ gross book value (or total assets, or the REIT's covenant 'total indebtedness' ratio), as reported, at the latest balance-sheet date.",
      why: "Leverage decides whether a REIT survives a fall in property values or a jump in rates. 60% is the strictest declaration-of-trust cap found.",
      facts: [
        "RioCan's limit is 60% of aggregate assets (2026 AIF); CAPREIT's covenant is 62.5% (trust deed 70%); Killam's is 70%.",
        "REITs that went into 2007–09 with more debt lost more value (Sun, Titman & Twite, 2015).",
      ],
    },
    {
      id: "debtToEbitda",
      short: "Debt ÷ EBITDA",
      label: "Debt ÷ adjusted EBITDA (company-reported)",
      unit: "multiple",
      higherIsBetter: false,
      description: "Years of operating profit needed to repay debt.",
      formula: "As the REIT reports it, latest date. Not computed here: debt and EBITDA in the data are dated differently.",
      why: "How rating agencies look at REIT leverage: debt against the income that services it.",
      facts: [
        "RioCan targets 8.0–9.0×. DBRS rates RioCan BBB at 9.4× and Granite BBB(high) at 7.1×.",
        "No published rating grid was found, so the 9× line rests on these individual ratings.",
      ],
    },
    {
      id: "samePropertyNoi",
      short: "Same-property NOI",
      label: "Same-property NOI growth (company-reported)",
      unit: "pct",
      higherIsBetter: true,
      description: "Growth in net operating income from properties owned in both periods.",
      formula: "As reported by the REIT, company-wide figure only. Latest fiscal year, the longest period reported in it.",
      why: "The REIT's organic growth: what the existing buildings earn, without help from acquisitions. 2% keeps pace with the Bank of Canada's inflation target.",
      facts: [
        "Nareit, Q2 2026: US REIT same-store NOI grew 4.1%, against 3.5% inflation.",
      ],
    },
    {
      id: "ffoPerUnitGrowth",
      short: "FFO per unit",
      label: "FFO per unit, growth over one year",
      unit: "pct",
      higherIsBetter: true,
      description: "Growth in funds from operations per unit.",
      formula: "Latest FFO per unit ÷ the same period a year earlier − 1. Full years first, then nine months, six months, a quarter.",
      why: "The REIT version of earnings per share. It falls when acquisitions or developments are funded with more new units than they earn.",
      facts: [
        "FFO is defined by Nareit (US) and REALPAC (Canada) so REITs can be compared.",
        "Academic support for FFO over net income is mixed (Fields, Rangan & Thiagarajan, 1998).",
      ],
    },
    {
      id: "occupancy",
      short: "Occupancy",
      label: "Occupancy (company-reported)",
      unit: "pct",
      higherIsBetter: true,
      description: "Share of space or suites that is leased.",
      formula: "As reported, latest date. Definitions differ (in-place or committed, by area or by suite, whole or same-property portfolio).",
      why: "Empty space earns nothing; falling occupancy is an early warning.",
      facts: ["Nareit, Q2 2026: US REITs across all sectors were 93.8% occupied."],
    },
    {
      id: "affoPerUnitGrowth",
      short: "AFFO per unit",
      label: "AFFO per unit, growth over one year",
      unit: "pct",
      higherIsBetter: true,
      description: "Growth in recurring cash flow per unit, after maintenance spending. Not scored: shown for context.",
      formula: "Latest AFFO per unit ÷ the same period a year earlier − 1, like for like.",
      why: "AFFO subtracts the spending needed to keep buildings rentable, so it is closer to the cash that can be paid out.",
    },
  ] satisfies MetricDef[],

  mapTitle: "AFFO payout vs FFO per unit growth",
  map: {
    x: "affoPayout",
    y: "ffoPerUnitGrowth",
    xThreshold: 0.9, // same line as the "payout cushion" check
    yThreshold: 0, // same line as the "FFO per unit not falling" check
    zones: {
      topLeft: "Covered payout · growing per unit",
      topRight: "Stretched payout · growing per unit",
      bottomLeft: "Covered payout · shrinking per unit",
      bottomRight: "Stretched payout · shrinking per unit",
    },
  },
};

function computeMetrics(_rows: FinRow[], ctx: MetricContext): { metrics: Record<string, MetricValue>; warnings: string[] } {
  const warnings: string[] = [];
  const facts = ctx.facts;
  if (facts.length === 0) warnings.push(`${ctx.ticker}: no company-reported figures in facts.csv`);

  const latest = (f: FactFilter, missing: string, pointInTime = false): MetricValue => {
    const x = latestFact(facts, f, pointInTime);
    return x
      ? { value: x.value, period: periodLabel(x), sourceIds: [x.sourceId], note: "Company-reported" }
      : { value: null, sourceIds: [], note: missing };
  };
  const growth = (f: FactFilter, what: string): MetricValue => {
    const g = yearOverYear(facts, f);
    if (!g) return { value: null, sourceIds: [], note: `No two like-for-like periods of ${what} a year apart` };
    return {
      value: g.value,
      period: `${periodLabel(g.from)} → ${periodLabel(g.to)}`,
      sourceIds: [g.from.sourceId, g.to.sourceId],
      ...(g.value == null ? { note: `${what} was not positive in the earlier period` } : {}),
    };
  };

  const payout = (): MetricValue => {
    const reported = latestFact(facts, F.affoPayout);
    if (reported) return { value: reported.value, period: periodLabel(reported), sourceIds: [reported.sourceId], note: "Company-reported" };
    const r = samePeriodRatio(facts, F.distributions, F.affoPerUnit);
    if (r) return { value: r.value, period: periodLabel(r.part), sourceIds: [r.part.sourceId, r.whole.sourceId], note: "Distributions per unit ÷ AFFO per unit (no reported AFFO payout ratio)" };
    return { value: null, sourceIds: [], note: "No AFFO payout ratio reported, and no period with both distributions and AFFO per unit" };
  };

  const metrics: Record<string, MetricValue> = {
    affoPayout: payout(),
    debtRatio: latest(F.debtRatio, "No debt to gross book value (or total assets) ratio reported in the data provided", true),
    debtToEbitda: latest(F.debtToEbitda, "No debt to EBITDA ratio reported in the data provided", true),
    samePropertyNoi: latest(F.sameProperty, "No company-wide same-property NOI growth reported in the data provided"),
    ffoPerUnitGrowth: growth(F.ffoPerUnit, "FFO per unit"),
    occupancy: latest(F.occupancy, "No occupancy rate reported in the data provided", true),
    affoPerUnitGrowth: growth(F.affoPerUnit, "AFFO per unit"),
  };
  return { metrics, warnings };
}

/** Canadian REITs the tool tests: XRE's holdings plus smaller TSX REITs. Sources: reports/REIT evaluation variables.md, appendix A. */
const universe: UniverseEntry[] = [
  { ticker: "REI.UN", name: "RioCan REIT", listedOn: "TSX", subSector: "Retail", why: "Held by the iShares S&P/TSX Capped REIT ETF (XRE).", sourceUrl: "https://stockanalysis.com/quote/tsx/XRE/holdings/" },
  { ticker: "GRT.UN", name: "Granite REIT", listedOn: "TSX", subSector: "Industrial", why: "Held by the iShares S&P/TSX Capped REIT ETF (XRE).", sourceUrl: "https://stockanalysis.com/quote/tsx/XRE/holdings/" },
  { ticker: "FCR.UN", name: "First Capital REIT", listedOn: "TSX", subSector: "Retail (grocery-anchored)", why: "Held by the iShares S&P/TSX Capped REIT ETF (XRE).", sourceUrl: "https://stockanalysis.com/quote/tsx/XRE/holdings/" },
  { ticker: "CAR.UN", name: "Canadian Apartment Properties REIT", listedOn: "TSX", subSector: "Residential", why: "Held by the iShares S&P/TSX Capped REIT ETF (XRE).", sourceUrl: "https://stockanalysis.com/quote/tsx/XRE/holdings/" },
  { ticker: "CHP.UN", name: "Choice Properties REIT", listedOn: "TSX", subSector: "Retail / diversified", why: "Held by the iShares S&P/TSX Capped REIT ETF (XRE).", sourceUrl: "https://stockanalysis.com/quote/tsx/XRE/holdings/" },
  { ticker: "SRU.UN", name: "SmartCentres REIT", listedOn: "TSX", subSector: "Retail", why: "Held by the iShares S&P/TSX Capped REIT ETF (XRE).", sourceUrl: "https://stockanalysis.com/quote/tsx/XRE/holdings/" },
  { ticker: "DIR.UN", name: "Dream Industrial REIT", listedOn: "TSX", subSector: "Industrial", why: "Held by the iShares S&P/TSX Capped REIT ETF (XRE).", sourceUrl: "https://stockanalysis.com/quote/tsx/XRE/holdings/" },
  { ticker: "PMZ.UN", name: "Primaris REIT", listedOn: "TSX", subSector: "Retail (enclosed malls)", why: "Held by the iShares S&P/TSX Capped REIT ETF (XRE).", sourceUrl: "https://stockanalysis.com/quote/tsx/XRE/holdings/" },
  { ticker: "HR.UN", name: "H&R REIT", listedOn: "TSX", subSector: "Diversified", why: "Held by the iShares S&P/TSX Capped REIT ETF (XRE).", sourceUrl: "https://stockanalysis.com/quote/tsx/XRE/holdings/" },
  { ticker: "BEI.UN", name: "Boardwalk REIT", listedOn: "TSX", subSector: "Residential", why: "Held by the iShares S&P/TSX Capped REIT ETF (XRE).", sourceUrl: "https://stockanalysis.com/quote/tsx/XRE/holdings/" },
  { ticker: "KMP.UN", name: "Killam Apartment REIT", listedOn: "TSX", subSector: "Residential", why: "Held by the iShares S&P/TSX Capped REIT ETF (XRE).", sourceUrl: "https://stockanalysis.com/quote/tsx/XRE/holdings/" },
  { ticker: "CRR.UN", name: "Crombie REIT", listedOn: "TSX", subSector: "Retail (grocery-anchored)", why: "Held by the iShares S&P/TSX Capped REIT ETF (XRE).", sourceUrl: "https://stockanalysis.com/quote/tsx/XRE/holdings/" },
  { ticker: "CRT.UN", name: "CT REIT", listedOn: "TSX", subSector: "Retail (net lease)", why: "Held by the iShares S&P/TSX Capped REIT ETF (XRE).", sourceUrl: "https://stockanalysis.com/quote/tsx/XRE/holdings/" },
  { ticker: "AP.UN", name: "Allied Properties REIT", listedOn: "TSX", subSector: "Office", why: "Held by the iShares S&P/TSX Capped REIT ETF (XRE).", sourceUrl: "https://stockanalysis.com/quote/tsx/XRE/holdings/" },
  { ticker: "NXR.UN", name: "Nexus Industrial REIT", listedOn: "TSX", subSector: "Industrial", why: "Organizers' candidate (data pack); TSX-listed industrial REIT.", sourceUrl: "https://app.researchpool.com/provider/globenewswire/nexus-industrial-reit-nxrun-nexus-industrial-reit-announces-fourth-quarter-and-year-end-2025-finan-kBXO8GJO0X" },
  { ticker: "SGR.UN", name: "Slate Grocery REIT", listedOn: "TSX", subSector: "Retail (US grocery-anchored)", why: "TSX-listed REIT owning US grocery-anchored centres.", sourceUrl: "https://www.businesswire.com/news/home/20260806782662/en/Slate-Grocery-REIT-Reports-Second-Quarter-2026-Results" },
  { ticker: "MRG.UN", name: "Morguard North American Residential REIT", listedOn: "TSX", subSector: "Residential", why: "TSX-listed apartment REIT in Canada and the US.", sourceUrl: "https://www.morguard.com/news-knowledge/news/news-detail?nid=123616" },
  { ticker: "MRT.UN", name: "Morguard REIT", listedOn: "TSX", subSector: "Diversified", why: "TSX-listed diversified REIT.", sourceUrl: "https://retail-insider.com/?p=210983" },
  { ticker: "APR.UN", name: "Automotive Properties REIT", listedOn: "TSX", subSector: "Retail (automotive net lease)", why: "TSX-listed net-lease REIT owning car dealerships.", sourceUrl: "https://quartr.com/events/automotive-properties-real-estate-investment-trust-apr-un-q2-2026_oCPfs7Vw" },
];

export const reits: IndustryProfile = {
  ...settings,
  universe,
  holdingNames: {
    EGP: "EastGroup Properties", O: "Realty Income", DLR: "Digital Realty", SPG: "Simon Property Group", MAA: "Mid-America Apartment Communities",
    IRS: "IRSA Inversiones y Representaciones", INVH: "Invitation Homes", AMT: "American Tower", VICI: "VICI Properties", KIM: "Kimco Realty",
    BXP: "BXP", CCI: "Crown Castle", PLD: "Prologis", PSA: "Public Storage", REXR: "Rexford Industrial", LRE: "Lead Real Estate",
  },
  hasStatements: false,
  reportedSeries: [
    { id: "ffoPerUnit", label: "FFO per unit", unit: "count", kind: "flow", filter: F.ffoPerUnit, note: "Per unit, in the REIT's reporting currency" },
    { id: "affoPerUnit", label: "AFFO per unit", unit: "count", kind: "flow", filter: F.affoPerUnit, note: "Per unit, in the REIT's reporting currency" },
    { id: "affoPayout", label: "AFFO payout ratio", unit: "pct", kind: "flow", filter: F.affoPayout, metricId: "affoPayout" },
    { id: "samePropertyNoi", label: "Same-property NOI growth", unit: "pct", kind: "flow", filter: F.sameProperty, metricId: "samePropertyNoi", note: "Each quarter against the same quarter a year earlier" },
    { id: "debtRatio", label: "Debt ÷ gross book value", unit: "pct", kind: "level", filter: F.debtRatio, metricId: "debtRatio" },
    { id: "occupancy", label: "Occupancy", unit: "pct", kind: "level", filter: F.occupancy, metricId: "occupancy", note: "As the REIT defines it" },
  ],
  rankTiebreak: "ffoPerUnitGrowth",
  ruleControls: [
    { id: "debtLimit", label: "Maximum debt / gross book value", min: 0.3, max: 0.7, step: 0.01, unit: "pct", why: "How much of the portfolio may be funded with debt?" },
    { id: "payoutCushion", label: "Maximum AFFO payout", min: 0.6, max: 1.1, step: 0.01, unit: "pct", why: "How much of recurring cash flow may be paid out?" },
    { id: "organicNoi", label: "Minimum same-property NOI growth", min: 0, max: 0.06, step: 0.005, unit: "pct", why: "How much should existing buildings grow on their own?" },
    { id: "debtToEbitda", label: "Maximum debt / EBITDA", min: 5, max: 12, step: 0.5, unit: "multiple", why: "How many years of profit may the debt represent?" },
  ],
  extraInputs: [],
  computeMetrics,
};


