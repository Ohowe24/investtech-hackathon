import { describe, expect, it } from "vitest";
import type { Company, MetricDef } from "@contract/types";
import { ordinal, ranking } from "./rank";

const co = (ticker: string, value: number | null) => ({ ticker, metrics: { m: { value, sourceIds: [] } } }) as unknown as Company;
const def = (higherIsBetter?: boolean) => ({ id: "m", label: "m", unit: "pct", description: "", higherIsBetter }) as MetricDef;

describe("ranking", () => {
  const list = [co("A", 0.1), co("B", null), co("C", 0.3), co("D", -0.2)];
  it("puts the highest first by default, missing last", () => {
    expect(ranking(list, def(true)).map((c) => c.ticker)).toEqual(["C", "A", "D", "B"]);
    expect(ranking(list, def()).map((c) => c.ticker)).toEqual(["C", "A", "D", "B"]);
  });
  it("puts the lowest first when lower is better, missing last", () => {
    expect(ranking(list, def(false)).map((c) => c.ticker)).toEqual(["D", "A", "C", "B"]);
  });
});

describe("ordinal", () => {
  it("handles teens and endings", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 20, 21, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "20th", "21st", "22nd"]);
  });
});
