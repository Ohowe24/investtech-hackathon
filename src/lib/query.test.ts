import { describe, expect, it } from "vitest";
import { fromSearch, normalizeTicker, parseHoldingsText, resolveWeights, tickerFromLink, toSearch } from "./query";

describe("tickers", () => {
  it("normalizes exchange suffixes, prefixes and unit separators", () => {
    expect(normalizeTicker("csu.to")).toBe("CSU");
    expect(normalizeTicker("TSX:GRT.UN")).toBe("GRT.UN");
    expect(normalizeTicker("car-un")).toBe("CAR.UN");
    expect(normalizeTicker("CAR.UN.TO")).toBe("CAR.UN");
    expect(normalizeTicker("ccl b")).toBe("CCL.B");
    expect(normalizeTicker("toi.v")).toBe("TOI");
    expect(normalizeTicker("  ")).toBe("");
    expect(normalizeTicker("not a ticker!")).toBe("");
  });
});

describe("pasted holdings", () => {
  it("reads lists, weights and spreadsheet pairs, and drops duplicates", () => {
    const { entries, rejected } = parseHoldingsText("EGP 10.76\nO:10.39%\nPLD, spg; EGP\nDLR\t6.99%");
    expect(entries).toEqual([
      { ticker: "EGP", weightPct: 10.76 },
      { ticker: "O", weightPct: 10.39 },
      { ticker: "PLD" },
      { ticker: "SPG" },
      { ticker: "DLR", weightPct: 6.99 },
    ]);
    expect(rejected).toEqual([]);
  });
  it("splits space-separated tickers but keeps unit classes together", () => {
    expect(parseHoldingsText("EGP O PLD").entries.map((e) => e.ticker)).toEqual(["EGP", "O", "PLD"]);
    expect(parseHoldingsText("CAR UN").entries.map((e) => e.ticker)).toEqual(["CAR.UN"]);
  });
  it("reports what it cannot read", () => {
    expect(parseHoldingsText("EGP, ???").rejected).toEqual(["???"]);
  });
});

describe("weights", () => {
  it("keeps typed weights; cash is the rest", () => {
    const r = resolveWeights([{ ticker: "A", weightPct: 60 }, { ticker: "B", weightPct: 30 }], 99);
    expect(r).toMatchObject({ ok: true, weights: { A: 60, B: 30 }, cashPct: 10 });
  });
  it("splits the rest equally among blanks", () => {
    const r = resolveWeights([{ ticker: "A", weightPct: 20 }, { ticker: "B" }, { ticker: "C" }], 10);
    expect(r).toMatchObject({ ok: true, weights: { A: 20, B: 35, C: 35 }, cashPct: 10 });
  });
  it("refuses more than 100%", () => {
    expect(resolveWeights([{ ticker: "A", weightPct: 70 }, { ticker: "B", weightPct: 40 }], 0).ok).toBe(false);
    expect(resolveWeights([{ ticker: "A", weightPct: 95 }, { ticker: "B" }], 10).ok).toBe(false);
    expect(resolveWeights([], 10).ok).toBe(false);
  });
});

describe("address", () => {
  it("round-trips a query", () => {
    const q = { industry: "reits", holdings: [{ ticker: "CAR.UN", weightPct: 3.42 }, { ticker: "O" }], cashPct: 14.62, value: 99721.75 };
    expect(fromSearch(Object.fromEntries(new URLSearchParams(toSearch(q))))).toEqual(q);
  });
  it("needs an industry; holdings are optional", () => {
    expect(fromSearch({ industry: "reits" })?.holdings).toEqual([]);
    expect(fromSearch({ h: "O" })).toBeNull();
  });
});

describe("quote links", () => {
  it("reads the ticker out of common quote page links", () => {
    expect(tickerFromLink("https://finance.yahoo.com/quote/CSU.TO/")).toBe("CSU");
    expect(tickerFromLink("https://www.google.com/finance/quote/GRT.UN:TSE?hl=en")).toBe("GRT.UN");
    expect(tickerFromLink("https://money.tmx.com/en/quote/CAR.UN")).toBe("CAR.UN");
    expect(tickerFromLink("https://example.com/chart?symbol=TSX:TFII")).toBe("TFII");
    expect(tickerFromLink("www.marketwatch.com/investing/stock/tfii?countrycode=ca")).toBe("TFII");
    expect(tickerFromLink("CSU")).toBe("");
  });
  it("accepts links pasted with plain tickers", () => {
    const { entries } = parseHoldingsText("https://finance.yahoo.com/quote/CSU.TO, TOI\nhttps://money.tmx.com/en/quote/CAR.UN");
    expect(entries.map((e) => e.ticker)).toEqual(["CSU", "TOI", "CAR.UN"]);
  });
});

describe("optional holdings", () => {
  it("round-trips a query with no holdings", () => {
    const q = fromSearch(Object.fromEntries(new URLSearchParams(toSearch({ industry: "reits", holdings: [] }))));
    expect(q).toEqual({ industry: "reits", holdings: [], cashPct: undefined, value: undefined });
  });
});

describe("more candidates flag", () => {
  it("survives the address round trip, and is absent by default", () => {
    const q = { industry: "acquirers", holdings: [{ ticker: "AME" }], more: true };
    const back = fromSearch(Object.fromEntries(new URLSearchParams(toSearch(q))));
    expect(back?.more).toBe(true);
    expect(fromSearch({ industry: "acquirers" })?.more).toBeUndefined();
  });
});
