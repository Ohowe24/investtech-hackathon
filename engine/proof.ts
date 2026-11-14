// PROOF: re-runs the engine's own formulas on what it published, so anyone can check its work.
//
// The website's X-ray page imports this file and runs it in the browser. Every value here comes
// from a function in metrics.ts applied to the yearly figures in data/companies.json, then is
// compared with the value the engine stored. Nothing is estimated: a gap is reported, never hidden.

import type { CheckResult, Company, Dataset, ModelResult, Verdict, YearRow } from "../contract/types";
import { config } from "./config";
import {
  acquisitionIntensity, cagr, cashReturnOnCapital, equalWeights, freeCashFlow, meanStrict, netDebt, netDebtToEbitda, passes, pctChange, perShare, sumStrict, tally,
} from "./metrics";

type Rec = ModelResult["recommendation"];

export type InputUnit = "money" | "perShare" | "shares" | "pct" | "multiple" | "years";

export interface Series {
  label: string;
  unit: InputUnit;
  /** one per entry in Reproduction.years; null where the formula does not use that year */
  values: (number | null)[];
}

export interface Step {
  label: string;
  value: number | null;
  unit: InputUnit;
}

export interface Reproduction {
  metricId: string;
  /** computed: re-run from yearly figures. quoted: read from a filing quote. none: nothing to re-run */
  method: "computed" | "quoted" | "none";
  /** the engine function that produced the value, as named in engine/metrics.ts */
  fn: string;
  years: number[];
  inputs: Series[];
  steps: Step[];
  /** the re-run result */
  value: number | null;
  /** what the engine stored in companies.json */
  stored: number | null;
  match: boolean;
  quote?: string;
}

export interface CheckProof {
  check: CheckResult;
  value: number | null;
  /** passes() re-run on the stored value and the declared threshold */
  rerun: boolean | null;
  match: boolean;
  /** the dataset's threshold equals the one declared in engine/config.ts */
  ruleMatch: boolean;
  /** distance from the pass line in the metric's unit: positive clears it, negative misses it */
  headroom: number | null;
  /** the result if this one check came out the other way; null if the result would not change */
  flipsTo: Rec | null;
}

export interface Safeguard {
  id: string;
  title: string;
  detail: string;
}

export interface CompanyProof {
  ticker: string;
  reproductions: Reproduction[];
  checks: CheckProof[];
  result: { stored: Rec; rerun: Rec; match: boolean; passed: number; available: number };
  verdict: { stored: Verdict; fromModel: Verdict; source: "model" | "human"; match: boolean };
  weight: { stored: number; rerun: number | null; match: boolean } | null;
  /** failed checks that decide the result: if any one of them passed, the result would change */
  deciding: string[];
  /** passed checks the result rests on: if any one of them failed, the result would change */
  loadBearing: string[];
  safeguards: Safeguard[];
}

const same = (a: number | null, b: number | null) =>
  a == null || b == null ? a == null && b == null : Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

const byYear = (c: Company): YearRow[] => [...(c.history ?? [])].sort((a, b) => a.fiscalYear - b.fiscalYear);

