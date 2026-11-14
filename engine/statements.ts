// Helpers that read statement rows. Industry-neutral: used by build.ts and by industry profiles.

import type { FinRow } from "./industries/types";
import { cashReturnOnCapital, freeCashFlow } from "./metrics";

/** Cash return for one year: needs that year's FCF and the balance sheets at both ends of it. */
export function cashReturnFor(rows: FinRow[], i: number): number | null {
  const r = rows[i];
  const prev = rows[i - 1];
  if (!r || !prev || r.year - prev.year !== 1) return null;
  return cashReturnOnCapital(freeCashFlow(r.ocf, r.capex), prev.debt, prev.equity, r.debt, r.equity);
}
