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
  add: { label: "Add", dot: "#16a34a", badge: "bg-green-100 text-green-800" },
  reject: { label: "Reject", dot: "#dc2626", badge: "bg-red-100 text-red-800" },
  watch: { label: "Watch", dot: "#d97706", badge: "bg-amber-100 text-amber-800" },
  existing: { label: "In index", dot: "#475569", badge: "bg-slate-200 text-slate-800" },
};

export const recStyle: Record<"pass" | "mixed" | "fail", { label: string; badge: string }> = {
  pass: { label: "Passes", badge: "bg-green-100 text-green-800" },
  mixed: { label: "Mixed", badge: "bg-amber-100 text-amber-800" },
  fail: { label: "Fails", badge: "bg-red-100 text-red-800" },
};

export const pct = (v: number, digits = 1) => `${v.toFixed(digits)}%`;
