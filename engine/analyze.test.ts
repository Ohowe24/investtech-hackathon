import { describe, expect, it } from "vitest";
import datasetJson from "../data/companies.json";
import storeJson from "../data/store.json";
import snapshotJson from "../data/indexes.json";
import type { Dataset, IndexSnapshot } from "../contract/types";
import { analyze } from "./analyze";
import { getIndustry } from "./industries";
import { median } from "./metrics";
import type { Store } from "./store";

const store = storeJson as unknown as Store;
const snapshot = snapshotJson as unknown as IndexSnapshot;
const published = datasetJson as unknown as Dataset;
const acquirers = getIndustry("acquirers");
const reits = getIndustry("reits");
const positions = (p: typeof acquirers) => snapshot.indexes.find((i) => i.name === p.indexName)!.positions;

const strip = (d: Dataset) => ({ ...d, generatedAt: "" });

describe("analyze", () => {
  it("reproduces the published dataset for the organizers' index", () => {
    const pos = positions(getIndustry(published.industryId));
    const { dataset } = analyze(getIndustry(published.industryId), store, { holdings: pos.map((p) => p.ticker), holdingsSource: "organizers", positions: pos });
    expect(strip(dataset)).toEqual(strip(published));
  });

  it("keeps a holding with no data, with empty metrics and a note, and never guesses", () => {
    const { dataset } = analyze(acquirers, store, { holdings: ["ZZZZ", "AME"], holdingsSource: "user" });
    const z = dataset.companies.find((c) => c.ticker === "ZZZZ")!;
    expect(z.inIndex).toBe(true);
    expect(z.dataNote).toBeTruthy();
    expect(Object.values(z.metrics).every((m) => m.value === null && m.note)).toBe(true);
    expect(z.model!.checks.every((k) => k.pass === null)).toBe(true);
    // A company with data always ranks ahead of one without.
    expect(dataset.companies.find((c) => c.ticker === "AME")!.model!.rank).toBeLessThan(z.model!.rank);
  });

  it("does not test a held Canadian company as a candidate", () => {
    const { dataset } = analyze(acquirers, store, { holdings: ["CSU", "AME"], holdingsSource: "user" });
    const csu = dataset.companies.filter((c) => c.ticker === "CSU");
    expect(csu).toHaveLength(1);
    expect(csu[0].inIndex).toBe(true);
    expect(csu[0].verdict).toBe("existing");
  });

  it("lists universe candidates without data as unmeasured, not ranked", () => {
    const { dataset } = analyze(reits, store, { holdings: ["O"], holdingsSource: "user" });
    const un = new Set(dataset.unmeasured!.map((u) => u.ticker));
    for (const c of dataset.companies.filter((x) => !x.inIndex)) expect(un.has(c.ticker)).toBe(false);
    expect(dataset.companies.filter((c) => !c.inIndex).length + un.size).toBe(reits.universe.length);
  });

  it("only points at sources it ships", () => {
    const { dataset } = analyze(reits, store, { holdings: ["O"], holdingsSource: "user" });
    const ids = new Set(dataset.sources.map((s) => s.id));
    for (const c of dataset.companies) for (const m of Object.values(c.metrics)) for (const id of m.sourceIds) expect(ids.has(id)).toBe(true);
  });

  it("weights additions inside the profile's sleeve and cap", () => {
    for (const p of [acquirers, reits]) {
      const { dataset } = analyze(p, store, { holdings: positions(p).map((x) => x.ticker), holdingsSource: "organizers" });
      const adds = dataset.companies.filter((c) => c.verdict === "add");
      expect(adds.reduce((s, c) => s + c.proposedWeightPct!, 0)).toBeLessThanOrEqual(p.sleevePct + 1e-9);
      for (const c of adds) expect(c.proposedWeightPct!).toBeLessThanOrEqual(p.maxWeightPct + 1e-9);
    }
  });
});

describe("median", () => {
  it("skips missing values", () => {
    expect(median([3, null, 1, 2])).toBe(2);
    expect(median([4, 1, undefined, 2, 3])).toBe(2.5);
    expect(median([null])).toBeNull();
  });
});
