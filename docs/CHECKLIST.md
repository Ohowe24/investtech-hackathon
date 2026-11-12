# Tonight's checklist

## Before 17:00
- [ ] Both laptops: repo cloned, `npm install`, `npm run dev` shows the FAKE banner + map
- [ ] Max has push access to the GitHub repo
- [ ] Check the Nov 9 registrant email for Onesheet data / API details
- [ ] Max: Onesheet PRO free account; open CSU + 3 Canadian names; note which fields exist
- [ ] Oscar: check Claude plan usage; close other Claude sessions on the Mac
- [ ] Vercel connected to the repo (vercel.com/new → import `investtech-hackathon`)
- [ ] Laptops charged, chargers packed

## At kickoff: ask the organizers
1. One index or both?
2. Do you expect weights, or only picks?
3. Can we use outside data (filings, prices) alongside Onesheet?
4. How long is the demo, and is it live on a laptop?
5. Is code we prepared before 17:25 OK? (Say openly that we prepped a skeleton.)

## 17:00–17:20: does the data have it? (Max)
- [ ] Which Canadian companies are in the list?
- [ ] Format: CSV / API / both? How many years of history?
- [ ] Revenue · operating cash flow · capex
- [ ] **Acquisition spending** (cash paid for acquisitions)
- [ ] **Diluted share count** per year
- [ ] Debt · cash
- [ ] Organic growth (reported)
- [ ] Source links / page references
- [ ] Real-estate KPIs (occupancy, NOI, FFO/AFFO, debt maturities), in case REITs win

## 17:20 go / no-go (together, 5 minutes)
- **Serial-acquirer fields present for Canadian names** → keep `engine/config.ts` as is.
- **Mostly real-estate data** → switch `engine/config.ts` to REIT metrics and set `indexName` to "REITs across borders".
- **The challenge is something else** → keep the shape (question → map → click-in → complete the index) and change the metrics.
- Pick 6–10 Canadian candidates and 3–5 existing holdings as reference points.

## Before the demo
- [ ] `isFake` is false (banner gone)
- [ ] Every number on the demo path checked against its source
- [ ] Live on Vercel; URL works on a phone too
- [ ] Backup screen recording
- [ ] Rehearsed twice, timed
