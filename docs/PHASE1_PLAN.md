# Phase 1 plan: from one index to an index completer

Goal of the whole project: pick an industry, enter the non-Canadian stocks your index already holds, and the tool
finds Canadian candidates, pulls their data and tests them with that industry's declared checks, the same way the
acquirers tool does today.

**Phase 1 goal:** make that work end to end for **two industries**: serial acquirers (already built) and REITs
(the organizers' second index). Do it live on Vercel, with no Railway and no database. Industries 3 to 5 come in
phase 2, once the industry config shape has proven itself on two very different industries.

Deadline context: tool + video are due **Nov 19, 23:59** (80% of the score). Phase 1 should be done and demo-ready
by about **Nov 17**, leaving two days for the video and polish.

---

## 0. Blocker: the Onesheet API key has expired

Checked Nov 13: every call returns `401 API_KEY_EXPIRED` / `INVALID_API_KEY`.

What we still have offline:
- Annual statements for 20 companies in `engine/raw/statements/`: the 15 acquirer-index holdings + CSU, TOI, WSP, TFII, ARE.
- The data pack (`engine/raw/datapack/`): 5 acquirer candidates + 5 Canadian REITs (CAR.UN, GRT.UN, KMP.UN, NXR.UN, REI.UN).
- **No statements for the 16 REIT-index holdings.**

**Action (today):** ask the organizers (Onesheet) whether finalists can get the key extended or reissued until Nov 19,
and whether a public tool may call it. Fallback if not: Onesheet PRO free tier. Until then, build against the cache
(step 2 makes this cheap).

Everything below is designed so the key only ever lives on the server, and so the tool still runs from cached files
when the API is down.

---

## 1. Industry profiles (refactor, no new behaviour)

Today `engine/config.ts` is one acquirer config. Split it:

```
engine/industries/
  types.ts          IndustryProfile type
  acquirers.ts      today's config, moved as-is
  reits.ts          new (step 4)
  index.ts          registry: id -> profile
```

`IndustryProfile` = what `config` already has (index name, question, checks, metricDefs, map, scoring, sleeve,
weight cap, related groups) **plus**:
- `computeMetrics(rows) -> Record<metricId, MetricValue>`: the industry's formulas, built only from pure functions in
  `engine/metrics.ts` (tested).
- `statementFields`: which statement lines it needs, so the fetcher pulls only those.
- `candidates`: the seed list of Canadian tickers (step 5).

`build.ts` takes a profile instead of importing `config`. `contract/types.ts` gets an `industryId` on `Dataset`.

**Done when:** `npm run engine` produces the same `data/companies.json` for acquirers (apart from `generatedAt` and the new `industryId`). Tests pass. **Status: done Nov 14.**

## 2. Data layer: one fetcher, cache first

New `engine/data/onesheet.ts`, used by both the CLI scripts and the website's server code:
- `getStatements(symbol)`: reads `engine/raw/statements/` first; calls the API only on a miss (server-side key).
- Every call returns raw JSON plus a `Source` entry (endpoint + date), so `sourceIds` keep working.
- On Vercel: wrap API calls in Next's cache (statements change quarterly; a one-day revalidate is plenty). Read
  `node_modules/next/dist/docs/` on caching before writing this. Next 16 differs from what we remember.
- Ticker mapping (`CSU` -> `CSU.TO`) moves out of `fetch-statements.mjs` into this module.

**Done when:** `fetch-statements` and `make-inputs` use it, and the engine runs with the API unreachable.

## 3. Holdings in, analysis out (the dynamic part)

- **Input:** on the start page, choose an industry, then holdings. Default = the organizers' live index for that
  industry (from `data/indexes.json`); the user can edit the list (add/remove tickers, non-Canadian only).
- **Route:** `POST /api/analyze { industryId, holdings[] }` runs the engine in memory (same code as `build.ts`) and
  returns a `Dataset`. Holdings with no data come back `null` + `note`, never dropped silently.
- The current static `data/companies.json` stays as the **default, pre-built view** (fast first load, and the demo
  still works if the API is down).

**Holdings as the benchmark.** The engine already computes metrics for holdings. Use them:
- Each score check can be `fixed` (today's declared threshold) or `vsIndex` (candidate must beat the **median of
  the user's holdings** on that metric). The median comes from data, so it needs no invented threshold.
- Gates (theme fit, debt limit) stay `fixed`.
- The UI shows both lines on charts: declared bar and index median.

**Decision needed (Max + Oscar):** default mode for score checks: `fixed` or `vsIndex`?

**Done when:** editing the acquirer holdings changes the medians and the verdicts, live on a Vercel preview.

## 4. REIT profile

Metrics are limited to what annual statements give us. Anything needing company KPIs (occupancy, same-property NOI,
NAV) is `null` + note in phase 1.

Candidate metrics (each one: formula in `methodology.md`, pure function + test in `metrics.ts`):
- Payout: distributions paid ÷ operating cash flow
- Leverage: net debt ÷ EBITDA, and debt ÷ total assets
- Interest coverage: EBITDA ÷ interest expense
- Operating cash flow per unit, growth per year
- Unit count change (REITs fund growth by issuing units, so this is the dilution check)

Theme-fit gate: the company is a REIT/real estate company (from its profile), not a ratio.

**Thresholds:** none typed from memory. Either cite research the way `reports/Serial acquirer evaluation
variables.md` does, or use `vsIndex` (step 3). Oscar or Max writes the REIT research note before thresholds go in.

**Known data gaps:** the data pack's REIT files are missing FCF and debt for several names (see `docs/DATA_PACK.md`).
REIT holdings need a fresh fetch (blocked on step 0).

**Done when:** REIT industry renders the full workbench (table, map, company pages, recommendation) with real data,
or honest nulls.

## 5. Candidates

Phase 1 uses a **seed list per industry**, written in the profile with a source note for why each ticker is on it:
- Acquirers: CSU, TOI, WSP, TFII, ARE (the organizers' five).
- REITs: CAR.UN, GRT.UN, KMP.UN, NXR.UN, REI.UN (the organizers' five), plus any others we can source.

Automatic discovery (screen all TSX symbols by sector, then run the gate on cheap data first) is **phase 2**. The API
spec's `/stocks/symbols` takes no filter parameters, so we need a working key to see how big and how usable that list
is before designing the screen.

## 6. Website changes

- Industry picker + holdings editor on `StartPage`.
- Every component that hard-codes acquirer words (labels, map zones, deal timeline) reads them from the profile;
  `DealTimeline` hides for industries without deals.
- FAKE banner rule unchanged: shown whenever `isFake` is true, for any industry.

## 7. Ship

- Add `ONESHEET_API_KEY`, `ONESHEET_API_BASE_URL`, `ONESHEET_AUTH_HEADER` to Vercel project env vars (server only,
  no `NEXT_PUBLIC_`).
- `npm test` + `npm run build` before each push to `main`.

---

## Order and owners (suggested)

| # | Step | Can start | Suggested owner |
|---|---|---|---|
| 0 | Ask organizers for key | now | either |
| 1 | Industry profiles refactor | now | Max (engine) |
| 2 | Data layer + cache | after 1 | Max |
| 6a | Site reads labels from profile | now, in parallel with 1 | Oscar (site) |
| 3 | `/api/analyze` + holdings editor + vsIndex | after 1, 2 | Max route, Oscar UI |
| 4 | REIT research note + profile | research now, code after 1 | split |
| 5 | Seed candidate lists | with 4 | either |
| 7 | Vercel env + deploy | after 3 | either |

## Phase 2 (not now)

Industries 3 to 5, picked where Canada has depth (banks, pipelines/midstream, royalty & streaming, insurers, rails).
Automatic TSX candidate discovery. Company-KPI metrics (occupancy, NAV) via `/kpis/segments-and-kpis`. A persistent
cache (Vercel Marketplace database) only if the Next cache proves too short-lived.
