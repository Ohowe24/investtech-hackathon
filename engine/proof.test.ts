import { describe, expect, it } from "vitest";
import datasetJson from "../data/companies.json";
import snapshotJson from "../data/indexes.json";
import type { CheckResult, Dataset, IndexSnapshot } from "../contract/types";
import { getIndustry } from "./industries";
import { flipResults, headroom, proveCompany, proveEngine, reproduce, rerunWeights, tallyChecks } from "./proof";

const config = getIndustry("acquirers");

const ds = datasetJson as unknown as Dataset;
const snap = snapshotJson as unknown as IndexSnapshot;
const tested = ds.companies.filter((c) => c.model);

const check = (kind: "gate" | "score", pass: boolean | null) => ({ kind, pass }) as Pick<CheckResult, "kind" | "pass">;

describe("the published dataset reproduces", () => {
  it("every metric of every company, re-run from its yearly figures with metrics.ts", () => {
    const misses = tested.flatMap((c) => ds.metricDefs.map((d) => reproduce(ds, c, d.id)).filter((r) => !r.match).map((r) => `${c.ticker}.${r.metricId}: ${r.value} vs ${r.stored}`));
    expect(misses).toEqual([]);
  });

  it("every check, result and weight", () => {
    const p = proveEngine(ds);
    expect(p.companies).toBe(tested.length);
    for (const k of ["metrics", "checks", "results", "weights", "rules"] as const) expect(p[k].matched, k).toBe(p[k].total);
    expect(p.metrics.total).toBeGreaterThan(tested.length * 5);
  });

  it("organic growth is found word for word in its filing quote", () => {
    for (const c of tested.filter((x) => x.metrics.organicGrowth?.value != null)) {
      const r = reproduce(ds, c, "organicGrowth");
      expect(r.method).toBe("quoted");
      expect(r.match).toBe(true);
    }
  });

  it("weights follow the declared rule, related companies sharing a slot", () => {
    const w = rerunWeights(ds);
    for (const c of ds.companies.filter((x) => x.proposedWeightPct != null)) expect(w[c.ticker]).toBe(c.proposedWeightPct);
  });
});

describe("a reproduction catches a wrong number", () => {
  it("reports a mismatch instead of hiding it", () => {
    const c = tested.find((x) => x.metrics.revenueCagr?.value != null)!;
    const tampered = { ...c, metrics: { ...c.metrics, revenueCagr: { ...c.metrics.revenueCagr, value: c.metrics.revenueCagr.value! + 0.01 } } };
    expect(reproduce(ds, tampered, "revenueCagr").match).toBe(false);
  });
});

describe("headroom", () => {
  it("is positive when a value clears the line and negative when it misses", () => {
    expect(headroom(0.2, ">=", 0.07)).toBeCloseTo(0.13);
    expect(headroom(0.05, ">=", 0.07)).toBeCloseTo(-0.02);
    expect(headroom(1.1, "<=", 3)).toBeCloseTo(1.9);
    expect(headroom(3.2, "<=", 3)).toBeCloseTo(-0.2);
    expect(headroom(null, "<=", 3)).toBeNull();
  });
});

describe("which checks the result rests on", () => {
  it("a single failed must-pass check decides a result that would otherwise pass", () => {
    const checks = [check("gate", true), check("gate", false), check("score", true), check("score", true), check("score", true), check("score", true)];
    expect(tallyChecks(checks).recommendation).toBe("fail");
    expect(flipResults(checks)).toEqual([null, "pass", null, null, null, null]);
  });

  it("with every scored check passing, one scored check can fail without changing a pass", () => {
    const checks = [check("gate", true), check("gate", true), check("score", true), check("score", true), check("score", true), check("score", true)];
    expect(flipResults(checks)).toEqual(["fail", "fail", null, null, null, null]);
  });

  it("at the minimum, every passing scored check holds the result up", () => {
    const checks = [check("gate", true), check("gate", true), check("score", true), check("score", true), check("score", true), check("score", false)];
    const flips = flipResults(checks);
    expect(flips.slice(2, 5)).toEqual(["mixed", "mixed", "mixed"]);
    expect(flips[5]).toBeNull();
  });

  it("unknown checks are never flipped", () => {
    expect(flipResults([check("gate", true), check("gate", true), check("score", null)])).toEqual(["fail", "fail", null]);
  });
});

describe("company proof", () => {
  it("lists deciding checks that are failed, and load-bearing checks that are passed", () => {
    for (const c of tested) {
      const p = proveCompany(ds, c);
      for (const id of p.deciding) expect(c.model!.checks.find((k) => k.id === id)!.pass).toBe(false);
      for (const id of p.loadBearing) expect(c.model!.checks.find((k) => k.id === id)!.pass).toBe(true);
    }
  });

  it("flags a holding the index labels with another country", () => {
    const index = snap.indexes.find((i) => i.name === ds.indexName)!;
    const pos = index.positions.find((x) => ds.companies.find((c) => c.ticker === x.ticker)?.hqCountry !== x.countryCode);
    if (!pos) return;
    const c = ds.companies.find((x) => x.ticker === pos.ticker)!;
    expect(proveCompany(ds, c, pos.countryCode).safeguards.map((s) => s.id)).toContain("relabel");
  });

  it("names the related-company slot from config", () => {
    const t = config.relatedGroups[0]?.[0];
    const c = ds.companies.find((x) => x.ticker === t);
    if (c) expect(proveCompany(ds, c).safeguards.map((s) => s.id)).toContain("related");
  });
});
