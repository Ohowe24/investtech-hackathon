# InvestTech Hackathon — Brief

Team: Oscar + Max. Event: **tonight, Thu Nov 12, 2026**, Deck, 180 rue Peel, Montréal.
Every fact below was checked on Nov 12 against trimestre.ca (EN + FR), trimestre.ca/indexes and its data feed, the Luma page, onesheet.ca and onesheet.pro, plus web sources where noted.

---

## 1. Verified event facts

| | |
|---|---|
| Run by | **Onesheet**, a Montréal fintech. Co-founders "Tony & MK" are the Luma hosts Anthony A and Mikael Kortbaoui; Laurent Leveille is also a host. |
| Partners | Deck (venue), Fintech Cadence (Nov 24 final). Sponsors are offered "judging seats", so judges are likely Onesheet plus sponsors. |
| Schedule | 16:45 doors · 17:00 teams + **challenge and sectors revealed** · **17:25 build** · **20:45 code freeze** (3 h 20) · 20:50 quick demos · 21:50 top 3 announced |
| Tonight | A "quick demo" decides the **top 3** finalists. The site gives no length; Luma says 3 min. |
| Scoring | **80%** = tool + video due **Nov 19, 23:59** · **20%** = working MVP tonight |
| Finals rule | Same team **and same core idea** |
| Ownership | "Who owns what I build? You do." |
| Language | FR or EN, your choice |

**The format has changed at least twice.**
- Oct 13 LinkedIn post: Nov 12–13, winners announced the next night.
- Luma page: top 5, 3-min demo, 2-min video, Nov 13–20.
- trimestre.ca now: top 3, Nov 13–19.

The site is the newest source. Confirm the demo length at kickoff.

---

## 2. What Onesheet is, and what that says about the judges

- **Product:** "the intelligence layer". Filings, MD&A, calls, decks and KPIs become one company profile, and **every number is sourced to its page**. Covers KPIs and segments for 1,000+ stocks and 5,000+ stocks overall, plus an entity graph and alternative data.
- **Manifesto:** "A company isn't a ticker. It's a system." "More than the same five ratios." "Built to be built on."
- **PRO platform pitch:** "Build your ultimate research stack: custom-built tools or from our library, in one workflow." That is the hackathon's tagline. **A winning tool probably looks like something that could live in Onesheet's tool library.**
- **Their homepage demo is Constellation Software (TSX: CSU),** the textbook Canadian serial acquirer:
  - Question: "Recurring organic growth fell to 2%. Is that the whole portfolio, or one vertical?"
  - Answer, from the Q2 2026 MD&A: **one vertical**. Altera, the hospital software business, is under 5% of revenue, but its recurring revenue fell 19%. The rest of Constellation held at +4%.
  - Uses CSU-specific metrics: FCFA2S (free cash flow available to shareholders), FX-adjusted organic growth, revenue split across Constellation, Topicus and Lumine.
  - **That is their idea of great research: a sharp question, drilled into sourced segment data, ending in an answer you wouldn't guess.** And the company is a Canadian serial acquirer.
- Onesheet PRO has a **free tier**. Signing up now is the fastest way to see what their data fields actually look like.

---

## 3. The indexes and their data feed

- Page: trimestre.ca/indexes. It isn't linked from the main site; registrants reached it through a Luma link.
- Mission line: **"Tonight's mission: complete these indexes with Canadian companies."**
- Raw feed: `trimestre.ca/data/indexes.json`, refreshed every 60 s. Snapshot saved at `data/indexes.json` (refresh with `npm run refresh-index`).
- Fields per holding: `ticker, country, countryCode, subSector, signal, signalDir, shares, marketValue, weightPct, pnlPct`.
- **Their "multi-signal tilt" signals are named in the feed:** Momentum, Low vol, Resilience, Value/Yield, Acquisition pace. Each one is tagged up or down.
- Every position's P&L is within ±3%, so the positions were opened recently. These indexes were built for this event.
- About $100k each, paper money (Alpaca Paper via SnapTrade). REITs: 85% invested, 15% cash. Serial acquirers: 82% invested, 18% cash.
- Weights cluster at the same values: REITs at 3.42% (five names), serial acquirers at about 8.2% (five names) and 2.05% (six names). That looks like optimizer bounds.

