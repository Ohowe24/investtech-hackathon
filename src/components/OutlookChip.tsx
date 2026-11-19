"use client";

// A small Outlook engine chip (tailwind + direction) for the companies the engine reads (data/outlook.json).
// The tailwind is scored (10-point score part and the "Industries growing ≥ the economy" check). Formats engine fields; no math.

import type { Direction, OutlookCompany, OutlookData, Trend } from "@contract/outlook";
import outlookJson from "@data/outlook.json";

const outlook = outlookJson as unknown as OutlookData;
const byTicker = new Map(outlook.companies.map((c) => [c.ticker, c]));

export const outlookFor = (ticker: string): OutlookCompany | null => byTicker.get(ticker) ?? null;

const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const ARROW: Record<Direction, string> = { toward: "↗", steady: "→", away: "↘" };
const WORD: Record<Direction, string> = { toward: "toward stronger", steady: "steady", away: "toward weaker" };
const TREND_CLS: Record<Trend, string> = { growing: "text-teal", stable: "text-warn", declining: "text-bad" };

/** Links to the Outlook tab with this company selected. Renders nothing for a company the engine does not read. */
export default function OutlookChip({ ticker, size = "sm" }: { ticker: string; size?: "sm" | "md" }) {
  const c = outlookFor(ticker);
  if (!c) return null;
  const title =
    `Outlook engine. Tailwind (scored, 10 points + one check): ${pct(c.tailwind)} a year after inflation, its industries' outlook weighted by revenue` +
    `${c.trend ? ` (${c.trend} vs the whole economy at ${pct(outlook.economy.outlook)})` : ""}. ` +
    (c.featured ? `Direction of recent deals: ${c.direction ? WORD[c.direction] : "not enough deals to say"}. Click for the detail.` : "Read for the stock score: revenue mix and tailwind.");
  return (
    <a
      href={`#outlook/${encodeURIComponent(ticker)}`}
      onClick={(e) => {
        // inside clickable table rows: open the Outlook tab, not the row's company page; land at the top like the tab buttons
        e.stopPropagation();
        requestAnimationFrame(() => window.scrollTo({ top: 0 }));
      }}
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-[var(--panel-hi)] font-medium text-muted transition-colors hover:border-ink hover:text-ink ${size === "md" ? "px-3 py-1.5 text-xs" : "px-1.5 py-0.5 text-[10.5px]"}`}
    >
      <span className="uppercase tracking-wide text-faint">Outlook</span>
      <span className={`font-mono font-semibold ${c.trend ? TREND_CLS[c.trend] : "text-ink"}`}>{pct(c.tailwind)}</span>
      {c.featured && (
        <>
          <span className="text-faint">·</span>
          <span className="text-ink">
            {c.direction ? <><span aria-hidden>{ARROW[c.direction]}</span> {WORD[c.direction]}</> : <span className="text-faint">no direction</span>}
          </span>
        </>
      )}
    </a>
  );
}
