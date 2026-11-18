"use client";

// Jarvis: a spoken conversation with an analyst who can operate the platform. Tap the orb (or press J) once;
// from then on it just listens. Talk, pause, and it answers out loud. Start talking while it speaks and it
// stops at once. It moves the screen as it explains: opens pages, spotlights panels, points at companies,
// puts graphics up. Every sentence is checked on the server; one with a number that traces to nothing is
// never spoken.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dataset } from "@contract/types";
import type { AnalysisQuery } from "@/lib/query";
import { findCompany, runDataTool } from "@/lib/jarvis/data";
import type { Cue } from "@/lib/jarvis/cues";
import type { Message, StepEvent, ToolCall } from "@/lib/jarvis/types";
import Graphic, { toSpec, type GraphicSpec } from "./Graphic";
import { findByText, findTicker, goTo, hover, onSpot, readScreen, scrollPage, spotlight, type Spot } from "./screen";
import { chime, Listener, Speaker } from "./voice";

type Phase = "off" | "starting" | "listening" | "hearing" | "thinking" | "speaking";

interface Status {
  claude: boolean;
  voice: boolean;
  ears: boolean;
}

interface Props {
  dataset: Dataset;
  query?: AnalysisQuery;
}

const MAX_STEPS = 6;

function greeting(ds: Dataset): string {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${part}. I have the engine's results for ${ds.industryName ?? ds.industryId} in front of me. What would you like to know?`;
}

/** Where the person is: the page, every panel heading on it, and what's visible. Sent with each turn. */
function screenNote(): string {
  const s = readScreen();
  const heads = [...new Set(s.elements.filter((e) => e.kind === "heading").map((e) => e.text))].slice(0, 30);
  const visible = s.elements.filter((e) => e.visible && (e.kind === "row" || e.kind === "chart" || e.kind === "button")).slice(0, 24).map((e) => `${e.kind}: ${e.text}`);
  return [`Page: ${s.page}`, heads.length ? `Panel headings: ${heads.join(" | ")}` : "", visible.length ? `Visible: ${visible.join(" | ")}` : ""].filter(Boolean).join("\n");
}

