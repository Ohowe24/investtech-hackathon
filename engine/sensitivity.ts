import type { Company } from "../contract/types";
import { config } from "./config";
import { evaluateScreen } from "./metrics";

export const controls = [
  { id: "debtLimit", label: "Maximum net debt / EBITDA", min: 1, max: 5, step: 0.1, unit: "multiple", why: "How much leverage will you tolerate while a company keeps acquiring?" },
  { id: "ownersGain", label: "Minimum FCF per share growth", min: 0, max: 0.15, step: 0.01, unit: "pct", why: "How much annual cash growth should reach each share?" },
  { id: "cashReturn", label: "Minimum cash return on capital", min: 0, max: 0.2, step: 0.01, unit: "pct", why: "How much cash should the company earn on its invested debt and equity?" },
] as const;
export type RuleSettings = Record<(typeof controls)[number]["id"], number>;
export function defaultSettings(): RuleSettings {
  return Object.fromEntries(controls.map((c) => [c.id, config.checks.find((k) => k.id === c.id)!.threshold])) as RuleSettings;
}

export function compareRules(company: Company, settings: RuleSettings) {
  const baseline = evaluateScreen(company.metrics, config.checks, config.scoring);
  const checks = config.checks.map((check) => {
    const control = controls.find((c) => c.id === check.id);
    if (!control) return check;
    const value = settings[control.id];
    // Invalid inputs fall back to the declared default; fixed rules cannot be overridden.
    const threshold = Number.isFinite(value) ? Math.max(control.min, Math.min(control.max, value)) : check.threshold;
    return { ...check, threshold };
  });
  const scenario = evaluateScreen(company.metrics, checks, config.scoring);
  const changedChecks = scenario.checks.filter((check, i) => check.pass !== baseline.checks[i].pass);
  return { baseline, scenario, changedChecks, changed: baseline.recommendation !== scenario.recommendation };
}
