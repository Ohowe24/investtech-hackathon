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
3. **Candidates** = the profile's Canadian universe minus anything already held. A held Canadian company is ranked with the holdings, never as a candidate. **Serial acquirers start with the 5 candidates the organizers provided** (CSU, TOI, WSP, TFII, ARE: `provided: true` in `acquirers.ts`). "Generate more candidates" on the Companies page re-runs with `more=1` in the address, which tests the rest of the researched universe too (each entry with its source). The provided ones are then marked.
4. Every company is tested on the profile's checks. A company the engine has no data for is **never guessed at**: a holding keeps its row with empty metrics and a note; a candidate is listed under "not tested".
5. Candidates and holdings are ranked separately, each 1 to N, by the same order: has data, result, quality score out of 100 (industries that declare weights, see "Quality score"), share of scored checks passed, checks with data, the profile's tie-break metric.
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


## Quality score (serial acquirers and oil & gas producers)

The pass / fail checks answer "does it clear the bar?". They count every check the same and cannot say how far above or below the bar a company is. The **quality score** adds that: each variable is graded 0–1, multiplied by its weight, and the weights add up to 100.

- **Formula** (`weightedScore()` in `metrics.ts`): score = Σ weight × grade ÷ Σ weight of the variables with data, × 100, rounded.
- **Missing data:** a variable with no data drops out and the other weights are rescaled. If the variables with data carry less than 60% of the weight, there is no score (shown as "—" with a note). Missing is never graded as 0.
- **Verdicts do not change.** Add / Watch / Reject still come from the checks. Within each verdict, companies are ranked by score.
- Weights, scales and grades for every company are in `data/companies.json` (`model.score.parts`) and on the ranking (▾ on any row).

How well each variable measures quality was judged on three things: (1) the research behind it (the `facts` on each metric, and `research_notes/`), (2) whether it measures the company or something outside it (prices, one-off events), and (3) how it behaves on our own data: how much it overlaps with the other variables (rank correlation, Spearman ρ) and whether it separates companies at all. The data checks below were run on the engine's own output (`analyze()` with the organizers' acquirer index; all 32 Canadian E&Ps).

### Serial acquirers: weights (`engine/industries/acquirers.ts`)

Grade = a straight line between two declared points (`rampGrade()`). **Full points need an exceptional result, not a good one**, so no real company gets near 100: the best score is CSU's 82. The pass lines of the checks earn a quarter to two thirds of a variable's points: clearing the bar is the floor of quality, not the top. (A first version gave full points at good levels; CSU then scored 100, which said nothing about how much better it could be.)

| Variable | Weight | No points at | All points at | Assessment |
|---|---|---|---|---|
| FCF per share growth | **30** | −5%/yr | 25%/yr | The best single measure of what an acquirer delivers to owners: it nets out deals paid in shares and interest. Leonard's own choice of "one measure". Weakness: two end points only (FY2021, FY2025), so one odd year moves it; capped at 25% so BSP's +113% (three years since IPO) cannot dominate. The 7% check line earns 40% of the points. |
| Return on capital (FCF ÷ debt + equity) | **25** | 0% | 30% | Strongest evidence for acquirers: return on capital with goodwill included separates winners from losers (Aktagon: 59 of 187 clear 12%). Single year, so it moves with one year's cash flow. 8% (the check) earns about a quarter; Aktagon's 12% earns 40%; only TOI (31%) gets full points. |
| Share count change | **20** | +20% | −10% (buybacks) | The most replicated finding in merger research (paying in stock destroys value: Loughran & Vijh; Fuller, Netter & Stegemoller). Nearly independent of the other variables (ρ ≤ 0.21 with all but acquisition spend), so it adds information. Caveat: TOI's +42% is mostly a share-structure change in FY2022 (91.5M → 129.8M shares, flat since), not deal dilution; the data is kept as reported. |
| Net debt ÷ 3-yr EBITDA | **15** | 4.0× | 0× (no net debt) | Measures risk, not skill. No large study sets an optimal level, so it weighs less, and the 3× must-pass check already removes the worst. Overlaps with return on capital (ρ = −0.63: high-return acquirers carry less debt). 3× earns a quarter of the points. |
| Acquisitions ÷ operating cash flow (self-funding) | **10** | 200% | 50% or less | Above 100%, outside money paid for the deals; that is the "big bets" pattern Bain and NBER w10200 link to losses. Weak on its own (ρ with the total score −0.17). The ≥ 20% part is a fit test (is it an acquirer at all?), not quality, so it stays a must-pass check and earns no points. |
| Revenue growth | 0 | | | Size alone. Fast asset growth predicts *lower* returns (Cooper, Gulen & Schill); Aktagon finds revenue growth does not separate winners. Shown, not scored. |
| Organic growth | 0 | | | A good measure, but only CSU, TOI and WSP report it. Weighting it would score three companies on a variable the other 31 lack. Shown, not scored. |

