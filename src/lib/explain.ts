import type { CheckResult, Dataset } from "@contract/types";
import type { Explanation } from "@/components/ui";

/** Explanation for a metric, from its definition in the engine config. */
export function metricInfo(dataset: Dataset, metricId: string, title?: string): Explanation {
  const d = dataset.metricDefs.find((m) => m.id === metricId);
  return { title: title ?? d?.label ?? metricId, what: d?.description, how: d?.formula };
}

/** Explanation for one check: the metric behind it plus the pass line. */
export function checkInfo(dataset: Dataset, k: CheckResult): Explanation {
  return {
    ...metricInfo(dataset, k.metricId, k.label),
    pass: `${k.rule}.`,
    note: k.kind === "gate" ? "Must pass. Failing it fails the company." : undefined,
  };
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

/** Explanation for a metric plus every pass line set on it. */
export function scoredMetricInfo(dataset: Dataset, metricId: string): Explanation {
  const checks = dataset.companies.find((c) => c.model)?.model?.checks.filter((k) => k.metricId === metricId) ?? [];
  return {
    ...metricInfo(dataset, metricId),
    pass: checks.length ? checks.map((k) => `${k.rule}.`).join(" ") : undefined,
    note: checks.some((k) => k.kind === "gate") ? "Must pass: failing the first line fails the company." : checks.length ? undefined : "Shown for context. Not scored.",
  };
}
