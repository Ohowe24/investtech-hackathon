# InvestTech Hackathon — Team Plan

Read with [BRIEF.md](BRIEF.md) and [CHECKLIST.md](CHECKLIST.md). This file is *how* you work; the brief is *what* you're building.

---

## 1. The core idea: two lanes that meet at one file

| Lane | Owner | Owns the question | Produces |
|---|---|---|---|
| **Engine** | **Max** | "Is this number right? Is this company in or out, and why?" | One file: `companies.json`, containing every metric, its source and a verdict |
| **Experience** | **Oscar** | "Can a judge get it in 3 minutes?" | The app (map → X-ray → complete the index) and the demo |
| **Contract** | Both | "What does `companies.json` look like?" | `contract/types.ts` plus the **FAKE** sample in `engine/input-sample/` |

The lanes only touch at that one file, so **nobody waits on anybody**. Oscar builds the screens against the fake sample until Max's real file lands at the first check-in.

**If Max doesn't code:** Max does the finance work in a spreadsheet from Onesheet's data, and that sheet becomes the answer key. A Claude Code session, driven by either of you, turns the sheet into `companies.json`. Max's real value is the finance judgment, not the code.

> Swap the lanes if your skills are the other way round. What matters is one owner per lane.

---

## 2. Repo layout (private GitHub repo `investtech-hackathon`)

```
investtech-hackathon/
  CLAUDE.md                 rules every Claude session reads (lanes, no invented numbers)
  README.md                 how to run it
  contract/types.ts         BOTH: shape of data/companies.json (change only together)
  engine/                   MAX
    config.ts               which metrics, map axes, thresholds
    metrics.ts (+ tests)    the finance formulas
    build.ts                spreadsheets -> data/companies.json   (npm run engine)
    input-sample/           FAKE example spreadsheets (exact columns)
    input/                  real spreadsheets (create from the sample)
    raw/                    Onesheet downloads (git-ignored)
    methodology.md          definitions + reasons for thresholds
  src/                      OSCAR: the website (Next.js)
    components/             ScatterMap, DetailPanel, IndexBuilder, Workbench
    lib/                    formatting + index math (+ tests)
  data/
    companies.json          engine output: the handshake
    indexes.json            organizers' live holdings (npm run refresh-index)
  docs/                     BRIEF, TEAM_PLAN, CHECKLIST
```

---

## 3. The contract

See `contract/types.ts`. In short, `data/companies.json` holds:
- the question;
- the metric definitions;
- the map axes and thresholds;
- every company with its metrics (each with a value or `null`, a period and source ids), zone, verdict, weight and reason;
- the list of sources.

Missing values are `null` plus a note, never `0`. Percentages are decimals.

---

## 4. Ground rules

1. **Stay in your lane.** Oscar edits `src/`; Max edits `engine/`. `contract/` changes only when you agree out loud.
2. **No hand-typed numbers in the app.** Every number on screen comes from `companies.json`.
3. **Fake data says FAKE on screen**, so it can't slip into the demo.
4. **Small commits, push often.** Run `git pull --rebase` before every push, and never use `git stash pop`.
5. **Three 5-minute check-ins, standing up:** 18:15, 19:15, 20:15.
6. **Feature freeze at 19:15.** After that, only fixes and polish on the demo path.
7. **Deployed by 20:00. Backup screen recording by 20:30.**

---

## 5. Tonight, hour by hour

### Now → ~16:15 (prep)
**Together, first 15 minutes:** lock the 9 decisions in the brief, confirm who owns which lane, and agree the contract draft.

| Oscar | Max |
|---|---|
| Create the private repo, invite Max, push this layout with CLAUDE.md and the brief | Accept the invite, install and log in to Claude Code, clone the repo, run the app locally to prove the laptop works |
| Scaffold the app: load the index snapshot, a 3-step page shell, the map chart on the fixture, the before/after weight math | Sign up for Onesheet PRO (free). Open CSU and 3 Canadian names, and note which fields exist |
| Deploy the empty shell to Vercel once, so deploy problems show up now rather than at 20:00 | Write `methodology.md`: the 5 metrics, their formulas, edge cases (negative cash flow, stock splits, currency) and the zone rules |
| Check your Claude plan usage. Close other Claude sessions on the Mac for tonight | Set up the hand-check spreadsheet template |

Both: charge your laptops.

### 17:00–17:25 — reveal
- **Oscar:** ask the 4 kickoff questions and note the demo length.
- **Max:** open the data straight away and tick the field checklist.
- **17:20 go / no-go (both, 5 min):**
  - Which index?
  - Which 3–5 metrics actually exist in the data?
  - Finalise the contract.
  - Pick 6–10 Canadian candidates.

### 17:25–18:15 — Block 1: first real numbers
- **Max:** load the raw data. Compute metrics for 3 companies (1 existing holding + 2 Canadian), check them by hand, and write `companies.json` v1.
- **Oscar:** build the map and the X-ray panel on the fixture, with clickable source links.
- **18:15 check-in:** swap the fixture for the real file. Do 3 real dots appear on the map? Is anything surprising?

### 18:15–19:15 — Block 2: whole universe + the story
- **Max:** add all candidates plus the 15 holdings, assign zones and verdicts, and **find the demo story**:
  - one surprising Canadian addition;
  - one famous name the tool rejects;
  - the WCN point.
- **Oscar:** build the "complete the index" view: weights, before/after, and the rejected list.
- **19:15 check-in:** **feature freeze**. Decide what gets cut, and write the 3-line demo story together.

### 19:15–20:15 — Block 3: make it true, make it clear
- **Max:** re-check every number on the demo path against its source, and finish the reasons.
- **Oscar:** polish the demo path only, have it **live by 20:00**, and fix bugs.
- **20:15 check-in:** run the full demo on the live URL.

### 20:15–20:45 — rehearse
Run the demo twice with a timer and record a screen-capture backup. **20:45 code freeze.**

### 20:50 — demo
**Oscar presents and drives. Max takes the finance questions.** The judges are Onesheet's founders, so expect questions about the metrics.

---

## 6. Demo shape (about 3 min; adjust once the length is confirmed)

| Time | Beat |
|---|---|
| 0:00 | "You run a serial-acquirer index. Which Canadian companies truly belong, and which only look like they do?" |
| 0:20 | The map. Their own holdings land where you'd expect, which shows the tool works. |
| 0:50 | Click the surprising Canadian compounder: X-ray and sources. |
| 1:40 | Click the famous reject: why it's out. |
| 2:10 | Complete the index: before and after. "And WCN is already Canadian." |
| 2:40 | What's next: the same engine on REITs, then any thematic index. |

---

## 7. Using Claude Code as a pair of pairs

- Each of you runs your **own** Claude Code session, working only in your own lane's folder.
- The repo's `CLAUDE.md` gives both sessions the same context: the brief, the contract, the lane rule, and "never invent numbers."
- When the contract changes, both of you tell your Claude session to re-read `contract/types.ts`.

---

## 8. Finals week (Nov 13–19), if you make the top 3

| When | Max | Oscar |
|---|---|---|
| Nov 13–14 | Extend the engine to the REIT index, with REIT metrics | Polish the UX and the mobile view |
| Nov 15–16 | Add a quarterly re-run "drift" view and more Canadian names | Add a REIT tab and an index switcher |
| Nov 17 | Check every number in the video | Write the video script and record it |
| Nov 18 | **Submit a day early** | |
| Nov 19, 23:59 | Hard deadline | |
