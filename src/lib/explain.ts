import type { Dataset } from "@contract/types";
import type { Explanation } from "@/components/ui";

/** Explanation for a metric, from its definition in the engine config. */
export function metricInfo(dataset: Dataset, metricId: string, title?: string): Explanation {
  const d = dataset.metricDefs.find((m) => m.id === metricId);
  return { title: title ?? d?.label ?? metricId, what: d?.description, how: d?.formula, why: d?.why, facts: d?.facts };
}

/** Yearly figures in the deal chart. Plain definitions, no numbers. */
export const yearInfo: Record<string, Explanation> = {
  acquisitions: {
    title: "Spent on acquisitions",
    how: "Cash paid to buy businesses that year, minus cash received from selling businesses. Negative means it sold more than it bought.",
  },
  operatingCashFlow: {
    title: "Operating cash flow",
    how: "Cash the business generated that year, from the cash flow statement.",
  },
  fcfPerShare: {
    title: "Free cash flow per share",
    how: "(Operating cash flow − capital spending) ÷ diluted shares, that year.",
  },
  cashReturn: {
    title: "Return on capital (free cash flow)",
    how: "That year's free cash flow ÷ average of (debt + equity) at the start and end of the year.",
  },
  dilutedShares: {
    title: "Diluted shares",
    how: "Average number of shares for the year, counting options and convertibles, as reported.",
  },
};

/** Explanation for a metric plus every pass line set on it and how much each counts. */
export function scoredMetricInfo(dataset: Dataset, metricId: string): Explanation {
  const all = dataset.companies.find((c) => c.model)?.model?.checks ?? [];
  const checks = all.filter((k) => k.metricId === metricId);
  const nScored = all.filter((k) => k.kind === "score").length;
  const weight = checks.length === 0
    ? "Not scored. Shown for context."
    : checks.map((k) => k.kind === "gate"
        ? `${k.target}: must pass. Failing it fails the company.`
        : `${k.target}: 1 of ${nScored} scored checks. All count the same toward the verdict.`).join(" ");
  const points = dataset.metricDefs.find((m) => m.id === metricId)?.weight;
  const scale = dataset.companies.flatMap((c) => c.model?.score?.parts ?? []).find((p) => p.metricId === metricId)?.scale;
  const score = !dataset.rules?.score
    ? undefined
    : points ? `${points} of 100 points. ${scale ? `${scale}.` : ""}` : "No points: shown for context.";
  return {
    ...metricInfo(dataset, metricId),
    pass: checks.length ? checks.map((k) => k.target).join(" and ") : undefined,
    weight,
    score,
  };
}
