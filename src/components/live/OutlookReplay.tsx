"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Direction, OutlookData, OutlookIndustry, OutlookSignal, Trend } from "@contract/outlook";
import { setSoundEnabled, sfx, soundEnabled } from "./sound";
import { panelsClass, usePanelTheme } from "../theme";

/*
  The Outlook engine run, replayed in at most 10 seconds. Same order as engine/outlook/build-outlook.ts:
  revenue segments, industry labels, the three published signals, the median outlook, the revenue-weighted
  tailwind, the deals and direction, then the hand-off to the stock score. Every code, value, count and verdict
  is read from data/outlook.json, built ahead of time by npm run outlook. Only the pacing is made up.
*/

const END = 10_000;
const FADE = 450;
const PH = [
  { at: 0, key: "segments", title: "Reading revenue segments" },
  { at: 1100, key: "labels", title: "Mapping revenue to industries" },
  { at: 2200, key: "momentum", title: "Pulling StatCan monthly GDP" },
  { at: 3400, key: "projection", title: "Reading the 10-year projections" },
  { at: 4500, key: "street", title: "Analyst estimates for listed peers" },
  { at: 5600, key: "blend", title: "Blending: the median of the signals" },
  { at: 6600, key: "tailwind", title: "Weighting by revenue: the tailwind" },
  { at: 7800, key: "direction", title: "Reading the deals: direction" },
  { at: 8800, key: "score", title: "Handing the tailwind to the score" },
] as const;
const DONE = 9_500;
const MAX_IND = 14;

const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const ramp = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const TREND: Record<Trend, string> = { growing: "bg-tealsoft text-teal", stable: "bg-warnsoft text-warn", declining: "bg-badsoft text-bad" };
const ARROW: Record<Direction, string> = { toward: "↗", steady: "→", away: "↘" };

type Col = { key: string; head: string; pick: (i: OutlookIndustry) => OutlookSignal | undefined; at: number };
const COLS: Col[] = [
  { key: "m", head: "StatCan momentum", pick: (i) => i.signals.find((s) => s.kind === "momentum"), at: PH[2].at },
  { key: "ca", head: "ESDC 2025–35", pick: (i) => i.signals.find((s) => s.kind === "projection" && s.geo === "Canada"), at: PH[3].at },
  { key: "us", head: "BLS 2025–35", pick: (i) => i.signals.find((s) => s.kind === "projection" && s.geo === "United States"), at: PH[3].at + 450 },
  { key: "st", head: "Analysts", pick: (i) => i.signals.find((s) => s.kind === "street"), at: PH[4].at },
];

function buildRun(o: OutlookData) {
  const featured = o.companies.filter((c) => c.featured);
  const segments = o.companies.flatMap((c) => c.mix.map((r) => ({ ticker: c.ticker, ...r })));
  // industries the featured companies earn in first, then the rest by outlook; the board shows the top of that list
  const featuredCodes = new Set(featured.flatMap((c) => c.industryMix.map((m) => m.naics)));
  const industries = [...o.industries].sort(
    (a, b) => Number(featuredCodes.has(b.naics)) - Number(featuredCodes.has(a.naics)) || (b.outlook ?? -1) - (a.outlook ?? -1),
  );
  const board = industries.slice(0, MAX_IND);
  const series = o.industries.reduce((n, i) => n + i.signals.filter((s) => s.kind !== "narrative" && s.value != null).length, 0);
  const peers = new Set(o.industries.flatMap((i) => i.signals.flatMap((s) => (s.peers ?? []).map((p) => p.ticker)))).size;
  const scored = o.companies.filter((c) => c.tailwind != null).length;
  const tape = segments.map((r) => ({ key: `${r.ticker}-${r.segment}`, ticker: r.ticker, text: `${r.segment} · ${r.period}${r.share != null ? ` · ${(r.share * 100).toFixed(0)}% of revenue` : ""}` }));

  const rowAt = (i: number) => PH[1].at + 60 + i * Math.min(55, 900 / board.length);
  const cellAt = (c: Col, i: number) => c.at + i * Math.min(45, 700 / board.length);
  const blendAt = (i: number) => PH[5].at + i * Math.min(50, 800 / board.length);
  const twAt = (i: number) => PH[6].at + 150 + i * 160;
  const dirAt = (i: number) => PH[7].at + 150 + i * 150;

  const sounds: { at: number; play: () => void }[] = [];
  PH.slice(1).forEach((p) => sounds.push({ at: p.at, play: sfx.read }));
  board.forEach((_, i) => sounds.push({ at: blendAt(i), play: sfx.none }));
  featured.forEach((_, i) => sounds.push({ at: twAt(i), play: sfx.pass }));
  sounds.push({ at: DONE - 200, play: sfx.done });
  sounds.sort((a, b) => a.at - b.at);

  return { featured, segments, industries, board, series, peers, scored, tape, rowAt, cellAt, blendAt, twAt, dirAt, sounds };
}

