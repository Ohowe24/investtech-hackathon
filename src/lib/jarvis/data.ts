// What Jarvis knows: read-only views of the dataset on screen, with every figure already formatted the way
// the site shows it, so Claude can quote it word for word. Pure functions; they run in the browser (the
// dataset is already there) and in tests.

import type { Company, Dataset, Deal, MetricDef, YearRow } from "@contract/types";
import { formatValue, recStyle, verdictStyle } from "@/lib/format";
import { ordinal, ranking } from "@/lib/rank";

export interface DataResult {
  result: unknown;
  /** a short human line for the status, e.g. "Reading Constellation Software's results" */
  step: string;
  error?: boolean;
}

// ───────────────────────── Shared helpers ─────────────────────────

/** Companies the model tested, best rank first. */
export function tested(ds: Dataset): Company[] {
  return ds.companies.filter((c) => c.model).sort((a, b) => a.model!.rank - b.model!.rank);
}

export function findCompany(ds: Dataset, raw: unknown): Company | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim().toUpperCase().replace(/^(TSX|TSXV|NYSE|NASDAQ):\s*/, "").replace(/\.(TO|V)$/, "");
  return ds.companies.find((c) => c.ticker.toUpperCase() === t)
    ?? ds.companies.find((c) => c.name.toUpperCase() === raw.trim().toUpperCase());
}

export const defOf = (ds: Dataset, id: unknown) => (typeof id === "string" ? ds.metricDefs.find((d) => d.id === id) : undefined);

/** "3rd best of 19", or "3rd highest of 19" when the metric has no better direction. */
export function rankPhrase(ds: Dataset, c: Company, def: MetricDef): string | undefined {
  const withData = ranking(tested(ds), def).filter((x) => x.metrics[def.id]?.value != null);
  const i = withData.findIndex((x) => x.ticker === c.ticker);
  if (i < 0) return undefined;
  return `${ordinal(i + 1)} ${def.higherIsBetter == null ? "highest" : "best"} of ${withData.length}`;
}

const ISO = /^\d{4}-\d{2}-\d{2}/;
export function dealWhen(d: Deal): string {
  if (d.date && ISO.test(d.date)) return d.date.slice(0, 10);
  return d.periodLabel ?? d.date ?? (d.fiscalYear != null ? `FY${d.fiscalYear}` : "Undated");
}