**How much the weights matter:** ranking by equal weights instead gives almost the same order (ρ = 0.94 across 34 companies). The result does not hinge on the exact weights; the variables chosen do the work.

**What the score shows that the checks did not:** TFII (68) and CCL.B (65) score like good adds but are rejected by must-pass checks (acquisitions only 18% of cash flow; net debt 3.2×). The score says "high quality"; the gate says "not this index" or "too much debt". Among the adds, TOI (61) sits well below CSU (82), because of the share-count jump; ENGH (56) passes the checks but earns almost nothing for FCF per share growth.

### Oil & gas producers: what was wrong with the generic test

E&P runs through "choose your own industry" (`custom.ts`), whose generic measures are single-year margins and growth from three years back. For producers that mostly measures the oil and gas price:

- **22 of the 32 producers had their highest revenue in FY2022.** The median company's FY2022 revenue was 1.33× its FY2025 revenue; operating cash flow 1.38×. Three-year growth (FY2022 → FY2025) starts at the peak, so 25 of 31 show falling revenue per share.
- **Single-year FCF margin is unstable:** the rank of companies on FCF margin in FY2022 and FY2025 correlates at only ρ = 0.21 (FY2024 vs FY2025: 0.58). One year says more about the price that year than about the company.
- **Small companies with acquisitions look like stars:** TNZ's revenue per share grew 97% a year from FY2022, when its revenue was C$34M, and it passed as an add; over five years its free cash flow margin is 2% and its return on capital negative.
- **One-year figures mislead after a restructuring:** MER (Meren Energy) reports no revenue for FY2021–FY2024 and consolidated in FY2025, so its single-year 59% margin and 41% return looked best in class.
- **The must-pass check (operating cash flow positive) passes all 32**, so it separates no one. It stays as a floor.

So producers get their own measures (`engine/industries/oilgas.ts`), still compared with the peer median:

| Variable | Weight | Assessment |
|---|---|---|
| Return on capital, mean of 4 years (FCF ÷ avg debt + equity) | **30** | The best available test of whether the money spent replacing reserves earns its keep, averaged over the peak and the years after. Counts capital tied up as well as margin. |
| Net debt ÷ 3-yr average EBITDA | **30** | Debt is what turns a price fall into a crisis for a producer. Independent of the profit measures (ρ ≈ 0 with both), so it adds the most new information. Averaging EBITDA stops a peak year from making the debt look small. |
| Free cash flow margin, 5 years combined | **15** | Low-cost producers keep a margin when prices fall. But it ranks companies almost exactly like return on capital (ρ = 0.89), so the two share 45 points, not 50. Empty when a year has no sales (MER). |
| Share count growth (3 yrs) | **15** | Capital discipline: E&Ps that fund themselves with new shares dilute owners; buybacks mean surplus cash goes back. Independent of the profit and debt measures (ρ ≤ 0.09). |
| Operating cash flow per share growth (3 yrs) | **5** | Mostly the price (see above), and uncorrelated with every quality measure (ρ ≈ 0). Kept small because comparing with peers removes part of the common price effect. |
| Revenue per share growth (3 yrs) | **5** | Same, and also inflated by acquisitions from a small base (TNZ, CDR, IPO). |
| Operating cash flow positive (must pass) | 0 | A floor, not a ranking variable: every producer passes. |

Grades are by **position among the companies tested** (`peerGrade()`): the best gets all the variable's points, the median half, the worst none. That matches the checks (which compare with the median) and needs no typed level for an industry whose normal margins and leverage move with prices.

**How much the weights matter:** equal weights would give ρ = 0.82 with the chosen ranking, so here the weights do matter: equal weights would let the two price-driven growth measures count as much as leverage.

**Effect:** the generic test made 8 producers "add" (ATH, HWX, CNQ, TNZ, FEC, PSK, PXT, MER). The producer test makes 5: PXT 85, ATH 79, PSK 79, HWX 76, CNQ 75. TNZ (27) and MER (26) fall to reject, FEC (63) to watch.

### What the data cannot measure (and the score therefore leaves out)

