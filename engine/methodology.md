# Methodology (Max owns this file)

Every number on the site is computed by `engine/metrics.ts` from the spreadsheets in `engine/input/`.
This file says what each metric means and why the thresholds are where they are. Judges will ask.

## Inputs (`engine/input/financials.csv`, one row per company per fiscal year)

| Column | Meaning | Notes |
|---|---|---|
| `revenue` | Total revenue | Reporting currency; keep one currency across companies or note it |
| `operating_cash_flow` | Cash from operations | |
| `capex` | Capital expenditure | **Positive** amount spent |
| `acquisitions` | Cash paid for acquisitions, net of cash acquired | **Positive** amount spent. Leave empty if unknown |
| `diluted_shares` | Weighted average diluted shares | Adjust for splits so they don't look like dilution |
| `total_debt` | Total debt at year end | |
| `cash` | Cash and equivalents at year end | |
| `organic_growth_pct` | Organic growth as **reported** by the company, as a decimal | Empty if not disclosed. Never estimate it |
| `source_id` | Which source this row came from | Must exist in `sources.csv` |

## Metrics

| id | Formula | Edge cases |
|---|---|---|
| `acqIntensity` | Σ acquisitions ÷ Σ operating cash flow, over all years | Null if any year is missing, or if Σ OCF ≤ 0 |
| `fcfPerShareCagr` | FCF per share = (OCF − capex) ÷ diluted shares; CAGR from first to last year | Null if either end ≤ 0 (growth undefined) |
| `revenueCagr` | CAGR of revenue, first to last year | Null if either end ≤ 0 |
| `shareCountChange` | last shares ÷ first shares − 1 | Positive means dilution |
| `netDebtToFcf` | (debt − cash) ÷ FCF, latest year | Null if FCF ≤ 0 |
| `organicGrowth` | As reported, latest year | Null if not disclosed |

**Known simplification:** FCF here doesn't subtract acquisition spending. That's deliberate: acquisitions are shown separately as `acqIntensity`.

## The map

- **Across (x):** `acqIntensity`. How much growth is bought.
- **Up (y):** `fcfPerShareCagr`. Whether owners got richer per share.
- **Thresholds:** x = 0.50 and y = 0.05 are **placeholders**. TODO (Max): set them deliberately and write the reason here.

| Zone | Meaning |
|---|---|
| Compounders (top right) | Buys a lot **and** per-share cash flow grows |
| Empire builders (bottom right) | Buys a lot, but per-share cash flow doesn't grow |
| Organic growers (top left) | Grows per share without buying much (may not fit the theme) |
| Stalled (bottom left) | Neither |

## Verdicts (human decisions, in `companies.csv`)

`add` / `reject` / `watch` / `existing`, plus a one-sentence `reason` that a judge can check against the numbers.

## What counts as Canadian

Canadian **headquarters or incorporation**, whatever the stock listing. Example: Waste Connections (WCN) is labelled US in the index, but its SEC filings show it is an Ontario corporation headquartered in Woodbridge, Ontario.
