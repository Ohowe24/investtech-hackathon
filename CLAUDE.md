# InvestTech Hackathon — rules for every Claude session in this repo

@AGENTS.md

Two people build this repo at the same time: **Oscar** (website) and **Max** (engine). Each runs their own Claude session.
Before substantial work, read `docs/BRIEF.md` (what and why), `docs/TEAM_PLAN.md` (how and when) `docs/KICKOFF_NOTES.md` (what the organizers said at kickoff) and `docs/DATA_PACK.md` (the 10 candidate companies' Onesheet data, in `engine/raw/datapack/`).

## Lanes: the most important rule
| Folder | Owner | What it is |
|---|---|---|
| `engine/` | **Max** | Spreadsheets in → `data/companies.json` out. All finance math. |
| `src/` | **Oscar** | The website. Reads `data/companies.json` and `data/indexes.json`, nothing else. |
| `contract/types.ts` | **Both** | Shape of `data/companies.json`. Change only if the user says both agreed. |
| `data/companies.json` | Engine output | Never hand-edit. Regenerate with `npm run engine`. |

- Ask who you're working with, if it's unclear, and edit only that person's lane.
- If a change needs the other lane, say so and describe it. Don't make it.

## Numbers: zero tolerance
- Never invent, estimate or hand-type a financial number, in code, data or copy.
- All math lives in `engine/metrics.ts` (pure functions with tests). Formulas are documented in `engine/methodology.md`.
- Missing means `null` plus a `note`, never `0`.
- Every metric carries `sourceIds` that point at `Dataset.sources`.
- While `isFake` is true the site shows a FAKE banner. Never remove or hide it.
- Verdicts and reasons are human decisions from `engine/input/companies.csv`. Don't auto-generate them.

## Commands
```
npm run dev            # website at http://localhost:3000
npm run engine         # rebuild data/companies.json (uses engine/input/ if present, else FAKE sample)
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
