# Methodology (Max owns this file)

Every number on the site is computed by `engine/metrics.ts` from the spreadsheets in `engine/input/`.
This file says what each metric means and why the thresholds are where they are. Judges will ask.

## Where the numbers come from

| Data | Source | File |
|---|---|---|
| Annual statements FY2021–FY2025, all 20 companies (5 candidates + 15 holdings) | Onesheet API `/financials/statements` | `engine/raw/statements/` → `engine/input/financials.csv` |
| Reported organic growth (CSU, TOI, WSP only) | Onesheet data pack, with the SEDAR quote | `engine/input/organic.csv` |
| Deals (acquisitions, divestitures) for the 5 candidates | Onesheet data pack events, with SEDAR quotes | `engine/input/deals.json` |
| REIT figures (FFO, AFFO, payout, debt ratio, occupancy…) for CAR.UN, GRT.UN, KMP.UN, NXR.UN, REI.UN | Onesheet data pack, each value with its SEDAR quote | `engine/input/facts.csv` |

`npm run engine` writes `data/store.json` (every company's figures) and `data/companies.json` (the default view).

`npm run inputs` copies values from the raw files. Nothing is typed by hand. Missing stays empty and becomes `null`.

## From onboarding to ranking (any holdings)

1. The user picks an industry (a profile in `engine/industries/`) and types the index's holdings, with optional weights.
2. `/analyze` runs `analyze()` (`engine/analyze.ts`) on the server, the same function `npm run engine` uses.
3. **Candidates** = the profile's Canadian universe minus anything already held. A held Canadian company is ranked with the holdings, never as a candidate.
4. Every company is tested on the profile's checks. A company the engine has no data for is **never guessed at**: a holding keeps its row with empty metrics and a note; a candidate is listed under "not tested".
5. Candidates and holdings are ranked separately, each 1 to N, by the same order: has data, result, share of scored checks passed, checks with data, the profile's tie-break metric.
6. **Weights of the index:** typed weights are kept as typed. If every weight is typed, cash is what is left of 100%. Otherwise cash is the number entered (default: the organizers' cash) and the holdings without a weight share the rest equally. When the list matches the organizers' index exactly, their live weights and cash are used.
7. **"Your index median"** on the ranking is the median of the holdings that have a value (`median()` in `metrics.ts`). A reference line, not a check.

## Metrics (serial acquirers)

| id | Formula | Edge cases |
|---|---|---|
| `acqIntensity` | Σ acquisition spending ÷ Σ operating cash flow, all years | Null if a year is missing or Σ OCF ≤ 0. A net seller (Σ acquisitions ≤ 0) is 0%, with a note: it spent no net cash buying businesses |
| `fcfPerShareCagr` | FCF per share = (OCF − capex) ÷ diluted shares; CAGR first to last year | Null if either end ≤ 0 |
| `cashReturn` | Latest-year FCF ÷ average (total debt + total equity) at the start and end of that year | Null without two consecutive years |
| `shareCountChange` | Last diluted shares ÷ first − 1 | Positive = dilution |
| `netDebtToEbitda` | (Total debt − cash), latest year ÷ average EBITDA of the last 3 years | Null without 3 years, or if average EBITDA ≤ 0. Negative = net cash |
| `organicGrowth` | As reported by the company, latest full year (latest quarter if no annual figure) | Null if not reported. Never estimated |
| `revenueCagr` | CAGR of revenue | Shown for context, not scored |

**Why cash return and not ROIC on operating income:** the debt and equity that paid for acquisitions stay in the denominator, so goodwill is counted and overpaying shows up. Cash flow is used because operating income in the statements feed is not defined consistently across years for some companies.

**FCF is computed one way for everyone** (OCF − capex). It will not match company-defined figures such as Constellation's FCFA2S.

**Currencies:** every metric is a ratio or growth rate inside one company, so USD, EUR and CAD reporters compare without conversion.

## The test (thresholds in `engine/industries/acquirers.ts`)

Two gates must pass. Five checks are scored.

| Check | Kind | Rule | Why this line |
|---|---|---|---|
| Acquisitions ≥ 20% of cash flow | gate | `acqIntensity` ≥ 20% | Below this, acquisitions are not what drives the company, so it does not fit the theme |
| Net debt ≤ 3× EBITDA | gate | `netDebtToEbitda` ≤ 3× | The cap Lifco, a model serial acquirer, sets for itself. Research treats leverage as a limit, not a score. Measured against 3-year average EBITDA so a cyclical company at a good point in its cycle (TFI) is not flattered |
| Free cash flow per share ≥ 7%/yr | score | `fcfPerShareCagr` ≥ 7% | Per-share cash is the best single proxy for value growth (Constellation's 2018 letter). 7% is a plain hurdle for an equity investor |
| Return on capital ≥ 8% | score | `cashReturn` ≥ 8% | Cash earned on everything invested, goodwill included, should clear a basic cost of capital |
| Share count up ≤ 5% | score | `shareCountChange` ≤ +5% | Stock-funded deals are the best-documented value destroyer in the M&A research |
| Acquisitions ≤ 100% of cash flow | score | `acqIntensity` ≤ 100% | Deals paid from the business's own cash flow, not outside money |

**Organic growth is shown, not scored.** Only CSU, TOI and WSP report it in our data, so scoring it gave those three an extra check the holdings could not take.

**Changes after first results (Nov 12):** the leverage test moved from latest-year EBITDA to 3-year average EBITDA, and organic growth stopped being scored. A net seller's acquisition intensity is 0% rather than a negative ratio.

**Recommendation** (`tally()` in `metrics.ts`):
- **Fails:** any gate fails, or fewer than half of the scored checks with data pass.
- **Passes:** both gates pass, at least 3 scored checks have data, and at least 75% of those pass.
- **Mixed:** everything else.
- Missing data is never a fail. It lowers the count of checks available, which is shown.

**Verdict:** model `Passes` → add, `Mixed` → watch, `Fails` → reject. A verdict typed in `companies.csv` overrides the model and is marked as a human decision. Holdings keep the verdict `existing`; the model result is shown beside it.

**Weights:** equal split of a 15% sleeve across the additions, capped at 8.2% each (the index's own top-tier weight). Constellation and Topicus share one slot because Constellation controls Topicus. Cash not needed stays as cash.

**Rank:** recommendation, then share of scored checks passed, then number of checks with data, then FCF per share growth.

## REITs (thresholds in `engine/industries/reits.ts`, research in `reports/REIT evaluation variables.md`)

REITs are judged on **company-reported** figures, not recomputed statements: FFO and AFFO are non-GAAP measures each REIT defines (REALPAC / Nareit). The engine only picks and compares them.

**How a reported figure is picked (`engine/facts.ts`):**
- A field counts only if its **filing quote names the figure** (and does not name a lookalike). The same field id holds different figures at different REITs: CAPREIT's `affo_ratio` is its ACFO payout, Granite's is capex per square foot, RioCan's recent `debt_ratio` is its floating-rate share. Those are excluded by the quote filters.
- Values outside a plausible range are skipped (e.g. Granite's `occupancy` field holds a unit count).
- Flow figures (payout, same-property NOI): the latest fiscal year reported, the longest period within it. A stale full year never beats a fresh nine months.
- Balance-sheet figures (debt ratio, debt ÷ EBITDA, occupancy): the latest date.
- Growth (FFO per unit): like for like only, one year apart (FY vs FY, 9M vs 9M, Q3 vs Q3), full years first.

| Metric | Formula | Check |
|---|---|---|
| `affoPayout` | REIT's own AFFO payout ratio; if none, distributions per unit ÷ AFFO per unit for the same period | **Must:** ≤ 100%. Score: ≤ 90% |
| `debtRatio` | Debt ÷ gross book value (or total assets, or the covenant "total indebtedness" ratio), as reported | **Must:** ≤ 60% (strictest declaration-of-trust cap found: RioCan) |
| `debtToEbitda` | Debt ÷ adjusted EBITDA, as reported. Not computed: debt and EBITDA are dated differently in the data | Score: ≤ 9× (RioCan's target 8–9×; DBRS ratings) |
| `samePropertyNoi` | Company-wide same-property NOI growth, as reported. Segment-only figures are not used | Score: ≥ 2% (Bank of Canada inflation target) |
| `ffoPerUnitGrowth` | Latest FFO per unit ÷ same period a year earlier − 1 | Score: ≥ 0% |
| `occupancy` | As reported, latest date. Definitions differ by REIT | Score: ≥ 93.8% (Nareit, US REITs, Q2 2026) |
| `affoPerUnitGrowth` | Like `ffoPerUnitGrowth`, on AFFO per unit | Not scored |

Result: same tally as acquirers, needing 3 scored checks with data to pass. Weights: 15% of the index split equally, at most 3.42% each (the REIT index's most common weight).

**REIT limits:** only the 5 data-pack REITs have data; the other Canadian REITs and every REIT-index holding show as "no data" until the Onesheet API is back. Granite reports no debt ratio, so it cannot pass the debt gate. RioCan's latest debt ratio in the data is from December 2024.

## The map

- **Across (x):** `acqIntensity`, split at 20% (the "Acquisitions ≥ 20% of cash flow" gate).
- **Up (y):** `fcfPerShareCagr`, split at 7% (the "Free cash flow per share ≥ 7%/yr" check).
- Quadrants: right = acquirer, left = light acquirer; top = strong per-share growth, bottom = weak.
- Values outside the chart window are pinned to the edge and labelled "off chart".

## Known limits

- **Statement data is from an aggregator feed**, not read from filings line by line. Spot-check anything on the demo path against the company's own report.
- **Share counts are weighted average diluted shares as reported in the feed.** A change in share structure (for example Topicus) can look like dilution. Check before relying on it.
- **`acquisitions` is net of disposals.** A big sale makes the figure negative for that year (Aecon FY2023, TFI FY2022), which lowers that company's acquisition intensity. Aecon is a net seller over FY2021–FY2025, so its intensity is 0%: the ratio would be −300%, a size that only reflects how small its operating cash flow was.
- **Bending Spoons has 3 years of data**, the others 5.
- **No backtest:** these checks reflect practitioner consensus and indirect academic evidence (see `reports/`), not proven return predictors.

## What counts as Canadian

Canadian **headquarters or incorporation**, whatever the stock listing. Example: Waste Connections (WCN) is labelled US in the index, but its SEC filings show it is an Ontario corporation headquartered in Woodbridge, Ontario.

## Yearly detail rows (company page charts)

Each fiscal year in `history` also carries, all `null` when an input is missing:

- `netDebt` = debt − cash. `netDebtToEbitda` = net debt ÷ that year's EBITDA (null if EBITDA ≤ 0).
- `revenueGrowth` = revenue ÷ prior year's revenue − 1 (null without a consecutive prior year).
- `ebitdaMargin`, `ocfMargin`, `fcfMargin`, `capexIntensity` = EBITDA, operating cash flow, free cash flow, capex ÷ revenue (null if revenue ≤ 0).
- `fcfConversion` = free cash flow ÷ EBITDA. `acqToOcf` = net acquisitions ÷ operating cash flow, with the same rule as the period figure (a net-seller year is 0). `goodwillToEquity` = goodwill ÷ equity. Each null if the base ≤ 0.
- `revenuePerShare` = revenue ÷ diluted shares.

`totals` are strict sums over every year in `history` (null if any year is missing); `fcfAfterAcquisitions` = summed free cash flow − summed net acquisitions; `revenueAdded` and `goodwillAdded` = last year − first year.
## Tested thesis (presentation)

The `#test` tab presents the existing investment thesis: select Canadian acquirers that turn growth
into cash flow per share, with disciplined debt and adequate cash returns on invested capital.
This wording synthesizes the project brief and the declared metric rationale in `engine/industries/acquirers.ts`.
The page reads published company decisions and model checks directly from the dataset. It shows
supporting checks, failed or missing checks, metric periods and source links for additions and other candidates.
Human decisions remain distinct from model results. No thresholds, scores, company data or portfolio
weights are changed. The former adjustable sliders are removed from the presentation; the pure
sensitivity utilities and their tests remain available for development research.
“Tested” means evaluated against the declared screen, not independently validated or proven to outperform.
