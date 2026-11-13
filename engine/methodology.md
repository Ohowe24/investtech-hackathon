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
| `acqIntensity` | Σ acquisition spending ÷ Σ operating cash flow, all years | Null if a year is missing or Σ OCF ≤ 0. Negative = sold more than it bought |
| `fcfPerShareCagr` | FCF per share = (OCF − capex) ÷ diluted shares; CAGR first to last year | Null if either end ≤ 0 |
| `cashReturn` | Latest-year FCF ÷ average (total debt + total equity) at the start and end of that year | Null without two consecutive years |
| `shareCountChange` | Last diluted shares ÷ first − 1 | Positive = dilution |
| `netDebtToEbitda` | (Total debt − cash) ÷ EBITDA, latest year | Null if EBITDA ≤ 0. Negative = net cash |
| `organicGrowth` | As reported by the company, latest full year (latest quarter if no annual figure) | Null if not reported. Never estimated |
| `revenueCagr` | CAGR of revenue | Shown for context, not scored |

**Why cash return and not ROIC on operating income:** the debt and equity that paid for acquisitions stay in the denominator, so goodwill is counted and overpaying shows up. Cash flow is used because operating income in the statements feed is not defined consistently across years for some companies.

**FCF is computed one way for everyone** (OCF − capex). It will not match company-defined figures such as Constellation's FCFA2S.

**Currencies:** every metric is a ratio or growth rate inside one company, so USD, EUR and CAD reporters compare without conversion.

## The test (declared before results; thresholds in `engine/config.ts`)

Two gates must pass. Five checks are scored.

| Check | Kind | Rule | Why this line |
|---|---|---|---|
| Really an acquirer | gate | `acqIntensity` ≥ 20% | Below this, acquisitions are not what drives the company, so it does not fit the theme |
| Debt under control | gate | `netDebtToEbitda` ≤ 3× | The cap Lifco, a model serial acquirer, sets for itself. Research treats leverage as a limit, not a score |
| Owners gained | score | `fcfPerShareCagr` ≥ 7% | Per-share cash is the best single proxy for value growth (Constellation's 2018 letter). 7% is a plain hurdle for an equity investor |
| Capital earns its keep | score | `cashReturn` ≥ 8% | Cash earned on everything invested, goodwill included, should clear a basic cost of capital |
| No dilution | score | `shareCountChange` ≤ +5% | Stock-funded deals are the best-documented value destroyer in the M&A research |
| Self-funded deals | score | `acqIntensity` ≤ 100% | Deals paid from the business's own cash flow, not outside money |
| Still growing underneath | score | `organicGrowth` ≥ 0 | Health check on businesses already bought. Scored only where reported |

**TODO (Max):** the thresholds are first proposals. Confirm or change each one on purpose, and never to move a result.

**Recommendation** (`tally()` in `metrics.ts`):
- **Fails:** any gate fails, or fewer than half of the scored checks with data pass.
- **Passes:** both gates pass, at least 3 scored checks have data, and at least 75% of those pass.
- **Mixed:** everything else.
- Missing data is never a fail. It lowers the count of checks available, which is shown.

**Verdict:** model `Passes` → add, `Mixed` → watch, `Fails` → reject. A verdict typed in `companies.csv` overrides the model and is marked as a human decision. Holdings keep the verdict `existing`; the model result is shown beside it.

**Weights:** equal split of a 15% sleeve across the additions, capped at 8.2% each (the index's own top-tier weight). Constellation and Topicus share one slot because Constellation controls Topicus. Cash not needed stays as cash.

**Rank:** recommendation, then share of scored checks passed, then number of checks with data, then FCF per share growth.

## The map

- **Across (x):** `acqIntensity`, split at 20% (the "Really an acquirer" gate).
- **Up (y):** `fcfPerShareCagr`, split at 7% (the "Owners gained" check).
- Values outside the chart window are pinned to the edge and labelled "off chart".

## Known limits

- **Statement data is from an aggregator feed**, not read from filings line by line. Spot-check anything on the demo path against the company's own report.
- **Share counts are weighted average diluted shares as reported in the feed.** A change in share structure (for example Topicus) can look like dilution. Check before relying on it.
- **`acquisitions` is net of disposals.** A big sale makes the figure negative for that year (Aecon, FY2023).
- **Bending Spoons has 3 years of data**, the others 5.
- **No backtest:** these checks reflect practitioner consensus and indirect academic evidence (see `reports/`), not proven return predictors.

## What counts as Canadian

Canadian **headquarters or incorporation**, whatever the stock listing. Example: Waste Connections (WCN) is labelled US in the index, but its SEC filings show it is an Ontario corporation headquartered in Woodbridge, Ontario.