/** Deals newest first, exact repeats dropped. */
export function sortedDeals(c: Company): Deal[] {
  const seen = new Set<string>();
  return (c.deals ?? [])
    .filter((d) => {
      const k = `${d.type}|${dealWhen(d)}|${d.counterparty ?? d.summary}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => dealWhen(b).localeCompare(dealWhen(a)));
}

function unknownCompany(ds: Dataset, raw: unknown): DataResult {
  return {
    step: "Looked for a company that isn't in the data",
    result: { error: `No company "${String(raw)}" in this run. Tickers: ${ds.companies.map((c) => c.ticker).join(", ")}` },
    error: true,
  };
}

function checks(ds: Dataset, c: Company) {
  return (c.model?.checks ?? []).map((k) => {
    const def = defOf(ds, k.metricId);
    return {
      check: k.label,
      rule: k.rule,
      mustPass: k.kind === "gate",
      target: k.target,
      value: def ? formatValue(c.metrics[k.metricId]?.value, def.unit) : "Missing",
      result: k.pass == null ? "no data (never counts as a fail)" : k.pass ? "pass" : "fail",
    };
  });
}

function summary(ds: Dataset, c: Company) {
  const m = c.model;
  return {
    ticker: c.ticker,
    name: c.name,
    headquarters: c.hqCountry,
    listedOn: c.listedOn,
    subSector: c.subSector,
    alreadyHeld: c.inIndex,
    verdict: verdictStyle[c.verdict].label,
    verdictSetBy: c.verdictSource === "human" ? "the team (overrides the model)" : "the model",
    reason: c.reason,
    model: m
      ? { result: recStyle[m.recommendation].label, rank: `${m.rank} of ${tested(ds).length}`, checksPassed: `${m.passed} of ${m.available} checks with data pass (${m.total} checks in all)` }
      : "not tested by the model",
    mapZone: c.zone,
    dataNote: c.dataNote,
  };
}

function metrics(ds: Dataset, c: Company) {
  return ds.metricDefs.map((d) => {
    const m = c.metrics[d.id];
    const r = rankPhrase(ds, c, d);
    return { id: d.id, label: d.label, value: formatValue(m?.value, d.unit), ...(m?.period ? { period: m.period } : {}), ...(m?.note ? { note: m.note } : {}), ...(r ? { rank: r } : {}) };
  });
}

// ───────────────────────── The briefing ─────────────────────────

/** One company on one line: verdict, rank, every check with its value and the bar, other metrics, map zone. */
export function companyLine(ds: Dataset, c: Company): string {
  const m = c.model;
  const checkIds = new Set(m?.checks.map((k) => k.metricId) ?? []);
  const checksText = (m?.checks ?? []).map((k) => {
    const def = defOf(ds, k.metricId);
    const v = def ? formatValue(c.metrics[k.metricId]?.value, def.unit) : "Missing";
    const r = def ? rankPhrase(ds, c, def) : undefined;
    return `${k.label}: ${v} ${k.pass == null ? "no data" : k.pass ? "pass" : "FAIL"}${k.kind === "gate" ? " (must pass)" : ""}${r ? `, ${r}` : ""}`;
  }).join("; ");
  const others = ds.metricDefs.filter((d) => !checkIds.has(d.id) && c.metrics[d.id]?.value != null)
    .map((d) => `${d.short ?? d.label} ${formatValue(c.metrics[d.id]?.value, d.unit)}`).join("; ");
  return [
    `- ${c.ticker} · ${c.name}${c.inIndex ? " (already held)" : ""}: ${verdictStyle[c.verdict].label}`,
    m ? `model ${recStyle[m.recommendation].label}, rank ${m.rank} of ${tested(ds).length}, ${m.passed} of ${m.available} checks with data pass` : "not tested",
    checksText && `checks: ${checksText}`,
    others && `also: ${others}`,
    `map: ${c.zone}`,
    c.reason && `reason: ${c.reason}`,
    c.dataNote && `note: ${c.dataNote}`,
  ].filter(Boolean).join(" | ");
}

/** A compact picture of the run, sent as part of the system prompt so headline questions need no tool call. */
export function briefing(ds: Dataset): string {
  const all = tested(ds);
  const cands = all.filter((c) => !c.inIndex);
  const by = (v: string) => cands.filter((c) => c.verdict === v);
  const line = (c: Company) => companyLine(ds, c);
  const exampleChecks = all.find((c) => c.model)?.model?.checks ?? [];
  return [
    "# Briefing: the run on screen",
    ds.isFake ? "WARNING: this is FAKE sample data. Say so if asked about real companies." : "",
    `Industry: ${ds.industryName ?? ds.industryId}. Index: ${ds.indexName}. The question the engine answers: ${ds.question}`,
    `Companies in the run: ${ds.companies.length}; tested by the model: ${all.length}; candidates not yet held: ${cands.length}; already held: ${all.length - cands.length}.`,
    `Recommended to add (${by("add").length}): ${by("add").map((c) => c.ticker).join(", ") || "none"}. Watch: ${by("watch").map((c) => c.ticker).join(", ") || "none"}. Reject: ${by("reject").map((c) => c.ticker).join(", ") || "none"}.`,
    "The platform says which companies to add, not how much: there are no weights. Never discuss position sizes or weights.",
    ds.rules ? `How results are decided: ${ds.rules.result}` : "",
    exampleChecks.length ? `The checks:\n${exampleChecks.map((k) => `- ${k.label}${k.kind === "gate" ? " (must pass)" : ""}: ${k.rule}`).join("\n")}` : "",
    `Metric ids: ${ds.metricDefs.map((d) => `${d.id} (${d.label})`).join(", ")}.`,
    ds.map ? `The map: across ${defOf(ds, ds.map.x)?.label ?? ds.map.x}, up ${defOf(ds, ds.map.y)?.label ?? ds.map.y}. Top-right zone: "${ds.map.zones.topRight}".` : "",
    ds.hasStatements === false ? "This industry has no yearly statements: no X-ray page and no deal history." : "",
    `Candidates, best first:\n${cands.map(line).join("\n") || "- none"}`,
    `Already held, tested:\n${all.filter((c) => c.inIndex).map(line).join("\n") || "- none"}`,
    ds.unmeasured?.length ? `Candidates with no data to test: ${ds.unmeasured.map((u) => `${u.ticker} (${u.why})`).join("; ")}.` : "",
  ].filter(Boolean).join("\n\n");
}

// ───────────────────────── Data tools ─────────────────────────

const YEAR_SERIES: Record<string, { label: string; unit: "money" | "pct" | "count" }> = {
  revenue: { label: "Revenue", unit: "money" },
  operatingCashFlow: { label: "Operating cash flow", unit: "money" },
  freeCashFlow: { label: "Free cash flow", unit: "money" },
  acquisitions: { label: "Spent on acquisitions", unit: "money" },
  fcfPerShare: { label: "Free cash flow per share", unit: "count" },
  cashReturn: { label: "Return on capital", unit: "pct" },
  dilutedShares: { label: "Diluted shares", unit: "count" },
};
export const SERIES_IDS = Object.keys(YEAR_SERIES);

export function yearValue(r: YearRow, id: string): number | null {
  const v = (r as unknown as Record<string, unknown>)[id];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function formatSeries(id: string, v: number | null): string {
  const s = YEAR_SERIES[id];
  if (!s) return String(v);
  if (v == null) return "Missing";
  if (id === "fcfPerShare") return v.toFixed(2);
  return formatValue(v, s.unit);
}

export function seriesLabel(id: string): string {
  return YEAR_SERIES[id]?.label ?? id;
}

export function runDataTool(ds: Dataset, name: string, input: Record<string, unknown>): DataResult | null {
  switch (name) {
    case "get_company": {
      const c = findCompany(ds, input.ticker);
      if (!c) return unknownCompany(ds, input.ticker);
      return {
        step: `Reading ${c.name}'s results`,
        result: { ...summary(ds, c), checks: checks(ds, c), metrics: metrics(ds, c), dealsOnRecord: sortedDeals(c).length, yearsOfStatements: c.history?.length ?? 0 },
      };
    }
    case "compare_companies": {
      const raw = Array.isArray(input.tickers) ? input.tickers.slice(0, 5) : [];
      const cs = raw.map((t) => findCompany(ds, t));
      const bad = raw.find((_, i) => !cs[i]);
      if (bad !== undefined) return unknownCompany(ds, bad);
      if (cs.length < 2) return { step: "Tried to compare", result: { error: "Give two to five tickers." }, error: true };
      return {
        step: `Comparing ${cs.map((c) => c!.ticker).join(", ")}`,
        result: cs.map((c) => ({ ...summary(ds, c!), checks: checks(ds, c!), metrics: metrics(ds, c!) })),
      };
    }
    case "rank_companies": {
      const scope = typeof input.scope === "string" ? input.scope : "all";
      const limit = Math.min(40, Math.max(1, typeof input.limit === "number" ? input.limit : 15));
      let cs = tested(ds);
      if (scope === "candidates") cs = cs.filter((c) => !c.inIndex);
      if (scope === "held") cs = cs.filter((c) => c.inIndex);
      const def = input.metric_id != null ? defOf(ds, input.metric_id) : undefined;
      if (input.metric_id != null && !def) return { step: "Looked for a metric", result: { error: `Unknown metric. Ids: ${ds.metricDefs.map((d) => d.id).join(", ")}` }, error: true };
      if (def) {
        const ordered = ranking(cs, def).filter((c) => c.metrics[def.id]?.value != null).slice(0, limit);
        return {
          step: `Ranking on ${def.short ?? def.label}`,
          result: { metric: def.label, higherIsBetter: def.higherIsBetter, companies: ordered.map((c, i) => ({ position: i + 1, ticker: c.ticker, name: c.name, value: formatValue(c.metrics[def.id]?.value, def.unit), verdict: verdictStyle[c.verdict].label })) },
        };
      }
      return {
        step: "Reading the engine's ranking",
        result: cs.slice(0, limit).map((c) => ({ rank: c.model!.rank, ticker: c.ticker, name: c.name, result: recStyle[c.model!.recommendation].label, checksPassed: `${c.model!.passed} of ${c.model!.available}`, verdict: verdictStyle[c.verdict].label, alreadyHeld: c.inIndex })),
      };
    }
    case "explain_metric": {
      const def = defOf(ds, input.metric_id);
      if (!def) return { step: "Looked for a metric", result: { error: `Unknown metric. Ids: ${ds.metricDefs.map((d) => d.id).join(", ")}` }, error: true };
      const check = tested(ds)[0]?.model?.checks.find((k) => k.metricId === def.id);
      return {
        step: `Reading how ${def.short ?? def.label} works`,
        result: { label: def.label, description: def.description, formula: def.formula, why: def.why, facts: def.facts, higherIsBetter: def.higherIsBetter, check: check ? { label: check.label, rule: check.rule, target: check.target, mustPass: check.kind === "gate" } : "no check uses it" },
      };
    }
    case "get_deals": {
      const c = findCompany(ds, input.ticker);
      if (!c) return unknownCompany(ds, input.ticker);
      const deals = sortedDeals(c);
      return {
        step: `Reading ${c.name}'s deals`,
        result: { total: deals.length, deals: deals.slice(0, 8).map((d) => ({ when: dealWhen(d), type: d.type, counterparty: d.counterparty, status: d.status, summary: d.summary, quote: d.quotes[0]?.quote })) },
      };
    }
    case "get_history": {
      const c = findCompany(ds, input.ticker);
      if (!c) return unknownCompany(ds, input.ticker);
      const rows = [...(c.history ?? [])].sort((a, b) => a.fiscalYear - b.fiscalYear);
      if (!rows.length) return { step: `Looked for ${c.ticker}'s statements`, result: { note: `No yearly statements for ${c.ticker} in this run.` } };
      return {
        step: `Reading ${c.name}'s yearly statements`,
        result: {
          currency: c.reportingCurrency ?? ds.currency,
          years: rows.map((r) => ({ fiscalYear: r.fiscalYear, ...Object.fromEntries(SERIES_IDS.map((id) => [seriesLabel(id), formatSeries(id, yearValue(r, id))])) })),
        },
      };
    }
  }
  return null;
}