/** Re-runs one metric for one company with the engine's own functions. */
export function reproduce(ds: Dataset, c: Company, metricId: string): Reproduction {
  const h = byYear(c);
  const first = h[0];
  const last = h[h.length - 1];
  const stored = c.metrics[metricId]?.value ?? null;
  const base = { metricId, stored, years: [] as number[], inputs: [] as Series[], steps: [] as Step[] };
  type Draft = Pick<Reproduction, "method" | "fn" | "value"> & Partial<Pick<Reproduction, "years" | "inputs" | "steps" | "quote">>;
  const done = (r: Draft): Reproduction => ({ ...base, ...r, match: same(r.value, stored) });
  const fcfps = (r: YearRow | undefined) => (r ? perShare(freeCashFlow(r.operatingCashFlow, r.capex ?? null), r.dilutedShares) : null);
  const span = first && last ? last.fiscalYear - first.fiscalYear : 0;
  const ends = first && last ? [first.fiscalYear, last.fiscalYear] : [];

  switch (metricId) {
    case "acqIntensity": {
      const acqSum = sumStrict(h.map((r) => r.acquisitions));
      const ocfSum = sumStrict(h.map((r) => r.operatingCashFlow));
      return done({
        method: "computed",
        fn: "acquisitionIntensity(acquisitions summed, operating cash flow summed)",
        years: h.map((r) => r.fiscalYear),
        inputs: [
          { label: "Acquisitions, net of disposals", unit: "money", values: h.map((r) => r.acquisitions) },
          { label: "Operating cash flow", unit: "money", values: h.map((r) => r.operatingCashFlow) },
        ],
        steps: [
          { label: "Acquisitions, all years", value: acqSum, unit: "money" },
          { label: "Operating cash flow, all years", value: ocfSum, unit: "money" },
        ],
        value: acquisitionIntensity(acqSum, ocfSum),
      });
    }
    case "fcfPerShareCagr":
      return done({
        method: "computed",
        fn: "cagr(FCF per share first year, FCF per share last year, years)",
        years: ends,
        inputs: [
          { label: "Operating cash flow", unit: "money", values: [first?.operatingCashFlow ?? null, last?.operatingCashFlow ?? null] },
          { label: "Capital spending", unit: "money", values: [first?.capex ?? null, last?.capex ?? null] },
          { label: "Diluted shares", unit: "shares", values: [first?.dilutedShares ?? null, last?.dilutedShares ?? null] },
        ],
        steps: [
          { label: `FCF per share, FY${first?.fiscalYear}`, value: fcfps(first), unit: "perShare" },
          { label: `FCF per share, FY${last?.fiscalYear}`, value: fcfps(last), unit: "perShare" },
          { label: "Years between them", value: span, unit: "years" },
        ],
        value: cagr(fcfps(first), fcfps(last), span),
      });
    case "revenueCagr":
      return done({
        method: "computed",
        fn: "cagr(revenue first year, revenue last year, years)",
        years: ends,
        inputs: [{ label: "Revenue", unit: "money", values: [first?.revenue ?? null, last?.revenue ?? null] }],
        steps: [{ label: "Years between them", value: span, unit: "years" }],
        value: cagr(first?.revenue, last?.revenue, span),
      });
    case "shareCountChange":
      return done({
        method: "computed",
        fn: "pctChange(diluted shares first year, diluted shares last year)",
        years: ends,
        inputs: [{ label: "Diluted shares", unit: "shares", values: [first?.dilutedShares ?? null, last?.dilutedShares ?? null] }],
        steps: [],
        value: pctChange(first?.dilutedShares, last?.dilutedShares),
      });
    case "cashReturn": {
      const prev = h[h.length - 2];
      const ok = prev && last && last.fiscalYear - prev.fiscalYear === 1;
      const fcf = last ? freeCashFlow(last.operatingCashFlow, last.capex ?? null) : null;
      return done({
        method: "computed",
        fn: "cashReturnOnCapital(free cash flow, debt and equity at the start and end of the year)",
        years: prev && last ? [prev.fiscalYear, last.fiscalYear] : [],
        inputs: [
          { label: "Operating cash flow", unit: "money", values: [null, last?.operatingCashFlow ?? null] },
          { label: "Capital spending", unit: "money", values: [null, last?.capex ?? null] },
          { label: "Debt", unit: "money", values: [prev?.totalDebt ?? null, last?.totalDebt ?? null] },
          { label: "Equity", unit: "money", values: [prev?.totalEquity ?? null, last?.totalEquity ?? null] },
        ],
        steps: [{ label: `Free cash flow, FY${last?.fiscalYear}`, value: fcf, unit: "money" }],
        value: ok ? cashReturnOnCapital(fcf, prev.totalDebt ?? null, prev.totalEquity ?? null, last.totalDebt ?? null, last.totalEquity ?? null) : null,
      });
    }
    case "netDebtToEbitda": {
      const three = h.slice(-3);
      const avg = three.length === 3 ? meanStrict(three.map((r) => r.ebitda ?? null)) : null;
      const blankButLast = (v: number | null | undefined) => three.map((_, i) => (i === three.length - 1 ? (v ?? null) : null));
      return done({
        method: "computed",
        fn: "netDebtToEbitda(debt, cash, 3-year average EBITDA)",
        years: three.map((r) => r.fiscalYear),
        inputs: [
          { label: "EBITDA", unit: "money", values: three.map((r) => r.ebitda ?? null) },
          { label: "Debt", unit: "money", values: blankButLast(last?.totalDebt) },
          { label: "Cash", unit: "money", values: blankButLast(last?.cash) },
        ],
        steps: [
          { label: "3-year average EBITDA", value: avg, unit: "money" },
          { label: `Net debt, FY${last?.fiscalYear}`, value: last ? netDebt(last.totalDebt ?? null, last.cash ?? null) : null, unit: "money" },
        ],
        value: last ? netDebtToEbitda(last.totalDebt ?? null, last.cash ?? null, avg) : null,
      });
    }
    case "organicGrowth": {
      const quote = (c.metrics[metricId]?.sourceIds ?? []).map((id) => ds.sources.find((s) => s.id === id)?.quote).find(Boolean);
      if (stored == null || !quote) return done({ method: "none", fn: "reported by the company", value: stored });
      // The filing states the figure in words; the engine stores it as a decimal. Find it in the quote.
      const text = `${Number((stored * 100).toFixed(2))}%`;
      const found = new RegExp(`(?<![0-9.])${text.replace(".", "\\.")}`).test(quote);
      return done({ method: "quoted", fn: "reported by the company, read from the filing", value: found ? stored : null, quote });
    }
    default:
      return done({ method: "none", fn: "", value: stored });
  }
}