**Facts about the holdings that ChatGPT missed:**
- **WCN is labelled "United States", but Waste Connections is an Ontario corporation** headquartered in Woodbridge, Ontario (per its SEC filings), and listed on both the TSX and NYSE. Their acquirer index arguably already holds a Canadian company. **That makes "what counts as Canadian?" a real decision:** stock listing, incorporation, headquarters, or where the revenue comes from.
- **BSP = Bending Spoons** (Milan; owns Evernote, Vimeo, Eventbrite, AOL). It IPO'd on Nasdaq on July 1, 2026, and it is the **largest weight** in the acquirer index at 9.81%.
- The REIT index's "International" picks: IRS = IRSA (Argentina), LRE = Lead Real Estate (Japan).

---

## 4. Fact-check of the ChatGPT conversation

**Correct:**
- The event structure, top 3, 80/20 split and 20:45 code freeze.
- The index contents.
- A Polymarket probability is not "% of people who believe it".
- A generated basket is not an ETF.
- The per-share math example: $100M over 100M shares, versus $120M over 130M shares, is −7.7% per share.
- The catalyst valuation example: −20%.
- "The data must change the answer."

**Partly verified:** Autopilot does sell creator-run thematic portfolios, and "Photonics Is Next" by Michael Sikand appears on a third-party tracker. "AI Factories", "Modern Warfare" and "Space Economy" could not be confirmed. The overall verdict (belief marketplaces are crowded) still stands.

**Wrong or misleading:** It said the French site differed from the English one. They match. The differences are between Luma and the site.

**Missed entirely:**
- Onesheet's homepage is a serial-acquirer deep-dive on CSU.
- WCN is Canadian.
- BSP is Bending Spoons.
- The index's signal names are visible in the feed.
- Onesheet's "tool library" pitch mirrors the hackathon theme.

**Wasted time on:** Polymarket, belief marketplaces and catalyst models. None of them fit the actual mission.

---

## 5. Leading option: the serial-acquirer "X-ray" (final call at the 17:20 go / no-go)

**User:** whoever runs a thematic index. That is the organizers themselves, and the site's own example of a user who needs a tailored tool ("a thematic index").

**Question it answers:** *Which Canadian companies are real serial-acquirer compounders, and what would adding them do to this index?*

**Three steps on screen:**
1. **Map:** every Canadian candidate, plus the 15 existing holdings for reference, on one chart.
   - Across: how much growth is bought (acquisition spend as a share of operating cash flow).
   - Up: whether it reaches shareholders (growth in free cash flow per share).
   - Four zones: **Compounders · Empire builders · Organic growers · Stalled**.
2. **X-ray:** click a company and get an Onesheet-style drill-down.
   - Organic versus acquired growth, capital deployed, and how it was paid for (cash, debt or new shares).
   - The per-share result, with **every number linked to its source**.
3. **Complete the index:** choose additions and get the result.
   - Weights that follow the index's existing pattern.
   - Before/after: country mix, sub-sector mix, cash.
   - The names the tool **rejected, and why**.

**Why this direction:**
- It answers the mission exactly, for the exact user who is judging.
- It plays to Onesheet's data strengths (segments, organic growth, sourced numbers). Their own demo is a Canadian serial acquirer.
- The demo has a built-in "aha". The existing holdings are on the map too, so judges see the tool rate names they know. Then it surfaces a non-obvious Canadian compounder, rejects a famous "acquirer" that only got bigger, and flags that WCN is already Canadian.
- It has room to grow for the 80% portion:
  - the same engine on the REIT index, using REIT measures;
  - then any thematic index;
  - then a quarterly re-run that shows which holdings drifted.

**Main risk:** it needs acquisition spend, cash flow and share count for the Canadian names. Acquisition spend is a standard cash-flow-statement line, so it should be there. If organic growth isn't provided, drop that piece rather than estimate it.

**Fallback if 17:00 points elsewhere:** keep the same three-step shape and change the measures. For REITs:
- Across: leverage and refinancing risk.
- Up: same-property NOI growth, or AFFO-per-unit growth.

**Considered and set aside:**
- Plain "index completer" (screen + weights): every team will build it.
- Max's catalyst model: a good feature for finals week (e.g. "what if Altera keeps shrinking?"), but not the core of tonight.
- Belief baskets / Polymarket: they don't fit the mission.

