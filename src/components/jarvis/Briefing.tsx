"use client";

// The briefing on screen: while Jarvis briefs you on a company, each sentence lights up the part of the company
// page it is about (a framed spotlight with corner brackets and a scan line) and puts an animated callout beside
// it: counters that run up to the figure, a score ring, check pips, bars against the peer bar, the analysts'
// split. A rail above the voice dock shows where the briefing is. Every figure shown comes from the briefing,
// which reads it from the dataset.

import { useEffect, useRef, useState } from "react";
import type { Beat, Brief, BriefTarget, Callout, StrengthItem } from "@/lib/jarvis/brief";
import { animateWithin } from "./pageMotion";
import { findByText } from "./screen";

export interface BriefState {
  brief: Brief;
  /** the beat being spoken; -1 before the first one starts */
  at: number;
}

const HEADER = 72;
const DOCK = 150;

function targetEl(t: BriefTarget): Element | null {
  switch (t.kind) {
    case "head": return document.querySelector('[data-jv-brief="head"]');
    case "stats": return document.querySelector('[data-jv-brief="stats"]');
    case "breakdown": return document.querySelector('[data-jv-brief="breakdown"]');
    case "metric": return document.querySelector(`[data-jv-metric="${CSS.escape(t.metricId)}"]`);
    case "find": return findByText(t.text);
  }
}