export default function Jarvis({ dataset, query }: Props) {
  const [phase, setPhase] = useState<Phase>("off");
  const [caption, setCaption] = useState("");
  const [heard, setHeard] = useState("");
  const [activity, setActivity] = useState("");
  const [held, setHeld] = useState(0);
  const [micOff, setMicOff] = useState(false);
  const [error, setError] = useState("");
  const [graphic, setGraphic] = useState<GraphicSpec | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  const speaker = useRef<Speaker | null>(null);
  const listener = useRef<Listener | null>(null);
  const session = useRef<Message[]>([]);
  const turn = useRef<AbortController | null>(null);
  const phaseRef = useRef<Phase>("off");
  /** the turn in progress: what you said, and what Jarvis has actually spoken of its answer so far */
  const current = useRef<{ words: string; spoken: string[] } | null>(null);
  /** screen moves run one after another, in the order they were written */
  const cueChain = useRef<Promise<void>>(Promise.resolve());
  const orb = useRef<HTMLButtonElement>(null);
  const live = useRef({ dataset, query });
  useEffect(() => {
    live.current = { dataset, query };
  });

  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  useEffect(() => {
    fetch("/api/jarvis/status").then((r) => r.json()).then(setStatus).catch(() => {});
    speaker.current = new Speaker();
    listener.current = new Listener();
    return () => {
      speaker.current?.stop();
      void listener.current?.stop();
    };
  }, []);

  // The orb follows whoever is talking.
  useEffect(() => {
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      const p = phaseRef.current;
      const raw = p === "speaking" ? speaker.current?.level() ?? 0 : p === "hearing" || p === "listening" ? listener.current?.level() ?? 0 : 0;
      smooth = smooth * 0.65 + raw * 0.35;
      orb.current?.style.setProperty("--lvl", smooth.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── Look-ups beyond the briefing: run here, against the dataset on screen ──
  const runTool = useCallback(async (call: ToolCall): Promise<{ content: string; error?: boolean }> => {
    const r = runDataTool(live.current.dataset, call.name, call.input);
    if (!r) return { content: JSON.stringify({ error: `Unknown tool ${call.name}` }), error: true };
    setActivity(r.step);
    return { content: JSON.stringify(r.result).slice(0, 14000), error: r.error };
  }, []);

  // ── Screen cues: each one moves the screen as its sentence is spoken ──
  const runCue = useCallback(async (cue: Cue) => {
    const ds = live.current.dataset;
    const a = cue.attrs;
    const caption = a.caption?.slice(0, 60) || undefined;
    switch (cue.kind) {
      case "go": {
        const c = a.company ? findCompany(ds, a.company) : undefined;
        const page = a.page || undefined;
        if (a.company && !c) return;
        if (page === "xray" && ds.hasStatements === false) return;
        spotlight(null);
        await goTo(page, c?.ticker);
        return;
      }
      case "point": {
        const c = findCompany(ds, a.ticker);
        const el = c ? findTicker(c.ticker) : null;
        if (!c || !el) return;
        hover(el);
        spotlight(el, caption ?? c.name);
        await new Promise((r) => setTimeout(r, 250));
        return;
      }
      case "spot": {
        const el = a.find ? findByText(a.find) : null;
        if (el) spotlight(el, caption);
        return;
      }
      case "show": {
        const spec = toSpec(ds, a);
        if (spec) setGraphic(spec);
        return;
      }
      case "scroll":
        await scrollPage(a.to || "down");
        return;
      case "clear":
        spotlight(null);
        setGraphic(null);
    }
  }, []);
  const queueCues = useCallback((cues: Cue[], signal?: AbortSignal) => {
    for (const cue of cues) {
      cueChain.current = cueChain.current.then(() => (signal?.aborted ? undefined : runCue(cue))).catch(() => {});
    }
  }, [runCue]);

  // Development only: try look-ups and screen cues from the console, e.g. await __jarvisCue("go", { page: "map" }).
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const w = window as unknown as {
      __jarvisTool?: (name: string, input?: Record<string, unknown>) => Promise<unknown>;
      __jarvisCue?: (kind: Cue["kind"], attrs?: Record<string, string>) => Promise<void>;
      __jarvisLook?: (phase: Phase, caption?: string, heard?: string) => void;
    };
    w.__jarvisTool = (name, input = {}) => runTool({ id: "dev", name, input });
    w.__jarvisCue = (kind, attrs = {}) => runCue({ kind, attrs });
    // Shows the dock in a given state, to check how it looks without a microphone.
    w.__jarvisLook = (p, c = "", h = "") => { go(p); setCaption(c); setHeard(h); };
    return () => { delete w.__jarvisTool; delete w.__jarvisCue; delete w.__jarvisLook; };
  }, [runTool, runCue, go]);

  // ── One spoken turn: Claude, tools, Claude… until it's said its piece ──
  const respond = useCallback(async (words: string) => {
    const sp = speaker.current!;
    turn.current?.abort();
    const ac = new AbortController();
    turn.current = ac;
    setHeard(words);
    setCaption("");
    setHeld(0);
    setActivity("Thinking");
    go("thinking");

    const msgs: Message[] = [...session.current, { role: "user", content: `[${screenNote()}]\n\nThe person said: ${words}` }];
    const now = { words, spoken: [] as string[] };
    current.current = now;
    let spoken = "";
    sp.begin();
    sp.onIdle = () => {
      if (ac.signal.aborted) return;
      if (phaseRef.current === "speaking" || phaseRef.current === "thinking") go("listening");
    };

    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const res = await fetch("/api/jarvis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: msgs, query: live.current.query }),
          signal: ac.signal,
        });
        if (res.status === 501) throw new Error("Claude isn't connected yet: add ANTHROPIC_API_KEY to .env.local and restart.");
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let end: Extract<StepEvent, { t: "end" }> | null = null;
        let pending: Cue[] = []; // cues for the sentence that's coming
        let lastHook: { cues: Cue[]; started: boolean } | null = null;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const ev = JSON.parse(line) as StepEvent;
            if (ev.t === "cue") {
              if (!ev.now) pending.push(ev.cue);
              else {
                const h = lastHook as { cues: Cue[]; started: boolean } | null;
                if (h && !h.started) h.cues.push(ev.cue);
                else queueCues([ev.cue], ac.signal);
              }
            }
            else if (ev.t === "say") {
              if (!ev.ok) { setHeld((n) => n + 1); continue; } // its cues wait for the next sentence
              const text = ev.text;
              const hook = { cues: pending, started: false };
              pending = [];
              lastHook = hook;
              spoken += `${spoken ? " " : ""}${text}`;
              sp.enqueue(ev.speech, () => {
                if (ac.signal.aborted) return;
                hook.started = true;
                queueCues(hook.cues, ac.signal);
                now.spoken.push(text);
                go("speaking");
                setCaption(text.replace(/\[\[([A-Z0-9.\-]+)\]\]/g, "$1").replace(/\*\*/g, ""));
              });
            } else if (ev.t === "end") {
              end = ev;
              // Cues after the last sentence: with that sentence if it hasn't started yet, otherwise now.
              if (pending.length) {
                const h = lastHook as { cues: Cue[]; started: boolean } | null;
                if (h && !h.started) h.cues.push(...pending);
                else queueCues(pending, ac.signal);
                pending = [];
              }
            }
            else if (ev.t === "error") throw new Error(ev.message);
          }
        }
        if (ac.signal.aborted) return;
        if (!end) throw new Error("The answer was cut off.");
        msgs.push({ role: "assistant", content: end.content });
        if (end.stop === "pause_turn") { msgs.push({ role: "user", content: "Continue." }); continue; }
        if (!end.calls.length) break;
        const results = [];
        for (const call of end.calls) {
          const r = await runTool(call);
          if (ac.signal.aborted) return;
          results.push({ type: "tool_result" as const, tool_use_id: call.id, content: r.content, ...(r.error ? { is_error: true } : {}) });
        }
        msgs.push({ role: "user", content: results });
        setActivity((a) => a || "Thinking");
      }
      // Done: keep the whole exchange (thinking blocks included, unchanged) for context.
      session.current = msgs[msgs.length - 1].role === "assistant" ? msgs : [...msgs, { role: "assistant", content: spoken || "…" }];
      if (current.current === now) current.current = null;
      if (session.current.length > 70 || JSON.stringify(session.current).length > 700_000) session.current = compact(session.current);
    } catch (err) {
      if (ac.signal.aborted) return;
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(msg);
      session.current = [...session.current, { role: "user", content: words }, { role: "assistant", content: spoken || "(no answer)" }];
      sp.enqueue("Apologies, something went wrong on my side.", () => { go("speaking"); setCaption("Apologies, something went wrong on my side."); });
    } finally {
      if (!ac.signal.aborted) {
        setActivity("");
        sp.finish();
      }
    }
  }, [go, runTool, queueCues]);

  // Development only: ask as if spoken, to test the whole loop without a microphone.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const w = window as unknown as { __jarvisAsk?: (words: string) => Promise<void> };
    w.__jarvisAsk = (words) => { speaker.current?.prime(); return respond(words); };
    return () => { delete w.__jarvisAsk; };
  }, [respond]);

  /** You started talking over Jarvis: stop everything, keep what it had already said. */
  const interrupt = useCallback(() => {
    speaker.current?.stop();
    const cut = current.current;
    if (turn.current && cut) {
      turn.current.abort();
      // Remember the question and how far the answer got, as plain words, so the next turn has context.
      session.current = [
        ...session.current,
        { role: "user", content: cut.words },
        { role: "assistant", content: cut.spoken.length ? `${cut.spoken.join(" ")} [interrupted here]` : "[interrupted before answering]" },
      ];
    }
    turn.current = null;
    current.current = null;
    setActivity("");
  }, []);

  // ── Session ──
  const start = useCallback(async () => {
    if (phaseRef.current !== "off") return;
    setError("");
    const sp = speaker.current!;
    sp.prime();
    if (status && !status.voice) sp.mode = "browser";
    sp.onLimited = () => setError("Voice limit reached: using the browser's voice for now.");
    go("starting");
    chime("start");
    // Warm Claude's prompt cache while the microphone starts, so the first answer comes back fast.
    void fetch("/api/jarvis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warm: true, messages: [{ role: "user", content: "Hello." }], query: live.current.query }),
    }).catch(() => {});
    const l = listener.current!;
    await l.start({
      onSpeechStart: () => {
        if (phaseRef.current === "speaking") speaker.current?.duck(true);
      },
      onSpeechReal: () => {
        interrupt();
        setCaption("");
        go("hearing");
      },
      onMisfire: () => {
        speaker.current?.duck(false);
        if (phaseRef.current === "hearing") go("listening");
      },
      onTranscribing: () => {
        chime("heard");
        setActivity("Got it");
        go("thinking");
      },
      onTurn: (text) => {
        if (phaseRef.current === "off") return;
        if (!text || text.replace(/[^a-z]/gi, "").length < 2) { setActivity(""); go("listening"); return; }
        void respond(text);
      },
      onError: (m) => {
        setError(m);
        go("off");
      },
    }, !!status?.ears);
    if (phaseRef.current === "off") return;
    // A short hello, then it listens.
    const hello = greeting(live.current.dataset);
    go("speaking");
    setCaption(hello);
    sp.begin();
    sp.onIdle = () => { if (phaseRef.current === "speaking") go("listening"); };
    sp.enqueue(hello, () => {});
    sp.finish();
  }, [go, interrupt, respond, status]);

  const end = useCallback(() => {
    turn.current?.abort();
    speaker.current?.stop();
    void listener.current?.stop();
    spotlight(null);
    setGraphic(null);
    setCaption("");
    setHeard("");
    setActivity("");
    session.current = [];
    current.current = null;
    if (phaseRef.current !== "off") chime("end");
    go("off");
  }, [go]);

  useEffect(() => {
    if (listener.current) listener.current.muted = micOff;
  }, [micOff]);

  // J starts, Esc ends.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "Escape" && phaseRef.current !== "off") end();
      else if ((e.key === "j" || e.key === "J") && !e.metaKey && !e.ctrlKey && !e.altKey && phaseRef.current === "off") { e.preventDefault(); void start(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [start, end]);

  // The graphic fades out a while after Jarvis falls quiet.
  useEffect(() => {
    if (phase !== "listening" || !graphic) return;
    const t = setTimeout(() => setGraphic(null), 20000);
    return () => clearTimeout(t);
  }, [phase, graphic]);

  const statusLine =
    phase === "starting" ? "Starting the microphone…"
      : phase === "listening" ? (micOff ? "Microphone off" : "Listening")
        : phase === "hearing" ? "Go on, I'm listening"
          : phase === "thinking" ? activity || "Thinking"
            : phase === "speaking" ? "Speaking · just talk to interrupt"
              : "";

  return (
    <div data-jarvis-ui>
      <SpotlightLayer />

      {graphic && (
        <div className="jarvis-graphic-wrap fixed right-5 top-20 z-[70]">
          <Graphic spec={graphic} dataset={dataset} />
        </div>
      )}

      {phase === "off" ? (
        <div className="jarvis-launch fixed bottom-5 right-5 z-[70] flex items-center gap-3">
          {error && <span className="max-w-[240px] rounded-full border border-amber-300/30 bg-black/80 px-3 py-1.5 text-[11px] leading-tight text-amber-300 backdrop-blur-xl">{error}</span>}
          <button type="button" onClick={() => void start()} aria-label="Talk to Jarvis (J)" title="Talk to Jarvis"
            className="jarvis-fab group relative flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-signal/60">
            <span className="jarvis-fab-label pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-full border border-white/10 bg-black/80 px-3 py-1.5 text-[12px] font-semibold tracking-[0.18em] text-white/90 backdrop-blur-xl">JARVIS</span>
            <span className="jarvis-fab-halo" aria-hidden />
            <span className="jarvis-fab-arc jarvis-fab-arc--a" aria-hidden />
            <span className="jarvis-fab-arc jarvis-fab-arc--b" aria-hidden />
            <span className="jarvis-orb jarvis-orb--off relative h-14 w-14" aria-hidden><span className="jarvis-core" /><span className="jarvis-fab-grid" /></span>
          </button>
        </div>
      ) : (
        <section aria-label="Jarvis voice conversation" aria-live="polite"
          className="jarvis-dock fixed bottom-5 left-1/2 z-[70] flex w-[min(620px,calc(100vw-24px))] -translate-x-1/2 items-center gap-4 rounded-[28px] border border-white/10 bg-[#060909]/88 py-3 pl-3 pr-3 text-white shadow-[0_30px_90px_-20px_rgba(0,0,0,0.95),0_0_0_1px_rgba(61,220,108,0.07)] backdrop-blur-2xl">
          <button ref={orb} type="button" onClick={() => setMicOff(!micOff)} aria-label={micOff ? "Turn the microphone on" : "Turn the microphone off"} title={micOff ? "Microphone off: tap to listen" : "Tap to mute the microphone"}
            className={`jarvis-orb jarvis-orb--${micOff && phase === "listening" ? "muted" : phase} h-14 w-14 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-signal/60`}>
            <span className="jarvis-core" /><span className="jarvis-ring" />
          </button>
          <div className="min-w-0 flex-1 py-0.5">
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-medium uppercase tracking-[0.14em] ${phase === "thinking" ? "jarvis-shimmer" : phase === "hearing" ? "text-signal" : "text-white/45"}`}>{statusLine}</span>
              {held > 0 && (
                <span title="Jarvis held back a sentence because a number in it didn't match the data." className="rounded bg-red-500/15 px-1.5 py-px font-mono text-[9.5px] uppercase tracking-wider text-red-300">
                  {held} held back · unverified number
                </span>
              )}
            </div>
            <p className="jarvis-caption mt-1 line-clamp-2 min-h-[1.5em] text-[15.5px] leading-snug text-white">
              {phase === "hearing" || (phase === "thinking" && !caption)
                ? <span className="text-white/55">{heard && phase === "thinking" ? `“${heard}”` : <span className="jarvis-wave" aria-hidden><i /><i /><i /><i /><i /></span>}</span>
                : caption || <span className="text-white/35">{phase === "listening" ? "Ask anything about the results, or say “show me…”" : ""}</span>}
            </p>
            {error && <p className="mt-1 truncate text-[11px] text-amber-300">{error}</p>}
          </div>
          <button type="button" onClick={end} aria-label="End the conversation (Esc)" title="End (Esc)"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.08] text-white/70 transition-colors hover:bg-red-500/80 hover:text-white">
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m4 4 8 8m0-8-8 8" /></svg>
          </button>
        </section>
      )}
    </div>
  );
}

/** Long conversations: keep the words, drop the working (tool calls, screen reads, thinking). */
function compact(msgs: Message[]): Message[] {
  const out: Message[] = [];
  for (const m of msgs) {
    if (typeof m.content === "string") {
      if (m.role === "user" && m.content.startsWith("[")) {
        const said = m.content.split("The person said: ")[1];
        if (said) out.push({ role: "user", content: said });
      } else out.push(m);
      continue;
    }
    const text = (m.content ?? []).filter((b) => b.type === "text").map((b) => ("text" in b ? b.text : "")).join(" ").trim();
    if (m.role === "assistant" && text) out.push({ role: "assistant", content: text });
  }
  // Alternate strictly, starting with the person.
  const fixed: Message[] = [];
  for (const m of out) {
    if (!fixed.length && m.role !== "user") continue;
    if (fixed.at(-1)?.role === m.role) fixed[fixed.length - 1] = m;
    else fixed.push(m);
  }
  if (fixed.at(-1)?.role === "user") fixed.push({ role: "assistant", content: "…" });
  return fixed.slice(-20);
}

/** Dims the page around whatever Jarvis is talking about, with a caption. Follows it as the page scrolls. */
function SpotlightLayer() {
  const [spot, setSpot] = useState<Spot | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLDivElement>(null);
  useEffect(() => onSpot(setSpot), []);
  useEffect(() => {
    if (!spot) return;
    let raf = 0;
    const tick = () => {
      const el = spot.el;
      const b = box.current;
      if (!b) return;
      if (!el.isConnected) {
        b.style.opacity = "0";
        if (tag.current) tag.current.style.opacity = "0";
      } else {
        const full = el.getBoundingClientRect();
        // Frame only the part that's on screen, between the header and the voice dock.
        const topLimit = 64, bottomLimit = window.innerHeight - 110;
        const top = Math.max(full.top, topLimit), bottom = Math.min(full.bottom, bottomLimit);
        const r = { left: full.left, width: full.width, top, bottom, height: Math.max(0, bottom - top) };
        const pad = 8;
        b.style.opacity = r.height > 4 ? "1" : "0";
        b.style.transform = `translate(${r.left - pad}px, ${r.top - pad}px)`;
        b.style.width = `${r.width + pad * 2}px`;
        b.style.height = `${r.height + pad * 2}px`;
        if (tag.current) {
          const above = r.top > 70;
          tag.current.style.opacity = "1";
          tag.current.style.transform = `translate(${Math.max(12, Math.min(window.innerWidth - 300, r.left - pad))}px, ${above ? r.top - pad - 38 : r.bottom + pad + 8}px)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spot]);
  if (!spot) return null;
  return (
    <>
      <div ref={box} className="jarvis-spot pointer-events-none fixed left-0 top-0 z-[65] rounded-2xl" />
      {spot.caption && (
        <div ref={tag} className="jarvis-spot-tag pointer-events-none fixed left-0 top-0 z-[66] flex items-center gap-2 rounded-full border border-signal/40 bg-black/85 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <span className="jarvis-spot-dot" /> {spot.caption}
        </div>
      )}
    </>
  );
}
