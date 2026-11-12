# Kickoff notes: AI & InvestTech Hackathon, Montréal (Nov 12)

Notes from the organizers' intro presentation before the build started.
Source: AI-generated meeting notes (Notion) from a live transcript, so names and URLs may be mistranscribed.
Lines marked **[our read]** are our interpretation, not what was said.

## The challenge, in one line
Build a **tool** that uses the data to prove why a company belongs in an index. The tool is judged, not the stock pick.

## Rules and format
- **Pick one of two segments**, each with **5 candidate companies**:
  - **REIT index**: complete the REIT index.
  - **Acquirers index**: companies that grow by acquisition. Example given: "Consensus Software", with "Dubtious" under the same roof.
    **[our read]** almost certainly Constellation Software (CSU) and Topicus, which matches the `acquisitions` and Topicus metrics in the CSU profile.
- Teams can focus on one company or cover all 5.
- Convince the organizers why each pick should be added. Act "like you are a fund manager and we want to add Canadians."
- Go deeper than "here's the stock price, there's a dip, let's buy it."
- Any tool or framework is allowed, and the data is open.

## The index today
- About **95% US companies, no Canadian names**. Whether any Canadian company makes it in is an open question the organizers framed as the challenge.
- Each fund has about **18% of its portfolio open** to trade (the 15–20% slice). It could drop toward **15%** because the VIX is high and Nvidia moved the index today.
- Split picks across names (for example 50/50) rather than locking in one number.
- Indexes are viewable at "kimesa.t/indexes" (as transcribed). **[our read]** this is trimestre.ca/indexes, the page `docs/BRIEF.md` and `npm run refresh-index` already use.

## Data access
- Every team has its own Onesheet API key.
  - Base URL `https://api.onesheet.pro/v1`, header `X-API-Key` (from the slide; docs at `https://api.onesheet.pro/v1/docs`).
  - Locally: key in `.env.local`, try endpoints with `npm run onesheet -- <path>`.
- A QR code on the slide links a Google Drive **data pack** with JSON company profiles for all 10 companies. See `docs/DATA_PACK.md`.
- The API has everything in the Onesheet app: KPIs, fundamentals, fundamentals history and price history.

## Judging and prizes
- Work runs until about **9 pm**. Teams that finish early can start judging sooner.
- Judging includes a **small benchmark on the stock picks**, but the focus is the tool. How the benchmark counts was not explained (cut off).
- Prize: **$1K split between 1st and 2nd**.
- **Top 3 teams** are invited to the next, flagship event (about 200 people; banks, startups, potential employers), with some tech guidance.
- Top 3 teams: send the organizers a video or email on their index picks and what they'd add.

## What this changes vs. `docs/BRIEF.md` and `docs/TEAM_PLAN.md`
- **Candidates are given: 5 per segment, 10 in total.** TEAM_PLAN says "Pick 6–10 Canadian candidates". Use the organizers' 5 acquirers instead of choosing our own: CSU, TOI, WSP, TFII, ARE (see `docs/DATA_PACK.md`).
- **Our segment choice holds.** BRIEF already picks serial acquirers, which is one of the two segments.
- **Cash room matches.** About 18% open lines up with BRIEF's "Serial acquirers: 82% invested, 18% cash", so proposed weights must fit inside roughly 15–18%.
- **Timing:** organizers said work runs until about 9 pm. Our own 20:45 code freeze in BRIEF still stands.

## Background (why this event exists)
- The organizers want to make fintech more accessible in Canada; banks recruit graduates with data, coding and Python skills.
- **Direct indexing** is pitched as an alternative to ETFs, since niche thematic ETFs (e.g. uranium) can charge about 1% with little volume. Their line: "ETF is going to be dead soon."
- **Canadian data is hard to get.** US platforms have little or none, and one provider quoted a huge bill or refused. That is why Onesheet was built.
- Sponsors named: DEC, SnapTrade, FinTech Alliance.
- **SnapTrade** (Alex): a free API to connect a brokerage, read data or place trades, across many brokerages. The pitch is building your own tools instead of using bank UIs.
