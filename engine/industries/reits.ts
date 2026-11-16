// REITs profile
// Ranked only on figures Onesheet has for every REIT: annual statements (debt, assets, operating cash flow, revenue,
// units) and distributions per unit. Company-reported KPIs (FFO, AFFO, occupancy...) from the data pack are shown
// on the company page as context, never ranked. Every threshold is a declared rule; research behind each one is in
// reports/REIT evaluation variables.md, and the formulas are in methodology.md.

import type { MetricDef, MetricValue } from "../../contract/types";
import type { FactFilter } from "../facts";
import { cagr, cashPayoutRatio, distributionsInYear, perShare, ratioOfPositive } from "../metrics";
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
  /** company-wide occupancy from the Onesheet API's reported KPIs (REITs without a data-pack profile); see make-inputs.ts */
  occupancyKpi: {
    metrics: [
      "kpi_occupancy_percentage", "kpi_period_end_occupancy_rate", "kpi_occupancy_of_properties_owned", "kpi_average_occupancy",
      "kpi_total_average_physical_occupancy", "kpi_combined_shopping_center_portfolio_property_occupancy", "kpi_average_same_store_occupancy",
    ],
    min: 0.3, max: 1,
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
  /** strict on purpose: a REIT is added only if it passes every scored check, with data on all four */
  scoring: { passShare: 1, mixedShare: 0.5, minAvailable: 4 },

  /**
   * Every check uses only figures Onesheet gives for every REIT: annual statements and distributions per unit.
   * Company-reported KPIs (FFO, AFFO, occupancy...) exist for a handful of REITs only, so they are shown on the
   * company page but never ranked. Research behind each line: reports/REIT evaluation variables.md.
   */
  checks: [
    { id: "payoutCovered", kind: "gate", label: "Cash payout ≤ 100%", metricId: "cashPayout", op: "<=", threshold: 1,
      rule: "Distributions are covered by operating cash flow: distributions per unit are at most 100% of operating cash flow per unit" },
    { id: "debtLimit", kind: "gate", label: "Debt ≤ 60% of assets", metricId: "debtToAssets", op: "<=", threshold: 0.6,
      rule: "Total debt is at most 60% of total assets (RioCan's declaration-of-trust cap, the strictest found)" },
    { id: "payoutCushion", kind: "score", label: "Cash payout ≤ 90%", metricId: "cashPayout", op: "<=", threshold: 0.9,
      rule: "The payout leaves at least 10% of operating cash flow in the business" },
    { id: "cashFlowGrowth", kind: "score", label: "Cash flow per unit ≥ 2%/yr", metricId: "cashFlowPerUnitGrowth", op: ">=", threshold: 0.02,
      rule: "Operating cash flow per unit grew at least 2% a year over the last three fiscal years, in line with the inflation target" },
    { id: "distributionGrowth", kind: "score", label: "Distributions per unit ≥ 2%/yr", metricId: "distributionGrowth", op: ">=", threshold: 0.02,
      rule: "Distributions per unit grew at least 2% a year over the last three fiscal years, keeping their value against inflation" },
    { id: "revenueGrowth", kind: "score", label: "Revenue per unit ≥ 2%/yr", metricId: "revenuePerUnitGrowth", op: ">=", threshold: 0.02,
      rule: "Revenue per unit grew at least 2% a year over three fiscal years, in line with the inflation target" },
  ] satisfies CheckDef[],

  metricDefs: [
    {
      id: "cashPayout",
      short: "Cash payout",
      label: "Distributions ÷ operating cash flow, per unit",
      unit: "pct",
      higherIsBetter: false,
      description: "Share of the cash the properties generate that is paid out to unitholders.",
      formula: "Distributions per unit recorded in the latest fiscal year ÷ (operating cash flow ÷ diluted units) for that year. Only when the distributions and the statements are in the same currency.",
      why: "Above 100%, the distribution is paid with something other than the cash the business makes: new debt, new units or asset sales. Below 90% leaves a margin.",
      facts: [
        "CAPREIT's credit facility caps its FFO payout at 100%; Nexus guides to a payout \"below 100%\".",
        "Operating cash flow is before maintenance capex, so this reads lower than the AFFO payout a REIT reports (Killam: 61% here, 68% reported).",
        "Some Canadian REITs report interest paid outside operating cash flow, which flatters this ratio.",
      ],
    },
    {
      id: "debtToAssets",
      short: "Debt ÷ assets",
      label: "Total debt ÷ total assets",
      unit: "pct",
      higherIsBetter: false,
      description: "Share of the balance sheet funded with debt.",
      formula: "Total debt ÷ total assets, latest annual balance sheet.",
      why: "Leverage decides whether a REIT survives a fall in property values or a jump in rates. 60% is the strictest declaration-of-trust cap found.",
      facts: [
        "RioCan's limit is 60% of aggregate assets (2026 AIF); CAPREIT's covenant is 62.5% (trust deed 70%); Killam's is 70%.",
        "REITs that went into 2007–09 with more debt lost more value (Sun, Titman & Twite, 2015).",
        "Canadian REITs carry properties at fair value, US REITs at depreciated cost, so the same debt reads lower in Canada.",
      ],
    },
    {
      id: "cashFlowPerUnitGrowth",
      short: "Cash flow / unit",
      label: "Operating cash flow per unit, growth a year over three years",
      unit: "pct",
      higherIsBetter: true,
      description: "How fast the cash each unit earns is growing.",
      formula: "(Operating cash flow ÷ diluted units, latest fiscal year) ÷ (same, three fiscal years earlier), to the power 1/3, − 1.",
      why: "The cash version of FFO per unit. It falls when acquisitions or developments are funded with more new units than they earn. 2% a year is the Bank of Canada's inflation target: below it, cash per unit shrinks in real terms.",
    },
    {
      id: "distributionGrowth",
      short: "Distribution growth",
      label: "Distributions per unit, growth a year over three years",
      unit: "pct",
      higherIsBetter: true,
      description: "Whether the payout to unitholders is rising, flat or being cut.",
      formula: "(Distributions per unit recorded in the latest fiscal year) ÷ (same, three fiscal years earlier), to the power 1/3, − 1.",
      why: "A cut is the clearest sign a REIT could not afford its payout. Below 2% a year (the inflation target), the income a unitholder receives loses purchasing power.",
    },
    {
      id: "revenuePerUnitGrowth",
      short: "Revenue / unit",
      label: "Revenue per unit, growth a year over three years",
      unit: "pct",
      higherIsBetter: true,
      description: "Rent and other revenue behind each unit, and how fast it grows.",
      formula: "(Revenue ÷ diluted units, latest fiscal year) ÷ (same, three fiscal years earlier), to the power 1/3, − 1.",
      why: "Rents per unit should at least keep pace with inflation. 2% is the Bank of Canada's inflation target.",
    },
  ] satisfies MetricDef[],

  mapTitle: "Cash payout vs cash flow per unit growth",
  map: {
    x: "cashPayout",
    y: "cashFlowPerUnitGrowth",
    xThreshold: 0.9, // same line as the "payout cushion" check
    yThreshold: 0.02, // same line as the "cash flow per unit ≥ 2%/yr" check
    zones: {
      topLeft: "Covered payout · beating inflation per unit",
      topRight: "Stretched payout · beating inflation per unit",
      bottomLeft: "Covered payout · lagging inflation per unit",
      bottomRight: "Stretched payout · lagging inflation per unit",
    },
  },
};

