import type { CheckResult, Company, Dataset } from "@contract/types";
import { formatMetric } from "./format";

/** One line of the engine's audit trail: one check on one company, as the model scored it. */
export interface AuditLine {
  ticker: string;
  label: string;
  /** the company's value, formatted in the metric's unit; "Missing" when there is none */
  value: string;
  /** the pass line, e.g. "≥ 20%" */
  target: string;
  pass: boolean | null;
  gate: boolean;
}

export function auditLine(dataset: Dataset, c: Company, k: CheckResult): AuditLine {
  const def = dataset.metricDefs.find((d) => d.id === k.metricId);
  return {
    ticker: c.ticker,
    label: k.label,
    value: formatMetric(c.metrics[k.metricId], def?.unit ?? "pct"),
    target: k.target ?? "",
    pass: k.pass,
    gate: k.kind === "gate",
  };
}

/** Every check the model ran, company by company in rank order. Read straight from the dataset; nothing is recomputed. */
export function auditTrail(dataset: Dataset): AuditLine[] {
  return dataset.companies
    .filter((c) => c.model)
    .sort((a, b) => a.model!.rank - b.model!.rank)
    .flatMap((c) => c.model!.checks.map((k) => auditLine(dataset, c, k)));
}

/** Source ids each company's figures cite, so the run can count filings as it reads them. */
export function sourcesByCompany(dataset: Dataset): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const c of dataset.companies) {
    const ids = new Set<string>();
    for (const m of Object.values(c.metrics)) m.sourceIds.forEach((id) => ids.add(id));
    for (const h of c.history ?? []) h.sourceIds.forEach((id) => ids.add(id));
    out.set(c.ticker, [...ids]);
  }
  return out;
}

export const passMark = (p: boolean | null) => (p === null ? "NO DATA" : p ? "PASS" : "FAIL");
