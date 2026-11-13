# Methodology (Max owns this file)

Every number on the site is computed by `engine/metrics.ts` from the spreadsheets in `engine/input/`.
This file says what each metric means and why the thresholds are where they are. Judges will ask.

## Where the numbers come from

| Data | Source | File |
|---|---|---|
| Annual statements FY2021–FY2025, all 20 companies (5 candidates + 15 holdings) | Onesheet API `/financials/statements` | `engine/raw/statements/` → `engine/input/financials.csv` |
| Reported organic growth (CSU, TOI, WSP only) | Onesheet data pack, with the SEDAR quote | `engine/input/organic.csv` |
| Deals (acquisitions, divestitures) for the 5 candidates | Onesheet data pack events, with SEDAR quotes | `engine/input/deals.json` |

`npm run inputs` copies values from the raw files. Nothing is typed by hand. Missing stays empty and becomes `null`.

## Metrics

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

## The test (thresholds in `engine/config.ts`)

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
This wording synthesizes the project brief and the declared metric rationale in `engine/config.ts`.
The page reads published company decisions and model checks directly from the dataset. It shows
supporting checks, failed or missing checks, metric periods and source links for additions and other candidates.
Human decisions remain distinct from model results. No thresholds, scores, company data or portfolio
weights are changed. The former adjustable sliders are removed from the presentation; the pure
sensitivity utilities and their tests remain available for development research.
“Tested” means evaluated against the declared screen, not independently validated or proven to outperform.
