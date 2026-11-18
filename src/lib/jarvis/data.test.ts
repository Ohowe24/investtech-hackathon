import { describe, expect, it } from "vitest";
import datasetJson from "@data/companies.json";
import type { Dataset } from "@contract/types";
import { briefing, findCompany, runDataTool } from "./data";
import { TOOL_DEFS } from "./toolDefs";

const ds = datasetJson as unknown as Dataset;
const pick = ds.companies.find((c) => c.verdict === "add" && !c.inIndex)!;
const other = ds.companies.find((c) => c.ticker !== pick.ticker && c.model)!;

describe("jarvis data tools", () => {
  it("briefing names the picks and never mentions weights as figures", () => {
    const b = briefing(ds);
    expect(b).toContain(pick.ticker);
    expect(b).not.toMatch(/weight \d/i);
  });

  it("every tool has a handler", () => {
    for (const t of TOOL_DEFS) expect(runDataTool(ds, t.name, {})).not.toBeNull();
  });

  it("briefing carries every tested company's checks, so most answers need no look-up", () => {
    const b = briefing(ds);
    for (const c of ds.companies.filter((x) => x.model)) expect(b).toContain(`- ${c.ticker} · `);
    expect(b).toContain(pick.model!.checks[0].label);
  });

  it("finds companies by ticker, exchange-prefixed ticker or name", () => {
    expect(findCompany(ds, pick.ticker.toLowerCase())?.ticker).toBe(pick.ticker);
    expect(findCompany(ds, `TSX:${pick.ticker}`)?.ticker).toBe(pick.ticker);
    expect(findCompany(ds, pick.name)?.ticker).toBe(pick.ticker);
  });

  it("get_company returns formatted checks and metrics", () => {
    const r = runDataTool(ds, "get_company", { ticker: pick.ticker })!;
    const out = r.result as { checks: { value: string }[]; metrics: { value: string }[] };
    expect(r.error).toBeFalsy();
    expect(out.checks.length).toBeGreaterThan(0);
    expect(out.metrics.every((m) => typeof m.value === "string")).toBe(true);
  });

  it("unknown tickers are errors, not guesses", () => {
    expect(runDataTool(ds, "get_company", { ticker: "NOPE" })!.error).toBe(true);
  });

  it("compare, rank, metric, deals and history run", () => {
    expect(runDataTool(ds, "compare_companies", { tickers: [pick.ticker, other.ticker] })!.error).toBeFalsy();
    expect(runDataTool(ds, "rank_companies", { scope: "candidates" })!.error).toBeFalsy();
    expect(runDataTool(ds, "rank_companies", { metric_id: ds.metricDefs[0].id })!.error).toBeFalsy();
    expect(runDataTool(ds, "explain_metric", { metric_id: ds.metricDefs[0].id })!.error).toBeFalsy();
    expect(runDataTool(ds, "get_deals", { ticker: pick.ticker })!.error).toBeFalsy();
    expect(runDataTool(ds, "get_history", { ticker: pick.ticker })!.error).toBeFalsy();
  });
});
