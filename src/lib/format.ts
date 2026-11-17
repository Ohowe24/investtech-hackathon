import type { MetricValue, Unit, Verdict } from "@contract/types";

export function formatValue(value: number | null | undefined, unit: Unit): string {
  if (value == null) return "Missing";
  switch (unit) {
    case "pct":
      return `${(value * 100).toFixed(1)}%`;
    case "multiple":
      return `${value.toFixed(1)}×`;
    case "money":
      return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
    case "count":
      return value.toLocaleString("en");
  }
}

export function formatMetric(m: MetricValue | undefined, unit: Unit): string {
  return formatValue(m?.value, unit);
}

export const verdictStyle: Record<Verdict, { label: string; dot: string; badge: string }> = {
  add: { label: "Add", dot: "#2f5454", badge: "bg-tealsoft text-teal" },
  reject: { label: "Reject", dot: "#c8372d", badge: "bg-badsoft text-bad" },
  watch: { label: "Watch", dot: "#d4a017", badge: "bg-warnsoft text-warn" },
  existing: { label: "In index", dot: "#9a9a9a", badge: "bg-soft text-muted" },
};

export const recStyle: Record<"pass" | "mixed" | "fail", { label: string; badge: string; dot: string }> = {
  pass: { label: "Passes", badge: "bg-tealsoft text-teal", dot: "#2f5454" },
  mixed: { label: "Mixed", badge: "bg-warnsoft text-warn", dot: "#d4a017" },
  fail: { label: "Fails", badge: "bg-badsoft text-bad", dot: "#c8372d" },
};

export const pct = (v: number, digits = 1) => `${v.toFixed(digits)}%`;

/**
 * "A", "A and B", "A, B and C". Past `max` names the rest become "and N more",
 * so a list that grows with the data (every company that passes) never turns into a wall of text.
 */
export function listNames(names: string[], max = Infinity): string {
  const shown = names.length > max ? names.slice(0, max) : names;
  const parts = shown.length < names.length ? [...shown, `${names.length - shown.length} more`] : shown;
  return parts.length <= 2 ? parts.join(" and ") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
