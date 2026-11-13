# InvestTech Hackathon

Trimestre Q4 · Montréal · Nov 12, 2026. Team: Oscar + Max.

A tool that finds which Canadian companies belong in the organizers' live indexes, shows the proof behind every number, and completes the index.

## Get going (both of you)

```bash
gh repo clone Ohowe24/investtech-hackathon
cd investtech-hackathon
npm install
npm run dev        # open http://localhost:3000
```

You should see a red **FAKE SAMPLE DATA** banner, a map with 5 dots, and a "Complete the index" panel. That means everything works.

## How it fits together

```
Onesheet data ──> engine/input/*.csv ──> npm run engine ──> data/companies.json ──> website (src/)
  (Max)              (Max fills)          (Max's script)       (the handshake)        (Oscar)
                                                                                     + data/indexes.json
                                                                                       (organizers' live holdings)
```

- **No database, no logins, no live API calls during the demo.** All math happens ahead of time; the site just reads two JSON files.
- **Push to GitHub → Vercel redeploys automatically** (once connected).

## Folders

| Path | Mostly worked on by | What |
|---|---|---|
| `engine/` | Max | `config.ts` (which metrics, thresholds) · `metrics.ts` (formulas) · `build.ts` (CSV → JSON) · `methodology.md` |
| `engine/input-sample/` | — | FAKE example spreadsheets showing the exact columns |
| `engine/input/` | Max | Real spreadsheets. Once `companies.csv` exists here, the FAKE banner disappears. |
| `engine/raw/` | Max | Onesheet raw downloads (git-ignored) |
| `src/` | Oscar | Website: `components/ScatterMap`, `DetailPanel`, `IndexBuilder`, `Workbench` |
| `contract/types.ts` | Both | Shape of `data/companies.json`, shared by the engine and the website. Update both sides when it changes. |
| `data/` | — | `companies.json` (engine output) · `indexes.json` (organizers' holdings) |
| `docs/` | — | `BRIEF.md` · `TEAM_PLAN.md` · `CHECKLIST.md` |

Oscar and Max both have full access to every folder. The column above only says who usually works where.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Website at localhost:3000 |
| `npm run engine` | Rebuild `data/companies.json` from the spreadsheets |
| `npm test` | Formula + index-math tests |
| `npm run build` | Production build (run before pushing) |
| `npm run refresh-index` | Download the organizers' latest holdings |

## Plugging in real data (Max, after 17:25)

1. Copy `engine/input-sample/` to `engine/input/`.
2. Replace the rows with real companies from Onesheet, using the same column names:
   - `companies.csv` holds one row per company, with your verdict (`add` / `reject` / `watch` / `existing`) and a one-sentence reason.
   - `financials.csv` holds one row per company per fiscal year. Amounts are positive numbers spent for `capex` and `acquisitions`. Leave a cell **empty** if it's unknown; never put 0.
   - `sources.csv` gives each source an id, a label like "Q2 2026 MD&A p.15", and a URL.
3. Run `npm run engine`. It prints a table and lists warnings for missing data.
4. Commit `engine/input/` and `data/companies.json`, then push.

To change the metrics or the map (for example, switching to the REIT index), edit `engine/config.ts` and `engine/metrics.ts`.
