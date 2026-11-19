"use client";

// The Outlook engine tab (#outlook). Reads data/outlook.json (npm run outlook). Plan: docs/OUTLOOK_ENGINE.md.
// Rules and formulas: engine/methodology.md ("Outlook engine"). This file only formats what the engine computed.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type {
  Direction,
  OutlookCompany,
  OutlookData,
  OutlookDeal,
  OutlookIndustry,
  OutlookLens,
  OutlookMixShift,
  OutlookSignal,
  StepStatus,
  Trend,
} from "@contract/outlook";
import outlookJson from "@data/outlook.json";
import { Card } from "./ui";
import OutlookReplay from "./live/OutlookReplay";
import { primeSound } from "./live/sound";
import { prefersReducedMotion } from "./live/motion";

const outlook = outlookJson as unknown as OutlookData;
/** the five companies read on every layer; the others are read for the stock score only */
const FEATURED = outlook.companies.filter((c) => c.featured);
const industryOf = new Map(outlook.industries.map((i) => [i.naics, i]));
const sourceOf = new Map(outlook.sources.map((s) => [s.id, s]));
const R = outlook.rules;

// ---------------------------------------------------------------- formatting (no math beyond display rounding)

const pct = (v: number | null | undefined, digits = 1) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);
// display rounding only: a gap that rounds to 0.0 shows without a sign
const pts = (v: number | null | undefined) =>
  v == null ? "—" : Math.abs(v) < 0.0005 ? "0.0 pt" : `${v > 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)} pt`;

const TREND: Record<Trend, { label: string; cls: string }> = {
  growing: { label: "Growing", cls: "bg-tealsoft text-teal" },
  stable: { label: "Stable", cls: "bg-warnsoft text-warn" },
  declining: { label: "Declining", cls: "bg-badsoft text-bad" },
};

const DIRECTION: Record<Direction, { arrow: string; label: string; cls: string }> = {
  toward: { arrow: "↗", label: "Toward stronger industries", cls: "text-teal" },
  steady: { arrow: "→", label: "Steady", cls: "text-ink" },
  away: { arrow: "↘", label: "Toward weaker industries", cls: "text-bad" },
};

const STATUS: Record<StepStatus, { label: string; cls: string }> = {
  done: { label: "Done", cls: "bg-tealsoft text-teal" },
  "in-progress": { label: "In progress", cls: "bg-warnsoft text-warn" },
  planned: { label: "Planned", cls: "bg-line text-muted" },
};

const LABEL_TAG: Record<OutlookDeal["labelStatus"], { label: string; cls: string }> = {
  approved: { label: "Approved", cls: STATUS.done.cls },
  proposed: { label: "Proposed", cls: STATUS["in-progress"].cls },
  unlabelled: { label: "Not labelled", cls: STATUS.planned.cls },
};

function TrendPill({ trend }: { trend: Trend | null }) {
  if (!trend) return <span className="text-faint">—</span>;
  return <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${TREND[trend].cls}`}>{TREND[trend].label}</span>;
}

function DirectionMark({ direction, big = false }: { direction: Direction | null; big?: boolean }) {
  if (!direction) return <span className="text-faint">—</span>;
  const d = DIRECTION[direction];
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${d.cls}`}>
      <span className={big ? "text-[26px] leading-none" : "text-[17px] leading-none"} aria-hidden>
        {d.arrow}
      </span>
      <span className={big ? "text-[14px]" : "text-[12.5px]"}>{d.label}</span>
    </span>
  );
}

type LensKey = "own" | "customer";

const LENSES: { key: LensKey; label: string; sub: string; explain: string }[] = [
  {
    key: "own",
    label: "What they do",
    sub: "their own industries",
    explain: "Each business is read by the industry it is in: software, engineering, trucking, construction.",
  },
  {
    key: "customer",
    label: "Who they sell to",
    sub: "their clients’ markets",
    explain:
      "Each business is read by the markets its clients are in: utilities, hospitals, governments. No client split reported: the whole economy. Transport and construction: same as what they do.",
  },
];

/** the company read through one lens; "own" is assembled from the company's own fields, no math */
function viewOf(c: OutlookCompany, lens: LensKey): OutlookLens {
  if (lens === "customer") return c.customer;
  return {
    base: "segments",
    tailwind: c.tailwind,
    coverage: c.coverage,
    trend: c.trend,
    decliningShare: c.decliningShare,
    dealOutlook: c.dealOutlook,
    dealCoverage: 0,
    directionGap: c.directionGap,
    direction: c.direction,
    industryMix: c.industryMix,
    mixShift: c.mixShift,
    notes: c.directionNotes,
  };
}

function dealLine(c: OutlookCompany, lens: LensKey): string {
  if (lens === "own") return `${c.dealsWithOutlook} of ${c.dealCount} with an industry`;
  if (c.customer.base === "same") return "same as “What they do”";
  return `${pct(c.customer.dealCoverage, 0)} of deals name a market`;
}

/** one-line verdict, assembled only from computed fields */
function verdict(v: OutlookLens, lens: LensKey): string {
  const what = lens === "own" ? "industries" : "markets";
  if (v.tailwind == null)
    return lens === "own" ? "Not enough published data to judge its industries." : "Not enough is reported about its clients’ markets to judge them.";
  const t = v.trend === "growing" ? "faster than the economy" : v.trend === "stable" ? "growing, but slower than the economy" : "shrinking";
  const where =
    lens === "customer" && v.base === "economy"
      ? "Sells across the whole economy (revenue by client market is not reported)"
      : `${lens === "own" ? "Earns its money in industries" : "Sells to markets"} ${t}`;
  if (v.direction == null) return `${where}. Too few recent deals name ${lens === "own" ? "an industry" : "a client market"} to call a direction.`;
  if (v.direction === "steady") return `${where}, and keeps buying into ${what} of the same strength.`;
  return `${where}; recent deals point toward ${v.direction === "toward" ? "stronger" : "weaker"} ${what}.`;
}

