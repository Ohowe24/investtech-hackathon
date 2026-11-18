"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Company, Dataset } from "@contract/types";
import { formatMetric, pct, verdictStyle } from "@/lib/format";
import { setSoundEnabled, sfx, soundEnabled } from "./sound";
import { panelsClass, usePanelTheme } from "../theme";

/*
  The engine run, replayed in at most 10 seconds once the result is in.
  Same order as engine/analyze.ts: the Canadian universe, the filings, the KPIs, the checks,
  the quality score and rank, then the weights. Every ticker, value, pass/fail, score, verdict
  and weight is read from the dataset. Only the pacing is made up.
*/

const END = 10_000; // hard cap, fade included
const FADE = 450;
const PH = [
  { at: 0, key: "universe", title: "Loading the Canadian universe" },
  { at: 1200, key: "filings", title: "Pulling annual statements" },
  { at: 3200, key: "kpis", title: "Computing KPIs from the filings" },
  { at: 5200, key: "checks", title: "Running the industry's checks" },
  { at: 7000, key: "score", title: "Scoring and ranking" },
  { at: 8600, key: "weights", title: "Sizing the adds" },
] as const;
const DONE = 9_500;
const RANK_AT = 7_800;
const MAX_ROWS = 24;

/** Compact money for the filings tape, in the company's reporting currency. Display only. */
function money(n: number | null | undefined): string | null {
  if (n == null) return null;
  const a = Math.abs(n);
  return a >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : `${(n / 1e6).toFixed(1)}M`;
}

const ramp = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));

function buildRun(dataset: Dataset) {
  const tested = dataset.companies.filter((c) => c.model);
  const all = tested.filter((c) => !c.inIndex);
  const holdings = tested.filter((c) => c.inIndex);
  // Too many to read in 10 seconds: show the top of the ranking, say how many more were tested.
  const shown = [...all].sort((a, b) => a.model!.rank - b.model!.rank).slice(0, MAX_ROWS);
  const az = [...shown].sort((a, b) => a.ticker.localeCompare(b.ticker));
  const ranked = shown;
  const unmeasured = (dataset.unmeasured ?? []).slice(0, Math.max(0, MAX_ROWS + 4 - az.length));
  const checks = tested[0]?.model?.checks ?? [];
  const unitOf = (metricId: string) => dataset.metricDefs.find((d) => d.id === metricId)?.unit ?? "pct";
  const gateIdx = checks.map((k, j) => (k.kind === "gate" ? j : -1)).filter((j) => j >= 0);
  const n = Math.max(1, az.length);
  const cols = Math.max(1, checks.length);

  const years = all.flatMap((c) => (c.history ?? []).map((r) => r.fiscalYear));
  const span = years.length ? `FY${Math.min(...years)}–FY${Math.max(...years)}` : "";

  const tape = az.flatMap((c) =>
    (c.history ?? []).map((r) => {
      const parts = [
        money(r.revenue) && `rev ${money(r.revenue)}`,
        money(r.operatingCashFlow) && `op. cash ${money(r.operatingCashFlow)}`,
        money(r.freeCashFlow) && `FCF ${money(r.freeCashFlow)}`,
      ].filter(Boolean);
      return { key: `${c.ticker}-${r.fiscalYear}`, ticker: c.ticker, text: `FY${r.fiscalYear} · ${parts.join(" · ") || "no figures"} ${c.reportingCurrency ?? ""}` };
    }),
  );
  // Interleave companies so the tape does not read one company at a time.
  tape.sort((a, b) => a.text.slice(2, 6).localeCompare(b.text.slice(2, 6)) || a.ticker.localeCompare(b.ticker));

  // Timings, all inside the phases above.
  const appear = (i: number) => 100 + i * Math.min(45, 900 / (n + unmeasured.length));
  const fyFill = (i: number, y: number) => 1300 + i * Math.min(80, 1400 / n) + y * 60;
  const colAt = (j: number) => 3250 + j * (1850 / cols);
  const kpiAt = (i: number, j: number) => colAt(j) + i * Math.min(12, 250 / n);
  const chkCol = (j: number) => 5250 + j * (1650 / cols);
  const chkAt = (i: number, j: number) => chkCol(j) + i * Math.min(10, 220 / n);
  const deadAt = gateIdx.length ? chkCol(Math.max(...gateIdx)) + 300 : Infinity;
  const scoreAt = (i: number) => 7050 + i * Math.min(20, 500 / n);
  const verdictAt = (rankIdx: number) => 8650 + rankIdx * Math.min(35, 650 / n);

  const sounds: { at: number; play: () => void }[] = [];
  checks.forEach((_, j) => sounds.push({ at: chkCol(j), play: sfx.pass }));
  if (gateIdx.length && az.some((c) => gateIdx.some((j) => c.model!.checks[j]?.pass === false))) sounds.push({ at: deadAt, play: sfx.fail });
  sounds.push({ at: RANK_AT, play: sfx.done });
  ranked.forEach((c, r) => c.verdict === "add" && sounds.push({ at: verdictAt(r), play: sfx.pick }));
  sounds.sort((a, b) => a.at - b.at);

  const counts = {
    add: all.filter((c) => c.verdict === "add").length,
    watch: all.filter((c) => c.verdict === "watch").length,
    reject: all.filter((c) => c.verdict === "reject").length,
  };

  return { all, az, ranked, holdings, unmeasured, checks, unitOf, gateIdx, span, tape, counts, appear, fyFill, colAt, kpiAt, chkCol, chkAt, deadAt, scoreAt, verdictAt, sounds };
}

