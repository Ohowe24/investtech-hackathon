# Seven checks decide whether a Canadian REIT belongs in a REIT index

The evidence supports a short scorecard that tests three things: whether the distribution is covered, whether the balance sheet can survive a downturn, and whether the property income is growing. **Two checks are gates: AFFO payout at or below 100% and debt at or below 60% of gross book value (or of assets). Five are scores: AFFO payout at or below 90%, debt to EBITDA at or below 9.0x, same-property NOI growth of at least 2.0%, FFO per unit not falling year over year, and occupancy of at least 93.8%.** The gates come from the REITs' own constating documents and lender covenants, which are the hardest limits in the sector: RioCan's Declaration of Trust caps total indebtedness at 60% of aggregate assets, and CAPREIT's credit facility caps its FFO payout at 100%. The score lines come from rating-agency practice (Morningstar DBRS), the Bank of Canada's inflation target and Nareit's industry tracker. The academic evidence is strongest on leverage: REITs with more debt and shorter maturities lost more in 2007-09, and the losses did not fully reverse. Payout, growth and occupancy rest on industry definitions and practitioner consensus, not on tested predictors. All seven checks can be computed from the Onesheet fields, but coverage across the five REITs is uneven. The data pack also has several mislabelled fields, so the engine must read the source quote before it trusts a field name.

Scope: Canadian REITs listed on the TSX. Research date: 2026-11-14. Data periods with a report date after 2026-11-12 are ignored. All figures are quoted from the cited sources; nothing here is estimated.

## Definitions the checks rely on

