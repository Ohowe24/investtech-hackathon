# Outlook engine (serial acquirers)

**Status:** built (Nov 19). All four layers compute from published sources (`npm run outlook:fetch`, `npm run outlook`). Open: deal labels await Oscar's approval; the narrative (never scored) is not built. Rules and formulas: `engine/methodology.md`, "Outlook engine".
**Owner:** Oscar. **Target:** the final on Nov 24.

## The idea in one line

An acquirer is only as good as the industries it buys into. The Outlook engine shows, for each serial acquirer,
**which industries it owns and buys**, **where those industries are heading according to published forecasts and data**,
and **whether its new deals point toward stronger or weaker industries than the business it already has**.

## What it is NOT

- **Not our own forecast.** We never type or invent an industry growth number. Every number is a published figure
  (government projection, official statistic, analyst estimate) with a source, combined by a formula declared in code.
- **Not a scored check** (yet). It is shown as context on its own tab and does not change Passes / Mixed / Fails.
  It becomes a check only if we can show, on past data, that it would have told good acquirers from bad ones.
- **Not "fastest-growing wins".** The best acquirers buy slow, durable niches on purpose (Constellation's model).
  The score rewards **growing or stable**, and flags **structural decline**. It does not reward hype.

## The four layers

### Layer 1: What industries does each company own and buy?

| Input | Source | Where it lives |
|---|---|---|
| Disclosed acquisitions, each with a SEDAR quote | Onesheet data pack (already in repo) | `engine/input/deals.json` → copied to `data/outlook.json` `deals[]` by `npm run outlook` |
| Revenue by business segment | Onesheet `/kpis/segments-and-kpis/{symbol}` (already used for REITs in `engine/onesheet-fetch.mjs`) | to fetch: `engine/raw/segments/` → `data/outlook.json` `companies[].mix` |

Steps:
1. Label each deal with an industry code (**NAICS 2022**, 4 or 6 digits). Claude may propose the label, but it must
   quote the deal text that justifies it (`naicsQuote`), and a person approves it (`labelStatus: "approved"`).
   Labels live in `engine/input/outlook-labels.csv` (ticker, deal date, counterparty, naics, naics_title, quote, status)
   so they survive a rebuild, like `companies.csv`.
   Columns: `ticker, date, counterparty` (the match key, as in `deals.json`), `naics, naics_title`, `serves` (customer
   markets the text names, e.g. "travel"; text only), `quote` (verbatim), `quote_source` ("SEDAR quote", "Onesheet deal
   summary" or "Onesheet company profile"), `status` (`proposed` → `approved`), `exclude` (why a row stays out of the deal
   mix: duplicate, minority stake, not completed, contained in a longer period; empty = counts), `note`.
   When a deal's own text is silent, the label may rest on the company's profile (e.g. CSU "acquires, manages and builds
   vertical market software businesses"); the note says "Company-level label". A deal with no supporting text gets no code.
2. Fetch segment revenue for the 5 candidates and map each segment to NAICS the same way.
3. Known gap: Constellation and Topicus disclose only material deals, so the deal side shows where the big money goes,
   not every deal. Say so on the page.

### Layer 2: Where is each industry going? (published signals only)

| Signal | Source (free unless noted) | Measures |
|---|---|---|
| Official projection | US BLS Employment Projections (10-year output and employment by NAICS); Canada COPS (ESDC) industry outlook | What government economists project |
| Recent momentum | Statistics Canada table 36-10-0434 (GDP by NAICS, monthly) via the StatCan WDS API; US BEA GDP by industry API | Whether the industry is growing now (3-year yearly rate) |
| Street forecast | Onesheet `/stocks/fundamentals/{symbol}/estimates` for the public companies in that industry (market map: `engine/input/market.csv`, 373 companies, 88 industries) | Analysts' expected revenue growth, median of the group |
| Narrative | News, earnings calls, industry reports, summarized by Claude **with quotes** | The why, shown as text, **never scored** |

Each signal is stored per industry in `data/outlook.json` `industries[].signals[]` with `value`, `unit`, `period`,
`sourceId`. Missing = `null` + `note`, never 0. Onesheet industry labels must be mapped to NAICS once
(`engine/input/outlook-industry-map.csv`) so the street forecast lines up with the official data.

### Layer 3: Company tailwind

`tailwind = Σ (share of revenue in industry i × outlook of industry i)`, using only industries with data, and showing
how much of revenue is covered. The industry outlook is one declared blend of the Layer 2 signals (to decide:
start with the **median of the available signals**, simplest to defend). The formula goes in `engine/metrics.ts`
with tests, and in `engine/methodology.md`.

Classify each industry: **growing** (outlook at least the whole economy's, measured the same way), **stable** (0 up to that),
**declining** (< 0). The signals are after inflation, so the economy is the bar instead of a fixed 2% inflation bar (see methodology.md).

### Layer 4: Direction (the unique part)

Compare the industry outlook of **recent deals** (last 3 fiscal years, weighted by disclosed price where given, else equal)
with the **existing revenue mix**:
- Deals point to stronger industries → **toward tailwinds** ↗
- Deals point to weaker industries → **drifting toward decline** ↘
- Within ±1 point → **steady** →

## Rules (from CLAUDE.md, apply in full)

- Never invent, estimate or hand-type a number. Claude writes labels with quotes and summaries, never numbers.
- Every value carries `sourceIds` pointing at `data/outlook.json` `sources[]`.
- Results are stored, not recomputed live, so the demo shows the same thing every time.
- Missing = `null` + `note`.
- Not investment advice; no backtest; say so on the page.

## Files

| File | What |
|---|---|
| `docs/OUTLOOK_ENGINE.md` | This plan |
| `contract/outlook.ts` | Shape of `data/outlook.json`, shared by engine and site |
| `engine/outlook/build-outlook.ts` | `npm run outlook`: builds `data/outlook.json` (today: plan + deals; next: labels, signals, scores) |
| `engine/outlook/plan.ts` | The four layers and their steps, with status. Update a step's status when it is done |
| `data/outlook.json` | The outlook "database". Regenerated by `npm run outlook`; do not hand-edit |
| `src/components/OutlookEngine.tsx` | The **Outlook engine** tab on `/analyze` (`#outlook`) |
| `src/components/OutlookChip.tsx` | Small tailwind + direction chip on the Ranking rows and company pages of the 5 acquirers; links to `#outlook/<ticker>`. Context only |

## Build order (next sessions)

1. Deal labels: create `engine/input/outlook-labels.csv`, label the 61 deals with quotes, read them in `build-outlook.ts`, show them on the tab.
2. Segment mix: fetch segments for CSU, TOI, WSP, TFII, ARE; label segments; fill `companies[].mix`.
3. Signals: StatCan momentum first (free, Canadian, by NAICS), then BLS projections, then Onesheet street forecast.
4. Tailwind + direction: pure functions in `engine/metrics.ts` with tests; documented in `methodology.md`.
5. Page: industry mix bars, signal table with sources, direction arrow per company.
6. Narrative last, if time.
