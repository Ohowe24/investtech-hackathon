// Onesheet annual statements (income, balance, cash flow responses) -> one row per fiscal year.
// Pure, shared by engine/make-inputs.ts (writes financials.csv) and the server's live fetch for holdings that
// are not cached (src/lib/server/live.ts), so a company's figures are the same whichever way they arrive.
// No number is computed here except flipping the sign of outflows: the API reports cash spent as negative.

export type StatementRow = Record<string, unknown>;

export interface YearFromStatements {
  year: number;
  currency: string;
  revenue: number | null;
  ocf: number | null;
  capex: number | null;
  acquisitions: number | null;
  shares: number | null;
  debt: number | null;
  cash: number | null;
  equity: number | null;
  ebitda: number | null;
  goodwill: number | null;
  assets: number | null;
  periodEnd: string;
  sourceId: string;
  sourceLabel: string;
}

const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const flip = (v: unknown) => (n(v) == null ? null : -(v as number));

export function yearsFromStatements(ticker: string, symbol: string, income: StatementRow[], balance: StatementRow[], cash: StatementRow[], labelSuffix = ""): YearFromStatements[] {
  const years = [...new Set(income.map((r) => String(r.date).slice(0, 4)))].sort();
  return years.map((y) => {
    const inc = income.find((r) => String(r.date).startsWith(y));
    const bal = balance.find((r) => String(r.date).startsWith(y));
    const cf = cash.find((r) => String(r.date).startsWith(y));
    return {
      year: Number(y),
      currency: String(inc?.reportedCurrency ?? bal?.reportedCurrency ?? cf?.reportedCurrency ?? ""),
      revenue: n(inc?.revenue),
      ocf: n(cf?.operatingCashFlow),
      capex: flip(cf?.capitalExpenditure),
      acquisitions: flip(cf?.acquisitionsNet),
      shares: n(inc?.weightedAverageShsOutDil),
      debt: n(bal?.totalDebt),
      cash: n(bal?.cashAndCashEquivalents),
      equity: n(bal?.totalEquity),
      ebitda: n(inc?.ebitda),
      goodwill: n(bal?.goodwill),
      assets: n(bal?.totalAssets),
      periodEnd: String(inc?.date ?? ""),
      sourceId: `os-${ticker}-FY${y}`,
      sourceLabel: `Onesheet API · ${symbol} annual statements, FY${y}${labelSuffix}`,
    };
  });
}
