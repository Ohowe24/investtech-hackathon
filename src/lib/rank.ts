import type { Company, Dataset, MetricDef } from "@contract/types";

export type State = "pass" | "fail" | "none" | "plain";

/** How a company does on one metric: fail if any check on it fails, pass if all pass, none if no data, plain if unscored. */
export function metricState(c: Company, metricId: string): State {
  if (c.metrics[metricId]?.value == null) return "none";
  const checks = c.model?.checks.filter((k) => k.metricId === metricId) ?? [];
  if (checks.length === 0) return "plain";
  if (checks.some((k) => k.pass === false)) return "fail";
  return checks.every((k) => k.pass === true) ? "pass" : "none";
}

/** Metrics that have at least one check, in check order. */
export function scoredMetrics(dataset: Dataset): MetricDef[] {
  const ids = [...new Set(dataset.companies.flatMap((c) => c.model?.checks.map((k) => k.metricId) ?? []))];
  return ids.map((id) => dataset.metricDefs.find((d) => d.id === id)).filter((d): d is MetricDef => d != null);
}

/** Companies ordered on one metric. Lowest first when lower is better, else highest first. Missing values go last. */
export function ranking(companies: Company[], def: MetricDef): Company[] {
  const dir = def.higherIsBetter === false ? 1 : -1;
  const v = (c: Company) => c.metrics[def.id]?.value ?? null;
  return [...companies].sort((a, b) => {
    const av = v(a);
    const bv = v(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * dir;
  });
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export const stateText: Record<State, string> = { pass: "text-teal", fail: "text-bad", none: "text-faint", plain: "text-ink" };
export const stateBg: Record<State, string> = { pass: "bg-teal", fail: "bg-bad", none: "bg-line", plain: "bg-ink/30" };
