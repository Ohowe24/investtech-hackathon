// npm run outlook: builds data/outlook.json for the Outlook engine tab. See docs/OUTLOOK_ENGINE.md.
// Writes the plan, copies the disclosed deals (Layer 1 input) and attaches their industry labels from
// engine/input/outlook-labels.csv. Segments and signals come next. Copies values; never creates a number.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { OutlookData, OutlookDeal } from "../../contract/outlook";
import { parseCsv } from "../csv";
import { COMPANIES, LAYERS, SOURCES, THESIS } from "./plan";

const LABELS = "engine/input/outlook-labels.csv";
const dealKey = (ticker: string, date: string, counterparty: string) => `${ticker}|${date}|${counterparty}`;
const labels = new Map(
  (existsSync(LABELS) ? parseCsv(readFileSync(LABELS, "utf8")) : []).map((r) => [dealKey(r.ticker, r.date, r.counterparty), r]),
);
const orNull = (s: string | undefined) => (s ? s : null);

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
      .map((d): OutlookDeal => {
        const date = d.date ?? d.periodLabel ?? "";
        const counterparty = d.counterparty ?? "";
        const l = labels.get(dealKey(ticker, date, counterparty));
        return {
          ticker,
          date,
          fiscalYear: d.fiscalYear ?? null,
          counterparty,
          summary: d.summary ?? "",
          quote: d.quotes?.[0]?.quote ?? null,
          naics: orNull(l?.naics),
          naicsTitle: orNull(l?.naics_title),
          naicsQuote: orNull(l?.quote),
          naicsQuoteSource: orNull(l?.quote_source),
          serves: orNull(l?.serves),
          labelStatus: l?.status === "approved" ? "approved" : l ? "proposed" : "unlabelled",
          exclude: orNull(l?.exclude),
          labelNote: orNull(l?.note),
        };
      }),
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

const used = new Set(deals.map((d) => dealKey(d.ticker, d.date, d.counterparty)));
const orphans = [...labels.keys()].filter((k) => !used.has(k));
if (orphans.length) console.warn(`${LABELS}: ${orphans.length} label rows match no deal:\n  ${orphans.join("\n  ")}`);

writeFileSync("data/outlook.json", JSON.stringify(out, null, 2) + "\n");
const count = (s: OutlookDeal["labelStatus"]) => deals.filter((d) => d.labelStatus === s).length;
console.log(
  `data/outlook.json: ${deals.length} deals for ${COMPANIES.length} companies, ${LAYERS.length} layers; ` +
    `labels: ${count("approved")} approved, ${count("proposed")} proposed, ${count("unlabelled")} unlabelled`,
);