type Run = ReturnType<typeof buildRun>;

export default function EngineReplay({ dataset, runNo, onDone }: { dataset: Dataset; runNo: number; onDone: () => void }) {
  const run = useMemo(() => buildRun(dataset), [dataset]);
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

  const industry = dataset.industryName ?? "this industry";
  const phase = t >= DONE ? -1 : PH.reduce((p, x, i) => (t >= x.at ? i : p), 0);
  const universe = run.all.length + (dataset.unmeasured?.length ?? 0);
  const totalChecks = run.az.length * run.checks.length;
  const mine = run.holdings.length;

  const sub = [
    `${industry}: ${universe} Canadian ${universe === 1 ? "company" : "companies"} to test. Anything with no filings on file is dropped, never guessed.`,
    `Onesheet annual statements${run.span ? `, ${run.span}` : ""}, for every candidate${mine ? ` and your ${mine} ${mine === 1 ? "stock" : "stocks"}` : ""}. Each KPI keeps the filings it came from.`,
    `${run.checks.length} KPIs per company, from the filings only.`,
    `${run.gateIdx.length} must-pass ${run.gateIdx.length === 1 ? "gate" : "gates"} (●) and ${run.checks.length - run.gateIdx.length} scored checks. Fail a gate and you're out.`,
    `Recommendation first, then the quality score out of 100, then checks passed.`,
    `Candidates that pass split the sleeve equally, capped per name.`,
  ];

  const hot = (() => {
    if (t >= run.colAt(0) && t < PH[3].at) return { j: Math.min(run.checks.length - 1, Math.floor((t - run.colAt(0)) / (1850 / Math.max(1, run.checks.length)))), mode: "kpi" as const };
    if (t >= run.chkCol(0) && t < PH[4].at) return { j: Math.min(run.checks.length - 1, Math.floor((t - run.chkCol(0)) / (1650 / Math.max(1, run.checks.length)))), mode: "check" as const };
    return null;
  })();
  const hk = hot ? run.checks[hot.j] : null;
  const caption =
    t >= DONE ? { k: "done", v: `${run.counts.add} add · ${run.counts.watch} watch · ${run.counts.reject} reject` }
    : t >= PH[5].at ? { k: "weights", v: "equal split of the sleeve, capped per name" }
    : t >= RANK_AT ? { k: "ranking", v: "recommendation, then score, then checks passed" }
    : t >= PH[4].at ? { k: "scoring", v: "quality score out of 100, weighted grades" }
    : hot && hk ? (hot.mode === "kpi"
        ? { k: "computing", v: dataset.metricDefs.find((d) => d.id === hk.metricId)?.label ?? hk.label }
        : { k: hk.kind === "gate" ? "must pass" : "scored", v: hk.label })
    : t >= PH[1].at ? { k: "reading", v: "annual statements, one filing per company per year" }
    : { k: "universe", v: `${industry} · Canadian candidates` };

  const rowsN = run.az.length + run.unmeasured.length;
  const H = rowsN > 18 ? 24 : rowsN > 9 ? 30 : 40;
  const gridCols = `26px 60px minmax(70px,1fr) repeat(${run.checks.length}, minmax(52px,64px)) 96px 92px`;
  const ranked = t >= RANK_AT;
  const tapeX = -((t * (t >= PH[1].at && t < PH[2].at ? 0.26 : 0.07)) % 4000);

  return (
    <div role="dialog" aria-label="Engine run" aria-live="polite"
      className={`${panelsClass(theme)} fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-black/55 backdrop-blur-md transition-all duration-500 ${leaving ? "scale-[1.015] opacity-0" : "opacity-100"}`}>
      {dataset.isFake && (
        <div className="bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white">FAKE SAMPLE DATA: not real companies or numbers</div>
      )}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_15%_0%,rgba(61,220,108,0.10),transparent_60%)]" />

      <header className="relative border-b border-white/10 bg-black/35 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 md:px-8">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-[#fff] text-[11px] font-bold text-[#050505]">X</span>
          <span className="text-sm font-semibold tracking-tight text-white">Index X-ray</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/50">Engine run #{runNo}</span>
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
        {/* Left: what the engine is doing now */}
        <section className="flex flex-col gap-4">
          <div className="panel px-5 py-5">
            <div className="kicker flex items-center gap-2"><span className="live-dot" />{industry} · engine run</div>
            <h1 key={phase} className="a-fade mt-3 text-[26px] font-bold leading-[1.1] tracking-[-0.03em] text-ink">
              {phase < 0 ? "Done. Opening the results." : `${PH[phase].title}…`}
            </h1>
            <p className="mt-2 min-h-[40px] text-[13px] leading-snug text-muted">
              {phase < 0 ? `${industry}: ranked on filings only.` : sub[phase]}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Counter label="candidates in the universe" value={Math.round(ramp(t, 100, 1100) * universe)} />
              <Counter label="filings cited" value={Math.round(ramp(t, 1250, 3100) * dataset.sources.length)} />
              <Counter label="checks evaluated" value={Math.round(ramp(t, run.chkCol(0), PH[4].at - 100) * totalChecks)} />
              <Counter label="to add" value={Math.round(ramp(t, PH[5].at, DONE - 100) * run.counts.add)} tone="teal" />
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

        {/* Right: the candidates, filling in */}
        <section className="panel min-w-0 overflow-hidden">
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
            <div className="min-w-[820px]">
              <div className="grid h-11 items-center gap-x-1 border-b border-line px-3.5 font-mono text-[9.5px] uppercase leading-tight tracking-[0.04em] text-faint" style={{ gridTemplateColumns: gridCols }}>
                <div>#</div><div>Ticker</div><div>Company <span className="opacity-70">· filings</span></div>
                {run.checks.map((k, j) => (
                  <div key={k.id} className={`transition-colors ${hot?.j === j ? "text-teal" : ""}`} title={k.label}>
                    <span className="line-clamp-2">{k.label.replace(/\s*[≥≤].*$/, "")}{k.kind === "gate" && <span className="text-warn"> ●</span>}</span>
                    <span className="opacity-70">{k.target}</span>
                  </div>
                ))}
                <div>Score /100</div><div>Verdict</div>
              </div>
              <div className="relative" style={{ height: (t >= PH[1].at ? run.az.length : run.az.length + run.unmeasured.length) * H + 8, transition: "height .4s" }}>
                {t >= PH[1].at && t < PH[4].at && (
                  <div className="pointer-events-none absolute inset-x-0 h-14 bg-gradient-to-b from-transparent via-[var(--color-tealsoft)] to-transparent"
                    style={{ top: ((t * 0.24) % (run.az.length * H + 112)) - 56 }} />
                )}
                {run.az.map((c, i) => (
                  <Row key={c.ticker} c={c} i={i} t={t} run={run} H={H} cols={gridCols} slot={ranked ? run.ranked.indexOf(c) : i} rankShown={ranked} />
                ))}
                {run.unmeasured.map((u, k) => {
                  const i = run.az.length + k;
                  const shown = t >= run.appear(i);
                  return (
                    <div key={u.ticker} className="absolute inset-x-0 grid items-center gap-x-1 px-3.5 text-[12px] transition-opacity duration-500"
                      style={{ gridTemplateColumns: gridCols, top: i * H, height: H, opacity: !shown ? 0 : t >= 1050 ? 0 : t >= 800 ? 0.3 : 1 }}>
                      <div /><div className="font-mono text-[11.5px] font-semibold text-ink line-through decoration-[var(--color-bad)]">{u.ticker}</div>
                      <div className="truncate text-muted">{u.name} <span className="font-mono text-[10px] text-bad">no filings on file</span></div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 font-mono text-[11.5px] text-muted">
            {t >= DONE - 200 ? (
              <span className="a-fade">
                <b className="font-medium text-teal">{run.counts.add} add</b> · <b className="font-medium text-warn">{run.counts.watch} watch</b> · <b className="font-medium text-bad">{run.counts.reject} reject</b>
                {(dataset.unmeasured?.length ?? 0) > 0 && <> · {dataset.unmeasured!.length} without filings</>}
                {run.all.length > run.az.length && <> · top {run.az.length} of {run.all.length} shown</>}
              </span>
            ) : (
              <span>Every value is read from this run. Press Enter to skip.</span>
            )}
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

function Row({ c, i, t, run, H, cols, slot, rankShown }: { c: Company; i: number; t: number; run: Run; H: number; cols: string; slot: number; rankShown: boolean }) {
  const m = c.model!;
  const years = c.history?.length ?? 0;
  const dead = t >= run.deadAt && run.gateIdx.some((j) => m.checks[j]?.pass === false);
  const scoreOn = t >= run.scoreAt(i);
  const score = m.score?.value ?? null;
  const vOn = t >= run.verdictAt(slot);
  const v = verdictStyle[c.verdict];
  const barColor = c.verdict === "add" ? "bg-teal" : c.verdict === "watch" ? "bg-warn" : "bg-bad";
  return (
    <div className={`absolute inset-x-0 grid items-center gap-x-1 px-3.5 text-[12px] ${dead ? "saturate-50" : ""}`}
      style={{ gridTemplateColumns: cols, top: slot * H, height: H, opacity: t >= run.appear(i) ? 1 : 0, transition: "top .7s cubic-bezier(0.7,0,0.2,1), opacity .25s ease-out, filter .3s" }}>
      <div className="font-mono text-[10.5px] text-faint">{rankShown ? slot + 1 : ""}</div>
      <div className={`font-mono text-[11.5px] font-semibold text-ink ${dead ? "line-through decoration-[var(--color-bad)]" : ""}`}>{c.ticker}</div>
      <div className={`flex min-w-0 items-center gap-1.5 text-muted ${dead ? "line-through decoration-[var(--color-bad)]" : ""}`}>
        <span className="truncate">{c.name}</span>
        <span className="flex shrink-0 gap-[2px]" aria-hidden>
          {Array.from({ length: Math.max(years, 1) }, (_, y) => (
            <i key={y} className={`h-2 w-1 rounded-[1px] transition-colors duration-200 ${y < years && t >= run.fyFill(i, y) ? "bg-teal" : "bg-line"}`} />
          ))}
        </span>
      </div>
      {run.checks.map((k, j) => {
        const r = m.checks[j];
        const val = formatMetric(c.metrics[k.metricId], run.unitOf(k.metricId));
        const missing = c.metrics[k.metricId]?.value == null;
        const judged = t >= run.chkAt(i, j);
        const shown = t >= run.kpiAt(i, j);
        const cls = judged
          ? r?.pass === true ? "a-cell bg-tealsoft text-teal" : r?.pass === false ? "a-cell bg-badsoft text-bad" : "text-faint ring-1 ring-inset ring-line"
          : shown ? (missing ? "text-faint ring-1 ring-inset ring-line" : "bg-soft text-ink") : "text-transparent";
        return (
          <div key={k.id} className={`h-[20px] rounded-md text-center font-mono text-[11px] leading-[20px] transition-colors duration-200 ${cls}`}>
            {shown ? (missing ? "—" : val) : ""}
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <div className={`h-full rounded-full transition-[width] duration-700 ease-out ${barColor}`} style={{ width: scoreOn && score != null ? `${score}%` : 0 }} />
        </div>
        <span className="w-6 text-right font-mono text-[11px] tabular-nums text-ink">{scoreOn ? (score ?? "—") : ""}</span>
      </div>
      <div className={`rounded-full py-[3px] text-center font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] transition-all duration-300 ease-[cubic-bezier(0.3,1.6,0.5,1)] ${v.badge} ${vOn ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}>
        {c.verdict === "add" && c.proposedWeightPct != null ? `Add ${pct(c.proposedWeightPct, 2)}` : v.label}
      </div>
    </div>
  );
}
