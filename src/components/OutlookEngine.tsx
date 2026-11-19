"use client";

// The Outlook engine tab (#outlook). Reads data/outlook.json (npm run outlook). Plan: docs/OUTLOOK_ENGINE.md.
// Rules and formulas: engine/methodology.md ("Outlook engine"). This file only formats what the engine computed.

import { useState, type ReactNode } from "react";
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

const outlook = outlookJson as unknown as OutlookData;
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

const LENSES: { key: LensKey; label: string; explain: string }[] = [
  { key: "own", label: "What they do", explain: "Read by the industry each business is in (its NAICS code): software, engineering, trucking, construction." },
  {
    key: "customer",
    label: "Who they sell to",
    explain:
      "Read by the markets their clients are in: power utilities, hospitals, governments… Where a company does not report revenue by client market, its base is the whole economy; for transport and construction both views are the same.",
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
  return `${pct(c.customer.dealCoverage, 0)} of deal weight names a client market`;
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

function LensSwitch({ lens, onChange }: { lens: LensKey; onChange: (l: LensKey) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line p-0.5" role="tablist" aria-label="Read companies by">
      {LENSES.map((l) => (
        <button
          key={l.key}
          role="tab"
          aria-selected={lens === l.key}
          onClick={() => onChange(l.key)}
          className={`rounded-md px-3 py-1 text-[12.5px] font-medium transition-colors ${lens === l.key ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
        >
          {l.label}
        </button>
      ))}
    </div>
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
  const [ticker, setTicker] = useState(initial && outlook.companies.some((c) => c.ticker === initial) ? initial : (outlook.companies[0]?.ticker ?? ""));
  const [lens, setLens] = useState<LensKey>("own");
  const company = outlook.companies.find((c) => c.ticker === ticker) ?? outlook.companies[0];
  const economy = outlook.economy.outlook;

  return (
    <div className="enter space-y-5">
      <section className="scan-once panel px-6 py-7 md:px-8">
        <div className="kicker flex items-center gap-2">
          <span className="live-dot" /> Outlook engine · serial acquirers
        </div>
        <h1 className="mt-3 text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink md:text-[38px]">Are they buying into the right industries?</h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-muted">{outlook.thesis}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
          <span className="rounded-md border border-line px-2.5 py-1 text-muted">
            Bar for “growing”: the whole economy, <span className="font-semibold text-ink">{pct(economy)}</span> a year after inflation
          </span>
          <span className="rounded-md border border-line px-2.5 py-1 text-muted">Context only: changes no recommendation</span>
          <span className="rounded-md border border-line px-2.5 py-1 text-muted">Published sources only, no forecast of ours</span>
          <span className="rounded-md border border-line px-2.5 py-1 text-muted">Not backtested · not investment advice</span>
        </div>
      </section>

      <Card title="The answer, company by company" right={<LensSwitch lens={lens} onChange={setLens} />}>
        <p className="mb-3 text-[12.5px] text-muted">{LENSES.find((l) => l.key === lens)!.explain}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-wide text-faint">
              <tr>
                <th className="py-2 pr-3 font-medium">Company</th>
                <th className="py-2 pr-3 font-medium">Tailwind</th>
                <th className="py-2 pr-3 font-medium">In declining industries</th>
                <th className="py-2 pr-3 font-medium">Recent deals</th>
                <th className="py-2 pr-3 font-medium">Direction</th>
              </tr>
            </thead>
            <tbody>
              {outlook.companies.map((c) => {
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
                    <div className="text-[11.5px] text-faint">{dealLine(c, lens)}</div>
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
        <GapChart lens={lens} economy={economy} selected={company.ticker} onSelect={setTicker} />
      </Card>

      <CompanyDetail c={company} economy={economy} lens={lens} />

      <SignalTable c={company} lens={lens} />

      <HowItWorks />

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
  const rows = outlook.companies.map((c) => ({ c, v: viewOf(c, lens) }));
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

function HowItWorks() {
  return (
    <Card title="How it works, and what it can't tell you">
      <div className="grid gap-6 lg:grid-cols-2">
        <ol className="space-y-3 text-[13px] leading-relaxed">
          <li>
            <span className="font-semibold text-ink">1. Industry map.</span>{" "}
            <span className="text-muted">Each reported revenue segment and each disclosed deal gets an industry code (NAICS 2022), with the exact text that justifies it.</span>
          </li>
          <li>
            <span className="font-semibold text-ink">2. Published signals.</span>{" "}
            <span className="text-muted">
              For each industry: recent real GDP growth (Statistics Canada), the official 10-year projections for Canada (ESDC) and the US (BLS), and analysts’ revenue
              forecasts for listed Canadian peers. The outlook is their median; an industry is growing if it beats the whole economy, stable if it grows slower,
              declining if it shrinks.
            </span>
          </li>
          <li>
            <span className="font-semibold text-ink">3. Tailwind.</span>{" "}
            <span className="text-muted">The company’s revenue-weighted outlook. It rewards growing and stable industries and flags declining ones; it does not chase the fastest.</span>
          </li>
          <li>
            <span className="font-semibold text-ink">4. Direction.</span>{" "}
            <span className="text-muted">
              The outlook of the last {R.dealYears.length} fiscal years’ deals against the tailwind. Within ±{(R.directionBand * 100).toFixed(0)} point it is steady.
            </span>
          </li>
        </ol>
        <ul className="space-y-2 text-[12.5px] leading-relaxed text-muted">
          <li>· <span className="text-ink">Not tested.</span> Whether these signals would have picked better stocks or faster growers is not tested, so it is context, not a check.</li>
          <li>· Industry codes describe what a business does. Software and engineering firms serve many client markets; those are listed (“serves”, “clients”) but not scored.</li>
          <li>· The signals describe Canada and the US. Topicus earns in Europe and WSP partly abroad.</li>
          <li>· Deals are those disclosed in filings. Constellation and Topicus disclose only material ones; each deal counts once whatever its size, because most prices are not disclosed.</li>
          <li>· Analysts’ revenue forecasts include acquisitions, and some industries have one or two listed Canadian peers, or none.</li>
          <li>· Deal industry labels are proposed by Claude with their quotes and still need a person’s approval.</li>
          <li>· Management quotes are what executives chose to say on a call: they explain, they do not measure.</li>
        </ul>
      </div>
      <details className="mt-5 border-t border-line pt-3">
        <summary className="cursor-pointer text-[12.5px] font-medium text-ink">Build status</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {outlook.layers.map((layer) => (
            <div key={layer.id} className="rounded-lg border border-line p-3">
              <div className="text-[12.5px] font-semibold text-ink">{layer.title}</div>
              <ul className="mt-2 space-y-1.5">
                {layer.steps.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 text-[12px]">
                    <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span>
                    <span>
                      <span className="font-medium text-ink">{s.label}.</span> <span className="text-muted">{s.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </Card>
  );
}
