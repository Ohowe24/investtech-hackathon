// Portfolio math for "complete the index": before/after weights, cash, country mix.
// Weights are percentages of total index value (positions + cash = 100).

import type { IndexDef } from "@contract/types";

export interface Addition {
  ticker: string;
  name: string;
  weightPct: number;
  countryCode: string;
  subSector?: string;
}

export interface Row {
  ticker: string;
  weightPct: number;
  countryCode: string;
  subSector?: string;
  isAddition: boolean;
}

export interface IndexState {
  rows: Row[];
  cashPct: number;
}

export interface CountryRelabel {
  ticker: string;
  labelled: string;
  actual: string;
}

/**
 * Builds before/after states. Additions are funded from cash first; if cash runs out,
 * existing positions are trimmed proportionally. `countryOverrides` lets our data
 * correct the organizers' country labels (ticker -> ISO-2).
 */
export function completeIndex(
  index: IndexDef,
  additions: Addition[],
  countryOverrides: Record<string, string> = {},
): { before: IndexState; after: IndexState; relabels: CountryRelabel[] } {
  const relabels: CountryRelabel[] = [];
  const existing: Row[] = index.positions.map((p) => {
    const actual = countryOverrides[p.ticker];
    if (actual && actual !== p.countryCode) relabels.push({ ticker: p.ticker, labelled: p.countryCode, actual });
    return {
      ticker: p.ticker,
      weightPct: p.weightPct,
      countryCode: actual ?? p.countryCode,
      subSector: p.subSector,
      isAddition: false,
    };
  });

  const invested = existing.reduce((s, r) => s + r.weightPct, 0);
  const addTotal = additions.reduce((s, a) => s + a.weightPct, 0);
  let cashAfter = index.cashPct - addTotal;
  let scale = 1;
  if (cashAfter < 0) {
    const shortfall = -cashAfter;
    cashAfter = 0;
    scale = invested > 0 ? Math.max(0, (invested - shortfall) / invested) : 0;
  }

  const afterRows: Row[] = [
    ...existing.map((r) => ({ ...r, weightPct: r.weightPct * scale })),
    ...additions.map((a) => ({
      ticker: a.ticker,
      weightPct: a.weightPct,
      countryCode: a.countryCode,
      subSector: a.subSector,
      isAddition: true,
    })),
  ];

  return {
    before: { rows: existing, cashPct: index.cashPct },
    after: { rows: afterRows, cashPct: cashAfter },
    relabels,
  };
}

/** Share of total index value by country (cash excluded), sorted largest first. */
export function countryMix(state: IndexState): { code: string; pct: number }[] {
  const totals = new Map<string, number>();
  for (const r of state.rows) totals.set(r.countryCode, (totals.get(r.countryCode) ?? 0) + r.weightPct);
  return [...totals.entries()].map(([code, pct]) => ({ code, pct })).sort((a, b) => b.pct - a.pct);
}

export function sharePct(state: IndexState, countryCode: string): number {
  return state.rows.filter((r) => r.countryCode === countryCode).reduce((s, r) => s + r.weightPct, 0);
}

/** Money a weight buys at the index's current total value. */
export function amountFor(weightPct: number, totalValue: number): number {
  return (weightPct / 100) * totalValue;
}