- **FFO (funds from operations).** Nareit defines FFO as GAAP net income excluding gains or losses on sales of real estate and real-estate depreciation and amortization; its *FFO White Paper – 2018 Restatement* consolidated earlier guidance without changing the definition ([Nareit white paper](https://www.reit.com/sites/default/files/2018-FFO-white-paper-(11-27-18).pdf); definition as quoted in [First Industrial 10-K 2018](https://www.sec.gov/Archives/edgar/data/921825/000092182519000003/fr-20181231x10k.htm)). In Canada, REALPAC's *FFO & AFFO for IFRS (January 2022)* calls FFO "the industry-wide standard measure of a real estate entity's operating performance" ([REALPAC](https://realpac.ca/product/realpac-funds-from-operations-ffo-adjusted-funds-from-operations-affo-for-ifrs-january-2022/)). It starts from IFRS net income and lists about 20 adjustments, mostly add-backs of fair-value changes and other non-cash items ([Advisor.ca](https://www.advisor.ca/investments/market-insights/be-wary-of-reits-reported-numbers/)).
- **AFFO (adjusted FFO).** REALPAC describes AFFO as "a recurring economic earnings measure": FFO less maintenance capex, leasing costs, tenant improvements and straight-line rent ([summary of the REALPAC paper](https://canadianvaluestocks.substack.com/p/a-discussion-about-ffo-and-affo)). RioCan's MD&A confirms the practice: "AFFO is calculated as FFO less straight-line" rent, capital expenditures and internal leasing costs, "in accordance with the recommendations of REALPAC's January 2022 guidance" ([RioCan Q1 2026 report](https://s29.q4cdn.com/937534249/files/doc_financials/2026/q1/REI-Q1-2026-Report-to-Unitholders.pdf)). REALPAC leaves the capex input open (actual spend or a reserve), so AFFO is less comparable across REITs than FFO.
- **ACFO (adjusted cash flow from operations).** REALPAC's cash-flow measure, intended as "a sustainable, economic cash flow metric" ([summary](https://canadianvaluestocks.substack.com/p/a-discussion-about-ffo-and-affo)). CAPREIT reports an ACFO payout instead of an AFFO payout, which affects the data pack (see below).
- **Same-property NOI.** NOI from properties owned in both the current and the prior comparison period. CAPREIT's wording: "based on the operating performance of properties fully owned by CAPREIT in the current and prior year comparative periods, excluding properties that are classified as assets held for sale" ([CAPREIT 2025 Annual Report](https://s206.q4cdn.com/217547279/files/doc_financials/2025/ar/CAPREIT-2025-Annual-Report-Final.pdf)). The comparison pool changes every year, so growth must be taken as reported, never computed from two years of same-property NOI levels.

## Leverage has the strongest evidence and the hardest limits

The most robust academic result is about leverage. Sun, Titman and Twite found that "the share prices of REITs with higher debt-to-asset ratios and shorter maturity debt fell more during the 2007 to early-2009 crisis", and that financial distress costs had a permanent effect on REIT values even after property prices recovered ([Real Estate Economics 2015, RePEc](https://econpapers.repec.org/RePEc:bla:reesec:v:43:y:2015:i:1:p:8-36)). That is a reason to treat leverage as a gate and not just a score: a REIT that breaches its own limit can be forced to sell assets or issue units at the bottom of the cycle.

The limits are written into each REIT's constating documents and loan agreements:
- RioCan: "the aggregate of the total indebtedness of the Trust and the amount of additional indebtedness proposed to be assumed is restricted to 60% of Aggregate Assets" ([RioCan AIF, 27 Mar 2026](https://s29.q4cdn.com/937534249/files/doc_downloads/2026/Q4-2025-AIF-Final.pdf)). Its credit facilities repeat a Total Indebtedness covenant of under 60% and a secured-debt covenant of under 40% ([RioCan Q1 2026 report](https://s29.q4cdn.com/937534249/files/doc_financials/2026/q1/REI-Q1-2026-Report-to-Unitholders.pdf)).
- CAPREIT: "Pursuant to the DOT, CAPREIT's overall leverage is limited to 70% of its reported gross book value". Its acquisition and operating facility sets a stricter maximum of 62.5% total debt to gross book value, a minimum interest coverage of 1.65x, a minimum debt service coverage of 1.4x and a maximum FFO payout of 100% ([CAPREIT 2025 Annual Report](https://s206.q4cdn.com/217547279/files/doc_financials/2025/ar/CAPREIT-2025-Annual-Report-Final.pdf)).
- Killam: "Overall indebtedness is not to exceed 70% of Gross Book Value, as defined by the DOT" (operating policies in the MD&A; [Killam Q4 2021 MD&A](https://killamreit.com/sites/default/files//financial_reports/KillamQ42021%20MDA.pdf), seen as a search excerpt and not read in full).
- Morguard REIT (not one of the five data-pack REITs): an amendment sets the cap at 65% of Gross Book Value ([Morguard REIT amended Declaration of Trust](https://www.morguard.com/Documents/Morguard%20REIT/Corporate%20Governance/MRT_Amendment_and_Amended_and_Restated_Declaration_of_Trust.pdf), search excerpt).

60% is the strictest constating-document limit found among the candidates and sits just under CAPREIT's 62.5% covenant, so it is the gate. The US average is far below it: Nareit puts REIT debt-to-market assets at about 34% in Q2 2026 ([Nareit, 17 Aug 2026](https://www.reit.com/news/blog/media/reits-extend-strong-operating-performance)). That figure uses market values, so it is a reference point, not a like-for-like threshold.

Rating agencies measure leverage against earnings, not assets. Morningstar DBRS rates RioCan BBB with a Positive trend at 9.4x total debt to EBITDA. It would consider an upgrade if the ratio improves to and stays in the low 9.0x range, and would move the trend back to Stable above 9.3x ([DBRS, 25 Feb 2026](https://dbrs.morningstar.com/research/475139)). It rates Granite BBB (high) at 7.10x and would consider an upgrade "comfortably below 7.2x" with interest coverage above 4.33x ([DBRS, 24 Mar 2026](https://dbrs.morningstar.com/research/477120/morningstar-dbrs-changes-trends-on-granite-reit-holdings-limited-partnership-to-positive-from-stable-confirms-credit-ratings-at-bbb-high)). RioCan's own long-term target for adjusted spot debt to adjusted EBITDA is 8.0x-9.0x ([RioCan Q1 2026 report](https://s29.q4cdn.com/937534249/files/doc_financials/2026/q1/REI-Q1-2026-Report-to-Unitholders.pdf)). The DBRS methodology document (June 2025) does not publish a numeric grid on its press page ([DBRS](https://dbrs.morningstar.com/research/456537/morningstar-dbrs-publishes-final-global-methodology-for-rating-entities-in-the-real-estate-industry)), so the 9.0x score line is anchored on these issuer-level statements, not on a published grid.

## Payout, growth and occupancy rest on definitions and consensus

**Payout.** Paying out more than AFFO means distributing more than the REIT's recurring economic earnings, by REALPAC's own definition, so 100% is the natural gate. Lenders and managers use the same line: CAPREIT's facility caps the FFO payout at 100%, and Nexus told investors it "anticipates the normalized AFFO payout ratio (1) to average below 100% for the full fiscal year in 2026" (Nexus MD&A quote in `engine/raw/datapack/nxr-un.json`, event `milestone`). The 90% score line is a practitioner rule of thumb: "We generally prefer an AFFO payout ratio below 90%" ([Simply Safe Dividends](https://simplysafedividends.com/world-of-dividends/posts/21-affo-and-ffo-explained-the-reit-metrics-that-matter-most)). No peer-reviewed study tying a payout level to later distribution cuts was found, so the evidence for this line is weak.

**Growth.** Nareit judges REIT operations against inflation: Q2 2026 same-store NOI rose 4.1% year over year and "outpaced inflation in the second quarter, which was 3.5%" ([Nareit, 17 Aug 2026](https://www.reit.com/news/blog/media/reits-extend-strong-operating-performance)). For Canadian REITs the matching yardstick is the Bank of Canada's target, "the 2 per cent midpoint of a target range of 1 to 3 per cent" ([Bank of Canada](https://www.bankofcanada.ca/rates/indicators/key-variables/inflation-control-target/)). Same-property NOI growth below 2% means the existing portfolio is shrinking in real terms. FFO per unit is the outcome measure that nets out dilution. CAPREIT says it "is focused on achieving steady increases in this metric" ([CAPREIT 2025 Annual Report](https://s206.q4cdn.com/217547279/files/doc_financials/2025/ar/CAPREIT-2025-Annual-Report-Final.pdf)). The academic record on FFO is mixed: Fields, Rangan and Thiagarajan found that the industry's claim that FFO is more useful than net income was "premature", because which measure is better depends on context ([Review of Accounting Studies 1998](https://ideas.repec.org/a/spr/reaccs/v3y1998i1d10.1023_a1009680401226.html)). FFO per unit growth is therefore a score, with a no-decline line rather than a growth hurdle that no source supports.

**Occupancy.** Nareit's tracker puts occupancy of all US REIT-owned properties at 93.8% in Q2 2026 ([Nareit](https://www.reit.com/news/blog/media/reits-extend-strong-operating-performance)). This is the only published industry-wide figure found. It is a US, all-sector number: apartments and grocery-anchored retail normally run higher than office, so the line is a floor, not a target.

## The scorecard

| id | Kind | Metric (fields used) | Pass line | Evidence strength |
|---|---|---|---|---|
| `affo_payout_gate` | gate | AFFO payout = `distributions_per_unit` / `affo_per_share`, same period, fiscal year or trailing 4 quarters; fallback to company `affo_payout_ratio` | <= 100% | Definitional (REALPAC) plus lender covenant (CAPREIT) |
| `affo_payout_score` | score | same | <= 90% | Practitioner rule of thumb; weak |
| `leverage_gate` | gate | `debt_ratio` as reported (debt / gross book value, or debt / total assets) | <= 60% | Constating-document limits; academic support (Sun, Titman, Twite) |
| `debt_to_ebitda` | score | `debt` / `adjusted_ebitda` (same date, trailing 12 months); fallback to a company-reported debt-to-EBITDA ratio | <= 9.0x | Rating-agency practice (DBRS issuer statements); RioCan target |
| `spnoi_growth` | score | `same_store_noi_change_pct`, as reported, fiscal year or latest quarter | >= 2.0% | Nareit inflation framing plus Bank of Canada target |
| `ffo_per_unit_growth` | score | year-over-year change in `ffo_per_share` (fallback `affo_per_share`), same period type | >= 0% | Industry practice; academic support mixed |
| `occupancy` | score | `occupancy` at latest point in time (segment alias allowed, see below) | >= 93.8% | Nareit industry benchmark (US) |

Design notes, following the serial-acquirer report: with five names, use pre-declared thresholds rather than z-scores. A missing input reduces the maximum score and is never scored as zero. Compute payout from per-unit fields wherever possible so the formula is identical across REITs: the five companies' own payout ratios use different numerators (basic or diluted, "normalized", "core", ACFO instead of AFFO) and different windows (quarter, nine months, rolling 12 months).

Left out on purpose:
- Raw NOI margin and rent per unit: these are sub-sector traits, not quality signals.
- Weighted average interest rate: there is no sourced threshold, and the data-pack field is inconsistent (see below).
- Interest coverage: no clean field. Killam's field holds percentage changes, not levels.
- Capex intensity: definitions vary too much across the five REITs.
- NAV discount: price-based, and it would penalise any REIT the market dislikes for reasons unrelated to quality.

## Data availability in the Onesheet pack (periods with report date up to 2026-11-12)

Period codes: FY = fiscal year, Qn = quarter, 9M/H1 = year-to-date, "pit" = point-in-time balance.

| Check | CAR.UN | GRT.UN | KMP.UN | NXR.UN | REI.UN |
|---|---|---|---|---|---|
| AFFO payout (computed) | Quarters 25Q1-25Q3, 26Q1, 26Q3; H1 and 9M 2025-26. No FY: `affo_per_share` has no annual values | Not computable: no distributions field | FY2024, FY2025; 9M25, 9M26; 25Q1-Q3, 26Q1-Q3 (field named `distribution_per_unit`) | 25Q4, 26Q1-Q3 only | Not computable: no distributions field |
| AFFO payout (company) | None. `affo_ratio` is the **ACFO** payout (FY24, FY25, quarters) | `affo_payout_ratio` FY24, FY25, 9M24, 9M25, H125, H126, quarters | `affo_payout_ratio` FY25; `affo_ratio` FY23, FY25, quarters (mixed labels) | `affo_ratio` = normalized AFFO payout, FY24, FY25, 9M26, H126, 24Q4, 25Q4, 26Q3 | `affo_payout_ratio` 9M25, 9M26 only |
| Leverage ratio | `total_debt_to_gross_book_value_ratio`, 12 quarter-ends 2023-12 to 2026-09 | **None** | `debt_ratio` 2025-12-31 only | `total_indebtedness_ratio` 2023-12, 2024-12, 2025-12, 2026-06, 2026-09 | `debt_ratio` 2024-12-31 only usable |
| Debt to EBITDA | Not reliable: `debt` only 2026-09 and looks partial | Not aligned: debt to 2025-09; FY2024 EBITDA mis-extracted | Not aligned: debt 2026 only, EBITDA FY24/FY25 | FY2025 (`adjusted_debt` 2025-12 / FY2025 `adjusted_ebitda`); reported 10.7x at 2026-06 | Reported ratio FY2025 and 2025-12 to 2026-09 |
| SPNOI growth | FY2025, 25Q3, 25Q4 | FY2025, 25Q2, 25Q4, 26Q1-Q3 (cash basis; 25Q2 constant currency) | FY2024, FY2025, 25Q4, 26Q1-Q3 | 25Q4, 26Q1; FY2025 value ambiguous; alias `industrial_same_store_noi_change_pct` FY25, 25Q4, 26Q1-Q3 | None in core field; alias `commercial_same_property_noi_growth_change_pct` 25Q1, 26Q1-Q3 |
| FFO per unit growth | FY24 to FY25; quarters 23Q3-26Q3; 9M, H1 | FY23-FY25; 24Q4-26Q3; 9M, H1 | FY24 to FY25; 24Q1-26Q3; 9M, H1 | FY24 to FY25 (basic); `core_ffo_per_share` quarters 24Q4-26Q3 | 9M25 to 9M26; 25Q1/26Q1; 25Q3/26Q3; no FY |
| Occupancy | `occupancy` 2024-03 to 2025-12 (8 points) | Alias `occupancy_pct` 2024-09 to 2026-09 (core field mis-extracted) | Alias `apartment_occupancy` (same property) 2023-12 to 2026-09 | Alias `industrial_occupancy(_pct)` 2024-12 to 2026-09 (in-place plus committed) | Alias `committed_occupancy` / `retail_occupancy` 2025-03 to 2026-09 |

Gate readings visible in the data: NXR.UN's normalized AFFO payout was 103.5% for FY2025 and 98.0% for 9M 2026, so it fails the payout gate on the last full year and passes year to date. CAR.UN's debt to gross book value was 42.1% at 2026-09-30, and NXR.UN's Total Indebtedness Ratio was 49.0% at 2026-09-30. All of these sit below the 60% gate.

## How each company defines its payout and debt ratio

| REIT | Payout ratio (data-pack label → definition) | Debt ratio (data-pack label → definition) |
|---|---|---|
| CAR.UN | "ACFO payout ratio" (in field `affo_ratio`); "FFO payout ratio" (in `ffo_payout_ratio` and mislabelled `adjusted_ffo_payout_ratio`). CAPREIT: "ACFO payout ratio is calculated using total distributions declared during the period divided by ACFO" ([AR 2025](https://s206.q4cdn.com/217547279/files/doc_financials/2025/ar/CAPREIT-2025-Annual-Report-Final.pdf)) | "Total Debt to Gross Book Value": "calculated using total debt divided by gross book value", with "Gross Book Value ... defined by CAPREIT's DOT" (same source). The pack's `debt_ratio` (41.5% at 2024-12-31) has a garbled quote and conflicts with the 38.4% reported for the same date. Do not use it. |
| GRT.UN | "AFFO payout ratio" (annual and interim MD&A; quotes give no formula). Granite elsewhere: "monthly distributions, which exclude special distributions, declared to unitholders divided by AFFO in a period" ([Granite 6-K 2022](https://www.sec.gov/Archives/edgar/data/1564540/000119312522070800/d269187dex991.htm), via search excerpt) | None in the pack. Granite reports a "net leverage ratio" = net debt / fair value of investment properties, excluding assets held for sale ([Granite 6-K Q2 2025](https://www.sec.gov/Archives/edgar/data/1564538/000156453825000008/pressrelease-2025q2.htm), via search excerpt) |
| KMP.UN | "AFFO payout ratio - diluted" (quarterly and 9M); FY2025 quote: "The payout ratio improved to 69% for the year ended December 31, 2025". No formula in the quotes. | "Total debt as a percentage of assets as at December 31, 2025, was 41.9%." Separately, Killam's Declaration of Trust limit is measured against Gross Book Value (70%). |
| NXR.UN | "Normalized AFFO payout ratio - basic". No formula in the quotes or in public sources found. | "Total Indebtedness Ratio". No definition in the quotes; not found online. Check the MD&A non-IFRS section before relying on it. |
| REI.UN | "AFFO Payout Ratio" and "Core AFFO Payout Ratio" (9M). RioCan's payout ratios are "calculated on a twelve-month rolling basis" ([Q1 2026 report](https://s29.q4cdn.com/937534249/files/doc_financials/2026/q1/REI-Q1-2026-Report-to-Unitholders.pdf)). | "Total Indebtedness" 54.0% at 2024-12-31, a covenant ratio with a limit under 60%. RioCan redefined Total Indebtedness from 25 June 2025 (contractual mortgages, lines, debentures, leases, contingent and guarantee liabilities), and reports 50.0% at 2025-12-31 (same source), so the 2024 and later values are not comparable. |

## Data-quality warnings for the engine

Each of these was checked against the field's `sources[].quote`:
1. **GRT `affo_ratio`** holds "capital expenditures and leasing costs included in AFFO per square foot", not a payout. **CAR `affo_ratio`** is the ACFO payout. **KMP `affo_ratio`** mixes labels: FY2024 is "Percentage of distributions reinvested" (27.2%) and 24Q1 is an FFO payout.
2. **REI `debt_ratio`** values at 2025-12-31 (5.8%) and 2026-06-30 (12.7%) are the "Ratio of floating rate debt to total debt".
3. **REI `weighted_average_interest_rate`** (7.48% and 7.32%) comes from a sub-table of maturing debt. RioCan's headline weighted average contractual rate was 4.05% at 2025-12-31 and 4.04% at 2026-03-31 ([Q1 2026 report](https://s29.q4cdn.com/937534249/files/doc_financials/2026/q1/REI-Q1-2026-Report-to-Unitholders.pdf)).
4. **KMP `interest_coverage_ratio` and `debt_to_normalized_ebitda_ratio`** are percentage changes, not levels.
5. **GRT `adjusted_ebitda` FY2024** (-53.0M) is the fair-value-loss line. **GRT `occupancy`** (61,288) and **REI `occupancy`** (80, a basis-point spread) are not occupancy rates. **CAR `rent_per_unit`** values (97.7, 98.2) are occupancy percentages.
6. **CAR total debt to GBV at 2025-12-31** is 38.5% in the pack against 39.3% in CAPREIT's 2025 Annual Report. The pack's quote for that point is garbled.
7. **Future-dated periods.** Annual periods dated 2026-12-31 exist in CAR, GRT, KMP and REI; REI also has a quarter dated 2026-12-31 and KMP a point dated 2026-11-16. Filter them out.

## Gaps

- S&P's *Key Credit Factors for the Real Estate Industry* (2018) ratio table could not be extracted, Moody's REIT methodology was not retrieved, and the full DBRS methodology PDF is behind a download wall. Debt-to-EBITDA thresholds therefore rest on issuer-level DBRS statements.
- REALPAC's white papers are sold, not free; definitions here come from REALPAC's product page, a summary, and RioCan and CAPREIT MD&As that cite them.
- Declaration-of-trust limits for Granite and Nexus were not found.
- No Canadian large-sample study on payout, same-property NOI or occupancy as predictors was found. Nearly all academic evidence is US data.

---

## Appendix A: TSX-listed Canadian REIT universe

The first 14 are the holdings of the iShares S&P/TSX Capped REIT ETF (XRE), which tracks the S&P/TSX Capped REIT Index, as of 11 Nov 2026 ([StockAnalysis XRE holdings](https://stockanalysis.com/quote/tsx/XRE/holdings/)). Sub-sector labels are our read.

| Ticker | Name | Sub-sector | Source |
|---|---|---|---|
| REI.UN | RioCan REIT | Retail (mixed-use) | [XRE holdings](https://stockanalysis.com/quote/tsx/XRE/holdings/) |
| GRT.UN | Granite REIT | Industrial / logistics | [XRE holdings](https://stockanalysis.com/quote/tsx/XRE/holdings/) |
| FCR.UN | First Capital REIT | Retail (grocery-anchored) | [XRE holdings](https://stockanalysis.com/quote/tsx/XRE/holdings/) |
| CAR.UN | Canadian Apartment Properties REIT | Residential | [XRE holdings](https://stockanalysis.com/quote/tsx/XRE/holdings/) |
| CHP.UN | Choice Properties REIT | Retail / diversified | [XRE holdings](https://stockanalysis.com/quote/tsx/XRE/holdings/) |
| SRU.UN | SmartCentres REIT | Retail | [XRE holdings](https://stockanalysis.com/quote/tsx/XRE/holdings/) |
| DIR.UN | Dream Industrial REIT | Industrial | [XRE holdings](https://stockanalysis.com/quote/tsx/XRE/holdings/) |
| PMZ.UN | Primaris REIT | Retail (enclosed malls) | [XRE holdings](https://stockanalysis.com/quote/tsx/XRE/holdings/) |
| HR.UN | H&R REIT | Diversified | [XRE holdings](https://stockanalysis.com/quote/tsx/XRE/holdings/) |
| BEI.UN | Boardwalk REIT | Residential | [XRE holdings](https://stockanalysis.com/quote/tsx/XRE/holdings/) |
| KMP.UN | Killam Apartment REIT | Residential | [XRE holdings](https://stockanalysis.com/quote/tsx/XRE/holdings/) |
| CRR.UN | Crombie REIT | Retail (grocery-anchored) | [XRE holdings](https://stockanalysis.com/quote/tsx/XRE/holdings/) |
| CRT.UN | CT REIT | Retail (net lease) | [XRE holdings](https://stockanalysis.com/quote/tsx/XRE/holdings/) |
| AP.UN | Allied Properties REIT | Office | [XRE holdings](https://stockanalysis.com/quote/tsx/XRE/holdings/) |
| NXR.UN | Nexus Industrial REIT | Industrial | [Nexus Q4 2025 results](https://app.researchpool.com/provider/globenewswire/nexus-industrial-reit-nxrun-nexus-industrial-reit-announces-fourth-quarter-and-year-end-2025-finan-kBXO8GJO0X); `docs/DATA_PACK.md` |
| SGR.UN | Slate Grocery REIT | Retail (US grocery-anchored) | [Q2 2026 results](https://www.businesswire.com/news/home/20260806782662/en/Slate-Grocery-REIT-Reports-Second-Quarter-2026-Results) |
| MRG.UN | Morguard North American Residential REIT | Residential | [Q2 2026 results](https://www.morguard.com/news-knowledge/news/news-detail?nid=123616) |
| MRT.UN | Morguard REIT | Diversified | [Q3 2026 coverage](https://retail-insider.com/?p=210983) |
| APR.UN | Automotive Properties REIT | Retail (automotive net lease) | [Q2 2026 results](https://quartr.com/events/automotive-properties-real-estate-investment-trust-apr-un-q2-2026_oCPfs7Vw) |
| CSH.UN | Chartwell Retirement Residences | Healthcare / seniors housing | [Q3 2026 MD&A](https://s206.q4cdn.com/873100156/files/content_files/Q3-2026-Chartwell-MDA-November-5_-2026.pdf) |

Flags:
- CSH.UN is a TSX-listed real estate trust, but it is not named a REIT and is not in XRE. Confirm its classification before including it.
- NorthWest Healthcare Properties REIT (NWH.UN) announced a name change to Vital Infrastructure Property Trust with its FY2025 results ([Newsfile](https://www.newsfilecorp.com/release/285100)). Its current ticker was not confirmed.
- Excluded because they left the TSX in 2026: InterRent (IIP.UN; arrangement closed 9 Jul 2026, [InterRent](https://www.irent.com/investors/press-releases/interrent-reit-announces-closing-of-arrangement-with-carriage-hill-properties-acquisition-corp)), Minto Apartment REIT (MI.UN; take-private completed Aug 2026, [Stockwatch](https://wwww.stockwatch.com/News/Item/Z-C!MI-3849446/C/MI)) and Artis (AX.UN; became an RFA Financial subsidiary Feb 2026, [IREI](https://irei.com/news/artis-and-rfa-capital-complete-merger-transaction)).

## Appendix B: TSX/TSXV serial acquirers and consolidators

| Ticker | Name | Sub-sector | Why it is a serial acquirer | Source |
|---|---|---|---|---|
| CSU | Constellation Software | Vertical market software | Archetypal acquire-and-hold programme | [Globe and Mail](https://www.theglobeandmail.com/investing/markets/inside-the-market/article-company-growth-strategic-acquisition/); [Aktagon Canada](https://serial-acquirers.aktagon.com/scorecard/canada/) |
| TOI (TSXV) | Topicus.com | Vertical market software (Europe) | CSU spin-off running the same programme | [Aktagon Canada](https://serial-acquirers.aktagon.com/scorecard/canada/) |
| LMN (TSXV) | Lumine Group | Communications and media software | Says it aims to reinvest all free cash flow in acquisitions | [Lumine FY2025 results](https://www.luminegroup.com/?p=5801) |
| WSP | WSP Global | Engineering consulting | Platform acquirer: POWER, Ricardo, TRC (US$3.3B) | [Financier Worldwide](https://www.financierworldwide.com/fw-news/2025/12/18/wsp-global-strikes-33bn-trc-deal) |
| STN | Stantec | Engineering and design | 150th acquisition since its 1994 IPO, closed Aug 2025 | [Stantec](https://www.stantec.com/en/news-media/2025/stantec-successfully-completes-150th-acquisition) |
| TFII | TFI International | Trucking and logistics | Named in the Globe's list of serial acquirers | [Globe and Mail](https://www.theglobeandmail.com/investing/markets/inside-the-market/article-company-growth-strategic-acquisition/) |
| GFL | GFL Environmental | Waste management | "Over 100 acquisitions" since 2007 per its 2019 F-1; more than 200 by about 2023 | [SEC F-1/A](https://www.sec.gov/Archives/edgar/data/1780232/000104746919004816/a2239324zf-1a.htm); [Recycling Today](https://recyclingtoday.com/article/gfl-environmental-no-longer-the-new-kids) |
| WCN | Waste Connections | Waste management | 19 acquisitions in 2025, about $330M annualized revenue | [WCN Q4 2025](https://investors.wasteconnections.com/news/news-details/2026/Waste-Connections-Reports-Fourth-Quarter-2025-Results-and-Provides-2026-Outlook/default.aspx) |
| FSV | FirstService | Property services | 2025 growth attributed mainly to tuck-under acquisitions | [FirstService AR 2025](https://www.firstservice.com/wp-content/uploads/2026/03/FirstService-Annual-Report-2025-FINAL-V1.pdf) |
| CIGI | Colliers International | Real estate services and engineering | Seven acquisitions from Q2 2025; engineering built by acquisition | [Colliers](https://corporate.colliers.com/news/news-details/2025/Colliers-adds-leading-telecommunications-engineering-firm/default.aspx) |
| BYD | Boyd Group Services | Auto collision repair | Consolidator of collision centres | [Globe and Mail](https://www.theglobeandmail.com/investing/markets/inside-the-market/article-company-growth-strategic-acquisition/); [Aktagon Canada](https://serial-acquirers.aktagon.com/scorecard/canada/) |
| CCL.B | CCL Industries | Specialty packaging and labels | Named in the Globe's list (as CCL-A) | [Globe and Mail](https://www.theglobeandmail.com/investing/markets/inside-the-market/article-company-growth-strategic-acquisition/) |
| RCH | Richelieu Hardware | Hardware distribution | In Aktagon's Canadian serial-acquirer screen | [Aktagon Canada](https://serial-acquirers.aktagon.com/scorecard/canada/) |
| ATD | Alimentation Couche-Tard | Convenience retail | Named in the Globe's list | [Globe and Mail](https://www.theglobeandmail.com/investing/markets/inside-the-market/article-company-growth-strategic-acquisition/) |
| DND | Dye & Durham | Legal software | In Aktagon's screen (ROIC -9.5%); now in a strategic review and selling assets | [Aktagon Canada](https://serial-acquirers.aktagon.com/scorecard/canada/); [Dye & Durham Q2 FY2026](https://dyedurham.com/dye-durham-reports-second-quarter-fiscal-2026-financial-results/) |
| DSG | Descartes Systems | Logistics software | In both lists | [Globe and Mail](https://www.theglobeandmail.com/investing/markets/inside-the-market/article-company-growth-strategic-acquisition/); [Aktagon Canada](https://serial-acquirers.aktagon.com/scorecard/canada/) |
| ENGH | Enghouse Systems | Contact-centre and telecom software | In both lists | [Globe and Mail](https://www.theglobeandmail.com/investing/markets/inside-the-market/article-company-growth-strategic-acquisition/); [Aktagon Canada](https://serial-acquirers.aktagon.com/scorecard/canada/) |
| GIB.A | CGI | IT services | In both lists | [Globe and Mail](https://www.theglobeandmail.com/investing/markets/inside-the-market/article-company-growth-strategic-acquisition/); [Aktagon Canada](https://serial-acquirers.aktagon.com/scorecard/canada/) |
| PBH | Premium Brands | Specialty food | In both lists | [Globe and Mail](https://www.theglobeandmail.com/investing/markets/inside-the-market/article-company-growth-strategic-acquisition/); [Aktagon Canada](https://serial-acquirers.aktagon.com/scorecard/canada/) |
| EIF | Exchange Income | Aviation and manufacturing | In Aktagon's screen | [Aktagon Canada](https://serial-acquirers.aktagon.com/scorecard/canada/) |
| MTY | MTY Food Group | Restaurant franchising | In Aktagon's screen | [Aktagon Canada](https://serial-acquirers.aktagon.com/scorecard/canada/) |
| TVK | TerraVest Industries | Industrial manufacturing | Repeated tank and equipment deals 2024-26 (EnTrans, KBK) | [Angel Muffin Capital](https://angelmuffincapital.substack.com/p/terravest-industries-tsxtvk) |
| ARE | Aecon Group | Construction | **Not confirmed.** Occasional bolt-ons; no source names it a serial acquirer (see the serial-acquirer report) | `reports/Serial acquirer evaluation variables.md` |

Flags:
- ARE is unconfirmed as a serial acquirer.
- TVK's evidence comes from blogs, and their deal counts disagree.
- DND is shrinking, not acquiring, while its strategic review is open.
- The Globe and Mail list is from 25 Oct 2022 and was read through an arc-dev mirror of the article.
- Aktagon's screen is a third-party cross-section.
