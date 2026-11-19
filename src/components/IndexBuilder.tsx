"use client";

// The generated index (#index on /analyze): the companies the engine tested, turned into a $100,000 index,
// back-tested on 20 years of monthly prices and projected 1 to 30 years ahead.
// Prices come from /api/index-builder (Yahoo Finance); every number on this page is computed by
// engine/indexBuilder.ts. Formulas: engine/methodology.md, "Generated index".

import { useEffect, useMemo, useRef, useState } from "react";
import type { Company, Dataset } from "@contract/types";
import {
  BENCHMARK, buildIndex, CAP_SHARE, HORIZONS, LOOKBACK_MONTHS, MIN_COVERAGE, MIN_PROJECTION_MONTHS, projectAt, START_AMOUNT,
  type Basis, type BuiltIndex, type PricePayload, type ReturnStats, type Weighting,
} from "../../engine/indexBuilder";
import { recStyle } from "@/lib/format";
import { Explain, Segmented } from "./ui";

interface Props {
  dataset: Dataset;
  /** true when the person just pressed "Generate index": play the build, even if prices are cached */
  fresh: boolean;
  onBuilt: () => void;
  onOpen: (ticker: string) => void;
}

type Pool = "pass" | "passWatch" | "all";

// ---------------------------------------------------------------- formatting

