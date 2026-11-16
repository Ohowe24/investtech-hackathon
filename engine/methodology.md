# Methodology (Max owns this file)

Every number on the site is computed by `engine/metrics.ts` from the spreadsheets in `engine/input/`.
This file says what each metric means and why the thresholds are where they are. Judges will ask.

## Where the numbers come from

| Data | Source | File |
|---|---|---|
| Annual statements (5 years), all 20 acquirer-index companies and all 35 REITs (19 Canadian candidates + 16 REIT-index holdings) | Onesheet API `/financials/statements` | `engine/raw/statements/` → `engine/input/financials.csv` |
| Canadian market map: every company in the TSX composite (ZCN) and small-cap (XCS) index ETFs, with its profile (name, sector, industry, country, market cap), plus statements for every Canadian one | Onesheet API `/stocks/etf`, `/stocks/fundamentals/{symbol}/profile`, `/financials/statements` (`npm run discover`) | `engine/raw/market/` → `engine/input/market.csv`, `financials.csv` |
| Distributions per unit, all 35 REITs | Onesheet API `/stocks/dividends` | `engine/raw/dividends/` → `engine/input/distributions.csv` |
| Company-wide occupancy for REITs outside the data pack (EGP, INVH, KIM, MAA, PLD, PSA, REXR) | Onesheet API `/kpis/segments-and-kpis` | `engine/raw/kpis/` → `engine/input/facts.csv` (`kpi_*` metrics) |
| Reported organic growth (CSU, TOI, WSP only) | Onesheet data pack, with the SEDAR quote | `engine/input/organic.csv` |
| Deals (acquisitions, divestitures) for the 5 acquirer candidates and the 5 data-pack REITs | Onesheet data pack events, with SEDAR quotes | `engine/input/deals.json` |
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

REITs are ranked **only on figures Onesheet has for every REIT**: annual statements (total debt, total assets, operating cash flow, revenue, diluted units) and distributions per unit. Company-reported KPIs (FFO, AFFO, same-property NOI, occupancy) exist for the 5 data-pack REITs and a few US REITs only, so ranking on them left most of the table empty. They are still shown on the company page as "Reported figures over time", never ranked.

Statement fields left out on purpose: EBITDA, operating income and net income (Canadian REITs report under IFRS, where property revaluations flow through them: Morguard's operating income goes negative in 2023, Allied's debt ÷ operating EBITDA jumps from 15× to 26×), interest expense (empty for Killam in four of five years), and dividends paid (empty for every REIT; distributions come from the distribution history instead).

| Metric | Formula | Check |
|---|---|---|
| `cashPayout` | Distributions per unit recorded in the latest fiscal year (`distributionsInYear`) ÷ operating cash flow per unit (`cashPayoutRatio`). Same currency only | **Must:** ≤ 100%. Score: ≤ 90% |
| `debtToAssets` | Total debt ÷ total assets, latest annual balance sheet | **Must:** ≤ 60% (RioCan's declaration-of-trust cap, the strictest found) |
| `cashFlowPerUnitGrowth` | Operating cash flow per unit, latest fiscal year vs three years earlier, yearly rate (`cagr`) | Score: ≥ 2% (Bank of Canada inflation target) |
| `distributionGrowth` | Distributions per unit, latest fiscal year vs three years earlier, yearly rate | Score: ≥ 2% (keeps pace with inflation) |
| `revenuePerUnitGrowth` | Revenue per unit, latest fiscal year vs three years earlier, yearly rate | Score: ≥ 2% (Bank of Canada inflation target) |

Result: stricter than acquirers on purpose. A REIT **passes** only if both must-pass checks pass and **every** scored check passes, with data on all four. One or two scored misses make it mixed (watch); a must-pass miss, or fewer than half the scored checks passing, makes it fail. In short: covered payout, moderate debt, and cash flow, distributions and rent per unit all growing faster than inflation. Ties are broken on cash flow per unit growth. Weights: 15% of the index split equally among the REITs added, at most 3.42% each (the REIT index's most common weight).

**How these differ from what REITs report:** operating cash flow is before maintenance capex, so the cash payout reads lower than a reported AFFO payout (Killam: 61% here, 68% reported; CAPREIT 43% vs 70%, since some Canadian REITs report interest paid outside operating cash flow). Canadian REITs carry properties at fair value and US REITs at depreciated cost, so debt ÷ assets reads lower in Canada for the same debt. Nexus's operating cash flow is low relative to its reported AFFO, so its cash payout is 142% against a reported 98%.

**REIT limits:** per-unit figures are used only for CAD and USD reporters: IRSA (ARS) and Lead Real Estate (JPY) have unit-count breaks and zero placeholders in their statements, so they are judged on debt ÷ assets (and IRSA on distribution growth) only. Slate Grocery's distributions are listed in CAD and its statements are in USD, so it has no cash payout.

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

## Choose your own industry (`engine/industries/custom.ts`)

For any industry in the Canadian market map, the engine finds the candidates itself and judges every company against its peers, so no industry-specific threshold is typed.

**Candidates:** every company in the market map whose Onesheet profile names the chosen industry and Canada as its country, and that has annual statements. The dropdown offers an industry when it has at least 3 such companies. Holdings the cache does not have are fetched live from Onesheet when the analysis runs (`src/lib/server/live.ts`, same conversion as `npm run inputs`); any it cannot find stay in the index as "no data".

**Peer lines:** each scored check's threshold is the **median of every company tested in that run** (the candidates plus your holdings with statements; `median` in `metrics.ts`), used only when at least 3 companies have the figure. So adding holdings moves the lines.

| Metric | Formula | Check |
|---|---|---|
| `cashFromOperations` | Operating cash flow ÷ revenue, last three fiscal years summed | **Must:** > 0% (the business makes cash, in any industry) |
| `revenuePerShareGrowth` | Revenue per diluted share, latest FY vs three years earlier, yearly rate | Score: ≥ peer median |
| `cashFlowPerShareGrowth` | Operating cash flow per diluted share, same | Score: ≥ peer median |
| `fcfMargin` | (Operating cash flow − capex) ÷ revenue, latest FY | Score: ≥ peer median |
| `cashReturnOnCapital` | Free cash flow ÷ average (debt + equity) over the latest FY | Score: ≥ peer median |
| `netDebtToEbitda` | (Debt − cash) ÷ EBITDA, latest FY (null if EBITDA ≤ 0) | Score: ≤ peer median |
| `shareCountGrowth` | Diluted shares, latest FY vs three years earlier, yearly rate | Score: ≤ peer median |

Result: passes if the must-pass check passes and at least 75% of the scored checks with data pass, with data on at least 4 (in practice 5 of 6: better than the median company on nearly everything). Weights: 15% of the index split equally among additions, at most 5% each.

**Not offered:** banks, insurers, mortgage and credit lenders. Debt is their raw material, and EBITDA, capital spending and free cash flow do not describe them.

**Limits:** a relative test always passes the best of the group, even in a weak industry, and it needs several companies to mean anything. EBITDA and margins also say little for IFRS real-estate companies, whose EBITDA includes revaluations: the researched REIT model is the one to use for REITs. Onesheet's industry labels decide who counts as a peer.

