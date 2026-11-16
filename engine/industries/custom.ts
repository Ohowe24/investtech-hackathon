// "Choose your own" industries: any industry in the Canadian market map, with candidates found automatically.
//
// Candidates: every company in the market map (npm run discover: the holdings of the TSX composite and small-cap
// index ETFs) whose Onesheet profile names the chosen industry and Canada as its country.
// Checks: one must-pass check that holds in any industry (the business makes cash from operations), and six
// scored checks that compare each company with its peers: better than the median of all companies tested in this
// run (the candidates plus your holdings). No industry-specific number is typed anywhere: every threshold is a
// median of reported figures, computed in engine/metrics.ts. Formulas are in methodology.md.

import type { MetricDef, MetricValue } from "../../contract/types";
import { cagr, cashReturnOnCapital, freeCashFlow, median, netDebtToEbitda, perShare, ratioOfPositive, sumStrict } from "../metrics";
import type { MarketEntry, Store } from "../store";
import type { CheckDef, FinRow, IndustryProfile, MetricContext, UniverseEntry } from "./types";

export const CUSTOM_PREFIX = "custom:";
/** An industry is offered only if the market map has at least this many Canadian companies in it with statements. */
export const MIN_COMPANIES = 3;
/** A median is used as a threshold only if at least this many companies have the figure. */
const MIN_FOR_MEDIAN = 3;
const GROWTH_YEARS = 3;
/**
 * Industries this statement-based test does not fit, so they are not offered: for banks, insurers and lenders,
 * debt is the raw material, and EBITDA, capital spending and free cash flow do not describe the business.
 */
const NOT_OFFERED = /^(Banks|Insurance|Financial - (Mortgages|Credit Services))/;

const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const customId = (industry: string) => `${CUSTOM_PREFIX}${slug(industry)}`;
export const isCustomId = (id: string) => id.startsWith(CUSTOM_PREFIX);

const hasStatements = (store: Store, t: string) => (store.companies[t]?.financials.length ?? 0) > 0;
const canadianIn = (store: Store, industry: string): MarketEntry[] =>
  store.market.filter((m) => m.country === "CA" && m.industry === industry && hasStatements(store, m.ticker));

export interface CustomIndustry {
  id: string;
  name: string;
  sector: string;
  /** Canadian companies with statements in this industry */
  count: number;
}

