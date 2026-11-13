import { describe, expect, it } from "vitest";
import type { Company, Dataset } from "../contract/types";
import data from "../data/companies.json";
import { compareRules, defaultSettings } from "./sensitivity";

const companies = (data as Dataset).companies;
function fixture(): Company {
  return { ticker: "TEST", name: "Test fixture", hqCountry: "CA", inIndex: false, zone: "", verdict: "watch", metrics: Object.fromEntries(Object.entries({ acqIntensity: 0.5, netDebtToEbitda: 3, fcfPerShareCagr: 0.07, cashReturn: 0.08, shareCountChange: 0.01 }).map(([id, value]) => [id, { value, sourceIds: [] }])) };
}

describe("acquirer rule sensitivity", () => {
  it("reproduces every published model at the declared defaults", () => {
    for (const company of companies) {
      const { baseline, scenario, changedChecks } = compareRules(company, defaultSettings());
      expect(baseline.recommendation, company.ticker).toBe(company.model!.recommendation);
      expect(baseline.checks.map((c) => c.pass)).toEqual(company.model!.checks.map((c) => c.pass));
      expect(scenario).toEqual(baseline);
      expect(changedChecks).toEqual([]);
    }
  });
  it("uses inclusive boundaries and explains a changed debt gate", () => {
    const result = compareRules(fixture(), { ...defaultSettings(), debtLimit: 2.9 });
    expect(result.baseline.recommendation).toBe("pass");
    expect(result.scenario.recommendation).toBe("fail");
    expect(result.changedChecks.map((c) => c.id)).toEqual(["debtLimit"]);
  });
  it("can change a scored check without changing the overall result", () => {
    const result = compareRules(fixture(), { ...defaultSettings(), ownersGain: 0.08 });
    expect(result.changedChecks.map((c) => c.id)).toEqual(["ownersGain"]);
    expect(result.changed).toBe(false);
    expect(result.scenario.passed).toBe(3);
  });
  it("does not turn missing evidence into passes or zeroes", () => {
    const company = fixture();
    company.metrics.netDebtToEbitda.value = null;
    expect(compareRules(company, defaultSettings()).scenario.recommendation).toBe("mixed");
    company.metrics = {};
    const result = compareRules(company, defaultSettings());
    expect(result.scenario.available).toBe(0);
    expect(result.scenario.checks.every((c) => c.pass === null)).toBe(true);
    expect(result.scenario.recommendation).toBe("mixed");
  });
  it("keeps theme fit fixed even with permissive thresholds", () => {
    const company = fixture();
    company.metrics.acqIntensity.value = 0.1;
    expect(compareRules(company, { debtLimit: 5, ownersGain: 0, cashReturn: 0 }).scenario.recommendation).toBe("fail");
  });
  it("does not mutate company decisions, metrics or defaults", () => {
    const before = JSON.stringify(companies);
    const defaults = defaultSettings();
    companies.forEach((c) => compareRules(c, { debtLimit: 1, ownersGain: 0.15, cashReturn: 0.2 }));
    expect(JSON.stringify(companies)).toBe(before);
    expect(defaultSettings()).toEqual(defaults);
  });
  it("bounds invalid inputs and falls back for non-finite thresholds", () => {
    const result = compareRules(fixture(), { debtLimit: NaN, ownersGain: -5, cashReturn: 10 });
    expect(result.scenario.checks.find((c) => c.id === "debtLimit")!.threshold).toBe(defaultSettings().debtLimit);
    expect(result.scenario.checks.find((c) => c.id === "ownersGain")!.threshold).toBe(0);
    expect(result.scenario.checks.find((c) => c.id === "cashReturn")!.threshold).toBe(0.2);
  });
});