---

## 5a. All the options considered

| Option | What it does | Why it could win | Why it could lose |
|---|---|---|---|
| 1. Simple screener | Filter Canadian stocks on basic measures and add the top ones | Easy, low risk | Most teams will build this; it's "the same five ratios" |
| **2. Serial-acquirer X-ray** (leading) | Shows whether acquisitions made each share worth more, or only made the company bigger | Same kind of analysis as Onesheet's own homepage; clear "aha"; their data changes the answer | Needs acquisition spend, share counts and cash flow in the data |
| 3. REIT stress test | An interest-rate slider shows which Canadian landlords hold up | Visual and interactive | REIT metrics are standard, so it's harder to go "beyond the ratios" |
| 4. Portfolio-fit lab | Uses daily prices to test whether a stock steadies the index or duplicates it | Matches their low-volatility method | Portfolio math, not company research; doesn't show off Onesheet's data |
| 5. Catalyst "what if" model | One company, one event, see the financial impact | Fits their single-stock example | Doesn't answer tonight's mission; better as a finals-week feature |

The repo is built so the **app shape stays the same** whichever option wins. Only `engine/config.ts` (metrics and map axes) changes.

## 6. Decisions to lock before 17:00 (recommendation in bold)

1. **Which index:** **Serial acquirers.** Switch to REITs only if the data reveal favours it.
2. **Who it's for:** **an index manager** (rather than a retail investor or an analyst).
3. **The one question:** **"Real compounder, or just getting bigger?"**
4. **What counts as Canadian:** **Canadian headquarters or incorporation, whatever the listing.** Show WCN as the example.
5. **Output:** **picks + weights + before/after + rejected list.**
6. **AI:** **none in the core tonight.** Add an "ask" box only if the data includes filing text.
7. **Stack:** **the one you two already ship fastest in.** Next.js + TypeScript if equal, since the 80% portion needs polish.
8. **Roles:** who owns the finance logic and who owns the UI and demo. Decide now.
9. **Pre-build:** **build the data-independent shell now:**
   - index loader from the public feed;
   - weight and before/after math;
   - page layout;
   - map chart.

   Nothing on the site forbids it. Mention it openly at kickoff.

---

## 7. Before 17:00

- [ ] Check the **Nov 9 registrant email** for Onesheet data or API details.
- [ ] Sign up for **Onesheet PRO (free)** and open CSU to see what fields exist.
- [ ] Lock the decisions in §6.
- [ ] Build the shell (§6.9).
- [ ] Laptop + charger.

**Ask at kickoff (four questions):**
1. One index or both?
2. Do you expect weights, or only picks?
3. Can we use outside data (filings, prices) alongside Onesheet?
4. How long is the demo, and is it live on a laptop?

**Check the moment data arrives (17:00–17:25):**
- Which Canadian names are included?
- Format: CSV or API?
- History depth.
- Are acquisition spend, operating cash flow, capex, share count, debt and organic growth there?
- Do source links exist?

---

## 8. Canadian names worth checking against the supplied list

From general knowledge, **not** from Onesheet. Only use names that are in the supplied universe.

**Serial acquirers**, with the closest existing holding in brackets:
- Constellation Software (CSU), Topicus (TOI), Lumine (LMN) — vertical-software acquirers [ROP, BSP]
- GFL Environmental (GFL) — waste consolidator [WCN]
- WSP Global (WSP), Stantec (STN) — engineering roll-ups [ACM, J]
- Alimentation Couche-Tard (ATD), TFI International (TFII) — Québec-based acquirers
- FirstService (FSV), Colliers (CIGI), Boyd Group (BYD), CCL Industries (CCL), Richelieu (RCH), Intact Financial (IFC)
- Dye & Durham (DND) — a counter-example to test whether the tool catches "bigger, not better"
- WCN itself — already in the index, labelled US

**REITs**, with the closest existing holdings in brackets:
- Granite (GRT.UN), Dream Industrial (DIR.UN) [PLD, REXR, EGP]
- CAPREIT (CAR.UN), Boardwalk (BEI.UN) [MAA, INVH]
- RioCan (REI.UN), Choice Properties (CHP.UN), SmartCentres (SRU.UN) [SPG, KIM, O]
- Allied Properties (AP.UN) [BXP]