/** Every industry the market map can serve, largest sectors and industries first. */
export function customIndustries(store: Store): CustomIndustry[] {
  const byIndustry = new Map<string, { sector: string; count: number }>();
  for (const m of store.market) {
    if (m.country !== "CA" || !m.industry || NOT_OFFERED.test(m.industry) || !hasStatements(store, m.ticker)) continue;
    const e = byIndustry.get(m.industry) ?? { sector: m.sector || "Other", count: 0 };
    e.count++;
    byIndustry.set(m.industry, e);
  }
  return [...byIndustry.entries()]
    .filter(([, e]) => e.count >= MIN_COMPANIES)
    .map(([name, e]) => ({ id: customId(name), name, sector: e.sector, count: e.count }))
    .sort((a, b) => a.sector.localeCompare(b.sector) || b.count - a.count || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- metrics (statements only)

const metricDefs: MetricDef[] = [
  {
    id: "cashFromOperations",
    short: "Operating cash margin",
    label: "Operating cash flow ÷ revenue, last three fiscal years combined",
    unit: "pct",
    higherIsBetter: true,
    description: "Whether the business brings in cash from its operations.",
    formula: "Sum of operating cash flow over the last three fiscal years ÷ sum of revenue over the same years.",
    why: "A business that does not make cash from operations over three years is funding itself with debt or new shares, whatever its industry.",
  },
  {
    id: "revenuePerShareGrowth",
    short: "Revenue / share",
    label: "Revenue per share, growth a year over three years",
    unit: "pct",
    higherIsBetter: true,
    description: "How fast sales behind each share grow.",
    formula: "(Revenue ÷ diluted shares, latest fiscal year) ÷ (same, three fiscal years earlier), to the power 1/3, − 1.",
    why: "Per share, so growth bought with new shares does not count.",
  },
  {
    id: "cashFlowPerShareGrowth",
    short: "Cash flow / share",
    label: "Operating cash flow per share, growth a year over three years",
    unit: "pct",
    higherIsBetter: true,
    description: "How fast the cash each share earns grows.",
    formula: "(Operating cash flow ÷ diluted shares, latest fiscal year) ÷ (same, three fiscal years earlier), to the power 1/3, − 1.",
    why: "Cash is harder to flatter than earnings; per share, it is what an owner gets.",
  },
  {
    id: "fcfMargin",
    short: "FCF margin",
    label: "Free cash flow ÷ revenue",
    unit: "pct",
    higherIsBetter: true,
    description: "Share of each sales dollar left after investing in the business.",
    formula: "(Operating cash flow − capital spending) ÷ revenue, latest fiscal year.",
    why: "What the business can return to owners, pay down debt with, or reinvest, after keeping itself running.",
  },
  {
    id: "cashReturnOnCapital",
    short: "Cash return on capital",
    label: "Free cash flow ÷ average debt and equity",
    unit: "pct",
    higherIsBetter: true,
    description: "Cash the business makes on the money invested in it.",
    formula: "Free cash flow, latest fiscal year ÷ average of (debt + equity) at the start and end of that year.",
    why: "High returns on capital are what let a company compound value when it reinvests.",
  },
  {
    id: "netDebtToEbitda",
    short: "Net debt ÷ EBITDA",
    label: "Net debt ÷ EBITDA",
    unit: "multiple",
    higherIsBetter: false,
    description: "Years of operating profit needed to repay debt net of cash.",
    formula: "(Total debt − cash) ÷ EBITDA, latest fiscal year. Null if EBITDA is not positive.",
    why: "The leverage measure lenders and rating agencies use. Compared with peers, because normal leverage differs by industry.",
  },
  {
    id: "shareCountGrowth",
    short: "Share count",
    label: "Diluted shares, growth a year over three years",
    unit: "pct",
    higherIsBetter: false,
    description: "Whether owners are being diluted (rising) or bought back (falling).",
    formula: "(Diluted shares, latest fiscal year) ÷ (same, three fiscal years earlier), to the power 1/3, − 1.",
    why: "Every new share splits the business more ways; falling share counts mean buybacks.",
  },
];

function computeMetrics(rows: FinRow[], _ctx: MetricContext): { metrics: Record<string, MetricValue>; warnings: string[] } {
  const none = (note: string): MetricValue => ({ value: null, sourceIds: [], note });
  const last = rows[rows.length - 1];
  if (!last) {
    const empty = none("No annual statements for this company");
    return { metrics: Object.fromEntries(metricDefs.map((m) => [m.id, empty])), warnings: [] };
  }
  const prev = rows.find((r) => r.year === last.year - 1);
  const base = rows.find((r) => r.year === last.year - GROWTH_YEARS);
  const lastThree = rows.filter((r) => r.year > last.year - 3);
  const fy = `FY${last.year}`;
  const span = base ? `FY${base.year} → FY${last.year}` : "";

  const growth = (pick: (r: FinRow) => number | null, what: string, perUnit = true): MetricValue => {
    if (!base) return none(`No FY${last.year - GROWTH_YEARS} statements to compare ${what} with`);
    if (base.currency !== last.currency) return none(`FY${base.year} and FY${last.year} statements are in different currencies`);
    const v = perUnit ? cagr(perShare(pick(base), base.shares), perShare(pick(last), last.shares), GROWTH_YEARS) : cagr(pick(base), pick(last), GROWTH_YEARS);
    return v == null ? none(`${what} was missing or not positive in FY${base.year} or FY${last.year}`) : { value: v, period: span, sourceIds: [base.sourceId, last.sourceId] };
  };
  const latest = (v: number | null, missing: string, ids = [last.sourceId]): MetricValue =>
    v == null ? none(missing) : { value: v, period: fy, sourceIds: ids };

  const fcf = freeCashFlow(last.ocf, last.capex);
  const threeYears = lastThree.length === 3 ? `FY${lastThree[0].year}–FY${last.year}` : "";
  const ocfMargin = lastThree.length === 3 ? ratioOfPositive(sumStrict(lastThree.map((r) => r.ocf)), sumStrict(lastThree.map((r) => r.revenue))) : null;

  const metrics: Record<string, MetricValue> = {
    cashFromOperations: ocfMargin == null
      ? none("Needs three fiscal years with operating cash flow and positive revenue")
      : { value: ocfMargin, period: threeYears, sourceIds: lastThree.map((r) => r.sourceId) },
    revenuePerShareGrowth: growth((r) => r.revenue, "Revenue per share"),
    cashFlowPerShareGrowth: growth((r) => r.ocf, "Operating cash flow per share"),
    fcfMargin: latest(ratioOfPositive(fcf, last.revenue), `No operating cash flow, capital spending or positive revenue in ${fy}`),
    cashReturnOnCapital: latest(
      prev ? cashReturnOnCapital(fcf, prev.debt, prev.equity, last.debt, last.equity) : null,
      `Needs free cash flow in ${fy} and debt and equity at the start and end of it`,
      prev ? [prev.sourceId, last.sourceId] : [last.sourceId],
    ),
    netDebtToEbitda: latest(netDebtToEbitda(last.debt, last.cash, last.ebitda), `No debt, cash or positive EBITDA in ${fy}`),
    shareCountGrowth: growth((r) => r.shares, "Diluted shares", false),
  };
  return { metrics, warnings: [] };
}

// ---------------------------------------------------------------- the profile for one run

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

/**
 * Builds the profile for one industry and one set of holdings. The thresholds are the medians of the figures of
 * every company tested (candidates + holdings with statements), so they are computed before the profile exists.
 * Returns null for an unknown industry.
 */
export function customProfile(id: string, store: Store, holdings: string[]): IndustryProfile | null {
  const industry = customIndustries(store).find((c) => c.id === id);
  if (!industry) return null;
  const members = canadianIn(store, industry.name);
  const universe: UniverseEntry[] = members
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
    .map((m) => ({
      ticker: m.ticker,
      name: m.name || m.ticker,
      listedOn: m.exchange === "TSXV" ? "TSXV" : "TSX",
      subSector: m.industry,
      why: `Canadian, Onesheet profile industry "${m.industry}"${m.etfs.length ? `; held by ${m.etfs.join(" and ")}` : ""}.`,
    }));

  // Every company tested in this run: the candidates (minus those already held) and the holdings.
  const tested = [...new Set([...universe.map((u) => u.ticker), ...holdings])].filter((t) => hasStatements(store, t));
  const values = (metricId: string) =>
    tested.map((t) => computeMetrics(store.companies[t].financials, { ticker: t, lookup: () => undefined, facts: [], distributions: [] }).metrics[metricId]?.value ?? null);
  const med = (metricId: string) => {
    const v = values(metricId).filter((x): x is number => x != null);
    return v.length >= MIN_FOR_MEDIAN ? median(v) : null;
  };
  const n = tested.length;
  const peers = `the median of the ${n} companies tested`;

  const scored: { id: string; metricId: string; op: ">=" | "<="; label: string; rule: (m: number) => string }[] = [
    { id: "revenueGrowth", metricId: "revenuePerShareGrowth", op: ">=", label: "Revenue / share ≥ peers",
      rule: (m) => `Revenue per share grew at least as fast as ${peers} (${pct(m)} a year over three years)` },
    { id: "cashFlowGrowth", metricId: "cashFlowPerShareGrowth", op: ">=", label: "Cash flow / share ≥ peers",
      rule: (m) => `Operating cash flow per share grew at least as fast as ${peers} (${pct(m)} a year over three years)` },
    { id: "fcfMargin", metricId: "fcfMargin", op: ">=", label: "FCF margin ≥ peers",
      rule: (m) => `Free cash flow margin is at least ${peers} (${pct(m)})` },
    { id: "returnOnCapital", metricId: "cashReturnOnCapital", op: ">=", label: "Return on capital ≥ peers",
      rule: (m) => `Cash return on capital is at least ${peers} (${pct(m)})` },
    { id: "leverage", metricId: "netDebtToEbitda", op: "<=", label: "Net debt ÷ EBITDA ≤ peers",
      rule: (m) => `Net debt is at most ${peers} (${Math.round(m * 10) / 10}× EBITDA)` },
    { id: "dilution", metricId: "shareCountGrowth", op: "<=", label: "Dilution ≤ peers",
      rule: (m) => `Diluted shares grew no faster than ${peers} (${pct(m)} a year over three years)` },
  ];

  const checks: CheckDef[] = [
    { id: "cashPositive", kind: "gate", label: "Cash from operations > 0", metricId: "cashFromOperations", op: ">=", threshold: 0,
      rule: "Operating cash flow over the last three fiscal years combined is positive" },
  ];
  for (const s of scored) {
    const m = med(s.metricId);
    if (m == null) continue; // too few companies with this figure to set a peer line
    checks.push({ id: s.id, kind: "score", label: s.label, metricId: s.metricId, op: s.op, threshold: m, rule: s.rule(m) });
  }
  const xLine = med("netDebtToEbitda");
  const yLine = med("revenuePerShareGrowth");

  return {
    id,
    name: industry.name,
    tagline: `${industry.count} Canadian companies Onesheet classes as "${industry.name}" (${industry.sector}), found automatically and ranked against each other and your holdings.`,
    indexName: `Your ${industry.name} index`,
    currency: "USD",
    question: `Which Canadian ${industry.name} companies should your index add?`,
    sleevePct: 15,
    maxWeightPct: 5,
    relatedGroups: [],
    scoring: { passShare: 0.75, mixedShare: 0.5, minAvailable: 4 },
    checks,
    metricDefs,
    mapTitle: "Leverage vs revenue per share growth",
    map: {
      x: "netDebtToEbitda",
      y: "revenuePerShareGrowth",
      xThreshold: xLine ?? 0,
      yThreshold: yLine ?? 0,
      zones: {
        topLeft: "Less debt than peers · growing faster",
        topRight: "More debt than peers · growing faster",
        bottomLeft: "Less debt than peers · growing slower",
        bottomRight: "More debt than peers · growing slower",
      },
    },
    rankTiebreak: "cashFlowPerShareGrowth",
    ruleControls: [],
    extraInputs: [],
    hasStatements: false,
    universe,
    holdingNames: {},
    computeMetrics,
  };
}
