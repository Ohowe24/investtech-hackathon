import { describe, expect, it } from "vitest";
import type { Dataset } from "@contract/types";
import datasetJson from "@data/companies.json";
import { auditTrail, passMark, sourcesByCompany } from "./audit";
import { formatMetric } from "./format";

const dataset = datasetJson as unknown as Dataset;
const tested = dataset.companies.filter((c) => c.model);

// The engine run and the console only replay what the dataset says. These tests pin that.
describe("audit trail", () => {
  it("has one line per check the model ran, best-ranked company first", () => {
    const trail = auditTrail(dataset);
    expect(trail.length).toBe(tested.reduce((s, c) => s + c.model!.checks.length, 0));
    const top = tested.find((c) => c.model!.rank === Math.min(...tested.map((t) => t.model!.rank)))!;
    expect(trail[0].ticker).toBe(top.ticker);
  });

  it("shows each company's own value and the model's own pass result", () => {
    for (const line of auditTrail(dataset)) {
      const c = dataset.companies.find((x) => x.ticker === line.ticker)!;
      const k = c.model!.checks.find((x) => x.label === line.label)!;
      const def = dataset.metricDefs.find((d) => d.id === k.metricId)!;
      expect(line.value).toBe(formatMetric(c.metrics[k.metricId], def.unit));
      expect(line.pass).toBe(k.pass);
      expect(line.target).toBe(k.target ?? "");
    }
  });

  it("counts every source once across companies", () => {
    const all = new Set([...sourcesByCompany(dataset).values()].flat());
    for (const id of all) expect(dataset.sources.some((s) => s.id === id)).toBe(true);
  });

  it("never calls missing data a fail", () => {
    expect(passMark(null)).toBe("NO DATA");
    expect(passMark(false)).toBe("FAIL");
    expect(passMark(true)).toBe("PASS");
  });
});