/** Distance from a check's pass line, in the metric's unit. Positive clears it; negative misses it. */
export function headroom(value: number | null, op: ">=" | "<=", threshold: number): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return op === ">=" ? value - threshold : threshold - value;
}

/** The result the engine's tally() gives for a set of check results. */
export function tallyChecks(checks: Pick<CheckResult, "kind" | "pass">[]) {
  return tally(
    checks.filter((k) => k.kind === "gate").map((k) => k.pass),
    checks.filter((k) => k.kind === "score").map((k) => k.pass),
    config.scoring,
  );
}

/** For each check: what the result would become if that one check came out the other way. */
export function flipResults(checks: Pick<CheckResult, "kind" | "pass">[]): (Rec | null)[] {
  const now = tallyChecks(checks).recommendation;
  return checks.map((k, i) => {
    if (k.pass === null) return null;
    const flipped = checks.map((x, j) => (j === i ? { ...x, pass: !k.pass } : x));
    const r = tallyChecks(flipped).recommendation;
    return r === now ? null : r;
  });
}

/** Weights the engine's weight rule gives the companies it adds (related companies share one slot). */
export function rerunWeights(ds: Dataset): Record<string, number> {
  const adds = ds.companies.filter((c) => !c.inIndex && c.verdict === "add").map((c) => c.ticker);
  const groups: string[][] = [];
  for (const t of adds) {
    const related = config.relatedGroups.find((g) => g.includes(t));
    const existing = related && groups.find((g) => g.some((x) => related.includes(x)));
    if (existing) existing.push(t);
    else groups.push([t]);
  }
  return equalWeights(groups, config.sleevePct, config.maxWeightPct);
}

const fromModel = (r: Rec): Verdict => (r === "pass" ? "add" : r === "mixed" ? "watch" : "reject");

