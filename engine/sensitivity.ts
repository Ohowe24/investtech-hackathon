import type { Company } from "../contract/types";
import { getIndustry } from "./industries";
import type { IndustryProfile } from "./industries/types";
import { evaluateScreen } from "./metrics";

/** The rule lab's sliders for an industry. Each id matches one of its declared checks. */
export const controlsFor = (profile: IndustryProfile = getIndustry()) => profile.ruleControls;
export type RuleSettings = Record<string, number>;
export function defaultSettings(profile: IndustryProfile = getIndustry()): RuleSettings {
  return Object.fromEntries(profile.ruleControls.map((c) => [c.id, profile.checks.find((k) => k.id === c.id)!.threshold]));
}

export function compareRules(company: Company, settings: RuleSettings, profile: IndustryProfile = getIndustry()) {
  const baseline = evaluateScreen(company.metrics, profile.checks, profile.scoring);
  const checks = profile.checks.map((check) => {
    const control = profile.ruleControls.find((c) => c.id === check.id);
    if (!control) return check;
    const value = settings[control.id];
    // Invalid inputs fall back to the declared default; fixed rules cannot be overridden.
    const threshold = Number.isFinite(value) ? Math.max(control.min, Math.min(control.max, value)) : check.threshold;
    return { ...check, threshold };
  });
  const scenario = evaluateScreen(company.metrics, checks, profile.scoring);
  const changedChecks = scenario.checks.filter((check, i) => check.pass !== baseline.checks[i].pass);
  return { baseline, scenario, changedChecks, changed: baseline.recommendation !== scenario.recommendation };
}