const money = (v: number | null | undefined, compact = false) => {
  if (v == null || !Number.isFinite(v)) return "—";
  if (compact || Math.abs(v) >= 10_000_000) {
    return Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", currencyDisplay: "narrowSymbol", notation: "compact", maximumSignificantDigits: 3 }).format(v);
  }
  return Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).format(v);
};
const price = (v: number | null) => (v == null ? "—" : Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v));
const pct = (v: number | null | undefined, digits = 1, sign = false) =>
  v == null || !Number.isFinite(v) ? "—" : `${sign && v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;
/** A probability as a whole percent; "under 1%" rather than a misleading "0%". */
const chance = (v: number) => (v < 0.005 ? "under 1%" : v > 0.995 ? "over 99%" : `${Math.round(v * 100)}%`);
const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", year: "numeric", timeZone: "UTC" });
const yearsOf = (months: number) => Math.round((months / 12) * 10) / 10;
const horizonLabel = (y: number) => `${y} ${y === 1 ? "year" : "years"}`;

// ---------------------------------------------------------------- members

/** 0-1 grade the "Checks passed" weighting uses: the quality score out of 100 where the industry has one, else the share of scored checks passed. */
function qualityOf(c: Company): number | null {
  const s = c.model?.score?.value;
  if (s != null) return s / 100;
  const m = c.model;
  return m && m.available > 0 ? m.passed / m.available : null;
}

function inPool(c: Company, pool: Pool): boolean {
  const r = c.model?.recommendation;
  if (!r) return false;
  return pool === "all" || (pool === "pass" ? r === "pass" : r !== "fail");
}

/** Prices already fetched this session, by the set of tickers asked for. */
const payloads = new Map<string, PricePayload>();

async function loadPrices(tickers: string[]): Promise<PricePayload> {
  const key = [...tickers].sort().join(",");
  const hit = payloads.get(key);
  if (hit) return hit;
  const res = await fetch("/api/index-builder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tickers }) });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error ?? `The price service answered ${res.status}`);
  payloads.set(key, j as PricePayload);
  return j as PricePayload;
}

// ---------------------------------------------------------------- the page

export default function IndexBuilder({ dataset, fresh, onBuilt, onOpen }: Props) {
  const tested = useMemo(() => dataset.companies.filter((c) => c.model).sort((a, b) => (a.model!.rank ?? 0) - (b.model!.rank ?? 0)), [dataset]);
  const counts = useMemo(() => ({
    pass: tested.filter((c) => inPool(c, "pass")).length,
    passWatch: tested.filter((c) => inPool(c, "passWatch")).length,
    all: tested.length,
  }), [tested]);
  const [pool, setPool] = useState<Pool>(() => (counts.pass >= 3 ? "pass" : counts.passWatch >= 3 ? "passWatch" : "all"));
  const [method, setMethod] = useState<Weighting>("marketCap");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [horizon, setHorizon] = useState<number>(10);
  const [scale, setScale] = useState<"linear" | "log">("linear");
  const [basisId, setBasisId] = useState<"own" | "market">("own");
  const tickers = useMemo(() => tested.slice(0, 120).map((c) => c.ticker), [tested]);
  const priceKey = useMemo(() => [...tickers].sort().join(","), [tickers]);
  // Prices already fetched this session show at once, unless the person just pressed "Generate index".
  const [payload, setPayload] = useState<PricePayload | null>(() => payloads.get(priceKey) ?? null);
  const [loading, setLoading] = useState(() => fresh || !payloads.has(priceKey));
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState(0);

  // Fetch prices for every tested company once; members and weights then change without a new request.
  useEffect(() => {
    let live = true;
    loadPrices(tickers)
      .then((p) => { if (live) setPayload(p); })
      .catch((e: Error) => { if (live) setError(e.message || "Could not reach the price service"); });
    return () => { live = false; };
  }, [tickers, run]);

  /** Fetch the latest prices and play the build again. */
  const rebuild = () => {
    payloads.delete(priceKey);
    setPayload(null);
    setError(null);
    setLoading(true);
    setRun((n) => n + 1);
  };

  const members = useMemo(
    () => tested.filter((c) => inPool(c, pool) && !excluded.has(c.ticker)).map((c) => ({ ticker: c.ticker, marketCap: null, quality: qualityOf(c) })),
    [tested, pool, excluded],
  );
  const built = useMemo(() => (payload ? buildIndex({ payload, members, method }) : null), [payload, members, method]);
  const byTicker = useMemo(() => new Map(dataset.companies.map((c) => [c.ticker, c])), [dataset]);
  const industry = dataset.industryName ?? dataset.industryId;
  const hasScore = tested.some((c) => c.model?.score?.value != null);

  if (error) {
    return (
      <section className="panel mx-auto max-w-xl px-7 py-8 text-center">
        <div className="kicker">Generated index</div>
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink">Could not get prices</h1>
        <p className="mt-2 text-sm text-muted">{error}</p>
        <button onClick={rebuild} className="mt-6 rounded-[10px] bg-ink px-4 py-2 text-sm font-semibold text-white">Try again</button>
      </section>
    );
  }

  if (loading || !built || !payload) {
    return (
      <BuildLoading industry={industry} count={members.length} method={method} built={built} payload={payload}
        onDone={() => { setLoading(false); onBuilt(); }} />
    );
  }

  const n = built.positions.length;
  const weighting = method === "equal"
    ? "equally"
    : method === "quality"
      ? `by ${hasScore ? "quality score" : "share of checks passed"}`
      : n * CAP_SHARE < 1
        ? "by market cap (too few companies to cap any one)"
        : `by market cap, no company above ${Math.round(CAP_SHARE * 100)}%`;
  const bt = built.backtest;
  // Projection basis: the index's own past, or its own ups and downs at the market's pace.
  const usePace = basisId === "market" && built.pace?.projection != null;
  const basis = usePace ? built.pace!.basis : built.stats;
  const projection = usePace ? built.pace!.projection : built.projection;
  const sel = projection?.find((p) => p.years === horizon) ?? null;
  const allCanadian = built.positions.every((p) => byTicker.get(p.ticker)?.hqCountry === "CA");
  const basisPicker = built.pace?.projection && built.stats && built.benchmark?.stats ? (
    <Segmented value={basisId} onChange={setBasisId} options={[
      { id: "own", label: `Its own past · ${pct(built.stats.annualReturn)}` },
      { id: "market", label: `Market's pace · ${pct(built.benchmark.stats.annualReturn)}` },
    ]} />
  ) : null;
  const tsxSel = built.benchmark?.projection?.find((p) => p.years === horizon) ?? null;

  return (
    <div className="enter space-y-5">
      {/* ---------------- headline */}
      <section className="scan-once panel grid gap-8 px-6 py-8 md:px-9 lg:grid-cols-[1fr_380px]"
        style={{ backgroundImage: "radial-gradient(80% 140% at 0% 0%, var(--color-tealsoft), transparent 55%)" }}>
        <div className="min-w-0">
          <div className="kicker flex items-center gap-2"><span className="live-dot" /> Generated index · {industry}</div>
          <h1 className="mt-3 text-[34px] font-bold leading-[1.06] tracking-[-0.035em] text-ink md:text-[44px]">Your {industry} index</h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">
            {money(built.amount)} split across <b className="text-ink">{n} {allCanadian ? "Canadian " : ""}{n === 1 ? "company" : "companies"}</b>, weighted {weighting}.
            {bt && <> Back-tested on <b className="text-ink">{yearsOf(bt.months.length)} years</b> of monthly prices, dividends reinvested.</>}
          </p>
          <div className="mt-6 flex flex-wrap items-end gap-x-6 gap-y-4">
            <Control label="Companies">
              <Segmented value={pool} onChange={(p) => { setPool(p); setExcluded(new Set()); }} options={[
                { id: "pass", label: `Passing · ${counts.pass}` },
                { id: "passWatch", label: `Passing + mixed · ${counts.passWatch}` },
                { id: "all", label: `All tested · ${counts.all}` },
              ]} />
            </Control>
            <Control label="Weighting">
              <Segmented value={method} onChange={setMethod} options={[
                { id: "marketCap", label: "Market cap" },
                { id: "equal", label: "Equal" },
                { id: "quality", label: hasScore ? "Quality score" : "Checks passed" },
              ]} />
            </Control>
            <button onClick={rebuild} title="Fetch the latest prices and build again"
              className="group flex h-[34px] items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium text-ink transition-colors hover:border-ink">
              <span className="inline-block transition-transform duration-500 group-hover:rotate-180">⟳</span> Rebuild with latest prices
            </button>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-line bg-[var(--panel-hi)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="kicker whitespace-nowrap">In {horizonLabel(horizon)}</span>
            <HorizonPicker value={horizon} onChange={setHorizon} small />
          </div>
          {sel ? (
            <>
              <div key={`${horizon}|${method}|${pool}|${basisId}`} className="a-fade mt-4">
                <div className="font-mono text-[44px] font-semibold leading-none tracking-[-0.04em] text-teal tabular-nums">{money(sel.p50)}</div>
                <div className="mt-2 text-[13px] text-muted">
                  <Explain info={EXPLAIN.middle}>Middle outcome</Explain> · {pct(Math.pow(sel.p50 / built.amount, 1 / horizon) - 1)} a year
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4">
                <Mini label={<Explain info={EXPLAIN.likely}>Likely range</Explain>} value={`${money(sel.p25, true)} – ${money(sel.p75, true)}`} />
                <Mini label={<Explain info={EXPLAIN.bad}>Bad case</Explain>} value={money(sel.p10, sel.p10 >= 1e6)} tone="bad" />
                <Mini label={<Explain info={EXPLAIN.loss}>Chance of a loss</Explain>} value={chance(sel.lossChance)} />
                <Mini label={`${BENCHMARK.label}, middle`} value={tsxSel ? money(tsxSel.p50, tsxSel.p50 >= 1e6) : "—"} />
              </div>
              {basisPicker && (
                <div className="mt-4 border-t border-line pt-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-faint">
                    <Explain info={EXPLAIN.basis}>Growth assumed</Explain>
                  </div>
                  {basisPicker}
                </div>
              )}
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">
              {bt ? `Only ${bt.months.length} months of prices: too short to project (needs ${MIN_PROJECTION_MONTHS}).` : "No price history to back-test."}
            </p>
          )}
        </div>
      </section>

      {/* ---------------- projection */}
      {projection && basis && built.stats && (
        <section className="panel">
          <Head title={`What ${money(built.amount)} could grow to`}
            sub={usePace
              ? `The index's own ups and downs, at ${BENCHMARK.label}'s average pace over the last ${yearsOf(built.benchmark!.stats!.months)} years. Shaded: 1-in-10 bad case to 1-in-10 good case.`
              : `If the next ${horizonLabel(horizon)} move like the last ${yearsOf(built.stats.months)}: same average month, same ups and downs. Shaded: 1-in-10 bad case to 1-in-10 good case.`}
            right={<div className="flex flex-wrap items-center gap-2">{basisPicker}<HorizonPicker value={horizon} onChange={setHorizon} /></div>} />
          <div className="border-t border-line px-3 pb-4 pt-5 md:px-6">
            <FanChart key={`${horizon}|${method}|${pool}|${excluded.size}|${basisId}`} built={built} basis={basis} horizon={horizon} showBench={!usePace} />
          </div>
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[640px] text-[13.5px]">
              <thead>
                <tr className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">
                  <th className="px-6 py-2.5 text-left font-medium">After</th>
                  <th className="px-3 py-2.5 text-right font-medium"><Explain info={EXPLAIN.bad}>Bad case</Explain></th>
                  <th className="px-3 py-2.5 text-right font-medium"><Explain info={EXPLAIN.middle}>Middle</Explain></th>
                  <th className="px-3 py-2.5 text-right font-medium"><Explain info={EXPLAIN.good}>Good case</Explain></th>
                  <th className="px-3 py-2.5 text-right font-medium"><Explain info={EXPLAIN.loss}>Chance of a loss</Explain></th>
                  <th className="px-6 py-2.5 text-right font-medium">{BENCHMARK.label}, middle</th>
                </tr>
              </thead>
              <tbody>
                {projection.map((p) => {
                  const b = built.benchmark?.projection?.find((x) => x.years === p.years);
                  const on = p.years === horizon;
                  return (
                    <tr key={p.years} onClick={() => setHorizon(p.years)}
                      className={`cursor-pointer border-t border-line transition-colors ${on ? "bg-tealsoft" : "hover:bg-soft"}`}>
                      <td className={`px-6 py-3 font-medium ${on ? "text-teal" : "text-ink"}`}>{horizonLabel(p.years)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-muted">{money(p.p10)}</td>
                      <td className="px-3 py-3 text-right font-mono font-semibold tabular-nums text-ink">{money(p.p50)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-muted">{money(p.p90)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-muted">{chance(p.lossChance)}</td>
                      <td className="px-6 py-3 text-right font-mono tabular-nums text-faint">{b ? money(b.p50) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------------- holdings */}
      <section className="panel">
        <Head title={`The ${money(built.amount)}, company by company`}
          sub={`Whole shares at the latest price, in Canadian dollars. Untick a company to leave it out; the rest are re-weighted.`} />
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[860px] text-[13.5px]">
            <thead>
              <tr className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">
                <th className="w-10 py-2.5 pl-6" />
                <th className="px-3 py-2.5 text-left font-medium">Company</th>
                <th className="px-3 py-2.5 text-left font-medium">Weight</th>
                <th className="px-3 py-2.5 text-right font-medium">Invested</th>
                <th className="px-3 py-2.5 text-right font-medium">Shares × price</th>
                <th className="px-3 py-2.5 text-right font-medium">Market cap</th>
                <th className="px-6 py-2.5 text-right font-medium"><Explain info={EXPLAIN.own}>Return a year</Explain></th>
              </tr>
            </thead>
            <tbody>
              {built.positions.map((p, i) => {
                const c = byTicker.get(p.ticker);
                const rec = c?.model?.recommendation;
                const series = payload.series.find((s) => s.ticker === p.ticker);
                const capCad = series?.marketCap != null ? series.marketCap * (series.currency === "CAD" ? 1 : payload.fx.find((f) => f.currency === series.currency)?.latest ?? NaN) : null;
                return (
                  <tr key={p.ticker} className="a-fade border-t border-line" style={{ animationDelay: `${Math.min(i, 20) * 30}ms` }}>
                    <td className="py-3 pl-6">
                      <input type="checkbox" checked aria-label={`Leave ${p.ticker} out`} disabled={built.positions.length <= 1}
                        onChange={() => setExcluded((s) => new Set([...s, p.ticker]))} className="h-4 w-4 cursor-pointer accent-[var(--color-teal)]" />
                    </td>
                    <td className="px-3 py-3">
                      <button onClick={() => onOpen(p.ticker)} className="group flex min-w-0 items-center gap-2.5 text-left">
                        <span className="grid h-7 min-w-14 place-items-center rounded-md border border-line bg-[var(--panel-hi)] px-1.5 font-mono text-[11px] font-semibold text-ink group-hover:border-teal">{p.ticker}</span>
                        <span className="min-w-0 max-w-[240px] truncate text-ink group-hover:underline">{c?.name ?? p.ticker}</span>
                        {rec && <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${recStyle[rec].badge}`}>{recStyle[rec].label}</span>}
                        {built.capped.includes(p.ticker) && <span className="shrink-0 rounded bg-soft px-1.5 py-0.5 text-[10px] font-semibold text-muted" title={`Held to ${Math.round(CAP_SHARE * 100)}%`}>Capped</span>}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-soft">
                          <div className="a-grow-x h-full rounded-full bg-teal" style={{ width: `${(p.weight / Math.max(...built.positions.map((x) => x.weight))) * 100}%` }} />
                        </div>
                        <span className="w-12 font-mono tabular-nums text-ink">{pct(p.weight)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-ink">{money(p.cost ?? p.target)}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-muted">{p.shares != null ? `${p.shares.toLocaleString("en-CA")} × ${price(p.price)}` : "no price"}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-muted">{capCad != null && Number.isFinite(capCad) ? money(capCad, true) : "—"}</td>
                    <td className="px-6 py-3 text-right font-mono tabular-nums">
                      <span className={p.annualReturn == null ? "text-faint" : p.annualReturn >= 0 ? "text-ink" : "text-bad"}>{pct(p.annualReturn, 1, true)}</span>
                      {p.since && <span className="ml-1.5 text-[11px] text-faint">since {p.since.slice(0, 4)}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-[var(--panel-hi)] text-[13px]">
                <td />
                <td className="px-3 py-3 font-medium text-ink">{n} {n === 1 ? "company" : "companies"}</td>
                <td className="px-3 py-3 font-mono tabular-nums text-muted">100%</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums text-ink">{money(built.amount - built.cash)}</td>
                <td colSpan={3} className="px-6 py-3 text-right text-muted">
                  <Explain info={EXPLAIN.cash}>Cash left over</Explain> <span className="ml-1 font-mono tabular-nums text-ink">{money(built.cash)}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {(excluded.size > 0 || built.dropped.length > 0) && (
          <div className="space-y-2 border-t border-line px-6 py-4 text-[12.5px]">
            {excluded.size > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-muted">
                Left out by you:
                {[...excluded].map((t) => (
                  <button key={t} onClick={() => setExcluded((s) => { const x = new Set(s); x.delete(t); return x; })} title="Put it back"
                    className="rounded-md border border-dashed border-line px-2 py-0.5 font-mono text-[11px] font-semibold text-ink hover:border-teal">+ {t}</button>
                ))}
              </div>
            )}
            {built.dropped.length > 0 && (
              <div className="text-faint">
                Not in the index:{" "}
                {byNote(built.dropped).map(([note, list]) => (
                  <span key={note} className="mr-3 inline-block">
                    <b className="font-mono text-muted">{list.map((d) => d.ticker).join(", ")}</b>: {note.toLowerCase()}.
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ---------------- back-test */}
      {bt && built.stats && (
        <section className="panel">
          <Head title={`If you had built it in ${monthLabel(bt.start)}`}
            sub={`The same weights, rebalanced every month, dividends reinvested, no fees. Against ${BENCHMARK.label} (XIC) over the same months. These are today's companies, picked with today's results, so the past flatters them.`} />
          <div className="grid border-t border-line lg:grid-cols-[1fr_300px] lg:divide-x lg:divide-line">
            <div className="px-3 pb-4 pt-5 md:px-6">
              <div className="mb-3 flex justify-end">
                <Segmented value={scale} onChange={setScale} options={[{ id: "linear", label: "Linear" }, { id: "log", label: "Log scale" }]} />
              </div>
              <GrowthChart key={scale} built={built} log={scale === "log"} />
            </div>
            <div className="grid grid-cols-2 content-start gap-x-4 gap-y-5 border-t border-line p-6 lg:border-t-0">
              <Versus label={<Explain info={EXPLAIN.annual}>Return a year</Explain>} a={pct(built.stats.annualReturn)} b={pct(built.benchmark?.samePeriod?.annualReturn)} />
              <Versus label={<Explain info={EXPLAIN.vol}>Volatility</Explain>} a={pct(built.stats.volatility)} b={pct(built.benchmark?.samePeriod?.volatility)} />
              <Versus label={<Explain info={EXPLAIN.drawdown}>Worst fall</Explain>} a={pct(built.stats.maxDrawdown)} b={pct(built.benchmark?.samePeriod?.maxDrawdown)} />
              <Versus label="Worst 12 months" a={pct(built.stats.worst12m)} b={pct(built.benchmark?.samePeriod?.worst12m)} />
              <Versus label="Best 12 months" a={pct(built.stats.best12m, 1, true)} b={pct(built.benchmark?.samePeriod?.best12m, 1, true)} />
              <Versus label="Today" a={money(built.amount * bt.levels[bt.levels.length - 1], true)}
                b={built.benchmark?.sameLevels ? money(built.amount * built.benchmark.sameLevels[built.benchmark.sameLevels.length - 1], true) : "—"} />
            </div>
          </div>
          {bt.coverage[0] < 0.999 && (
            <p className="border-t border-line px-6 py-3 text-[12.5px] text-faint">
              {coverageNote(bt.months, bt.coverage)}
            </p>
          )}
        </section>
      )}

      {/* ---------------- method */}
      <section className="panel px-6 py-5 text-[13px] leading-relaxed text-muted md:px-7">
        <div className="kicker mb-3">How this is built</div>
        <ul className="grid gap-x-8 gap-y-2 md:grid-cols-2">
          <li><b className="text-ink">Companies:</b> the ones the engine tested in {industry}, filtered by its verdict. A company with no price history is left out and listed above.</li>
          <li><b className="text-ink">Weights:</b> market cap (no company above {Math.round(CAP_SHARE * 100)}% when there are at least {Math.ceil(1 / CAP_SHARE)}), equal, or in proportion to {hasScore ? "the quality score" : "the share of scored checks passed"}. Whole shares only; the rest stays as cash.</li>
          <li><b className="text-ink">Back-test:</b> up to {LOOKBACK_MONTHS / 12} years of month-end prices with dividends reinvested, in Canadian dollars (US listings converted at each month&apos;s USD/CAD rate). It starts once the companies with prices carry {Math.round(MIN_COVERAGE * 100)}% of the weight.</li>
          <li><b className="text-ink">Hindsight:</b> the back-test holds today&apos;s companies, chosen on today&apos;s filings, all the way back. Companies that failed or were bought out are not in it, so the past looks better than an index built at the time would have done.</li>
          <li><b className="text-ink">Projection:</b> the back-test&apos;s average monthly log return and its spread, carried forward, or (&ldquo;Market&apos;s pace&rdquo;) the same spread at the TSX Composite&apos;s average growth. The bands also count the uncertainty in that average, so they widen with time and with a short history. It is what the past implies, not a forecast.</li>
        </ul>
        <p className="mt-4 text-[12px] text-faint">
          Prices: {payload.source}, as of {new Date(payload.asOf).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}. Fees, taxes and trading costs are ignored. Not investment advice.
        </p>
      </section>
    </div>
  );
}

/** Left-out companies grouped by the reason, in first-seen order. */
function byNote(list: { ticker: string; note: string }[]): [string, { ticker: string; note: string }[]][] {
  const m = new Map<string, { ticker: string; note: string }[]>();
  for (const d of list) m.set(d.note, [...(m.get(d.note) ?? []), d]);
  return [...m];
}

function coverageNote(months: string[], coverage: number[]): string {
  const full = coverage.findIndex((c) => c >= 0.999);
  if (full < 0) return "Not every company has prices for the whole period; each month, the weight of those without a price is shared among the others.";
  return `Until ${monthLabel(months[full])} not every company was listed; each month, the weight of those without a price is shared among the others.`;
}

const EXPLAIN = {
  basis: { title: "Growth assumed", what: "Its own past: the index keeps the average month and the ups and downs it had in the back-test. Market's pace: the same ups and downs, but the TSX Composite's average growth, so it does not assume a hot run lasts.", how: "Market's pace uses the index's spread of monthly log returns with the TSX Composite's average monthly log return over the last 20 years." },
  likely: { title: "Likely range", what: "Half of the outcomes the back-test implies land in this range: a quarter end below it, a quarter above.", how: "The 25th and 75th percentiles of a lognormal with the back-test's average and spread; the spread includes how uncertain that average is." },
  middle: { title: "Middle outcome", what: "Half of the outcomes the back-test implies end above this, half below.", how: "Start × e^(μ·T), where μ is the average monthly log return of the back-test and T the months ahead." },
  bad: { title: "Bad case (1 in 10)", what: "Only one outcome in ten ends lower than this.", how: "The 10th percentile of a lognormal with the back-test's average and spread; the spread includes how uncertain that average is." },
  good: { title: "Good case (1 in 10)", what: "Only one outcome in ten ends higher than this.", how: "The 90th percentile of the same lognormal." },
  loss: { title: "Chance of a loss", what: "Chance of ending below the starting $100,000.", how: "Normal probability that the log return over the horizon is below zero." },
  own: { title: "Company's own return a year", what: "What the company's shares returned a year, dividends reinvested, in Canadian dollars.", how: "Over its last 20 years of prices, or since it listed if later." },
  cash: { title: "Cash left over", what: "Whole shares cannot use every dollar; what is left stays as cash and is not in the back-test." },
  annual: { title: "Return a year", how: "(Value at the end ÷ value at the start)^(12 ÷ months) − 1." },
  vol: { title: "Volatility", what: "How much the index swings around its average.", how: "Standard deviation of monthly returns × √12." },
  drawdown: { title: "Worst fall", what: "The largest drop from a high to a later low." },
};

// ---------------------------------------------------------------- small parts

function Head({ title, sub, right }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-6 pb-4 pt-5 md:px-7">
      <div className="min-w-0 max-w-3xl">
        <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-faint">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="kicker mb-1.5 !text-[9.5px]">{label}</div>
      {children}
    </div>
  );
}

function Mini({ label, value, tone }: { label: React.ReactNode; value: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <div className="text-[11.5px] text-faint">{label}</div>
      <div className={`mt-0.5 font-mono text-[17px] font-semibold tabular-nums ${tone === "bad" ? "text-bad" : tone === "good" ? "text-teal" : "text-ink"}`}>{value}</div>
    </div>
  );
}

function Versus({ label, a, b }: { label: React.ReactNode; a: string; b: string }) {
  return (
    <div>
      <div className="text-[11.5px] text-faint">{label}</div>
      <div className="mt-1 font-mono text-[17px] font-semibold tabular-nums text-ink">{a}</div>
      <div className="mt-0.5 font-mono text-[11.5px] tabular-nums text-faint">TSX {b}</div>
    </div>
  );
}

function HorizonPicker({ value, onChange, small }: { value: number; onChange: (y: number) => void; small?: boolean }) {
  return (
    <div className="inline-flex rounded-lg bg-soft p-0.5 font-mono text-xs font-medium" role="group" aria-label="Horizon">
      {HORIZONS.map((y) => (
        <button key={y} onClick={() => onChange(y)} aria-pressed={value === y}
          className={`rounded-md ${small ? "px-2 py-1" : "px-3 py-1.5"} transition-all ${value === y ? "bg-white text-ink shadow-sm [.panels-dark_&]:bg-white/15" : "text-muted hover:text-ink"}`}>
          {y}y
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- charts

/** Round a domain to tidy ticks. */
function ticks(max: number, count = 4): number[] {
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) out.push(v);
  return out;
}

/** Gridlines for a log scale: 1-2-5 steps between lo and hi, thinned to at most 7. */
function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, e);
      if (v >= lo && v <= hi) out.push(v);
    }
  }
  if (out.length <= 7) return out;
  const decades = out.filter((v) => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9);
  return decades.length >= 2 ? decades : out.filter((_, i) => i % 2 === 0);
}

/** Width of a chart's box in CSS pixels, so the SVG draws 1:1 and its labels stay readable on a phone. */
function useWidth(ref: React.RefObject<HTMLDivElement | null>, fallback = 760): number {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** The projection: median line, 25–75 and 10–90 bands, the benchmark's median dashed. Hover to read a year. */
function FanChart({ built, basis, horizon, showBench }: { built: BuiltIndex; basis: Basis; horizon: number; showBench: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const W = useWidth(wrap);
  const H = W < 560 ? 230 : 300;
  const P = { l: 64, r: 16, t: 14, b: 28 };
  const steps = Math.max(24, Math.min(120, horizon * 12));
  const pts = useMemo(() => Array.from({ length: steps + 1 }, (_, i) => projectAt(built.amount, basis, (horizon * i) / steps)), [built, basis, horizon, steps]);
  const bench = useMemo(() => showBench && built.benchmark?.stats && built.benchmark.stats.months >= MIN_PROJECTION_MONTHS
    ? Array.from({ length: steps + 1 }, (_, i) => projectAt(built.amount, built.benchmark!.stats as ReturnStats, (horizon * i) / steps).p50)
    : null, [built, horizon, steps, showBench]);
  // Log scale: compounding is a straight line, and a halving looks as big as a doubling.
  const hi = Math.max(pts[steps].p90, ...(bench ?? []), built.amount) * 1.08;
  const lo = Math.min(...pts.map((p) => p.p10), ...(bench ?? []), built.amount) / 1.08;
  const yt = logTicks(lo, hi);
  const x = (i: number) => P.l + ((W - P.l - P.r) * i) / steps;
  const y = (v: number) => P.t + (H - P.t - P.b) * (1 - (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)));
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const band = (lo: number[], hi: number[]) => `${line(hi)}${lo.map((v, i) => i).reverse().map((i) => `L${x(i).toFixed(1)},${y(lo[i]).toFixed(1)}`).join("")}Z`;
  const xTicks = horizon <= 1 ? [0, 0.25, 0.5, 0.75, 1] : horizon <= 5 ? Array.from({ length: horizon + 1 }, (_, i) => i) : horizon <= 10 ? [0, 2, 4, 6, 8, 10] : horizon <= 20 ? [0, 5, 10, 15, 20] : [0, 5, 10, 15, 20, 25, 30];
  const h = hover != null ? pts[hover] : null;

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(steps, Math.round(((px - P.l) / (W - P.l - P.r)) * steps))));
  };

  return (
    <div className="relative" ref={wrap}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img"
        aria-label={`Projection of ${money(built.amount)} over ${horizonLabel(horizon)}: middle ${money(pts[steps].p50)}, bad case ${money(pts[steps].p10)}, good case ${money(pts[steps].p90)}`}>
        {yt.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" />
            <text x={P.l - 8} y={y(v) + 4} textAnchor="end" className="fill-[var(--color-faint)] font-mono text-[10.5px]">{money(v, true)}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={x((t / horizon) * steps)} y={H - 8} textAnchor="middle" className="fill-[var(--color-faint)] font-mono text-[10.5px]">
            {t === 0 ? "Today" : horizon <= 1 ? `${Math.round(t * 12)} mo` : `${t}y`}
          </text>
        ))}
        <line x1={P.l} x2={W - P.r} y1={y(built.amount)} y2={y(built.amount)} stroke="var(--color-faint)" strokeDasharray="2 4" />
        <g className="a-fade">
          <path d={band(pts.map((p) => p.p10), pts.map((p) => p.p90))} fill="var(--color-teal)" opacity={0.12} />
          <path d={band(pts.map((p) => p.p25), pts.map((p) => p.p75))} fill="var(--color-teal)" opacity={0.2} />
          {bench && <path d={line(bench)} fill="none" stroke="var(--color-muted)" strokeWidth={1.5} strokeDasharray="5 5" />}
          <path d={line(pts.map((p) => p.p50))} fill="none" stroke="var(--color-teal)" strokeWidth={2.5} className="a-draw" pathLength={1} />
        </g>
        {h && hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="var(--color-ink)" strokeOpacity={0.25} />
            <circle cx={x(hover)} cy={y(h.p50)} r={4} fill="var(--color-teal)" />
          </g>
        )}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 px-2 text-[11.5px] text-muted md:px-0 md:pl-16">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-teal" /> Middle</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-teal/35" /> Half of outcomes</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-teal/15" /> 8 in 10 outcomes</span>
        {bench && <span className="flex items-center gap-1.5"><span className="w-4 border-t-[1.5px] border-dashed border-muted" /> {BENCHMARK.label}, middle</span>}
        <span className="ml-auto text-faint">Log scale: each gridline step is the same percentage gain</span>
      </div>
      {h && hover != null && (
        <div className="pointer-events-none absolute top-2 rounded-lg border border-line bg-[var(--panel-solid)] px-3 py-2 text-[12px] shadow-lg"
          style={{ left: `${Math.min(70, Math.max(10, (x(hover) / W) * 100))}%`, transform: "translateX(-50%)" }}>
          <div className="font-semibold text-ink">{h.years < 1 ? `${Math.round(h.years * 12)} months` : `${(Math.round(h.years * 10) / 10).toString()} years`}</div>
          <div className="mt-1 grid grid-cols-[auto_auto] gap-x-4 font-mono tabular-nums">
            <span className="text-faint">Good</span><span className="text-right text-ink">{money(h.p90)}</span>
            <span className="text-faint">Middle</span><span className="text-right font-semibold text-teal">{money(h.p50)}</span>
            <span className="text-faint">Bad</span><span className="text-right text-ink">{money(h.p10)}</span>
            {bench && <><span className="text-faint">TSX</span><span className="text-right text-muted">{money(bench[hover])}</span></>}
          </div>
        </div>
      )}
    </div>
  );
}

/** The back-test: $100,000 grown month by month, index vs the benchmark. */
function GrowthChart({ built, log }: { built: BuiltIndex; log: boolean }) {
  const bt = built.backtest!;
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const W = useWidth(wrap);
  const H = W < 560 ? 210 : 260;
  const P = { l: 64, r: 16, t: 14, b: 28 };
  const a = bt.levels.map((v) => v * built.amount);
  const b = built.benchmark?.sameLevels?.map((v) => v * built.amount) ?? null;
  const n = a.length - 1;
  const top = Math.max(...a, ...(b ?? [])) * 1.04;
  const bottom = Math.min(...a, ...(b ?? [])) / 1.04;
  const yt = log ? logTicks(bottom, top) : ticks(top);
  const yMax = log ? top : yt[yt.length - 1];
  const x = (i: number) => P.l + ((W - P.l - P.r) * i) / Math.max(n, 1);
  const y = (v: number) => P.t + (H - P.t - P.b) * (1 - (log ? (Math.log(v) - Math.log(bottom)) / (Math.log(yMax) - Math.log(bottom)) : v / yMax));
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const months = [bt.start, ...bt.months];
  const yearTicks = months.map((m, i) => ({ m, i })).filter(({ m }, k, all) => m.endsWith("-01") && (all.length < 90 && W >= 560 || Number(m.slice(0, 4)) % (n > 180 || W < 560 ? 4 : 2) === 0));
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(n, Math.round(((px - P.l) / (W - P.l - P.r)) * n))));
  };
  return (
    <div className="relative" ref={wrap}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img"
        aria-label={`Back-test: ${money(built.amount)} in ${monthLabel(bt.start)} grew to ${money(a[n])}`}>
        {yt.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" />
            <text x={P.l - 8} y={y(v) + 4} textAnchor="end" className="fill-[var(--color-faint)] font-mono text-[10.5px]">{money(v, true)}</text>
          </g>
        ))}
        {yearTicks.map(({ m, i }) => (
          <text key={m} x={x(i)} y={H - 8} textAnchor="middle" className="fill-[var(--color-faint)] font-mono text-[10.5px]">{m.slice(0, 4)}</text>
        ))}
        <line x1={P.l} x2={W - P.r} y1={y(built.amount)} y2={y(built.amount)} stroke="var(--color-faint)" strokeDasharray="2 4" />
        {b && <path d={line(b)} fill="none" stroke="var(--color-muted)" strokeWidth={1.5} strokeDasharray="5 5" />}
        <path d={line(a)} fill="none" stroke="var(--color-teal)" strokeWidth={2.2} className="a-draw" pathLength={1} />
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="var(--color-ink)" strokeOpacity={0.25} />
            <circle cx={x(hover)} cy={y(a[hover])} r={4} fill="var(--color-teal)" />
          </g>
        )}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 px-2 text-[11.5px] text-muted md:px-0 md:pl-16">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-teal" /> Your index</span>
        {b && <span className="flex items-center gap-1.5"><span className="w-4 border-t-[1.5px] border-dashed border-muted" /> {BENCHMARK.label} (XIC)</span>}
      </div>
      {hover != null && (
        <div className="pointer-events-none absolute top-2 rounded-lg border border-line bg-[var(--panel-solid)] px-3 py-2 text-[12px] shadow-lg"
          style={{ left: `${Math.min(75, Math.max(12, (x(hover) / W) * 100))}%`, transform: "translateX(-50%)" }}>
          <div className="font-semibold text-ink">{monthLabel(months[hover])}</div>
          <div className="mt-1 grid grid-cols-[auto_auto] gap-x-4 font-mono tabular-nums">
            <span className="text-faint">Index</span><span className="text-right font-semibold text-teal">{money(a[hover])}</span>
            {b && <><span className="text-faint">TSX</span><span className="text-right text-muted">{money(b[hover])}</span></>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- loading

/**
 * The build, step by step. Steps advance on a timer, except "pulling prices", which waits for the prices to arrive.
 * The figures appear only once they are computed.
 */
function BuildLoading({ industry, count, method, built, payload, onDone }: {
  industry: string; count: number; method: Weighting; built: BuiltIndex | null; payload: PricePayload | null; onDone: () => void;
}) {
  const [at, setAt] = useState(0);
  const PRICES = 1;
  const weighting = method === "marketCap" ? "by market cap" : method === "equal" ? "equally" : "by checks passed";
  const months = built?.backtest?.months.length;
  const steps = [
    `Gathering the ${count} ${industry} ${count === 1 ? "company" : "companies"}`,
    payload ? `Pulled ${LOOKBACK_MONTHS / 12} years of monthly prices` : `Pulling ${LOOKBACK_MONTHS / 12} years of monthly prices from Yahoo Finance`,
    "Converting every price to Canadian dollars",
    `Splitting ${money(START_AMOUNT)} ${weighting}`,
    months ? `Back-testing ${months} months, rebalancing each one` : "Back-testing the index month by month",
    "Projecting 1 to 30 years ahead",
  ];
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; });

  useEffect(() => {
    if (at === PRICES && !payload) return; // wait for the prices
    if (at >= steps.length) {
      const t = setTimeout(() => doneRef.current(), 450);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setAt((n) => n + 1), at === 0 ? 650 : 720);
    return () => clearTimeout(t);
  }, [at, payload, steps.length]);

  const shown = Math.min(at, steps.length - 1);
  const chips = at >= 3 && built ? built.positions : [];
  return (
    <section className="panel mx-auto grid w-full max-w-5xl gap-8 px-6 py-8 md:grid-cols-[1fr_340px] md:px-9"
      style={{ backgroundImage: "radial-gradient(70% 120% at 0% 0%, var(--color-tealsoft), transparent 55%)" }} aria-live="polite">
      <div className="min-w-0 self-center">
        <div className="kicker flex items-center gap-2"><span className="live-dot" /> Generating your index</div>
        <h1 key={shown} className="a-fade mt-4 text-[28px] font-bold leading-tight tracking-[-0.03em] text-ink md:text-[34px]">{steps[shown]}…</h1>
        <div className="mt-5 h-1 overflow-hidden rounded-full bg-soft">
          <div className="h-full rounded-full bg-teal transition-[width] duration-700" style={{ width: `${(Math.min(at + 1, steps.length) / steps.length) * 100}%` }} />
        </div>
        <div className="mt-7 rounded-2xl border border-line bg-[var(--panel-hi)] p-5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="kicker">Starting amount</span>
            <span className="font-mono text-[26px] font-semibold tabular-nums tracking-tight text-ink">{money(START_AMOUNT)}</span>
          </div>
          <div className="mt-4 flex min-h-[64px] flex-wrap content-start gap-1.5">
            {chips.length === 0 && Array.from({ length: Math.min(count, 14) }, (_, i) => (
              <span key={i} className="h-6 w-16 animate-pulse rounded-md bg-soft" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
            {chips.map((p, i) => (
              <span key={p.ticker} className="a-fade inline-flex items-center gap-1.5 rounded-md bg-tealsoft px-2 py-0.5 font-mono text-[11px] font-semibold text-teal"
                style={{ animationDelay: `${i * 60}ms` }}>
                {p.ticker} <span className="font-normal opacity-75">{money(p.target, true)}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <ol className="flex flex-col gap-1.5 self-center">
        {steps.map((s, i) => (
          <li key={i} className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[13px] transition-colors duration-300 ${i === at ? "border-teal/50 bg-tealsoft text-ink" : i < at ? "border-line text-ink" : "border-line text-faint"}`}>
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[10px] font-semibold ${i < at ? "bg-tealsoft text-teal" : i === at ? "bg-teal text-white [.panels-dark_&]:text-[#03160a]" : "ring-1 ring-inset ring-line"}`}>
              {i < at ? "✓" : i === at && i === PRICES && !payload ? <span className="h-2 w-2 animate-ping rounded-full bg-current" /> : i + 1}
            </span>
            <span className="min-w-0">{s}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
