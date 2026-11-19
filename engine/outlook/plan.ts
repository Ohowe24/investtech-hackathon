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
      { id: "deal-labels", label: "Deal industry labels", status: "in-progress", detail: "A NAICS code per deal with the quote that justifies it (engine/input/outlook-labels.csv). Proposed; awaiting approval." },
      { id: "segments", label: "Revenue by segment", status: "done", detail: "Onesheet segments for CSU, TOI, WSP, TFII, ARE, each mapped to an industry with a quote (engine/input/outlook-segments.csv)." },
    ],
  },
  {
    id: "signals",
    title: "2 · Industry signals",
    question: "Where is each industry heading, according to published sources?",
    steps: [
      { id: "momentum", label: "Recent momentum", status: "done", detail: "Statistics Canada real GDP by industry (36-10-0434): latest 12 months vs 3 years earlier, yearly rate." },
      { id: "projection", label: "Official projections", status: "done", detail: "Canada: ESDC COPS real GDP 2025 → 2035. United States: BLS real output 2025 → 2035 (Table 2.11)." },
      { id: "street", label: "Street forecast", status: "done", detail: "Median analyst revenue growth of listed Canadian peers (Onesheet estimates), after inflation." },
      { id: "narrative", label: "Narrative", status: "done", detail: "Verbatim quotes from each company's latest earnings call, with a one-line summary by Claude (engine/input/outlook-narrative.csv). Shown as text, never scored." },
    ],
  },
  {
    id: "tailwind",
    title: "3 · Company tailwind",
    question: "How strong are the industries this company earns its money in?",
    steps: [
      { id: "blend", label: "Industry outlook", status: "done", detail: "Median of the available signals (at least 2), compared with the whole economy measured the same way." },
      { id: "weighting", label: "Revenue-weighted tailwind", status: "done", detail: "Share of revenue × industry outlook, with the share of revenue covered shown." },
    ],
  },
  {
    id: "direction",
    title: "4 · Direction",
    question: "Are the new deals heading toward stronger or weaker industries than the existing business?",
    steps: [
      { id: "compare", label: "Deals vs base", status: "done", detail: "Outlook of the last 3 fiscal years' deals vs the tailwind: toward ↗, steady →, or away ↘ (±1 point)." },
    ],
  },
];

export const SOURCES: OutlookSource[] = [
  { id: "deals", label: "Onesheet data pack: disclosed deals with SEDAR quotes (engine/input/deals.json), labelled in engine/input/outlook-labels.csv", status: "fetched" },
  { id: "onesheet-segments", label: "Onesheet API: reported segments and KPIs (/kpis/segments-and-kpis)", url: "https://api.onesheet.pro/v1/kpis/segments-and-kpis", status: "fetched" },
  { id: "onesheet-profile", label: "Onesheet data pack: company profiles (segment and subsidiary descriptions quoted for each industry label)", status: "fetched" },
  { id: "statcan-36-10-0434", label: "Statistics Canada, table 36-10-0434: GDP at basic prices by industry, monthly, chained 2017 dollars, seasonally adjusted", url: "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610043401", status: "fetched" },
  { id: "esdc-cops-2026", label: "ESDC, Canadian Occupational Projection System 2026–2035: GDP by industry", url: "https://open.canada.ca/data/en/dataset/e80851b8-de68-43bd-a85c-c72e1b3a3890", status: "fetched", detail: "Growth computed from the yearly GDP levels; the published growth-rate file is misaligned by one row, so it is not used." },
  { id: "bls-ep-2-11", label: "US Bureau of Labor Statistics, Employment Projections Table 2.11: employment and output by industry, 2025 and projected 2035", url: "https://www.bls.gov/emp/tables/industry-employment-and-output.htm", status: "fetched", detail: "Rows copied on 2026-11-19 (bls.gov refuses scripts); checked against the live table by fingerprint and by recomputing every published rate." },
  { id: "onesheet-estimates", label: "Onesheet API: analyst revenue estimates for listed Canadian peers (/stocks/fundamentals/{symbol}/estimates)", url: "https://api.onesheet.pro/v1/stocks/fundamentals", status: "fetched" },
  { id: "statcan-18-10-0005", label: "Statistics Canada, table 18-10-0005: Consumer Price Index, annual average, Canada, all-items (reality check: organic growth after inflation)", url: "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000501", status: "fetched" },
  { id: "onesheet-transcripts", label: "Onesheet API: latest earnings-call transcripts (/financials/transcripts)", url: "https://api.onesheet.pro/v1/financials/transcripts", status: "fetched", detail: "Each quote is checked word for word against the transcript when the engine runs." },
  { id: "boc-inflation-target", label: "Bank of Canada inflation-control target (2%), used only to put analyst revenue estimates after inflation", url: "https://www.bankofcanada.ca/rates/indicators/key-variables/inflation-control-target/", status: "fetched" },
];

/** The serial-acquirer candidates the engine covers first. Names are labels, not data. */
export const COMPANIES: { ticker: string; name: string }[] = [
  { ticker: "CSU", name: "Constellation Software" },
  { ticker: "TOI", name: "Topicus.com" },
  { ticker: "WSP", name: "WSP Global" },
  { ticker: "TFII", name: "TFI International" },
  { ticker: "ARE", name: "Aecon Group" },
];