/** one control for everything below it: the table, the chart, the company detail and the signals */
function LensBar({ lens, onChange }: { lens: LensKey; onChange: (l: LensKey) => void }) {
  const active = LENSES.find((l) => l.key === lens)!;
  return (
    <section className="panel grid items-center gap-4 px-5 py-4 md:grid-cols-[auto_minmax(0,1fr)] md:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="kicker">Read each company by</span>
        <div className="inline-flex rounded-xl border border-line bg-soft p-1" role="tablist" aria-label="Read each company by">
          {LENSES.map((l) => {
            const on = lens === l.key;
            return (
              <button key={l.key} role="tab" aria-selected={on} onClick={() => onChange(l.key)}
                className={`rounded-lg px-3.5 py-1.5 text-left transition-[background-color,color,box-shadow] duration-200 ${on ? "bg-[var(--panel-solid)] text-ink shadow-[0_1px_0_0_var(--color-line),0_0_0_1px_var(--color-line)]" : "text-muted hover:text-ink"}`}>
                <span className="block text-[13px] font-semibold leading-tight">{l.label}</span>
                <span className={`block text-[11px] leading-tight ${on ? "text-teal" : "text-faint"}`}>{l.sub}</span>
              </button>
            );
          })}
        </div>
      </div>
      {/* fixed height so switching never moves the page */}
      <p key={lens} className="a-fade min-h-[36px] text-[12.5px] leading-snug text-muted md:border-l md:border-line md:pl-5">{active.explain}</p>
    </section>
  );
}

function TailwindCell({ v, lens }: { v: OutlookLens; lens: LensKey }) {
  const economyBase = lens === "customer" && v.base === "economy";
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[14px] font-semibold text-ink">{pct(v.tailwind)}</span>
        {economyBase ? <span className="text-[11px] text-faint">whole economy</span> : <TrendPill trend={v.trend} />}
      </div>
      <div className="text-[11.5px] text-faint">{economyBase ? "client mix not reported" : v.coverage != null ? `${pct(v.coverage, 0)} of revenue covered` : ""}</div>
    </>
  );
}

// ---------------------------------------------------------------- page