- **E&P:** reserve life, finding and development cost, recycle ratio, production per share and breakeven price are the industry's own quality measures. None is in the statements data. Return on capital and the five-year margin are the closest proxies.
- **Acquirers:** returns on each acquisition, and organic growth for 31 of 34 companies.
- **No test against later returns:** the engine has no per-company price history, so whether a higher score predicted a better stock return is not tested here. Onesheet's price-history endpoint would allow it.

## Outlook engine (serial acquirers, context only)

Shown on the **Outlook engine** tab (`/analyze#outlook`). It answers one question per company: *are its industries,
and the industries its recent deals are in, growing or shrinking, according to published sources?* It changes no
Passes / Mixed / Fails and no weight. Plan: `docs/OUTLOOK_ENGINE.md`. Build: `npm run outlook:fetch` then `npm run outlook`.

### Inputs

| Data | Source | File |
|---|---|---|
| Industry code per deal, with the verbatim text behind it | Claude-proposed from the deal's SEDAR quote, Onesheet deal summary or Onesheet company profile; approved by a person | `engine/input/outlook-labels.csv` |
| Revenue by segment, latest fiscal year where every segment is reported (FY2025) | Onesheet API `/kpis/segments-and-kpis` | `engine/raw/segments/` (fetched) + `engine/input/outlook-segments.csv` (industry per segment, with quote) |
| Recent momentum, Canada | Statistics Canada table 36-10-0434: GDP at basic prices by industry, monthly, chained 2017 dollars, seasonally adjusted at annual rates (Web Data Service) | `engine/raw/outlook/statcan-36100434-*.json` |
| Official projection, Canada | ESDC Canadian Occupational Projection System 2026–2035, real GDP by industry, yearly levels (open.canada.ca) | `engine/raw/outlook/cops-gdp-2026-2035.csv` |
| Official projection, US | BLS Employment Projections Table 2.11, real output by industry, 2025 and projected 2035 | `engine/input/outlook-bls-ep.csv` |
| Street forecast | Onesheet API analyst revenue estimates for listed Canadian peers named in the industry map | `engine/raw/outlook/estimates/` |
| Which published series stands for each industry code, and which peers | Declared once, with the reason | `engine/input/outlook-industry-map.csv` |
| Narrative: what management says about its markets | Onesheet API latest earnings-call transcripts; quotes chosen by Claude with a one-line summary each. The engine refuses to build if a quote is not word for word in the transcript, and reads the speaker from the transcript. Never scored. | `engine/raw/outlook/transcripts/` + `engine/input/outlook-narrative.csv` |