export default function OutlookReplay({ outlook, runNo, onDone }: { outlook: OutlookData; runNo: number; onDone: () => void }) {
  const run = useMemo(() => buildRun(outlook), [outlook]);
  const theme = usePanelTheme();
  const [t, setT] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [sound, setSound] = useState(soundEnabled);
  const finished = useRef(false);
  const sfxAt = useRef(0);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setLeaving(true);
    setTimeout(onDone, FADE);
  }, [onDone]);

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    sfxAt.current = 0;
    const tick = (now: number) => {
      const e = now - t0;
      setT(e);
      while (sfxAt.current < run.sounds.length && run.sounds[sfxAt.current].at <= e) run.sounds[sfxAt.current++].play();
      if (e >= END - FADE) return finish();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        finish();
      }
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [finish]);

  const phase = t >= DONE ? -1 : PH.reduce((p, x, i) => (t >= x.at ? i : p), 0);
  const o = outlook;
  const sub = [
    `Onesheet reported segments for ${o.companies.length} companies: ${run.segments.length} revenue lines, each with its share of revenue.`,
    `Each line gets a NAICS industry code and the filing or profile quote that justifies it.`,
    `Statistics Canada table 36-10-0434: real GDP by industry, latest 12 months against 3 years earlier.`,
    `ESDC's Canadian projections and the US BLS projections, 2025 to 2035, after inflation.`,
    `Median analyst revenue growth of ${run.peers} listed peers, with the 2% inflation target removed.`,
    `Each industry's outlook is the median of its signals; growing means at least the whole economy (${pct(o.economy.outlook)}).`,
    `Each company: its industries' outlooks weighted by its revenue in them.`,
    `${o.deals.length} disclosed deals with their quotes: are recent deals in stronger or weaker industries?`,
    `${run.scored} companies get a tailwind: 10 points of the quality score and the "growing ≥ economy" check.`,
  ];
  const caption =
    t >= DONE ? { k: "done", v: `${run.scored} companies scored · ${o.industries.length} industries · ${run.series} published series` }
    : { k: PH[Math.max(phase, 0)].key, v: PH[Math.max(phase, 0)].title };
  const tapeX = -((t * (t < PH[2].at ? 0.22 : 0.06)) % 6000);
  const gridCols = `64px minmax(140px,1fr) repeat(${COLS.length}, minmax(64px,84px)) 70px 84px`;

  return (
    <div role="dialog" aria-label="Outlook engine run" aria-live="polite"
      className={`${panelsClass(theme)} fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-black/55 backdrop-blur-md transition-all duration-500 ${leaving ? "scale-[1.015] opacity-0" : "opacity-100"}`}>
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_85%_0%,rgba(61,220,108,0.10),transparent_60%)]" />

      <header className="relative border-b border-white/10 bg-black/35 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 md:px-8">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-[#fff] text-[11px] font-bold text-[#050505]">X</span>
          <span className="text-sm font-semibold tracking-tight text-white">Outlook engine</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/50">Run #{runNo}</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="font-mono text-[12px] tabular-nums text-white/70"><span className="text-white">{(Math.min(t, END) / 1000).toFixed(2)}</span>s / 10.00s</span>
            <button onClick={() => { setSoundEnabled(!sound); setSound(!sound); }} aria-pressed={sound}
              className="rounded-md border border-white/15 px-2.5 py-1 text-[12px] font-medium text-white/75 hover:border-white/40 hover:text-white">
              {sound ? "Sound on" : "Sound off"}
            </button>
            <button onClick={finish} className="rounded-md bg-[#fff] px-3 py-1 text-[12px] font-semibold text-[#050505] hover:opacity-85">Skip ⏎</button>
          </div>
        </div>
        <div className="h-[2px] bg-white/10">
          <div className="h-full bg-[var(--color-signal)] shadow-[0_0_12px_var(--color-signal)]" style={{ width: `${Math.min(100, (t / DONE) * 100)}%` }} />
        </div>
      </header>

      <div className="relative mx-auto grid w-full max-w-[1320px] gap-5 px-5 py-6 md:px-8 lg:grid-cols-[290px_minmax(0,1fr)]">
        <section className="flex flex-col gap-4">
          <div className="panel px-5 py-5">
            <div className="kicker flex items-center gap-2"><span className="live-dot" />Outlook engine · run</div>
            <h1 key={phase} className="a-fade mt-3 text-[26px] font-bold leading-[1.1] tracking-[-0.03em] text-ink">
              {phase < 0 ? "Done. Opening the outlook." : `${PH[phase].title}…`}
            </h1>
            <p className="mt-2 min-h-[56px] text-[13px] leading-snug text-muted">{phase < 0 ? "Published sources only; no forecast of ours." : sub[phase]}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Counter label="revenue lines read" value={Math.round(ramp(t, 100, PH[1].at) * run.segments.length)} />
              <Counter label="industries mapped" value={Math.round(ramp(t, PH[1].at, PH[2].at) * o.industries.length)} />
              <Counter label="published series" value={Math.round(ramp(t, PH[2].at, PH[5].at) * run.series)} />
              <Counter label="companies scored" value={Math.round(ramp(t, PH[8].at, DONE - 100) * run.scored)} tone="teal" />
            </div>
          </div>
          <ol className="hidden flex-col gap-1.5 lg:flex">
            {PH.map((p, i) => {
              const done = phase < 0 || i < phase;
              const on = i === phase;
              const end = i + 1 < PH.length ? PH[i + 1].at : DONE;
              return (
                <li key={p.key} className={`flex items-center gap-3 rounded-xl border bg-[var(--panel)] px-3 py-2 text-[12.5px] backdrop-blur-xl transition-colors duration-300 ${on ? "border-teal/50 text-ink shadow-[inset_0_0_0_999px_var(--color-tealsoft)]" : done ? "border-line text-ink" : "border-line text-faint"}`}>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[10px] font-semibold ${done ? "bg-tealsoft text-teal" : on ? "bg-teal text-white [.panels-dark_&]:text-[#03160a]" : "ring-1 ring-inset ring-line"}`}>
                    {done ? "✓" : i + 1}
                  </span>
                  <span className="min-w-0">{p.title}</span>
                  {done && <span className="ml-auto font-mono text-[10.5px] text-faint">{((end - p.at) / 1000).toFixed(1)}s</span>}
                </li>
              );
            })}
          </ol>
        </section>

        <section className="flex min-w-0 flex-col gap-5">
          <div className="panel min-w-0 overflow-hidden">
            <div className="relative h-[34px] overflow-hidden border-b border-line font-mono text-[11px] text-muted [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
              <div className="absolute left-0 top-0 flex gap-7 whitespace-nowrap px-4 py-[9px]" style={{ transform: `translateX(${tapeX}px)` }}>
                {[...run.tape, ...run.tape].map((l, i) => (
                  <span key={`${l.key}-${i}`}><b className="font-medium text-ink">{l.ticker}</b> {l.text}</span>
                ))}
              </div>
            </div>
            <div className="flex min-h-[42px] items-center gap-3 border-b border-line px-4 py-2.5 text-[12px]">
              <span className="kicker">{caption.k}</span>
              <span className="truncate font-mono text-ink">{caption.v}</span>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid h-10 items-center gap-x-1.5 border-b border-line px-4 font-mono text-[9.5px] uppercase tracking-[0.04em] text-faint" style={{ gridTemplateColumns: gridCols }}>
                  <div>NAICS</div><div>Industry</div>
                  {COLS.map((c) => <div key={c.key} className={`text-center ${phase >= 0 && t >= c.at && t < c.at + 1100 ? "text-teal" : ""}`}>{c.head}</div>)}
                  <div className="text-center">Outlook</div><div className="text-center">Trend</div>
                </div>
                {run.board.map((ind, i) => {
                  const shown = t >= run.rowAt(i);
                  const blended = t >= run.blendAt(i);
                  return (
                    <div key={ind.naics} className="grid h-[30px] items-center gap-x-1.5 px-4 text-[12px] transition-opacity duration-300" style={{ gridTemplateColumns: gridCols, opacity: shown ? 1 : 0 }}>
                      <div className="font-mono text-[11px] text-muted">{ind.naics}</div>
                      <div className="truncate text-ink" title={ind.title}>{ind.title}</div>
                      {COLS.map((c) => {
                        const s = c.pick(ind);
                        const on = t >= run.cellAt(c, i);
                        return (
                          <div key={c.key} className={`h-[20px] rounded-md text-center font-mono text-[11px] leading-[20px] transition-colors duration-200 ${on ? (s?.value != null ? "bg-soft text-ink" : "text-faint ring-1 ring-inset ring-line") : "text-transparent"}`}>
                            {on ? pct(s?.value) : ""}
                          </div>
                        );
                      })}
                      <div className={`h-[20px] rounded-md text-center font-mono text-[11px] font-semibold leading-[20px] ${blended ? "a-cell text-ink ring-1 ring-inset ring-teal/40" : "text-transparent"}`}>{blended ? pct(ind.outlook) : ""}</div>
                      <div className="text-center">
                        {blended && ind.trend && (
                          <span className={`a-cell rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ${TREND[ind.trend]}`}>{ind.trend}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {run.industries.length > run.board.length && (
                  <div className="px-4 pb-2.5 pt-1 font-mono text-[11px] text-faint" style={{ opacity: t >= PH[2].at ? 1 : 0 }}>
                    + {run.industries.length - run.board.length} more industries read the same way
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="panel px-5 py-4">
            <div className="kicker mb-3">Featured companies · tailwind and direction</div>
            <div className="space-y-2.5">
              {run.featured.map((c, i) => {
                const on = t >= run.twAt(i);
                const dir = t >= run.dirAt(i);
                const w = c.tailwind != null ? Math.max(0, Math.min(1, c.tailwind / 0.06)) : 0;
                return (
                  <div key={c.ticker} className="grid grid-cols-[56px_minmax(0,1fr)_64px_92px] items-center gap-3 text-[12.5px]" style={{ opacity: t >= PH[6].at ? 1 : 0.25, transition: "opacity .4s" }}>
                    <span className="font-mono font-semibold text-ink">{c.ticker}</span>
                    <div className="relative h-2 overflow-hidden rounded-full bg-line">
                      <div className={`h-full rounded-full transition-[width] duration-700 ease-out ${c.trend === "growing" ? "bg-teal" : c.trend === "stable" ? "bg-warn" : "bg-bad"}`} style={{ width: on ? `${w * 100}%` : 0 }} />
                      {o.economy.outlook != null && <span className="absolute inset-y-0 w-px bg-ink/60" style={{ left: `${Math.min(1, o.economy.outlook / 0.06) * 100}%` }} />}
                    </div>
                    <span className="text-right font-mono tabular-nums text-ink">{on ? pct(c.tailwind) : ""}</span>
                    <span className={`font-mono text-[11.5px] transition-opacity duration-300 ${dir ? "opacity-100" : "opacity-0"} ${c.direction === "toward" ? "text-teal" : c.direction === "away" ? "text-bad" : "text-ink"}`}>
                      {c.direction ? `${ARROW[c.direction]} ${c.direction}` : "— no call"}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 font-mono text-[11px] text-faint">
              {t >= DONE - 200 ? <span className="a-fade">Line = the whole economy, {pct(o.economy.outlook)} a year. {run.scored} companies carry a tailwind into the stock score.</span> : "Every value is read from this run. Press Enter to skip."}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Counter({ label, value, tone }: { label: string; value: number; tone?: "teal" }) {
  return (
    <div className="rounded-xl border border-line bg-soft px-3 py-2.5">
      <div className={`font-mono text-[21px] font-medium tabular-nums tracking-[-0.02em] ${tone === "teal" && value > 0 ? "text-teal" : "text-ink"}`}>{value}</div>
      <div className="mt-0.5 text-[11px] leading-tight text-faint">{label}</div>
    </div>
  );
}