export default function OutlookEngine({ initial }: { initial?: string }) {
  const [ticker, setTicker] = useState(initial && FEATURED.some((c) => c.ticker === initial) ? initial : (FEATURED[0]?.ticker ?? ""));
  const [lens, setLens] = useState<LensKey>("own");
  const company = FEATURED.find((c) => c.ticker === ticker) ?? FEATURED[0];
  const economy = outlook.economy.outlook;
  // The engine run: plays the first time the tab opens in a browser session, and on "Run the engine".
  // Everything it shows is already in data/outlook.json (built by npm run outlook); only the pacing is staged.
  const [runs, setRuns] = useState(0);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    const autoplay = () => {
      let seen = false;
      try {
        seen = window.sessionStorage.getItem("outlook-run") === "1";
        window.sessionStorage.setItem("outlook-run", "1");
      } catch {}
      if (!seen && !prefersReducedMotion()) {
        setRuns(1);
        setRunning(true);
      }
    };
    autoplay();
  }, []);
  const runEngine = () => {
    if (prefersReducedMotion()) return;
    primeSound();
    setRuns((n) => n + 1);
    setRunning(true);
  };

  return (
    <div className="enter space-y-5">
      {/* portal: the tab's entrance animation makes a containing block, so a fixed overlay must sit on <body> */}
      {running && createPortal(<OutlookReplay outlook={outlook} runNo={runs} onDone={() => setRunning(false)} />, document.body)}
      <section className="scan-once panel px-6 py-7 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="kicker flex items-center gap-2">
            <span className="live-dot" /> Outlook engine · serial acquirers
          </div>
          <button onClick={runEngine} title="Replay the Outlook engine run"
            className="group flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-muted transition-colors hover:border-teal hover:text-ink">
            <span className="inline-block transition-transform duration-500 group-hover:rotate-180">⟳</span> Run the engine
          </button>
        </div>
        <div className="mt-3 grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <h1 className="text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink md:text-[38px]">Are they buying into the right industries?</h1>
            <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-muted">
              Where each acquirer’s industries are heading, and whether its new deals lean toward stronger or weaker ones.
            </p>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-line rounded-xl border border-line">
            <HeaderStat value={pct(economy)} label="economy: the bar for “growing”" />
            <HeaderStat value="10 pts" label="+ 1 check in the stock score" />
            <HeaderStat value={`${outlook.companies.length}`} label={`companies · ${outlook.industries.length} industries`} />
          </dl>
        </div>
        <p className="mt-4 text-[11.5px] text-faint">Published sources only · after inflation · not backtested · not investment advice</p>
      </section>

      <FeaturedCards economy={economy} selected={company.ticker} onSelect={setTicker} />

      <AllCompanies economy={economy} focus={initial && !FEATURED.some((c) => c.ticker === initial) ? initial : null} />

      <LensBar lens={lens} onChange={setLens} />

      <Card title="The answer, company by company" right={<span className="text-[12px] text-faint">{LENSES.find((l) => l.key === lens)!.label} · {LENSES.find((l) => l.key === lens)!.sub}</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] table-fixed text-left text-[13px]">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[22%]" />
              <col className="w-[14%]" />
              <col className="w-[20%]" />
              <col className="w-[22%]" />
            </colgroup>
            <thead className="text-[11px] uppercase tracking-wide text-faint">
              <tr>
                <th className="py-2 pr-3 font-medium">Company</th>
                <th className="py-2 pr-3 font-medium">Tailwind</th>
                <th className="py-2 pr-3 font-medium">In declining</th>
                <th className="py-2 pr-3 font-medium">Recent deals</th>
                <th className="py-2 pr-3 font-medium">Direction</th>
              </tr>
            </thead>
            <tbody key={lens} className="a-fade">
              {FEATURED.map((c) => {
                const v = viewOf(c, lens);
                return (
                <tr
                  key={c.ticker}
                  onClick={() => setTicker(c.ticker)}
                  aria-selected={c.ticker === company.ticker}
                  className={`cursor-pointer border-t border-line align-middle transition-colors ${c.ticker === company.ticker ? "bg-soft" : "hover:bg-soft"}`}
                >
                  <td className="py-2.5 pr-3">
                    <div className="font-semibold text-ink">{c.ticker}</div>
                    <div className="text-[12px] text-muted">{c.name}</div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <TailwindCell v={v} lens={lens} />
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className={`font-mono ${v.decliningShare ? "font-semibold text-bad" : "text-muted"}`}>{pct(v.decliningShare, 0)}</span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="font-mono text-ink">{pct(v.dealOutlook)}</div>
                    <div className="truncate text-[11.5px] text-faint" title={dealLine(c, lens)}>{dealLine(c, lens)}</div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <DirectionMark direction={v.direction} />
                    {v.directionGap != null && <div className="text-[11.5px] text-faint">{pts(v.directionGap)} vs tailwind</div>}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-faint">
          All rates are yearly growth after inflation. Tailwind: each industry’s outlook weighted by the company’s revenue in it. Recent deals:
          fiscal {R.dealYears[0]}–{R.dealYears[2]}, each deal counted once. Direction is steady within ±{(R.directionBand * 100).toFixed(0)} point.
          Click a company for the detail.
        </p>
      </Card>

      <Card title="Tailwind and direction at a glance" right={<span className="text-[12px] text-faint">{LENSES.find((l) => l.key === lens)!.label}</span>}>
        <div key={lens} className="a-fade">
          <GapChart lens={lens} economy={economy} selected={company.ticker} onSelect={setTicker} />
        </div>
      </Card>

      <div id="outlook-detail" key={`${lens}-${company.ticker}`} className="a-fade scroll-mt-20 space-y-5">
        <CompanyDetail c={company} economy={economy} lens={lens} />
        <SignalTable c={company} lens={lens} />
      </div>

      <Card title="Sources">
        <ul className="space-y-2 text-[13px]">
          {outlook.sources.map((s) => (
            <li key={s.id} className="flex items-start gap-3">
              <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${s.status === "fetched" ? STATUS.done.cls : STATUS.planned.cls}`}>
                {s.status === "fetched" ? "In use" : "Planned"}
              </span>
              <span>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink">
                    {s.label}
                  </a>
                ) : (
                  <span className="text-ink">{s.label}</span>
                )}
                {s.detail && <span className="block text-[12px] text-faint">{s.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-faint">Built {outlook.generatedAt.slice(0, 10)} by <code>npm run outlook</code>. Formulas: engine/metrics.ts; rules: engine/methodology.md.</p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- company detail

function CompanyDetail({ c, economy, lens }: { c: OutlookCompany; economy: number | null; lens: LensKey }) {
  const [showAll, setShowAll] = useState(false);
  const v = viewOf(c, lens);
  const client = lens === "customer" && v.base !== "same";
  const deals = outlook.deals.filter((d) => d.ticker === c.ticker);
  const recent = deals.filter((d) => d.recent);
  const maxShare = Math.max(0, ...v.industryMix.map((g) => g.share ?? 0));
  const notes = [...v.notes, ...c.notes];
  const inGroup = (code: string) => (r: OutlookCompany["mix"][number]) =>
    !client ? r.naics === code : code === "economy" ? true : (r.market ?? "") === code;

  return (
    <div className="space-y-5">
      <section className="panel px-6 py-6 md:px-8">
        <div className="kicker">{c.ticker} · {c.name}</div>
        <p className="mt-2 max-w-3xl text-[18px] font-semibold leading-snug tracking-[-0.01em] text-ink">{verdict(v, lens)}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Stat
            label={lens === "own" ? "Tailwind" : "Clients’ markets"}
            value={pct(v.tailwind)}
            sub={lens === "customer" && v.base === "economy" ? <>the whole economy (client mix not reported)</> : <>vs economy {pct(economy)} · <TrendPill trend={v.trend} /></>}
          />
          <Stat label={`Recent deals (FY${R.dealYears[0]}–${R.dealYears[2]})`} value={pct(v.dealOutlook)} sub={dealLine(c, lens)} />
          <div className="rounded-lg border border-line p-4">
            <div className="text-[11px] font-medium uppercase tracking-wide text-faint">Direction</div>
            <div className="mt-2">
              <DirectionMark direction={v.direction} big />
            </div>
            <div className="mt-1 text-[12px] text-muted">{v.directionGap != null ? `${pts(v.directionGap)} vs the base` : "Not enough deals with a known market"}</div>
          </div>
        </div>
        {notes.length > 0 && (
          <ul className="mt-4 space-y-1 text-[12.5px] text-muted">
            {notes.map((n) => (
              <li key={n} className="flex gap-2">
                <span className="text-faint">·</span>
                {n}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={client ? `Who pays · ${c.mixPeriod ?? "—"} revenue by client market` : `Where the money comes from · ${c.mixPeriod ?? "—"} revenue by segment`}>
          <ul className="space-y-5">
            {v.industryMix.map((g) => {
              const ind = industryOf.get(g.naics);
              const rows = c.mix.filter(inGroup(g.naics));
              const quotes = [...new Map(rows.filter((r) => r.quote).map((r) => [r.quote, r])).values()];
              return (
                <li key={g.naics}>
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className={`font-medium ${g.naics ? "text-ink" : "text-faint"}`}>{g.title}</span>
                    <span className="font-mono font-semibold text-ink">{pct(g.share, 0)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
                    <div className={`h-full rounded-full ${g.naics ? "bg-teal" : "bg-faint"}`} style={{ width: `${maxShare > 0 && g.share != null ? (g.share / maxShare) * 100 : 0}%` }} />
                  </div>
                  {ind ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                      <span>NAICS {g.naics}</span>
                      <span className="text-faint">· outlook</span>
                      <span className="font-mono text-ink">{pct(ind.outlook)}</span>
                      <TrendPill trend={ind.trend} />
                    </div>
                  ) : g.naics === "economy" ? (
                    <div className="mt-1.5 text-[12px] text-muted">
                      outlook <span className="font-mono text-ink">{pct(economy)}</span> (the whole economy)
                    </div>
                  ) : (
                    <div className="mt-1.5 text-[12px] text-faint">left out of this view</div>
                  )}
                  <ul className="mt-2 space-y-1 border-l border-line pl-3 text-[12px]">
                    {rows.map((r) => (
                      <li key={r.segment}>
                        <span className="text-ink">{r.segment}</span> <span className="font-mono text-muted">{pct(r.share, 0)}</span>
                        {r.serves && <span className="text-faint"> · clients: {r.serves}</span>}
                        {client && r.marketNote && g.naics !== "economy" && <div className="text-[11.5px] text-faint">{r.marketNote}</div>}
                      </li>
                    ))}
                  </ul>
                  {quotes.map((r) => (
                    <div key={r.quote} className="mt-1 text-[11.5px] italic leading-snug text-faint">
                      “{r.quote}” <span className="not-italic">· {r.quoteSource}</span>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
          {c.geography.length > 0 && (
            <div className="mt-5 border-t border-line pt-3 text-[12px] text-muted">
              <span className="font-medium text-ink">By region ({c.geography[0].period}):</span>{" "}
              {c.geography.map((g, i) => (
                <span key={g.region}>
                  {i > 0 && " · "}
                  {g.region} {pct(g.share, 0)}
                </span>
              ))}
            </div>
          )}
          {v.mixShift && <MixShiftBlock m={v.mixShift} lens={lens} />}
        </Card>

        <Card title={`Where the deals go · fiscal ${R.dealYears[0]}–${R.dealYears[2]}`}>
          {recent.length === 0 ? (
            <p className="text-[13px] text-muted">No disclosed acquisition in this window.</p>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((d, i) => {
                const ind = d.naics ? industryOf.get(d.naics) : undefined;
                const named = d.markets.filter((m) => m.code);
                return (
                  <li key={`${d.date}-${i}`} className="py-2.5 first:pt-0">
                    <div className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="font-medium text-ink">{d.counterparty || "Not named"}</span>
                      <span className="shrink-0 text-[12px] text-faint">{d.date || `FY${d.fiscalYear}`}</span>
                    </div>
                    {client ? (
                      <div className="mt-1 space-y-0.5 text-[12px] text-muted">
                        {named.length === 0 ? (
                          <span className="text-faint">No client market named in the filings</span>
                        ) : (
                          named.map((m) => (
                            <div key={m.code} className="flex flex-wrap items-center gap-x-2">
                              <span>
                                {m.code} · {m.title}
                              </span>
                              <span className="font-mono text-ink">{pct(m.outlook)}</span>
                              <TrendPill trend={m.code ? (industryOf.get(m.code)?.trend ?? null) : null} />
                              {d.markets.length > 1 && <span className="text-faint">· {Math.round(m.weight * 100)}% of the deal</span>}
                            </div>
                          ))
                        )}
                        {d.marketsNote && <div className="text-[11.5px] text-faint">{d.marketsNote}</div>}
                      </div>
                    ) : (
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                      {d.naics ? (
                        <>
                          <span>
                            {d.naics} · {d.naicsTitle}
                          </span>
                          <span className="font-mono text-ink">{pct(ind?.outlook)}</span>
                          <TrendPill trend={ind?.trend ?? null} />
                        </>
                      ) : (
                        <span className="text-faint">Industry not stated in the filings</span>
                      )}
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${LABEL_TAG[d.labelStatus].cls}`}>{LABEL_TAG[d.labelStatus].label}</span>
                    </div>
                    )}
                    {!client && d.serves && <div className="mt-0.5 text-[12px] text-faint">Serves: {d.serves}</div>}
                  </li>
                );
              })}
            </ul>
          )}
          <button onClick={() => setShowAll((v) => !v)} className="mt-4 text-[12.5px] font-medium text-ink underline decoration-line underline-offset-2 hover:decoration-ink">
            {showAll ? "Hide" : "Show"} all {deals.length} disclosed deals and how each was labelled
          </button>
        </Card>
      </div>

      {c.narrative.length > 0 && (
        <Card title={`What management says about its markets · ${c.narrative[0].call}`}>
          <ul className="grid gap-4 md:grid-cols-2">
            {c.narrative.map((n) => (
              <li key={n.quote} className="rounded-lg border border-line p-4">
                <div className="text-[13.5px] font-medium leading-snug text-ink">{n.summary}</div>
                <blockquote className="mt-2 border-l-2 border-line pl-3 text-[12.5px] italic leading-relaxed text-muted">“{n.quote}”</blockquote>
                <div className="mt-2 text-[11.5px] text-faint">{n.speaker ?? "Speaker not marked"} · {n.call}</div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-faint">
            Quotes are verbatim from the transcript (checked by the engine on every run); the bold line is Claude’s one-line summary. Context only: never scored.
          </p>
        </Card>
      )}

      {showAll && <DealLabels deals={deals} />}
    </div>
  );
}

/** how the mix itself moved since rules.mixFrom; formats engine fields only */
function MixShiftBlock({ m, lens }: { m: OutlookMixShift; lens: LensKey }) {
  return (
    <div className="mt-5 border-t border-line pt-3 text-[12px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-ink">Mix over time · {m.from} → {m.to}</span>
        {m.direction && <DirectionMark direction={m.direction} />}
      </div>
      <table className="mt-2 w-full text-[12px]">
        <tbody>
          {m.rows.map((r) => (
            <tr key={r.segment} className="border-t border-line/60">
              <td className="py-1 pr-2 text-ink">{r.segment}</td>
              <td className="py-1 pr-2 text-faint">{r.code ? (r.title ?? r.code) : lens === "customer" ? "no single market" : "—"}</td>
              <td className="whitespace-nowrap py-1 text-right font-mono text-muted">
                {pct(r.from, 0)} <span className="text-faint">→</span> <span className="text-ink">{pct(r.to, 0)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-muted">
        Tailwind on the {m.from} mix <span className="font-mono text-ink">{pct(m.tailwindFrom)}</span>, on the {m.to} mix{" "}
        <span className="font-mono text-ink">{pct(m.tailwindTo)}</span>
        {m.shift != null && <> · <span className="font-mono text-ink">{pts(m.shift)}</span> from the mix alone (today’s outlooks for both years)</>}.
      </div>
      {m.note && <div className="mt-1 text-faint">{m.note}</div>}
    </div>
  );
}

function HeaderStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col px-3 py-3 sm:px-4">
      <dt className="order-2 mt-1.5 max-w-[130px] text-[11px] leading-snug text-faint">{label}</dt>
      <dd className="order-1 whitespace-nowrap font-mono text-[18px] font-semibold leading-none tracking-[-0.02em] text-ink sm:text-[20px]">{value}</dd>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: ReactNode }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-1 font-mono text-[26px] font-semibold leading-tight text-ink">{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">{sub}</div>
    </div>
  );
}

// ---------------------------------------------------------------- industry signals

const KINDS: { key: string; head: string; pick: (s: OutlookSignal) => boolean }[] = [
  { key: "momentum", head: "Momentum CA", pick: (s) => s.kind === "momentum" },
  { key: "proj-ca", head: "Projection CA", pick: (s) => s.kind === "projection" && s.geo === "Canada" },
  { key: "proj-us", head: "Projection US", pick: (s) => s.kind === "projection" && s.geo === "United States" },
  { key: "street", head: "Street CA", pick: (s) => s.kind === "street" },
];

const SOURCE_SHORT: Record<string, string> = {
  "statcan-36-10-0434": "StatCan table",
  "esdc-cops-2026": "COPS data",
  "bls-ep-2-11": "BLS table",
  "onesheet-estimates": "Onesheet",
  "boc-inflation-target": "BoC target",
};

function SignalCell({ s }: { s: OutlookSignal | undefined }) {
  if (!s) return <span className="text-faint">—</span>;
  const tip = [s.series, s.period, s.note].filter(Boolean).join(" · ");
  return (
    <span title={tip} className={`font-mono ${s.value == null ? "text-faint" : s.value < 0 ? "font-semibold text-bad" : "text-ink"}`}>
      {pct(s.value)}
    </span>
  );
}

function SignalTable({ c, lens }: { c: OutlookCompany; lens: LensKey }) {
  const [open, setOpen] = useState<string | null>(null);
  const recent = outlook.deals.filter((d) => d.ticker === c.ticker && d.recent);
  const client = lens === "customer" && c.customer.base !== "same";
  const codes = [
    ...new Set(
      (client
        ? [...c.mix.map((r) => r.market), ...recent.flatMap((d) => d.markets.map((m) => m.code))]
        : [...c.mix.map((r) => r.naics), ...recent.map((d) => d.naics)]
      ).filter((x): x is string => !!x && industryOf.has(x)),
    ),
  ];
  // industries that read the same published series are shown once
  const seen = new Set<string>();
  const rows = codes
    .map((code) => industryOf.get(code))
    .filter((i): i is OutlookIndustry => !!i)
    .filter((i) => {
      const k = i.signals.map((s) => s.series).join("|");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  return (
    <Card title={`Where ${c.ticker}’s ${client ? "client markets" : "industries"} are heading · published signals, yearly growth after inflation`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-faint">
            <tr>
              <th className="py-2 pr-3 font-medium">Industry</th>
              {KINDS.map((k) => (
                <th key={k.key} className="py-2 pr-3 font-medium">
                  {k.head}
                </th>
              ))}
              <th className="py-2 pr-3 font-medium">Outlook</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-line bg-soft align-top">
              <td className="py-2 pr-3">
                <div className="font-medium text-ink">Whole economy</div>
                <div className="text-[11.5px] text-faint">the bar for “growing”</div>
              </td>
              <td className="py-2 pr-3"><SignalCell s={outlook.economy.signals.find(KINDS[0].pick)} /></td>
              <td className="py-2 pr-3"><SignalCell s={outlook.economy.signals.find(KINDS[1].pick)} /></td>
              <td className="py-2 pr-3"><SignalCell s={outlook.economy.signals.find(KINDS[2].pick)} /></td>
              <td className="py-2 pr-3 text-faint">n/a</td>
              <td className="py-2 pr-3 font-mono font-semibold text-ink">{pct(outlook.economy.outlook)}</td>
            </tr>
            {rows.map((i) => (
              <FragmentRow key={i.naics} i={i} open={open === i.naics} onToggle={() => setOpen(open === i.naics ? null : i.naics)} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-faint">
        Momentum: Statistics Canada real GDP, latest 12 months vs the 12 months {R.momentumYears} years earlier. Projections: ESDC COPS (Canada) and BLS
        (US), real output 2025 → 2035. Street: median analyst revenue growth of listed Canadian peers, FY{R.streetFrom} → FY{R.streetTo}, after the{" "}
        {(R.inflation * 100).toFixed(0)}% inflation target. Outlook: the median of the signals that exist (at least {R.minSignals}). Red: shrinking.
        Click an industry for its series, periods and peers.
      </p>
    </Card>
  );
}

function FragmentRow({ i, open, onToggle }: { i: OutlookIndustry; open: boolean; onToggle: () => void }) {
  const street = i.signals.find((s) => s.kind === "street");
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer border-t border-line align-top hover:bg-soft">
        <td className="py-2 pr-3">
          <div className="font-medium text-ink">
            <span className="mr-1 text-faint">{open ? "▾" : "▸"}</span>
            {i.title}
          </div>
          <div className="text-[11.5px] text-faint">NAICS {i.naics}</div>
        </td>
        {KINDS.map((k) => (
          <td key={k.key} className="py-2 pr-3">
            <SignalCell s={i.signals.find(k.pick)} />
          </td>
        ))}
        <td className="py-2 pr-3">
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-ink">{pct(i.outlook)}</span>
            <TrendPill trend={i.trend} />
          </div>
        </td>
      </tr>
      {open && (
        <tr className="bg-soft">
          <td colSpan={6} className="px-3 py-3 text-[12px] text-muted">
            <ul className="space-y-1">
              {i.signals.map((s) => (
                <li key={s.series + s.kind}>
                  <span className="font-medium text-ink">{s.label}{s.geo ? ` (${s.geo})` : ""}:</span> {pct(s.value, 2)} · {s.series}
                  {s.period && ` · ${s.period}`}
                  {s.note && <span className="text-faint"> · {s.note}</span>}
                  {s.sourceIds.map((id) => sourceOf.get(id)?.url && (
                    <a key={id} href={sourceOf.get(id)!.url} target="_blank" rel="noreferrer" className="ml-1.5 underline decoration-line underline-offset-2 hover:decoration-ink">
                      {SOURCE_SHORT[id] ?? "source"}
                    </a>
                  ))}
                </li>
              ))}
            </ul>
            {street?.peers && street.peers.length > 0 && (
              <div className="mt-2">
                <span className="font-medium text-ink">Peers (analyst revenue growth a year, before inflation):</span>{" "}
                {street.peers.map((p, j) => (
                  <span key={p.ticker}>
                    {j > 0 && " · "}
                    {p.name} {pct(p.growth)}
                  </span>
                ))}
                {street.nominal != null && <> · median {pct(street.nominal)}</>}
              </div>
            )}
            {i.note && <div className="mt-2 text-faint">{i.note}</div>}
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------- deals and labels (supporting detail)

function DealLabels({ deals }: { deals: OutlookDeal[] }) {
  const n = (f: (d: OutlookDeal) => boolean) => deals.filter(f).length;
  return (
    <Card title="All disclosed deals and their industry labels">
      <p className="mb-3 text-[12px] text-muted">
        {n((d) => !d.exclude && !!d.naics)} with an industry code · {n((d) => !d.exclude && !d.naics)} the filings don’t describe ·{" "}
        {n((d) => !!d.exclude)} left out (duplicates, minority stakes, deals not done, totals inside longer periods) · {n((d) => d.labelStatus === "approved")} of{" "}
        {deals.length} approved. Constellation and Topicus disclose only material deals, so this shows where the large money goes, not every deal.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-faint">
            <tr>
              <th className="py-2 pr-3 font-medium">When</th>
              <th className="py-2 pr-3 font-medium">Business bought</th>
              <th className="py-2 pr-3 font-medium">Industry and the text behind it</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d, i) => (
              <tr key={`${d.date}-${i}`} className={`border-t border-line align-top ${d.exclude ? "opacity-60" : ""}`}>
                <td className="whitespace-nowrap py-2 pr-3 text-muted">
                  {d.date || "—"}
                  {d.recent && <div className="text-[10.5px] font-semibold uppercase text-teal">Recent</div>}
                </td>
                <td className="py-2 pr-3">
                  <div className="font-medium text-ink">{d.counterparty || "Not named"}</div>
                  <div className="text-[12px] text-muted">{d.summary}</div>
                </td>
                <td className="w-[44%] py-2 pr-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {d.naics ? (
                        <span className="font-medium text-ink">
                          {d.naics} · {d.naicsTitle}
                        </span>
                      ) : (
                        <span className="text-faint">No industry code</span>
                      )}
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${LABEL_TAG[d.labelStatus].cls}`}>{LABEL_TAG[d.labelStatus].label}</span>
                    </div>
                    {d.serves && <div className="text-[12px] text-muted">Serves: {d.serves}</div>}
                    {d.naicsQuote && (
                      <div className="text-[12px] italic leading-snug text-muted">
                        “{d.naicsQuote}” <span className="not-italic text-faint">· {d.naicsQuoteSource}</span>
                      </div>
                    )}
                    {d.exclude && <div className="text-[12px] font-medium text-muted">Left out: {d.exclude}</div>}
                    {d.labelNote && <div className="text-[12px] leading-snug text-faint">{d.labelNote}</div>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- method, limits, build status

/** one dot per company: tailwind (x) against the direction gap (y); the steady band and the economy bar drawn from the rules */
function GapChart({ lens, economy, selected, onSelect }: { lens: LensKey; economy: number | null; selected: string; onSelect: (t: string) => void }) {
  const W = 980, H = 270, P = { l: 66, r: 16, t: 14, b: 34 };
  const rows = FEATURED.map((c) => ({ c, v: viewOf(c, lens) }));
  const shown = rows.filter((r) => r.v.tailwind != null && r.v.directionGap != null) as { c: OutlookCompany; v: OutlookLens & { tailwind: number; directionGap: number } }[];
  const missing = rows.filter((r) => r.v.tailwind == null || r.v.directionGap == null);
  const band = R.directionBand;
  const xsAll = [...shown.map((r) => r.v.tailwind), ...(economy != null ? [economy] : []), 0];
  const xPad = (Math.max(...xsAll) - Math.min(...xsAll)) * 0.12 || 0.01;
  const x0 = Math.min(...xsAll), x1 = Math.max(...xsAll) + xPad;
  const yMax = Math.max(band * 2, ...shown.map((r) => Math.abs(r.v.directionGap)) ) * 1.1;
  const sx = (v: number) => P.l + ((v - x0) / (x1 - x0 || 1)) * (W - P.l - P.r);
  const sy = (v: number) => P.t + ((yMax - v) / (2 * yMax)) * (H - P.t - P.b);
  // dots that land on the same spot share one label
  const groups: { x: number; y: number; tickers: string[] }[] = [];
  for (const r of [...shown].sort((a, b) => a.v.tailwind - b.v.tailwind)) {
    const x = sx(r.v.tailwind), y = sy(r.v.directionGap);
    const g = groups.find((g) => Math.abs(g.x - x) < 6 && Math.abs(g.y - y) < 6);
    if (g) g.tickers.push(r.c.ticker);
    else groups.push({ x, y, tickers: [r.c.ticker] });
  }
  const xTicks = [...new Set([x0, x1].map((t) => Math.round(t * 1000) / 1000))];
  return (
    <div>
      <p className="mb-3 text-[12.5px] text-muted">
        Right = earns in faster-growing {lens === "own" ? "industries" : "markets"}. Up = recent deals head toward stronger ones, down = toward weaker ones.
        Inside the grey band (±{(band * 100).toFixed(0)} point) the direction reads “steady”.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Tailwind against direction gap, one dot per company">
        <rect x={P.l} width={W - P.l - P.r} y={sy(band)} height={sy(-band) - sy(band)} fill="var(--color-line)" fillOpacity={0.45} />
        <text x={W - P.r - 4} y={sy(band) + 12} textAnchor="end" fontSize="10" fill="var(--color-faint)">steady</text>
        <line x1={P.l} x2={W - P.r} y1={sy(0)} y2={sy(0)} stroke="var(--color-line)" />
        <line x1={sx(0)} x2={sx(0)} y1={P.t} y2={H - P.b} stroke="var(--color-line)" />
        {[yMax, band, 0, -band, -yMax].map((t) => (
          <text key={`y${t}`} x={P.l - 6} y={sy(t) + 3} textAnchor="end" fontSize="10" fill="var(--color-faint)">{pts(t)}</text>
        ))}
        {xTicks.map((t) => (
          <text key={`x${t}`} x={sx(t)} y={H - P.b + 14} textAnchor="middle" fontSize="10" fill="var(--color-faint)">{pct(t)}</text>
        ))}
        <text x={(P.l + W - P.r) / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="var(--color-muted)">Tailwind, yearly after inflation</text>
        <text x={12} y={(P.t + H - P.b) / 2} textAnchor="middle" fontSize="10" fill="var(--color-muted)" transform={`rotate(-90 12 ${(P.t + H - P.b) / 2})`}>Deals vs tailwind</text>
        {economy != null && (
          <g>
            <line x1={sx(economy)} x2={sx(economy)} y1={P.t} y2={H - P.b} stroke="var(--color-ink)" strokeDasharray="4 3" strokeOpacity={0.5} />
            <text x={sx(economy) + 4} y={P.t + 9} fontSize="10" fill="var(--color-muted)">{`whole economy ${pct(economy)}`}</text>
          </g>
        )}
        {shown.map((r) => {
          const on = r.c.ticker === selected;
          return (
            <g key={r.c.ticker} className="cursor-pointer" onClick={() => onSelect(r.c.ticker)}>
              <circle cx={sx(r.v.tailwind)} cy={sy(r.v.directionGap)} r={14} fill="transparent" />
              <circle cx={sx(r.v.tailwind)} cy={sy(r.v.directionGap)} r={on ? 6.5 : 5} fill="var(--color-teal)" stroke="var(--panel-solid)" strokeWidth={2}>
                <title>{`${r.c.ticker} · ${r.c.name}: tailwind ${pct(r.v.tailwind)}, recent deals ${pct(r.v.dealOutlook)}, gap ${pts(r.v.directionGap)} (${r.v.direction ? DIRECTION[r.v.direction].label.toLowerCase() : "no call"})`}</title>
              </circle>
            </g>
          );
        })}
        {groups.map((g) => (
          <text key={g.tickers.join()} x={g.x + 9} y={g.y - 8} fontSize="11" fontWeight={600} fill="var(--color-ink)">{g.tickers.join(" · ")}</text>
        ))}
      </svg>
      {missing.length > 0 && (
        <p className="mt-2 text-[12px] text-faint">
          Not plotted: {missing.map((r) => `${r.c.ticker} (${r.v.tailwind == null ? "no tailwind" : "too few recent deals with an outlook to call a direction"})`).join("; ")}.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- hero: the five featured companies

const TREND_TEXT: Record<Trend, string> = { growing: "text-teal", stable: "text-warn", declining: "text-bad" };
const TREND_FILL: Record<Trend, string> = { growing: "bg-teal", stable: "bg-warn", declining: "bg-bad" };

/** a company's revenue split by industry, each part coloured by its industry's trend; widths are the engine's shares */
function MixBar({ c }: { c: OutlookCompany }) {
  const parts = c.industryMix.filter((m) => m.share != null && m.share > 0);
  return (
    <div className="flex h-2 gap-[2px] overflow-hidden rounded-full" aria-label="Revenue by industry">
      {parts.map((m) => {
        const ind = industryOf.get(m.naics);
        return (
          <span key={m.naics} title={`${m.title}: ${pct(m.share, 0)} of revenue · outlook ${pct(ind?.outlook)}`}
            className={`h-full first:rounded-l-full last:rounded-r-full ${ind?.trend ? TREND_FILL[ind.trend] : "bg-faint"}`} style={{ width: `${(m.share as number) * 100}%`, opacity: 0.85 }} />
        );
      })}
    </div>
  );
}

/** the scored check, read from the trend: "growing" means at least the whole economy, the check's own bar */
function CheckMark({ c }: { c: OutlookCompany }) {
  if (!c.trend) return <span className="text-faint">no tailwind: check has no data</span>;
  const pass = c.trend === "growing";
  return (
    <span className={pass ? "text-teal" : "text-bad"}>
      {pass ? "✓ passes" : "✗ fails"} <span className="text-muted">growing ≥ economy</span>
    </span>
  );
}

function FeaturedCards({ economy, selected, onSelect }: { economy: number | null; selected: string; onSelect: (t: string) => void }) {
  return (
    <section aria-label="The five featured companies" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {FEATURED.map((c, i) => {
        const on = c.ticker === selected;
        return (
          <button key={c.ticker} onClick={() => onSelect(c.ticker)} aria-pressed={on}
            style={{ animationDelay: `${120 + i * 70}ms` }}
            className={`a-rise panel group flex flex-col gap-3 px-4 py-4 text-left transition-[border-color,transform] duration-200 hover:-translate-y-0.5 ${on ? "!border-teal/60" : ""}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[13px] font-semibold text-ink">{c.ticker}</span>
              <TrendPill trend={c.trend} />
            </div>
            <div className="-mt-2 truncate text-[12px] text-muted">{c.name}</div>
            <div>
              <div className={`font-mono text-[30px] font-semibold leading-none tracking-[-0.03em] ${c.trend ? TREND_TEXT[c.trend] : "text-ink"}`}>{pct(c.tailwind)}</div>
              <div className="mt-1 text-[11px] text-faint">tailwind a year · economy {pct(economy)}</div>
            </div>
            <MixBar c={c} />
            <div className="truncate text-[11.5px] text-muted" title={c.industryMix.map((m) => `${m.title} ${pct(m.share, 0)}`).join(" · ")}>
              {c.industryMix.slice(0, 2).map((m) => `${m.title} ${pct(m.share, 0)}`).join(" · ")}
              {c.industryMix.length > 2 ? ` · +${c.industryMix.length - 2}` : ""}
            </div>
            <div className="mt-auto space-y-1 border-t border-line pt-2.5 text-[11.5px]">
              {c.direction ? <DirectionMark direction={c.direction} /> : <span className="text-faint">No direction call: too few deals with an industry</span>}
              <div><CheckMark c={c} /></div>
            </div>
          </button>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------- every company the score reads

function AllCompanies({ economy, focus }: { economy: number | null; focus: string | null }) {
  const [open, setOpen] = useState(focus != null);
  const rows = [...outlook.companies].sort((a, b) => (b.tailwind ?? -1) - (a.tailwind ?? -1));
  const vals = rows.map((c) => c.tailwind ?? 0);
  const lo = Math.min(0, ...vals), hi = Math.max(...vals, economy ?? 0);
  const x = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  useEffect(() => {
    if (focus) document.getElementById(`outlook-all-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focus]);
  const passing = rows.filter((c) => c.trend === "growing").length;
  if (!open)
    return (
      <button onClick={() => setOpen(true)} aria-expanded={false}
        className="panel group flex w-full flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:border-teal/50 md:px-6">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[14px] font-semibold text-ink">Every company the score reads</span>
          <span className="text-[12.5px] text-muted">
            {rows.length} candidates and holdings · {passing} pass the “growing ≥ economy” check
          </span>
        </span>
        <span className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-muted transition-colors group-hover:border-teal group-hover:text-ink">
          Show all {rows.length} <span aria-hidden>▾</span>
        </span>
      </button>
    );
  return (
    <Card title={`Every company the score reads · ${rows.length}`}
      right={<button onClick={() => setOpen(false)} aria-expanded className="rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-muted hover:text-ink">Hide <span aria-hidden>▴</span></button>}>
      <p className="mb-3 text-[12.5px] text-muted">
        The tailwind of every candidate and index holding, read the same way: each reported revenue segment mapped to an industry, each industry’s outlook from the
        published sources. The five featured companies are also read on deals and client markets. Line = the whole economy, {pct(economy)} a year.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[12.5px]">
          <thead className="text-[10.5px] uppercase tracking-wide text-faint">
            <tr>
              <th className="py-2 pr-2 font-medium">#</th>
              <th className="py-2 pr-3 font-medium">Company</th>
              <th className="w-[38%] py-2 pr-3 font-medium">Tailwind</th>
              <th className="py-2 pr-3 font-medium">Check</th>
              <th className="py-2 font-medium">Main industry</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => {
              const top = c.industryMix[0];
              return (
                <tr key={c.ticker} id={`outlook-all-${c.ticker}`} className={`border-t border-line align-middle transition-colors ${focus === c.ticker ? "bg-tealsoft" : "hover:bg-soft"}`}>
                  <td className="py-2 pr-2 font-mono text-[11px] text-faint">{i + 1}</td>
                  <td className="py-2 pr-3">
                    <a href={`#c/${encodeURIComponent(c.ticker)}`} className="font-mono font-semibold text-ink hover:underline">{c.ticker}</a>
                    {c.featured && <span className="ml-1.5 rounded bg-soft px-1 py-px text-[9.5px] font-semibold uppercase tracking-wide text-muted">featured</span>}
                    <div className="max-w-[180px] truncate text-[11.5px] text-muted">{c.name}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2.5">
                      <div className="relative h-2 flex-1 rounded-full bg-line">
                        {c.tailwind != null && (
                          <span className={`absolute inset-y-0 rounded-full ${c.trend ? TREND_FILL[c.trend] : "bg-faint"}`}
                            style={{ left: `${Math.min(x(0), x(c.tailwind))}%`, width: `${Math.abs(x(c.tailwind) - x(0))}%` }} />
                        )}
                        {economy != null && <span className="absolute -inset-y-1 w-px bg-ink/50" style={{ left: `${x(economy)}%` }} />}
                      </div>
                      <span className="w-12 text-right font-mono tabular-nums text-ink">{pct(c.tailwind)}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-[11.5px]"><CheckMark c={c} /></td>
                  <td className="py-2 text-[11.5px] text-muted">
                    {top ? <>{top.title} <span className="font-mono text-faint">{pct(top.share, 0)}</span></> : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] text-faint">Industry labels for the companies beyond the five featured are proposed by Claude, with a quote from each Onesheet profile, and await approval.</p>
    </Card>
  );
}
