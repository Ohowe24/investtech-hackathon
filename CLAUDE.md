# InvestTech Hackathon — rules for every Claude session in this repo

@AGENTS.md

Two people build this repo: **Oscar** and **Max**. Both have full access. Either of them, and any Claude session working for either of them, may change any file or folder, commit and push.
Before substantial work, read `docs/BRIEF.md` (what and why), `docs/TEAM_PLAN.md` (how and when) `docs/KICKOFF_NOTES.md` (what the organizers said at kickoff) and `docs/DATA_PACK.md` (the 10 candidate companies' Onesheet data, in `engine/raw/datapack/`).

## Map of the repo
| Folder | What it is |
|---|---|
| `engine/` | Spreadsheets in → `data/companies.json` out. All finance math. One profile per industry in `engine/industries/`. |
| `src/` | The website. `/` is the onboarding (industry → holdings → run); `/analyze` runs `engine/analyze.ts` on the server against `data/store.json` and `data/indexes.json`. |
| `contract/types.ts` | Shape of `data/companies.json`, shared by the engine and the website. When it changes, update both sides. |
| `data/companies.json` | Engine output. Regenerate it with `npm run engine`; hand edits are overwritten on the next run. |
| `docs/OUTLOOK_ENGINE.md` | The Outlook engine plan (industry outlook for serial acquirers). Data in `data/outlook.json`, built by `npm run outlook`; tab `#outlook` on `/analyze`. |

## Numbers: zero tolerance
- Never invent, estimate or hand-type a financial number, in code, data or copy.
- All math lives in `engine/metrics.ts` (pure functions with tests). Formulas are documented in `engine/methodology.md`.
- Missing means `null` plus a `note`, never `0`.
- Every metric carries `sourceIds` that point at `Dataset.sources`.
- While `isFake` is true the site shows a FAKE banner. Never remove or hide it.
- Verdicts come from the model's declared checks in the industry profile (`engine/industries/<id>.ts`). A verdict and reason typed in `engine/input/companies.csv` overrides the model.

## Commands
```
npm run dev            # website at http://localhost:3000
npm run fetch-statements  # download annual statements for all 20 companies into engine/raw/ (needs .env.local)
npm run inputs         # engine/raw/ -> engine/input/*.csv + deals.json (never overwrites companies.csv)
npm run engine         # rebuild data/store.json + data/companies.json (uses engine/input/ if present, else FAKE sample); add -- --industry <id> to pick a profile
npm run outlook        # rebuild data/outlook.json (Outlook engine tab); see docs/OUTLOOK_ENGINE.md
npm test               # formula + index-math tests
npm run build          # production build; must pass before pushing
npm run refresh-index  # pull the organizers' latest live holdings into data/indexes.json
```

## Git
- Small commits. Run `git pull --rebase` before every push. Never `git stash pop`. Never change `user.email`.
- Run `npm test` and `npm run build` before pushing to `main`.
- `engine/raw/` is git-ignored (Onesheet raw files). Put cleaned inputs in `engine/input/`.

## Tonight's clock (Nov 12)
17:25 build starts · 18:15 / 19:15 / 20:15 check-ins · **19:15 feature freeze** · 20:00 live on Vercel · **20:45 code freeze** · 20:50 demos
