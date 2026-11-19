import { describe, expect, it } from "vitest";
import datasetJson from "@data/companies.json";
import type { Company, Dataset } from "@contract/types";
import { formatValue } from "@/lib/format";
import { runAnalysis } from "@/lib/server/analysis";
import { briefRequest, buildBrief, CLOSING_QUESTION, isSignOff } from "./brief";
import { Ground } from "./grounding";
import { tested } from "./data";

const acquirers = datasetJson as unknown as Dataset;

/** Everything a briefing may quote about a company: its data as stored and as the site formats it. */
function groundFor(ds: Dataset, c: Company): Ground {
  const g = new Ground();
  g.add(JSON.stringify(c));
  g.add(String(tested(ds).length));
  g.add("100"); // the quality score's scale
  // Analyst counts, buy and strong buy together, sell and strong sell together.
  if (c.analyst) g.add(`${c.analyst.strongBuy + c.analyst.buy} ${c.analyst.sell + c.analyst.strongSell}`);
  // Money as the site formats it: net cash, and the latest year's revenue, EBITDA and free cash flow.
  for (const h of c.history ?? []) {
    for (const v of [h.netDebt, h.revenue, h.ebitda, h.freeCashFlow]) if (v != null) g.add(formatValue(Math.abs(v), "money"));
  }
  for (const d of ds.metricDefs) {
    const v = c.metrics[d.id]?.value;
    if (v != null) g.add(`${formatValue(v, d.unit)} ${formatValue(Math.abs(v), d.unit)}`);
  }
  return g;
}

function expectGrounded(ds: Dataset, c: Company) {
  const b = buildBrief(ds, c);
  expect(b).not.toBeNull();
  const g = groundFor(ds, c);
  for (const beat of b!.beats) {
    expect(g.unverified(beat.text), `${c.ticker}: ${beat.text}`).toEqual([]);
    if (beat.callout.kind === "strengths" || beat.callout.kind === "weak") {
      for (const it of beat.callout.items) expect(g.unverified(it.value), `${c.ticker}: ${it.value}`).toEqual([]);
    }
    if (beat.callout.kind === "company") {
      for (const f of beat.callout.figures) expect(g.unverified(f.value), `${c.ticker}: ${f.value}`).toEqual([]);
    }
    // The briefing describes the company; it never pitches the rank or the verdict.
    expect(beat.text).not.toMatch(/\brank|engine says|\bfirst of\b/i);
  }
}

describe("company briefing", () => {
  it("every number in every tested company's briefing traces to the data", () => {
    for (const c of acquirers.companies.filter((x) => x.model)) expectGrounded(acquirers, c);
  });

  it("greets Max and Oscar, then the company, strengths, soft spot, score, analysts, charts and yearly figures", async () => {
    const run = await runAnalysis({ industry: "custom:oil-and-gas-exploration-and-production", holdings: [] });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    const ds = run.dataset;
    const pxt = ds.companies.find((c) => c.ticker === "PXT")!;
    const b = buildBrief(ds, pxt)!;
    expect(b.beats[0].text).toBe("Of course, Max and Oscar. Allow me to brief you on Parex Resources.");
    expect(b.beats.map((x) => x.id)).toEqual(["intro", "company", "strengths", "weak", "score", "analysts", "charts", "table"]);
    expect(b.beats.find((x) => x.id === "charts")!.steps!.length).toBe(5);
    for (const c of ds.companies.filter((x) => x.model)) expectGrounded(ds, c);
  });

  it("recognises a briefing request, including a misheard name, and leaves specific questions to the analyst", async () => {
    const run = await runAnalysis({ industry: "custom:oil-and-gas-exploration-and-production", holdings: [] });
    if (!run.ok) throw new Error("analysis failed");
    const ds = run.dataset;
    expect(briefRequest("Jarvis, explain Parex Resources.", ds)?.ticker).toBe("PXT");
    expect(briefRequest("Can you explain Paris Resources to me?", ds)?.ticker).toBe("PXT");
    expect(briefRequest("Tell me about PXT", ds)?.ticker).toBe("PXT");
    expect(briefRequest("Why did Parex fail the cash flow check?", ds)).toBeNull();
    expect(briefRequest("Explain how the model decides", ds)).toBeNull();
  });

  it("ends by asking if there's anything else, and knows when we're done", async () => {
    const run = await runAnalysis({ industry: "custom:oil-and-gas-exploration-and-production", holdings: [] });
    if (!run.ok) throw new Error("analysis failed");
    const b = buildBrief(run.dataset, run.dataset.companies.find((c) => c.ticker === "PXT")!)!;
    expect(b.beats.at(-1)!.text.endsWith(CLOSING_QUESTION)).toBe(true);
    expect(isSignOff("No, that's all, Jarvis. Thank you.")).toBe(true);
    expect(isSignOff("No thanks, Jarvis")).toBe(true);
    expect(isSignOff("Explain Parex Resources")).toBe(false);
  });
});
