import { describe, expect, it } from "vitest";
import { CueStream, parseTag } from "./cues";

describe("parseTag", () => {
  it("reads a cue and its attributes", () => {
    expect(parseTag('point ticker="CSU" caption="Top pick"/')).toEqual({ kind: "point", attrs: { ticker: "CSU", caption: "Top pick" } });
    expect(parseTag("clear/")).toEqual({ kind: "clear", attrs: {} });
  });
  it("ignores anything that isn't a cue", () => {
    expect(parseTag("b")).toBeNull();
    expect(parseTag(" 3x leverage ")).toBeNull();
  });
});

describe("CueStream", () => {
  it("splits text and cues in order, even across chunks", () => {
    const s = new CueStream();
    const out = [
      ...s.feed("Here is the map. <go pa"),
      ...s.feed('ge="map"/> Constellation sits top right.'),
      ...s.flush(),
    ];
    expect(out).toEqual([
      { text: "Here is the map. " },
      { cue: { kind: "go", attrs: { page: "map" } } },
      { text: " Constellation sits top right." },
    ]);
  });

  it("lets a stray < in prose through", () => {
    const s = new CueStream();
    expect([...s.feed("Debt is < 3 times EBITDA, so it passes."), ...s.flush()].map((p) => ("text" in p ? p.text : "")).join("")).toBe("Debt is < 3 times EBITDA, so it passes.");
  });
});
