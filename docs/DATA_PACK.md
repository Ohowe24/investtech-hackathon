# Onesheet data pack: the 10 candidate companies

The organizers' data pack (Google Drive, linked from the kickoff slide's QR code) has one JSON company profile per candidate.
Local copy: `engine/raw/datapack/<file>.json`. It is **git-ignored** (Onesheet raw data), so each machine downloads its own; see the command at the bottom.
The files were built Nov 11, 2026, and every value in `data` carries a SEDAR filing quote in `sources`.

## The companies
**Acquirers segment** (5) **[our read]**: the five non-REIT names.

| File | Company | Listing | Reports in | Quarters | Annual | Acquisition events | Empty core slots |
|---|---|---|---|---|---|---|---|
| `csu.json` | Constellation Software | CSU / TSX | **USD** | 2022-Q4 → 2026-Q3 (16) | 2016 → 2025 (10) | 19 | gross margin, operating income, EBITDA |
| `toi.json` | Topicus.com (controlled by CSU) | TOI / **TSXV** | **EUR** | 2023-Q4 → 2026-Q3 (12) | 2024 → 2025 (2) | 10 | gross margin, operating income, EBITDA |
| `wsp.json` | WSP Global | WSP / TSX | CAD | 2023-Q3 → 2026-Q3 (13) | 2022 → 2025 (4) | 17 | none |
| `tfii.json` | TFI International | TFII / TSX | **USD** | 2023-Q4 → 2026-Q3 (12) | 2023 → 2025 (3) | 6 | debt |
| `are.json` | Aecon Group | ARE / TSX | CAD | 2023-Q3 → 2026-Q3 (13) | 2023 → 2025 (3) | 9 | free cash flow, debt |

**REIT segment** (5):

| File | Company | Listing | Quarters | Annual | Empty core slots |
|---|---|---|---|---|---|
| `car-un.json` | CAPREIT (residential) | CAR.UN / TSX | 13 | 3 | operating income, EPS, FCF, debt, rent per unit |
| `grt-un.json` | Granite REIT (industrial/logistics) | GRT.UN / TSX | 11 | 4 | operating income, EPS, capex, FCF, occupancy, rent per unit |
| `kmp-un.json` | Killam Apartment REIT | KMP.UN / TSX | 11 | 4 | operating income, EPS, FCF, debt, occupancy, rent per unit |
| `nxr-un.json` | Nexus Industrial REIT | NXR.UN / TSX | 8 | 3 | operating income, EPS, FCF, debt, occupancy, rent per unit |
| `rei-un.json` | RioCan (retail) | REI.UN / TSX | 11 | 3 | EBITDA, operating cash flow, FCF, debt, same-store NOI, occupancy |

All fiscal years end Dec 31.

## File layout
```
{ schemaVersion: "company-profile-consumer-v2", companyKey, sourceHash, sourceWatermark, builtAt,
  document: {
    profile: { identity, overview: { description, entityCounts, slots[] }, entities[] },
    metrics: [ { metricId, metricName, metricFormat, isCurrency, isPerShare, isKeyMetric, slotKey } ],
    data:    { "0": { periodId, periodType: "Quarterly"|"Annual", reportDate, fiscalYear, fiscalQuarter,
                      metricValues: { <metricId>: { value, unit, currency, adjusted, origin, sources[] } } }, ... },
    events:  [ { type, status, date: { occurredOn, precision }, entity, summary, attributes, sources[] } ]
  } }
```
- This is the same shape as `GET /v1/company-profiles/{symbol}` from the API, but wrapped in `document`. The data pack has **more history**: CSU has 10 annual periods here, against 3 from the API call.
- `sources[]` items look like `{ source: "sedar", formType, filedOn, quote }`, which is enough for the `sourceIds` our contract requires.
- Metric IDs differ by company: 33 for TOI, 187 for CAPREIT. Don't assume a fixed set.
- Event `type`s include `acquisition`, `divestiture`, `capital-return`, `financing`, `milestone` and, for REITs, `property-acquisition`, `property-disposition`, `development-*`, `lease-signing`.

## Gotchas
- **Three reporting currencies:** CSU and TFII report in USD, TOI in EUR, the rest in CAD. Convert before comparing across companies (the API has `/forex/rate-at-date`).
- **Units differ:** data `value`s are in actual units (`443000000`), but event `attributes.amount` values are strings in **millions** (`"391"`).
- **CSU's `free_cash_flow` is FCFA2S** (its own "free cash flow available to shareholders"), not operating cash flow minus capex. Check how each company defines FCF before comparing.
- **Some REIT files contain annual periods dated 2026-12-31**, which is after the Nov 12 build date. Check them before using.
- A slot marked empty means missing. Store it as `null` with a note, never `0`.

## Re-download
Run from the repo root:
```bash
mkdir -p engine/raw/datapack && cd engine/raw/datapack && while read f id; do curl -sL "https://drive.usercontent.google.com/download?id=$id&export=download&confirm=t" -o "$f"; done <<'EOF'
are.json 190MdrjjWVkuomp5aNaAOhUDZ-YW3UHwX
toi.json 1aqR2YRdCa5Ivzjw89iz5KBiKEASmorot
csu.json 1-XCjZjQpjN0ONWnli69AYxqKUUQg9HJv
wsp.json 1elYEXVC-jU5aBcgMt7m2JaZqfkyyzo_E
tfii.json 1Ifh_LTu-EG6eWV-BSlkD7lLQ8Iiqr6eI
rei-un.json 1urpnv_zvrCRmLF5FapJJ-VwJ80Mr2OoS
nxr-un.json 1bgTIi75V3Rr7CmsgHjKR1M1la_pNiBw5
kmp-un.json 1RJ1XeHHl784l0tqhVEoADe3K3rR5yBYS
grt-un.json 1t2mQXcuzGs5Xc_LEwPkqW9W_Bxk34tew
car-un.json 1SpM-FDq8WGuejic8ionLxEc85reBsP7d
EOF
```
Drive folder: https://drive.google.com/drive/folders/1zerBcKhfv-2hF4EesxSkF-oDQ6PqU7dy
