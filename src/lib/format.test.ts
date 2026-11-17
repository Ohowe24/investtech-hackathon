import { describe, expect, it } from "vitest";
import { listNames } from "./format";

describe("listNames", () => {
  it("joins short lists in plain English", () => {
    expect(listNames([])).toBe("");
    expect(listNames(["A"])).toBe("A");
    expect(listNames(["A", "B"])).toBe("A and B");
    expect(listNames(["A", "B", "C"])).toBe("A, B and C");
  });

  it("names at most `max` and counts the rest", () => {
    const ten = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
    expect(listNames(ten, 3)).toBe("A, B, C and 7 more");
    expect(listNames(ten, 1)).toBe("A and 9 more");
    expect(listNames(["A", "B", "C"], 3)).toBe("A, B and C");
  });
});
