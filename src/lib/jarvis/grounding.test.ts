import { describe, expect, it } from "vitest";
import { forSpeech, Ground, numbersIn, takeSentences } from "./grounding";

describe("numbersIn", () => {
  it("reads percents, multiples, money and ignores ticker chips", () => {
    expect(numbersIn("[[X1]] grew 34.2% at 1.5× and paid $1,234")).toEqual([34.2, 1.5, 1234]);
  });
});

describe("Ground", () => {
  const g = new Ground();
  g.add(JSON.stringify({ value: "34.25%", weight: "0.83%", debt: "1.5×", rank: "3 of 19" }));

  it("accepts exact and simply rounded figures", () => {
    expect(g.unverified("It grew 34.25% a year.")).toEqual([]);
    expect(g.unverified("It grew about 34.3% a year.")).toEqual([]);
    expect(g.unverified("Roughly 34% a year, weight 0.83%.")).toEqual([]);
  });

  it("flags a figure that traces to nothing", () => {
    expect(g.unverified("It grew 41.7% a year.")).toEqual([41.7]);
  });

  it("lets small counting words through but not small financial figures", () => {
    expect(g.unverified("Two things matter, and it passed 4 checks.")).toEqual([]);
    expect(g.unverified("Debt is 2 times EBITDA.")).toEqual([2]);
    expect(g.unverified("It returns 7% a year.")).toEqual([7]);
  });
});

describe("takeSentences", () => {
  it("does not split decimals, initials or abbreviations", () => {
    const { sentences, rest } = takeSentences("Weight is 4.1% in the U.S. market, e.g. like peers. Next one! And a half");
    expect(sentences).toEqual(["Weight is 4.1% in the U.S. market, e.g. like peers.", "Next one!"]);
    expect(rest).toBe(" And a half");
  });

  it("waits when the buffer ends on a period", () => {
    expect(takeSentences("It is 4.").sentences).toEqual([]);
  });

  it("splits on new lines", () => {
    expect(takeSentences("• First point\n• Second point\n").sentences).toEqual(["• First point", "• Second point"]);
  });
});

describe("forSpeech", () => {
  it("speaks names, not chips, and words, not symbols", () => {
    expect(forSpeech("**[[CSU]]** has net debt at 0.4× FCF", { CSU: "Constellation Software" })).toBe(
      "Constellation Software has net debt at 0.4 times free cash flow",
    );
  });
});