/** Everything the X-ray page shows for one company. `indexCountry` is the organizers' label, if it holds the company. */
export function proveCompany(ds: Dataset, c: Company, indexCountry?: string): CompanyProof {
  const reproductions = ds.metricDefs.map((d) => reproduce(ds, c, d.id));
  const stored = c.model?.checks ?? [];
  const flips = flipResults(stored);
  const checks: CheckProof[] = stored.map((k, i) => {
    const value = c.metrics[k.metricId]?.value ?? null;
    const declared = config.checks.find((d) => d.id === k.id);
    const rerun = k.op && k.threshold != null ? passes(value, k.op, k.threshold) : null;
    return {
      check: k,
      value,
      rerun,
      match: rerun === k.pass,
      ruleMatch: !!declared && declared.threshold === k.threshold && declared.op === k.op && declared.kind === k.kind,
      headroom: k.op && k.threshold != null ? headroom(value, k.op, k.threshold) : null,
      flipsTo: flips[i],
    };
  });
  const t = tallyChecks(stored);
  const storedRec = c.model?.recommendation ?? t.recommendation;
  const modelVerdict = fromModel(t.recommendation);
  const weights = rerunWeights(ds);
  const weight = c.proposedWeightPct != null
    ? { stored: c.proposedWeightPct, rerun: weights[c.ticker] ?? null, match: same(weights[c.ticker] ?? null, c.proposedWeightPct) }
    : null;

  const safeguards: Safeguard[] = [];
  const nd = c.metrics.netDebtToEbitda;
  if (nd?.value != null && nd.period) {
    safeguards.push({ id: "debtAverage", title: "Debt measured over three years", detail: `${nd.period}: the latest debt is set against average EBITDA, so one strong year can't make the debt look small.` });
  }
  const acq = c.metrics.acqIntensity;
  if (acq?.note && acq.value === 0) safeguards.push({ id: "netSeller", title: "Net seller counted as zero", detail: acq.note });
  const unknown = stored.filter((k) => k.pass === null);
  if (unknown.length) {
    const notes = [...new Set(unknown.map((k) => c.metrics[k.metricId]?.note).filter(Boolean))];
    safeguards.push({ id: "missing", title: "Missing data is never a fail", detail: `No data for ${unknown.map((k) => k.label).join("; ")}. ${notes.join(" ")} It counts neither for nor against.` });
  }
  if (indexCountry && indexCountry !== c.hqCountry) {
    safeguards.push({ id: "relabel", title: "Country label corrected", detail: `The organizers' index labels ${c.ticker} ${indexCountry}; it is headquartered in ${c.hqCountry}, so the engine counts it as ${c.hqCountry}.` });
  }
  const group = config.relatedGroups.find((g) => g.includes(c.ticker));
  if (group) safeguards.push({ id: "related", title: "Related companies share one slot", detail: `${group.join(" and ")} count as one bet in the weights: one controls the other.` });

  return {
    ticker: c.ticker,
    reproductions,
    checks,
    result: { stored: storedRec, rerun: t.recommendation, match: storedRec === t.recommendation && t.passed === c.model?.passed && t.available === c.model?.available, passed: t.passed, available: t.available },
    verdict: { stored: c.verdict, fromModel: modelVerdict, source: c.verdictSource === "human" ? "human" : "model", match: c.verdictSource === "human" || c.verdict === modelVerdict },
    weight,
    deciding: checks.filter((k) => k.check.pass === false && k.flipsTo).map((k) => k.check.id),
    loadBearing: checks.filter((k) => k.check.pass === true && k.flipsTo).map((k) => k.check.id),
    safeguards,
  };
}

export interface EngineProof {
  companies: number;
  metrics: { matched: number; total: number };
  checks: { matched: number; total: number };
  results: { matched: number; total: number };
  weights: { matched: number; total: number };
  rules: { matched: number; total: number };
}

/** The whole dataset re-run: how many of the engine's stored answers the proof reproduces. */
export function proveEngine(ds: Dataset): EngineProof {
  const proofs = ds.companies.filter((c) => c.model).map((c) => proveCompany(ds, c));
  const count = <T,>(xs: T[], ok: (x: T) => boolean) => ({ matched: xs.filter(ok).length, total: xs.length });
  const reps = proofs.flatMap((p) => p.reproductions.filter((r) => r.method !== "none"));
  const checks = proofs.flatMap((p) => p.checks);
  return {
    companies: proofs.length,
    metrics: count(reps, (r) => r.match),
    checks: count(checks, (k) => k.match),
    results: count(proofs, (p) => p.result.match),
    weights: count(proofs.filter((p) => p.weight), (p) => p.weight!.match),
    rules: count(config.checks, (d) => ds.companies.every((c) => c.model?.checks.find((k) => k.id === d.id)?.threshold === d.threshold)),
  };
}