/** Reporting currencies whose statements are used for per-unit figures. The two other currencies in this
 * universe (ARS, JPY) come with unit-count breaks and zero placeholders in the statements. */
const COMPARABLE_CURRENCIES = ["CAD", "USD"];
const GROWTH_YEARS = 3;

function computeMetrics(rows: FinRow[], ctx: MetricContext): { metrics: Record<string, MetricValue>; warnings: string[] } {
  const warnings: string[] = [];
  const none = (note: string): MetricValue => ({ value: null, sourceIds: [], note });
  const last = rows[rows.length - 1];
  if (!last) {
    warnings.push(`${ctx.ticker}: no statements`);
    const empty = none("No annual statements for this company");
    return { metrics: { cashPayout: empty, debtToAssets: empty, cashFlowPerUnitGrowth: empty, distributionGrowth: empty, revenuePerUnitGrowth: empty }, warnings };
  }
  const base = rows.find((r) => r.year === last.year - GROWTH_YEARS);
  const comparable = COMPARABLE_CURRENCIES.includes(last.currency);
  const notComparable = `Statements are in ${last.currency || "an unknown currency"}; per-unit figures are only used for CAD and USD reporters`;
  const yearsBack = `FY${last.year - GROWTH_YEARS} → FY${last.year}`;

  const debtToAssets = (): MetricValue => {
    const value = ratioOfPositive(last.debt, last.assets);
    return value == null
      ? none(`No total debt and total assets in the FY${last.year} balance sheet`)
      : { value, period: last.periodEnd ? `at ${last.periodEnd}` : `FY${last.year}`, sourceIds: [last.sourceId] };
  };

  const dpuSource = ctx.distributions[0]?.sourceId;
  const dpu = (r: FinRow) => (r.periodEnd ? distributionsInYear(ctx.distributions, r.periodEnd) : null);

  const cashPayout = (): MetricValue => {
    if (!comparable) return none(notComparable);
    if (!ctx.distributions.length) return none("No distribution history");
    if (ctx.distributions.some((d) => d.currency !== last.currency)) {
      return none(`Distributions are paid in ${ctx.distributions[0].currency} and statements are in ${last.currency}, so they are not compared`);
    }
    const value = cashPayoutRatio(dpu(last), last.ocf, last.shares);
    return value == null
      ? none(`No distributions, or no positive operating cash flow per unit, in FY${last.year}`)
      : { value, period: `FY${last.year}`, sourceIds: [last.sourceId, ...(dpuSource ? [dpuSource] : [])] };
  };

  const perUnitGrowth = (pick: (r: FinRow) => number | null, what: string): MetricValue => {
    if (!comparable) return none(notComparable);
    if (!base) return none(`No FY${last.year - GROWTH_YEARS} statements to compare ${what} with`);
    if (base.currency !== last.currency) return none(`FY${base.year} and FY${last.year} statements are in different currencies`);
    const value = cagr(perShare(pick(base), base.shares), perShare(pick(last), last.shares), GROWTH_YEARS);
    return value == null
      ? none(`${what} was not positive in FY${base.year} or FY${last.year}`)
      : { value, period: yearsBack, sourceIds: [base.sourceId, last.sourceId] };
  };

  const distributionGrowth = (): MetricValue => {
    if (!ctx.distributions.length) return none("No distribution history");
    if (!base) return none(`No FY${last.year - GROWTH_YEARS} fiscal year to compare distributions with`);
    const value = cagr(dpu(base), dpu(last), GROWTH_YEARS);
    return value == null
      ? none(`No distributions recorded in FY${base.year} or FY${last.year}`)
      : { value, period: yearsBack, sourceIds: dpuSource ? [dpuSource] : [] };
  };

  const metrics: Record<string, MetricValue> = {
    cashPayout: cashPayout(),
    debtToAssets: debtToAssets(),
    cashFlowPerUnitGrowth: perUnitGrowth((r) => r.ocf, "Operating cash flow per unit"),
    distributionGrowth: distributionGrowth(),
    revenuePerUnitGrowth: perUnitGrowth((r) => r.revenue, "Revenue per unit"),
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
    { id: "affoPayout", label: "AFFO payout ratio", unit: "pct", kind: "flow", filter: F.affoPayout },
    { id: "samePropertyNoi", label: "Same-property NOI growth", unit: "pct", kind: "flow", filter: F.sameProperty, note: "Each quarter against the same quarter a year earlier" },
    { id: "debtRatio", label: "Debt ÷ gross book value", unit: "pct", kind: "level", filter: F.debtRatio },
    { id: "occupancy", label: "Occupancy", unit: "pct", kind: "level", filter: F.occupancy, note: "As the REIT defines it" },
    { id: "occupancyKpi", label: "Occupancy", unit: "pct", kind: "flow", filter: F.occupancyKpi, note: "Company-wide, as reported (Onesheet API KPIs)" },
  ],
  rankTiebreak: "cashFlowPerUnitGrowth",
  ruleControls: [
    { id: "debtLimit", label: "Maximum debt / total assets", min: 0.3, max: 0.7, step: 0.01, unit: "pct", why: "How much of the balance sheet may be funded with debt?" },
    { id: "payoutCushion", label: "Maximum cash payout", min: 0.6, max: 1.1, step: 0.01, unit: "pct", why: "How much of operating cash flow may be paid out?" },
    { id: "revenueGrowth", label: "Minimum revenue per unit growth", min: 0, max: 0.06, step: 0.005, unit: "pct", why: "How fast should rent per unit grow each year?" },
    { id: "cashFlowGrowth", label: "Minimum cash flow per unit growth", min: -0.05, max: 0.08, step: 0.005, unit: "pct", why: "How fast must cash per unit grow each year?" },
    { id: "distributionGrowth", label: "Minimum distribution growth", min: -0.05, max: 0.08, step: 0.005, unit: "pct", why: "How fast must the payout per unit grow each year?" },
  ],

  extraInputs: [],
  computeMetrics,
};