Two data issues found and handled:
- **COPS growth-rate file is misaligned.** In `industrial_aagr_tcam_par_secteur_2026_2035.csv`, each growth rate sits on the
  row above its industry (e.g. the 5.0% shown for couriers is warehousing's), and the NAICS column is shifted too. We do
  not use it. We compute growth from the same release's GDP-levels file, whose rows are consistent.
- **bls.gov refuses scripts.** The 27 rows we use were copied from Table 2.11 on 2026-11-19. The copy was checked against the
  live table by SHA-256 fingerprint (`74f50372…5486`), and a test recomputes every published 10-year rate from the copied
  levels (`engine/outlook.test.ts`).
- **StatCan answers out of order.** The Web Data Service does not return series in the order requested. The fetcher matches
  each series by the industry in its coordinate, and the build refuses to run if any stored series is filed under the wrong
  industry. (The first version matched by position; every momentum figure published before this fix was attached to the
  wrong industry and has been replaced.)

### Formulas (`engine/metrics.ts`, tests in `engine/outlook.test.ts`)

| Step | Function | Rule |
|---|---|---|
| Momentum | `trailingMomentum(monthly, 3)` | Average of the latest 12 months vs the 12 months ending 3 years earlier, as a yearly rate. Averages smooth single-month noise. |
| Projections | `cagr(level2025, level2035, 10)` | Yearly rate between the published 2025 and 2035 levels (COPS GDP, BLS output). |
| Street | `median` of each peer's `cagr(estimate FY2026, estimate FY2028, 2)`, then `realGrowth(·, 2%)` | Needs at least 2 peers with estimates. Analysts' revenue is in dollars of the day, so the Bank of Canada 2% inflation target is removed exactly: (1 + g) / 1.02 − 1. The official figures are already after inflation. |
| Industry outlook | `industryOutlook(signals, 2)` | Median of the signals that exist; at least 2. The median keeps one odd source (a small peer group, a cyclical trough) from deciding. |
| Trend | `trendOf(outlook, economy)` | **Growing:** at least the whole economy's outlook, measured the same way (median of StatCan all industries, COPS all industries, BLS all industries; the value is shown on the page). **Stable:** 0 up to that. **Declining:** below 0. The bar is the economy rather than a fixed 2%, because the signals are after inflation; a fixed 2% inflation bar only fits figures that include inflation. |
| Tailwind | `weightedOutlook(revenue share × industry outlook, 50%)` | Revenue-weighted outlook of the industries the company earns in. Shares come from the reported segments (`shares`). Null if less than half the revenue has an outlook; coverage is shown. |
| Red flag | — | Share of revenue in declining industries. |
| Deal outlook | `weightedOutlook(equal weights, 50%)` | Recent deals = fiscal 2024–2026 (the latest fiscal year with a deal and the two before), not excluded. Each counts once: most prices are undisclosed, and those disclosed are in three currencies. Null if fewer than half have an industry with an outlook. |
| Direction | `directionOf(deal outlook, tailwind, 1 point)` | ↗ toward stronger industries if the deals' outlook is more than 1 point a year above the tailwind, ↘ away if more than 1 point below, → steady otherwise. One point is below what the sources can tell apart. |

### Two views: "What they do" and "Who they sell to"

The same tailwind and direction are computed twice.

- **What they do**: each segment and deal by its own industry (NAICS of the business).
- **Who they sell to**: by the market its clients are in. Software and engineering firms sell into many markets, so their own
  industry code says little about demand.
  - Segments: `market` in `outlook-segments.csv`. WSP's sectors map to heavy and civil construction (Transport & Infrastructure),
    non-residential buildings (Property & Buildings) and electric power (Power & Energy); Earth & Environment has no single
    client market and is left out (coverage shown). Constellation and Topicus do not report revenue by vertical: their base is
    **the whole economy** (declared, not measured). For TFI and Aecon what they do is what their clients buy, so both views are
    the same.
  - Deals: `markets` in `outlook-labels.csv`, one code per client market the deal text names, with the reason in `markets_note`.
    `marketWeights` splits a deal equally across the markets it names, so each deal still counts once; a market named but not
    placeable (`?`) keeps its share with no outlook and lowers coverage.
  - Client markets get the same four published signals as industries (`outlook-industry-map.csv`).

### Reality check (`engine/outlook/reality.ts`, shown on the tab)

Two tests of whether the signals mean anything. Results are computed on every build and shown with their sample sizes;
none is typed here.

1. **Does recent momentum predict the next years?** Statistics Canada monthly real GDP since 1997 for every detailed
   industry in table 36-10-0434 (the members with no sub-industries) and for all industries. One test per August from the
   first with 4 years of history to the last with 3 years ahead. In each test, every industry's past growth
   (`trailingMomentum`, the same formula the outlook uses) is set against its next 3 years (same formula, 3 years later).
   Reported: the rank correlation across industries per test (`spearman`) and its median; and, pooled over all tests,
   how often industries that shrank kept growing slower than the economy, and how often industries ahead of the economy
   stayed ahead, each against the base rate for all industries (`persistence`). Words for sizes come from
   `correlationStrength` (under 0.1 almost none, under 0.3 weak, under 0.5 moderate, else strong).
2. **Does industry growth show up in the companies?** For the companies that report organic growth every year
   (`engine/input/outlook-organic.csv`: CSU from 2020, FX-adjusted; TOI; WSP), organic growth is put after inflation with
   Statistics Canada's annual CPI (table 18-10-0005, Canada, all-items; `realGrowth`) and set against the same calendar
   year's growth in its industry's average real GDP (`yearlyMeans`, `pctChange`). Reported: the correlation per company
   (`pearson`) and over all company-years with each company's own average removed (`demean`), so a company that always
   grows fast cannot create a link on its own.

Limits: few years per company; organic growth is global while the industry series are Canadian; TFI and Aecon do not
report organic growth. Not tested: share prices (five companies are too few) and past editions of the projections and
analyst forecasts (not in the data).

### What it does not do

- **No stock-price backtest.** The reality check tests the signals, not whether they would have picked better stocks, so it is not a check.
- It rewards growing and stable industries and flags declining ones; it does not reward the fastest growing.
- Industry codes describe what a business does. Software and engineering firms serve many client markets; those are
  shown as text ("serves", "clients") and not scored.
- Signals describe Canada and the US; Topicus earns in Europe and WSP partly abroad (the page says so per company).
- Constellation and Topicus disclose only material deals. Analysts' revenue estimates include acquisitions.