/** Where to scroll so the beat's part of the page sits clear of the header and the dock, with room for the callout. */
function scrollTarget(el: Element): number {
  const r = el.getBoundingClientRect();
  const room = window.innerHeight - HEADER - DOCK;
  const want = r.height + 260 < room ? HEADER + Math.max(24, (room - r.height - 240) / 2) : HEADER + 24;
  return Math.max(0, Math.min(window.scrollY + r.top - want, document.documentElement.scrollHeight - window.innerHeight));
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Estimated speaking time of a passage, for the rail: the briefing voice reads about 13 characters a second. */
const spoken = (b: Beat) => Math.max(1400, (b.speech.length / 13) * 1000);

export default function Briefing({ state, leaving }: { state: BriefState; leaving?: boolean }) {
  const { brief, at } = state;
  const beat = at >= 0 ? brief.beats[at] : null;
  return (
    <div className={`brief-root ${leaving ? "brief-root--leaving" : ""}`}>
      {beat && <Stage key={brief.ticker} beat={beat} index={at} count={brief.beats.length} />}
      <Rail brief={brief} at={at} />
    </div>
  );
}

// ───────────────────────── The frame and the callout ─────────────────────────

type Box = { x: number; y: number; w: number; h: number };

/**
 * One frame and one callout for the whole briefing. Between points they glide (eased, following the page as it
 * scrolls) rather than jump, and the callout cross-fades its contents and eases to its new height.
 */
function Stage({ beat, index, count }: { beat: Beat; index: number; count: number }) {
  const frame = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const live = useRef(beat);
  const liveIndex = useRef(index);
  /** the beat on the card, the one fading out under it, and the stop within it (the charts tour) */
  const [shown, setShown] = useState<{ cur: Beat | null; prev: Beat | null; index: number; step: number }>({ cur: null, prev: null, index: 0, step: 0 });

  useEffect(() => {
    live.current = beat;
    liveIndex.current = index;
  }, [beat, index]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let el: Element | null = null;
    let forBeat: Beat | null = null; // the beat whose part of the page the frame is on
    let forKey = ""; // that beat and stop
    let seen: Beat | null = null;
    let beatStart = 0;
    let fr: Box | null = null; // the frame, as drawn
    let cp: { x: number; y: number; h: number } | null = null; // the callout, as drawn
    let scroll: { from: number; to: number; start: number; dur: number } | null = null;
    let prevTimer = 0;

    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      // Exponential easing toward the target: smooth whatever the frame rate.
      const k = 1 - Math.exp(-dt / 140);
      const b = live.current;
      if (seen !== b) { seen = b; beatStart = now; }
      // Which stop of the beat the voice has reached.
      let step = 0;
      if (b.steps) for (let i = 0; i < b.steps.length; i++) if (now - beatStart >= b.steps[i].at) step = i;
      const target = b.steps?.[step]?.target ?? b.target;
      const key = `${b.id}:${step}`;

      if (forKey !== key) {
        const found = targetEl(target);
        if (found) {
          const was = forBeat;
          el = found;
          forKey = key;
          // The page part replays itself as Jarvis turns to it; strengths also light their score rows as they're named.
          const glowRows = b.callout.kind === "strengths" ? b.callout.items.map((it) => ({ selector: `[data-jv-part="${CSS.escape(it.metricId)}"]`, at: it.at })) : [];
          window.setTimeout(() => animateWithin(found, { glow: glowRows }), 250);
          const to = scrollTarget(found);
          scroll = Math.abs(to - window.scrollY) > 4 ? { from: window.scrollY, to, start: now, dur: Math.min(1300, 650 + Math.abs(to - window.scrollY) * 0.6) } : null;
          if (was !== b) {
            forBeat = b;
            const at = liveIndex.current;
            setShown((s) => ({ cur: b, prev: was ? s.cur : null, index: at, step }));
            clearTimeout(prevTimer);
            prevTimer = window.setTimeout(() => setShown((s) => ({ ...s, prev: null })), 500);
          } else {
            setShown((s) => ({ ...s, step }));
          }
        }
      } else if (el && !el.isConnected) {
        el = targetEl(target);
      }

      if (scroll) {
        const t = Math.min(1, (now - scroll.start) / scroll.dur);
        window.scrollTo(0, scroll.from + (scroll.to - scroll.from) * easeInOut(t));
        if (t >= 1) scroll = null;
      }

      const f = frame.current, c = card.current, ins = inner.current;
      if (el && f && c) {
        const full = el.getBoundingClientRect();
        const top = Math.max(full.top, HEADER - 8), bottom = Math.min(full.bottom, window.innerHeight - DOCK + 20);
        const pad = 10;
        const want: Box = { x: full.left - pad, y: top - pad, w: full.width + pad * 2, h: Math.max(0, bottom - top) + pad * 2 };
        if (!fr) fr = { ...want };
        else {
          fr.x += (want.x - fr.x) * k;
          fr.y += (want.y - fr.y) * k;
          fr.w += (want.w - fr.w) * k;
          fr.h += (want.h - fr.h) * k;
        }
        f.style.opacity = want.h > 24 ? "1" : "0";
        f.style.transform = `translate(${fr.x.toFixed(1)}px, ${fr.y.toFixed(1)}px)`;
        f.style.width = `${fr.w.toFixed(1)}px`;
        f.style.height = `${fr.h.toFixed(1)}px`;

        // The callout: beside the part if there's room on its right, else below, else above, else over its corner.
        const ch = ins ? ins.offsetHeight : c.offsetHeight;
        const cw = c.offsetWidth, gap = 18, vw = window.innerWidth, vh = window.innerHeight;
        const r = want;
        let x: number, y: number;
        if (b.callout.kind === "tour") {
          // The chart tour: a slim strip just above the chart, so it never covers the next one.
          x = Math.min(Math.max(16, r.x), vw - cw - 16);
          y = r.y - ch - 10 >= HEADER ? r.y - ch - 10 : r.y + 12;
        } else if (r.x + r.w + gap + cw <= vw - 16) {
          x = r.x + r.w + gap;
          y = Math.min(Math.max(HEADER, r.y + r.h / 2 - ch / 2), vh - DOCK - ch);
        } else if (r.y + r.h + gap + ch <= vh - DOCK) {
          x = Math.min(Math.max(16, r.x + r.w - cw), vw - cw - 16);
          y = r.y + r.h + gap;
        } else if (r.y - gap - ch >= HEADER) {
          x = Math.min(Math.max(16, r.x + r.w - cw), vw - cw - 16);
          y = r.y - gap - ch;
        } else {
          x = Math.min(r.x + r.w - cw - 20, vw - cw - 16);
          y = Math.max(HEADER, Math.min(r.y + r.h - ch - 20, vh - DOCK - ch));
        }
        if (!cp) cp = { x, y, h: ch };
        else {
          cp.x += (x - cp.x) * k;
          cp.y += (y - cp.y) * k;
          cp.h += (ch - cp.h) * k;
        }
        c.style.transform = `translate(${cp.x.toFixed(1)}px, ${cp.y.toFixed(1)}px)`;
        c.style.height = `${cp.h.toFixed(1)}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); clearTimeout(prevTimer); };
  }, []);

  const cur = shown.cur;
  const bad = cur?.callout.kind === "weak";
  return (
    <>
      <div ref={frame} className={`brief-frame pointer-events-none fixed left-0 top-0 z-[65] rounded-2xl ${bad ? "brief-frame--bad" : ""}`} style={{ opacity: 0 }}>
        <i className="brief-corner brief-corner--tl" /><i className="brief-corner brief-corner--tr" />
        <i className="brief-corner brief-corner--bl" /><i className="brief-corner brief-corner--br" />
        {cur && <span key={cur.id} className="brief-scan" />}
      </div>
      <div ref={card} className="pointer-events-none fixed left-0 top-0 z-[71] overflow-visible" style={{ transform: "translate(-9999px, 0)" }}>
        {cur && (
          <div className={`brief-card relative h-full ${cur.callout.kind === "tour" ? "w-max max-w-[calc(100vw-32px)]" : "w-[min(380px,calc(100vw-32px))]"} overflow-hidden rounded-[20px] border bg-[#070a0a]/94 text-white backdrop-blur-2xl ${bad ? "brief-card--bad" : ""}`}>
            <div className={`brief-card-line absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent ${bad ? "via-red-400/70" : "via-signal/70"}`} />
            {shown.prev && (
              <div key={`out-${shown.prev.id}`} className="brief-content-out absolute inset-x-0 top-0">
                <CardContent beat={shown.prev} index={shown.index - 1} count={count} step={99} />
              </div>
            )}
            <div ref={inner} key={`in-${cur.id}`} className="brief-content-in">
              <CardContent beat={cur} index={shown.index} count={count} step={shown.step} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function CardContent({ beat, index, count, step }: { beat: Beat; index: number; count: number; step: number }) {
  const bad = beat.callout.kind === "weak";
  if (beat.callout.kind === "tour") return <div className="px-3 py-2"><Tour c={beat.callout} step={step} /></div>;
  return (
    <>
      <div className="flex items-center gap-2 px-5 pt-4 font-mono text-[10px] uppercase tracking-[0.2em]">
        <span className={bad ? "text-red-300" : "text-signal"}>{String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}</span>
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-white/50">{beat.label}</span>
      </div>
      <div className="px-5 pb-5 pt-3"><CalloutBody c={beat.callout} step={step} /></div>
    </>
  );
}

function CalloutBody({ c, step }: { c: Callout; step: number }) {
  switch (c.kind) {
    case "intro": return <Intro c={c} />;
    case "company": return <CompanyBody c={c} />;
    case "score": return <ScoreBody c={c} />;
    case "tour": return <Tour c={c} step={step} />;
    case "note": return <Note c={c} />;
    case "strengths": return <Items items={c.items} tone="good" />;
    case "weak": return <Items items={c.items} tone="bad" />;
    case "clean": return <Pips checks={Array(c.available).fill(true)} />;
    case "analysts": return <Analysts c={c} />;
  }
}

function Intro({ c }: { c: Extract<Callout, { kind: "intro" }> }) {
  return (
    <div>
      <div className="flex items-center gap-4">
        <span className="brief-mono relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-signal/40 bg-signal/10 font-mono text-[13px] font-bold text-signal">
          <span className="brief-mono-ring" />{c.ticker}
        </span>
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">{c.listedOn ? `${c.listedOn} : ${c.ticker}` : c.ticker}</div>
          <Typed text={c.name} className="mt-0.5 block text-[21px] font-semibold leading-tight tracking-tight" />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {c.chips.map((t, i) => (
          <span key={t} className="brief-pop rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[11.5px] text-white/75" style={{ animationDelay: `${500 + i * 140}ms` }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

function CompanyBody({ c }: { c: Extract<Callout, { kind: "company" }> }) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {c.chips.map((t, i) => (
          <span key={t} className="brief-pop rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[11.5px] text-white/75" style={{ animationDelay: `${200 + i * 160}ms` }}>{t}</span>
        ))}
      </div>
      <ul className="mt-4 space-y-3 border-t border-white/[0.07] pt-4">
        {c.figures.map((f) => (
          <li key={f.label} className="brief-row flex items-baseline justify-between gap-3" style={{ animationDelay: `${f.at}ms` }}>
            <span className="text-[13px] text-white/65">{f.label}</span>
            <span className="font-mono text-[22px] font-bold leading-none tabular-nums tracking-tight text-white"><CountUp text={f.value} delay={f.at} duration={1000} /></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScoreBody({ c }: { c: Extract<Callout, { kind: "score" }> }) {
  return (
    <div className="flex items-center gap-5">
      {c.score != null && <ScoreRing score={c.score} />}
      <div className="min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">Quality score{c.score != null ? " · out of 100" : ""}</div>
        <div className="mt-1 text-[13px] text-white/65">Passes {c.passed} of {c.available} checks</div>
        <div className="mt-2.5"><Pips checks={c.checks} /></div>
      </div>
    </div>
  );
}

function Tour({ c, step }: { c: Extract<Callout, { kind: "tour" }>; step: number }) {
  return (
    <ul className="flex items-center gap-1 whitespace-nowrap">
      <li className="px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-signal">Charts</li>
      {c.items.map((t, i) => (
        <li key={t} className={`brief-tour-item flex items-center gap-2 rounded-full px-2.5 py-1 text-[12.5px] ${i === step ? "is-on" : i < step ? "is-past" : ""}`}>
          <span className="brief-tour-dot" />
          {t}
        </li>
      ))}
    </ul>
  );
}

function Note({ c }: { c: Extract<Callout, { kind: "note" }> }) {
  return (
    <div>
      <div className="text-[19px] font-semibold leading-tight tracking-tight">{c.title}</div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {c.chips.map((t, i) => (
          <span key={t} className="brief-pop rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[11.5px] text-white/75" style={{ animationDelay: `${250 + i * 160}ms` }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

function Items({ items, tone }: { items: StrengthItem[]; tone: "good" | "bad" }) {
  return (
    <ul className="space-y-3.5">
      {items.map((it, i) => (
        <li key={it.metricId} className={`brief-row ${tone === "bad" ? "brief-row--bad" : ""}`} style={{ animationDelay: `${it.at}ms` }}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-white/70">{it.label}</span>
            <span className={`font-mono text-[26px] font-bold leading-none tabular-nums tracking-tight ${tone === "bad" ? "text-red-300" : "text-white"}`}>
              <CountUp text={it.value} delay={it.at} duration={850} />
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]" title="Position among the companies tested">
              <span className={`brief-fill absolute inset-y-0 left-0 rounded-full ${tone === "bad" ? "bg-red-400" : "bg-signal"}`} style={{ width: `${Math.round(it.grade * 100)}%`, animationDelay: `${it.at + 150}ms` }} />
              <span className="absolute inset-y-[-2px] left-1/2 w-px bg-white/40" title="Median of the companies tested" />
            </span>
            {it.target && <span className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] ${tone === "bad" ? "bg-red-500/15 text-red-300" : "bg-signal/15 text-signal"}`}>{tone === "bad" ? "✕" : "✓"} bar {it.target}</span>}
            {it.points && <span className="shrink-0 font-mono text-[10.5px] text-white/45">{it.points} pts</span>}
          </div>
          {i === 0 && items.length > 0 && <div className="sr-only">Bar: position among the companies tested; the tick is the median.</div>}
        </li>
      ))}
    </ul>
  );
}

const ANALYST_TONE: Record<string, string> = { sb: "bg-signal", b: "bg-signal/60", h: "bg-white/30", s: "bg-red-400/70", ss: "bg-red-500" };

function Analysts({ c }: { c: Extract<Callout, { kind: "analysts" }> }) {
  const shown = c.levels.filter((l) => l.n > 0);
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[40px] font-bold leading-none text-white"><CountUp text={String(c.buys)} duration={800} /></span>
          <span className="text-[13px] text-white/55">of <CountUp text={String(c.total)} duration={600} /> rate it a buy</span>
        </div>
        {c.sentiment && (
          <span className={`brief-stamp rounded-lg border px-2.5 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.14em] ${c.sentiment === "bullish" ? "border-signal/50 bg-signal/15 text-signal" : c.sentiment === "bearish" ? "border-red-400/50 bg-red-500/15 text-red-300" : "border-amber-300/50 bg-amber-300/10 text-amber-200"}`} style={{ animationDelay: "900ms" }}>
            {c.sentiment}
          </span>
        )}
      </div>
      <div className="mt-4 flex h-3 w-full gap-[3px] overflow-hidden rounded-full">
        {shown.map((l, i) => (
          <span key={l.label} className={`brief-seg h-full rounded-[3px] ${ANALYST_TONE[l.tone]}`} style={{ width: `${(l.n / c.total) * 100}%`, animationDelay: `${300 + i * 260}ms` }} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {c.levels.map((l, i) => (
          <span key={l.label} className="brief-pop inline-flex items-center gap-1.5 text-[11.5px] text-white/60" style={{ animationDelay: `${400 + i * 110}ms` }}>
            <span className={`inline-block h-2 w-2 rounded-full ${ANALYST_TONE[l.tone]}`} />{l.label} <b className="font-mono font-semibold text-white">{l.n}</b>
          </span>
        ))}
      </div>
      <div className="mt-3 text-[10.5px] text-white/35">Shown for context; not part of the verdict.</div>
    </div>
  );
}

// ───────────────────────── Small animated pieces ─────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 34, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, score / 100));
  return (
    <div className="relative h-[92px] w-[92px] shrink-0">
      <svg viewBox="0 0 92 92" className="h-full w-full" aria-label={`Quality score ${score} of 100`}>
        <circle cx="46" cy="46" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        <circle cx="46" cy="46" r={r} fill="none" stroke="#3ddc6c" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${c * f} ${c}`}
          transform="rotate(-90 46 46)" className="brief-ring" style={{ ["--len" as string]: `${c}` }} />
        <circle cx="46" cy="46" r={r + 7} fill="none" stroke="rgba(61,220,108,0.25)" strokeWidth="1" strokeDasharray="2 5" className="brief-orbit" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-mono text-[24px] font-bold leading-none text-white"><CountUp text={String(score)} delay={200} duration={1300} /></div>
          <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-white/45">score</div>
        </div>
      </div>
    </div>
  );
}

function Pips({ checks }: { checks: (boolean | null)[] }) {
  return (
    <div className="flex gap-1.5">
      {checks.map((p, i) => (
        <span key={i} className={`brief-pip grid h-6 w-6 place-items-center rounded-md border text-[11px] font-bold ${p === true ? "border-signal/50 bg-signal/20 text-signal" : p === false ? "border-red-400/50 bg-red-500/20 text-red-300" : "border-white/20 text-white/40"}`}
          style={{ animationDelay: `${900 + i * 180}ms` }}>{p === true ? "✓" : p === false ? "✕" : "–"}</span>
      ))}
    </div>
  );
}

/** Runs a formatted figure up from zero to exactly the text given ("25.6%", "-19.9%", "21.6M USD"). */
function CountUp({ text, delay = 0, duration = 900 }: { text: string; delay?: number; duration?: number }) {
  const m = text.match(/^(.*?)(-?)(\d[\d,]*)(\.\d+)?(.*)$/);
  const [shown, setShown] = useState(m ? `${m[1]}${m[2]}${"0"}${m[4] ? `.${"0".repeat(m[4].length - 1)}` : ""}${m[5]}` : text);
  useEffect(() => {
    if (!m) return;
    const target = Number(`${m[3].replace(/,/g, "")}${m[4] ?? ""}`);
    const decimals = m[4] ? m[4].length - 1 : 0;
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      const e = 1 - Math.pow(1 - t, 3);
      if (t >= 1) { setShown(text); return; }
      const v = (target * e).toFixed(decimals);
      setShown(`${m[1]}${m[2]}${v}${m[5]}`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, delay, duration]);
  return <span className="tabular-nums">{shown}</span>;
}

/** Types a name out, letter by letter. */
function Typed({ text, className }: { text: string; className?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => { i++; setN(i); if (i >= text.length) clearInterval(id); }, 28);
    return () => clearInterval(id);
  }, [text]);
  return <span className={className}>{text.slice(0, n)}<span className={`brief-caret ${n >= text.length ? "opacity-0" : ""}`}>▍</span></span>;
}

// ───────────────────────── Progress rail ─────────────────────────

function Rail({ brief, at }: { brief: Brief; at: number }) {
  return (
    <div className="brief-rail pointer-events-none fixed bottom-[108px] left-1/2 z-[70] w-[min(620px,calc(100vw-24px))] -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#060909]/88 px-3 py-2 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
        <span className="shrink-0 rounded-full border border-signal/40 bg-signal/10 px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.12em] text-signal">BRIEFING · {brief.ticker}</span>
        <div className="flex flex-1 gap-1.5">
          {brief.beats.map((b, i) => (
            <div key={b.id} className="min-w-0 flex-1">
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <div className={`brief-rail-fill h-full rounded-full ${b.id === "weak" ? "bg-red-400" : "bg-signal"}`}
                  style={{ width: i < at ? "100%" : i === at ? "100%" : "0%", transition: i === at ? `width ${spoken(b)}ms linear` : "width 400ms ease" }} />
              </div>
              <div className={`mt-1 truncate text-center font-mono text-[9px] uppercase tracking-[0.12em] transition-colors ${i === at ? "text-white" : i < at ? "text-white/45" : "text-white/25"}`}>{b.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
