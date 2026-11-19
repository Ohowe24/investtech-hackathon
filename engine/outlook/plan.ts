// The Outlook engine plan, as data, so the tab shows where the build stands.
// When a step is finished, change its status here and run `npm run outlook`. Full plan: docs/OUTLOOK_ENGINE.md.

import type { OutlookLayer, OutlookSource } from "../../contract/outlook";

export const THESIS =
  "An acquirer is only as good as the industries it buys into. For each serial acquirer: which industries it owns and buys, " +
  "where those industries are heading according to published forecasts and data, and whether its new deals point toward " +
  "stronger or weaker industries than the business it already has.";

export const LAYERS: OutlookLayer[] = [
  {
    id: "mix",
    title: "1 · Industry map",
    question: "Which industries does each company own and buy?",
    steps: [
      { id: "deals", label: "Disclosed deals", status: "done", detail: "Acquisitions with SEDAR quotes, copied from engine/input/deals.json." },
      { id: "deal-labels", label: "Deal industry labels", status: "in-progress", detail: "A NAICS code per deal, with the quote that justifies it, approved by a person (engine/input/outlook-labels.csv). Proposed; awaiting approval." },
      { id: "segments", label: "Revenue by segment", status: "planned", detail: "Onesheet segments for CSU, TOI, WSP, TFII, ARE, each segment mapped to NAICS." },
    ],
  },
  {
    id: "signals",
    title: "2 · Industry signals",
    question: "Where is each industry heading, according to published sources?",
    steps: [
      { id: "momentum", label: "Recent momentum", status: "planned", detail: "Statistics Canada GDP by industry (table 36-10-0434), 3-year yearly rate." },
      { id: "projection", label: "Official projection", status: "planned", detail: "US BLS Employment Projections and Canada COPS outlook by industry." },
      { id: "street", label: "Street forecast", status: "planned", detail: "Median analyst revenue growth estimate of the public companies in that industry (Onesheet estimates)." },
      { id: "narrative", label: "Narrative", status: "planned", detail: "News and earnings-call quotes summarized by Claude. Shown as text, never scored." },
    ],
  },
  {
    id: "tailwind",
    title: "3 · Company tailwind",
    question: "How strong are the industries this company earns its money in?",
    steps: [
      { id: "blend", label: "Industry outlook", status: "planned", detail: "One declared blend of the signals (start: median of the available ones), in engine/metrics.ts with tests." },
      { id: "weighting", label: "Revenue-weighted tailwind", status: "planned", detail: "Share of revenue × industry outlook, with the share of revenue covered shown." },
    ],
  },
  {
    id: "direction",
    title: "4 · Direction",
    question: "Are the new deals heading toward stronger or weaker industries than the existing business?",
    steps: [
      { id: "compare", label: "Deals vs base", status: "planned", detail: "Outlook of the last 3 years' deals vs the existing revenue mix: toward ↗, steady →, or away ↘." },
    ],
  },
];

export const SOURCES: OutlookSource[] = [
  { id: "deals", label: "Onesheet data pack deals with SEDAR quotes (engine/input/deals.json)", status: "fetched" },
  { id: "onesheet-segments", label: "Onesheet segments and KPIs", url: "https://api.onesheet.pro/v1/kpis/segments-and-kpis", status: "planned" },
  { id: "statcan-36-10-0434", label: "Statistics Canada, GDP at basic prices by industry (36-10-0434)", url: "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610043401", status: "planned" },
  { id: "bls-ep", label: "US BLS Employment Projections, output and employment by industry", url: "https://www.bls.gov/emp/", status: "planned" },
  { id: "esdc-cops", label: "Canadian Occupational Projection System (ESDC)", url: "https://occupations.esdc.gc.ca/sppc-cops/", status: "planned" },
  { id: "onesheet-estimates", label: "Onesheet analyst estimates", url: "https://api.onesheet.pro/v1/stocks/fundamentals", status: "planned" },
];

/** The serial-acquirer candidates the engine covers first. Names are labels, not data. */
export const COMPANIES: { ticker: string; name: string }[] = [
  { ticker: "CSU", name: "Constellation Software" },
  { ticker: "TOI", name: "Topicus.com" },
  { ticker: "WSP", name: "WSP Global" },
  { ticker: "TFII", name: "TFI International" },
  { ticker: "ARE", name: "Aecon Group" },
];
