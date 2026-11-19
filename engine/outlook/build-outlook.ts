// npm run outlook: builds data/outlook.json for the Outlook engine tab. See docs/OUTLOOK_ENGINE.md.
// Today it writes the plan and copies the disclosed deals (Layer 1 input). Labels, segments and signals come next.
// Copies values; never creates a number.

import { readFileSync, writeFileSync } from "node:fs";
import type { OutlookData, OutlookDeal } from "../../contract/outlook";
import { COMPANIES, LAYERS, SOURCES, THESIS } from "./plan";

interface RawDeal {
  type: string;
  status?: string;
  date?: string;
  periodLabel?: string;
  fiscalYear?: number;
  counterparty?: string;
  summary?: string;
  quotes?: { label: string; quote: string }[];
}

const raw = JSON.parse(readFileSync("engine/input/deals.json", "utf8")) as Record<string, RawDeal[]>;
const tickers = new Set(COMPANIES.map((c) => c.ticker));

const deals: OutlookDeal[] = Object.entries(raw)
  .filter(([t]) => tickers.has(t))
  .flatMap(([ticker, list]) =>
    list
      .filter((d) => d.type === "acquisition")
      .map((d) => ({
        ticker,
        date: d.date ?? d.periodLabel ?? "",
        fiscalYear: d.fiscalYear ?? null,
        counterparty: d.counterparty ?? "",
        summary: d.summary ?? "",
        quote: d.quotes?.[0]?.quote ?? null,
        naics: null,
        naicsTitle: null,
        naicsQuote: null,
        labelStatus: "unlabelled" as const,
      })),
  )
  .sort((a, b) => a.ticker.localeCompare(b.ticker) || (b.fiscalYear ?? 0) - (a.fiscalYear ?? 0) || b.date.localeCompare(a.date));

const out: OutlookData = {
  generatedAt: new Date().toISOString(),
  status: "planned",
  thesis: THESIS,
  layers: LAYERS,
  sources: SOURCES,
  companies: COMPANIES.map((c) => ({
    ...c,
    mix: [],
    tailwind: null,
    coverage: null,
    direction: null,
    notes: ["Industry mix not mapped yet"],
  })),
  deals,
  industries: [],
};

writeFileSync("data/outlook.json", JSON.stringify(out, null, 2) + "\n");
console.log(`data/outlook.json: ${deals.length} deals for ${COMPANIES.length} companies, ${LAYERS.length} layers`);
