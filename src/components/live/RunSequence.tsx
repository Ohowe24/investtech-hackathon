"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Company, Dataset } from "@contract/types";
import { auditLine, passMark, sourcesByCompany } from "@/lib/audit";
import { pct, recStyle, verdictStyle } from "@/lib/format";
import { setSoundEnabled, sfx, soundEnabled } from "./sound";

/*
  The engine run, played full screen. The data is already built (npm run engine);
  this replays what the engine did, in order, with the real inputs and results:
  every filing it read, every check on every company, the ranking and the verdicts.
  Every number on screen is read from the dataset. Only the pacing is made up.
*/

const BOOT = 1100; // boot lines before the first company
const PER = 175; // gap between one company's scan starting and the next
const SCAN = 980; // how long one company's scan lasts
const CHECK0 = 170; // first check fires this far into a scan
const CHECK_GAP = 115; // then one check every this many ms
const CANDIDATE_PAUSE = 450; // a beat before the candidates

type Tone = "dim" | "head" | "pass" | "fail" | "none" | "result" | "good" | "warn";
interface LogLine { at: number; tone: Tone; tag: string; text: string; right?: string }

function buildRun(dataset: Dataset) {
  const tested = dataset.companies.filter((c) => c.model);
  const holdings = tested.filter((c) => c.inIndex);
  // Candidates are scanned in ticker order, then slide into rank order.
  const candidates = tested.filter((c) => !c.inIndex).sort((a, b) => a.ticker.localeCompare(b.ticker));
  const ranked = [...candidates].sort((a, b) => a.model!.rank - b.model!.rank);
  const srcs = sourcesByCompany(dataset);
  const sourceLabel = new Map(dataset.sources.map((s) => [s.id, s.label]));
  const rules = tested[0]?.model?.checks ?? [];

  const log: LogLine[] = [];
  const sounds: { at: number; play: () => void }[] = [];
  const reads: number[] = [];
  const checks: { at: number; pass: boolean | null; rule: string }[] = [];
  const done: number[] = [];
  const start = new Map<string, number>();

  const built = new Date(dataset.generatedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  log.push({ at: 0, tone: "head", tag: "boot", text: "Acquirer X-ray engine" });
  log.push({ at: 140, tone: "dim", tag: "load", text: `data/companies.json · built ${built}` });
  log.push({ at: 280, tone: "dim", tag: "load", text: `${tested.length} companies · ${dataset.sources.length} filings · ${dataset.metricDefs.length} metrics` });
  log.push({ at: 420, tone: "dim", tag: "index", text: dataset.indexName });
  rules.forEach((k, i) =>
    log.push({ at: 560 + i * 70, tone: "dim", tag: k.kind === "gate" ? "gate" : "rule", text: k.label, right: k.target }),
  );

  let at = BOOT;
  log.push({ at: at - 80, tone: "head", tag: "phase", text: `Calibrating on ${holdings.length} index holdings` });
  const scan = (c: Company) => {
    const s = at;
    start.set(c.ticker, s);
    (srcs.get(c.ticker) ?? []).forEach((id, j) => {
      const t = s + j * 22;
      reads.push(t);
      log.push({ at: t, tone: "dim", tag: "read", text: sourceLabel.get(id) ?? id });
      sounds.push({ at: t, play: sfx.read });
    });
    c.model!.checks.forEach((k, i) => {
      const t = s + CHECK0 + i * CHECK_GAP;
      const a = auditLine(dataset, c, k);
      checks.push({ at: t, pass: k.pass, rule: k.id });
      log.push({ at: t, tone: k.pass === null ? "none" : k.pass ? "pass" : "fail", tag: "check", text: `${c.ticker}  ${a.label}`, right: `${a.value}  ${a.target}  ${passMark(k.pass)}` });
      sounds.push({ at: t, play: k.pass === null ? sfx.none : k.pass ? sfx.pass : sfx.fail });
    });
    const m = c.model!;
    log.push({ at: s + SCAN, tone: "result", tag: "score", text: `${c.ticker}  ${recStyle[m.recommendation].label.toUpperCase()}`, right: `${m.passed}/${m.available} · rank ${m.rank}` });
    done.push(s + SCAN);
    at += PER;
  };
  holdings.forEach(scan);
  at += CANDIDATE_PAUSE;
  log.push({ at: at - 120, tone: "head", tag: "phase", text: `Testing ${candidates.length} Canadian candidates` });
  candidates.forEach(scan);

  const R = at - PER + SCAN + 300; // ranking
  log.push({ at: R, tone: "head", tag: "rank", text: `Ranking ${tested.length} companies by checks passed` });
  ranked.forEach((c, i) =>
    log.push({ at: R + 160 + i * 110, tone: "dim", tag: "rank", text: `#${c.model!.rank}  ${c.ticker}  ${c.name}` }),
  );
  sounds.push({ at: R, play: sfx.done });

  const P = R + 160 + ranked.length * 110 + 300; // verdicts
  log.push({ at: P, tone: "head", tag: "verdict", text: "Verdicts" });
  ranked.forEach((c, i) => {
    const t = P + 120 + i * 170;
    const weight = c.proposedWeightPct != null ? pct(c.proposedWeightPct, 2) : undefined;
    log.push({ at: t, tone: c.verdict === "add" ? "good" : c.verdict === "watch" ? "warn" : "fail", tag: "verdict", text: `${verdictStyle[c.verdict].label.toUpperCase()}  ${c.ticker}`, right: weight });
    if (c.verdict === "add") sounds.push({ at: t, play: sfx.pick });
  });
  const READY = P + 120 + ranked.length * 170 + 200;
  log.push({ at: READY, tone: "good", tag: "done", text: "Recommendation ready" });
  const END = READY + 1300;

  sounds.sort((a, b) => a.at - b.at);
  log.sort((a, b) => a.at - b.at);
  const picks = ranked.filter((c) => c.verdict === "add");
  return { tested, holdings, candidates, ranked, picks, rules, start, log, sounds, reads, checks, done, R, P, READY, END, built };
}

const toneClass: Record<Tone, string> = {
  dim: "text-white/40",
  head: "text-white font-semibold",
  pass: "text-signal",
  fail: "text-[#ff6b5e]",
  none: "text-white/45",
  result: "text-white",
  good: "text-signal font-semibold",
  warn: "text-[#f0c050]",
};

const clock = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(2).padStart(5, "0")}`;
};

export default function RunSequence({ dataset, runNo, onDone }: { dataset: Dataset; runNo: number; onDone: () => void }) {
  const run = useMemo(() => buildRun(dataset), [dataset]);
  const [t, setT] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [sound, setSound] = useState(soundEnabled);
  const finished = useRef(false);
  const sfxAt = useRef(0);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setLeaving(true);
    setTimeout(onDone, 450);
  }, [onDone]);

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    sfxAt.current = 0;
    const tick = (now: number) => {
      const e = now - t0;
      setT(e);
      while (sfxAt.current < run.sounds.length && run.sounds[sfxAt.current].at <= e) run.sounds[sfxAt.current++].play();
      if (e >= run.END) return finish();
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

  const lines = run.log.filter((l) => l.at <= t).slice(-64);
  const reads = run.reads.filter((a) => a <= t).length;
  const fired = run.checks.filter((c) => c.at <= t);
  const companiesDone = run.done.filter((a) => a <= t).length;
  const passes = fired.filter((c) => c.pass === true).length;
  const fails = fired.filter((c) => c.pass === false).length;
  const firstCandidate = run.start.get(run.candidates[0]?.ticker ?? "") ?? Infinity;
  const phase = t < BOOT ? "Booting" : t < firstCandidate ? "Calibrating on the index" : t < run.R ? "Testing candidates" : t < run.P ? "Ranking" : t < run.READY ? "Verdicts" : "Ready";

  return (
    <div role="dialog" aria-label="Engine run" aria-live="polite"
      className={`fixed inset-0 z-[70] flex flex-col overflow-hidden bg-black/[0.93] text-white backdrop-blur-md transition-all duration-500 ${leaving ? "scale-[1.015] opacity-0" : "opacity-100"}`}>
      <div className="run-grid pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -left-40 top-1/3 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(61,220,108,0.12),transparent_65%)] blur-2xl" />
      {dataset.isFake && (
        <div className="relative bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white">FAKE SAMPLE DATA: not real companies or numbers</div>
      )}

      <div className="relative h-[2px] bg-white/10">
        <div className="h-full bg-signal shadow-[0_0_14px_#3ddc6c]" style={{ width: `${Math.min(100, (t / (run.READY + 200)) * 100)}%` }} />
      </div>

      <header className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 md:px-8">
        <span className="logo-scan grid h-7 w-7 place-items-center rounded-md bg-white text-[12px] font-bold text-ink">X</span>
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">Engine run <span className="text-white">#{runNo}</span></div>
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em]">
          <span className={`live-dot ${phase === "Ready" ? "" : ""}`} />
          <span className={phase === "Ready" ? "text-signal" : "text-white"}>{phase}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-sm tabular-nums text-white/70">{clock(t)}</span>
          <button onClick={() => { setSoundEnabled(!sound); setSound(!sound); }} aria-pressed={sound}
            className="rounded-md border border-white/15 px-2.5 py-1 font-mono text-[11px] text-white/70 hover:border-white/40 hover:text-white">
            {sound ? "♪ Sound on" : "♪ Sound off"}
          </button>
          <button onClick={finish} className="rounded-md bg-white px-3 py-1 text-[12px] font-semibold text-ink hover:bg-white/85">Skip ⏎</button>
        </div>
      </header>

      <div className="relative grid grid-cols-2 gap-px border-y border-white/10 bg-white/10 md:grid-cols-4">
        <Counter label="Filings read" value={reads} of={run.reads.length} />
        <Counter label="Companies tested" value={companiesDone} of={run.tested.length} />
        <Counter label="Checks run" value={fired.length} of={run.checks.length} />
        <div className="bg-black/70 px-5 py-3 md:px-8">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">Pass · Fail</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
            <span className="text-signal">{passes}</span><span className="text-white/30"> · </span><span className="text-[#ff6b5e]">{fails}</span>
          </div>
        </div>
      </div>

      <div className="relative grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,0.8fr)] gap-4 px-5 py-4 md:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-1">
        <section className="order-2 flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/60 lg:order-1">
          <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-white/20" /><span className="h-2 w-2 rounded-full bg-white/20" /><span className="h-2 w-2 rounded-full bg-white/20" />
            <span className="ml-2 font-mono text-[10px] text-white/40">engine.log</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-3 py-2 font-mono text-[11px] leading-[1.55]">
            {lines.map((l, i) => (
              <div key={`${l.at}-${i}-${l.text}`} className={`flex gap-2 whitespace-nowrap ${toneClass[l.tone]} ${i === lines.length - 1 ? "caret" : ""}`}>
                <span className="w-12 shrink-0 text-white/25">{l.tag}</span>
                <span className="min-w-0 truncate">{l.text}</span>
                {l.right && <span className="ml-auto shrink-0 pl-3 tabular-nums">{l.right}</span>}
              </div>
            ))}
          </div>
        </section>

        <section className="relative order-1 flex min-h-0 flex-col gap-4 overflow-hidden lg:order-2">
          <div>
            <div className="mb-2 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
              <span>Canadian candidates</span>
              <span>{t >= run.R ? "ranked" : "queued A–Z"}</span>
            </div>
            <div className="relative h-[150px]">
              {run.candidates.map((c) => {
                const slot = t >= run.R ? run.ranked.indexOf(c) : run.candidates.indexOf(c);
                const vi = run.ranked.indexOf(c);
                return (
                  <div key={c.ticker} className="absolute top-0 h-full px-1 transition-[left] duration-700 ease-[cubic-bezier(0.2,0.9,0.2,1)]"
                    style={{ left: `${(slot / run.candidates.length) * 100}%`, width: `${100 / run.candidates.length}%` }}>
                    <Cell c={c} t={t} start={run.start.get(c.ticker)!} big
                      rankShown={t >= run.R + 160 + vi * 110} verdictShown={t >= run.P + 120 + vi * 170} />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="min-h-0">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">Index holdings · calibration</div>
            <div className="grid grid-cols-5 gap-1.5">
              {run.holdings.map((c) => <Cell key={c.ticker} c={c} t={t} start={run.start.get(c.ticker)!} dim={t >= run.R} />)}
            </div>
          </div>
          <div className="hidden min-h-0 flex-1 flex-col rounded-xl border border-white/10 bg-black/40 p-3 lg:flex">
            <div className="mb-2 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
              <span>Checks by rule · live tally</span>
              <span><span className="text-signal">■</span> pass <span className="ml-2 text-[#ff6b5e]">■</span> fail <span className="ml-2 text-white/40">■</span> no data</span>
            </div>
            <div className="flex flex-1 flex-col justify-around gap-1.5">
              {run.rules.map((k) => {
                const mine = fired.filter((f) => f.rule === k.id);
                const n = run.tested.length;
                const p = mine.filter((f) => f.pass === true).length;
                const f = mine.filter((f) => f.pass === false).length;
                const z = mine.filter((f) => f.pass === null).length;
                return (
                  <div key={k.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-3 font-mono text-[11px]">
                    <span className="truncate text-white/70">{k.label}</span>
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="bg-signal shadow-[0_0_10px_rgba(61,220,108,0.6)] transition-[width] duration-150" style={{ width: `${(p / n) * 100}%` }} />
                      <div className="bg-[#ff6b5e] transition-[width] duration-150" style={{ width: `${(f / n) * 100}%` }} />
                      <div className="bg-white/30 transition-[width] duration-150" style={{ width: `${(z / n) * 100}%` }} />
                    </div>
                    <span className="w-24 text-right tabular-nums"><span className="text-signal">{p}</span> <span className="text-white/25">/</span> <span className="text-[#ff6b5e]">{f}</span>{z > 0 && <span className="text-white/40"> / {z}</span>}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {t >= run.READY && run.picks.length > 0 && (
            <div className="a-fade pointer-events-none absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-[2px]">
              <div className="a-stamp text-center">
                <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-signal">Recommendation ready</div>
                <div className="mt-3 text-5xl font-extrabold tracking-tight text-white md:text-6xl">
                  Add {run.picks.map((c) => c.ticker).join(" + ")}
                </div>
                <div className="mt-3 font-mono text-sm text-white/60">
                  {run.picks.map((c) => `${c.ticker} ${c.proposedWeightPct != null ? pct(c.proposedWeightPct, 2) : ""}`).join("  ·  ")}
                </div>
                <div className="mt-6 font-mono text-[11px] text-white/40">Opening the recommendation…</div>
              </div>
            </div>
          )}
        </section>
      </div>

      <footer className="relative flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-5 py-2 font-mono text-[10px] text-white/35 md:px-8">
        <span>Replaying the engine&apos;s output · dataset built {run.built} · every figure from data/companies.json</span>
        <span>Esc to skip</span>
      </footer>
    </div>
  );
}

function Counter({ label, value, of }: { label: string; value: number; of: number }) {
  const full = value >= of;
  return (
    <div className="bg-black/70 px-5 py-3 md:px-8">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
        <span className={full ? "text-signal" : "text-white"}>{value}</span>
        <span className="text-base text-white/30"> / {of}</span>
      </div>
    </div>
  );
}

/** One company on the board: queued, being scanned (a beam passes and its checks fire), then scored. */
function Cell({ c, t, start, big = false, dim = false, rankShown = false, verdictShown = false }: {
  c: Company; t: number; start: number; big?: boolean; dim?: boolean; rankShown?: boolean; verdictShown?: boolean;
}) {
  const m = c.model!;
  const p = (t - start) / SCAN;
  const state = p < 0 ? "queued" : p < 1 ? "scanning" : "done";
  const rec = recStyle[m.recommendation];
  const recTone = m.recommendation === "pass" ? "text-signal" : m.recommendation === "mixed" ? "text-[#f0c050]" : "text-[#ff6b5e]";
  const add = c.verdict === "add";

  return (
    <div className={`relative flex h-full flex-col overflow-hidden rounded-lg border transition-all duration-300 ${
      state === "scanning" ? "border-signal/70 bg-signal/[0.07] shadow-[0_0_24px_-4px_rgba(61,220,108,0.5)]"
        : state === "done" ? "border-white/15 bg-white/[0.04]" : "border-white/[0.07] bg-white/[0.015]"
    } ${dim ? "opacity-40" : ""} ${verdictShown && add ? "a-glow border-signal/80 bg-signal/10" : ""} ${big ? "p-3" : "px-2 py-1.5"}`}>
      {state === "scanning" && (
        <span className="pointer-events-none absolute inset-y-0 w-10 bg-gradient-to-r from-transparent via-signal/50 to-transparent"
          style={{ left: `calc(${p * 115 - 15}% )` }} />
      )}
      <div className="flex items-baseline justify-between gap-1">
        <span className={`font-mono font-semibold ${big ? "text-sm" : "text-[11px]"} ${state === "queued" ? "text-white/35" : "text-white"}`}>{c.ticker}</span>
        {big && rankShown && <span className="a-stamp font-mono text-[11px] text-white/70">#{m.rank}</span>}
        {!big && <span className={`font-mono text-[9px] ${state === "done" ? recTone : "text-white/30"}`}>{state === "done" ? rec.label : state === "scanning" ? "···" : ""}</span>}
      </div>
      {big && <div className="mt-0.5 truncate text-[11px] text-white/45">{c.name}</div>}
      <div className={`flex gap-[3px] ${big ? "mt-3" : "mt-1"}`}>
        {m.checks.map((k, i) => {
          const on = t >= start + CHECK0 + i * CHECK_GAP;
          return (
            <span key={k.id} className={`${big ? "h-5" : "h-2.5"} flex-1 rounded-[2px] transition-colors duration-150 ${
              !on ? "bg-white/[0.08]" : k.pass === null ? "bg-white/30" : k.pass ? "bg-signal shadow-[0_0_8px_rgba(61,220,108,0.7)]" : "bg-[#ff6b5e] shadow-[0_0_8px_rgba(255,107,94,0.6)]"
            }`} />
          );
        })}
      </div>
      {big && (
        <div className="mt-auto flex flex-wrap items-end justify-between gap-1 pt-2">
          <span className={`whitespace-nowrap font-mono text-[10px] uppercase tracking-wider ${state === "done" ? recTone : "text-white/30"}`}>
            {state === "done" ? `${rec.label} ${m.passed}/${m.available}` : state === "scanning" ? "scanning" : "queued"}
          </span>
          {verdictShown && (
            <span className={`a-stamp rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
              add ? "bg-signal text-ink" : c.verdict === "watch" ? "bg-[#f0c050] text-ink" : "bg-[#ff6b5e] text-ink"
            }`}>
              {verdictStyle[c.verdict].label}{add && c.proposedWeightPct != null ? ` ${pct(c.proposedWeightPct, 2)}` : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
