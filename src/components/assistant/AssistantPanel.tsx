"use client";

// The Guide: a panel that follows you around the site, points things out and answers questions.
// It talks to /api/assistant (a scripted demo, no AI model) and renders what streams back.
// Styled as one of the site's own white cards: ink text, hairline borders, teal for meaning.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dataset, IndexSnapshot } from "@contract/types";
import { INDEX_SOURCE } from "@/lib/assistant/brain";
import type { Action, AskRequest, Block, GuideContext, StreamEvent, View } from "@/lib/assistant/types";
import { AnswerBlock, TickerChip } from "./AnswerBlocks";
import { ArrowRight, ArrowUp, Check, Chevron, Close, Reset, Sparkle } from "./icons";

interface GuideMsg {
  id: string;
  role: "guide";
  kind: "answer" | "notice";
  place?: string;
  steps: string[];
  text: string;
  blocks: Block[];
  sourceIds: string[];
  actions: Action[];
  suggestions: string[];
  streaming: boolean;
  error?: string;
}
type Msg = { id: string; role: "user"; text: string } | GuideMsg;

interface Props {
  dataset: Dataset;
  snapshot: IndexSnapshot;
  open: boolean;
  context: GuideContext;
  /** bump to move the cursor into the question box */
  focusKey: number;
  onClose: () => void;
  /** a note arrived while the panel was closed */
  onUnread: () => void;
  onAction: (a: Action) => void;
}

const VIEW_NAMES: Record<View, string> = {
  start: "Start",
  recommendation: "Recommendation",
  companies: "Companies",
  map: "Map",
  index: "Index",
  test: "Tested thesis",
};

const STARTERS = ["How does the model work?", "Which companies pass the model?", "Who sits top-right?", "What can you do?"];

let seq = 0;
const newId = () => `g${Date.now().toString(36)}${(seq++).toString(36)}`;
const emptyGuide = (id: string, kind: GuideMsg["kind"], place?: string): GuideMsg => ({
  id, role: "guide", kind, place, steps: [], text: "", blocks: [], sourceIds: [], actions: [], suggestions: [], streaming: true,
});

export default function AssistantPanel({ dataset, snapshot, open, context, focusKey, onClose, onUnread, onAction }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const seen = useRef(new Set<string>());
  const latest = useRef({ open, onUnread, context });
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    latest.current = { open, onUnread, context };
  });

  const patch = useCallback((id: string, f: (m: GuideMsg) => GuideMsg | null) => {
    setMsgs((ms) => ms.flatMap((m) => {
      if (m.id !== id || m.role !== "guide") return [m];
      const next = f(m);
      return next ? [next] : [];
    }));
  }, []);

  const apply = useCallback((id: string, kind: GuideMsg["kind"], ev: StreamEvent, firstText: { v: boolean }) => {
    if (ev.t === "delta" && kind === "notice" && !firstText.v) {
      firstText.v = true;
      if (!latest.current.open) latest.current.onUnread();
    }
    patch(id, (m) => {
      switch (ev.t) {
        case "step": return { ...m, steps: [...m.steps, ev.text] };
        case "delta": return { ...m, text: m.text + ev.text };
        case "block": return { ...m, blocks: [...m.blocks, ev.block] };
        case "sources": return { ...m, sourceIds: ev.sourceIds };
        case "actions": return { ...m, actions: ev.actions };
        case "suggest": return { ...m, suggestions: ev.prompts };
        case "done": return m.kind === "notice" && !m.text ? null : { ...m, streaming: false };
      }
    });
  }, [patch]);

  const run = useCallback(async (req: AskRequest, id: string) => {
    const firstText = { v: false };
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) apply(id, req.mode === "notice" ? "notice" : "answer", JSON.parse(line) as StreamEvent, firstText);
        }
      }
      patch(id, (m) => (m.streaming ? { ...m, streaming: false } : m));
    } catch {
      patch(id, (m) => (req.mode === "notice" ? null : { ...m, streaming: false, error: "I couldn't reach my local API (/api/assistant). Is the dev server running?" }));
    }
  }, [apply, patch]);

  const ask = (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    const id = newId();
    stick.current = true;
    setMsgs((ms) => [...ms, { id: newId(), role: "user", text }, emptyGuide(id, "answer")]);
    setInput("");
    setBusy(true);
    run({ mode: "ask", question: text, context: latest.current.context }, id).finally(() => setBusy(false));
  };

  // Notes: once per place, shortly after you arrive.
  const { view, ticker } = context;
  useEffect(() => {
    const place = ticker ? `c/${ticker}` : view;
    if (view === "start" || seen.current.has(place)) return;
    const t = setTimeout(() => {
      seen.current.add(place);
      const id = newId();
      setMsgs((ms) => [...ms, emptyGuide(id, "notice", place)]);
      run({ mode: "notice", context: { view, ticker } }, id);
    }, 900);
    return () => clearTimeout(t);
  }, [view, ticker, run]);

  // Keep the newest message in sight unless you scrolled up to read.
  useEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  useEffect(() => {
    if (!open) return;
    // A hidden list cannot scroll, so catch up on anything that arrived while closed.
    const el = list.current;
    if (el) { el.scrollTop = el.scrollHeight; stick.current = true; }
    if (focusKey > 0) box.current?.focus();
  }, [open, focusKey]);

  const here = context.ticker ? dataset.companies.find((c) => c.ticker === context.ticker) : undefined;
  const watch = dataset.companies.find((c) => !c.inIndex && c.verdict === "watch");
  const placeholder = `Ask about a stock, like “${watch ? `Why is ${watch.ticker} on watch?` : "How does the model work?"}”`;
  const lastGuide = [...msgs].reverse().find((m): m is GuideMsg => m.role === "guide" && !m.streaming);

  const placeName = (place?: string) => {
    if (!place) return "";
    if (place.startsWith("c/")) return place.slice(2);
    return VIEW_NAMES[place as View] ?? place;
  };

  return (
    <div className="flex h-full flex-col bg-white text-ink">
      <header className="border-b border-line px-4 pb-3 pt-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ink text-signal">
            <Sparkle className="guide-star h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold leading-tight tracking-tight">Guide</h2>
            <p title="A scripted demo: every answer is assembled from data/companies.json and data/indexes.json. No AI model and no API key, so it cannot invent a number."
              className="cursor-help truncate text-[11px] leading-tight text-faint">Demo · answers from the data</p>
          </div>
          <div className="ml-auto flex items-center">
            <IconBtn label="Clear the conversation" onClick={() => { setMsgs([]); stick.current = true; }} disabled={!msgs.length || busy}><Reset /></IconBtn>
            <IconBtn label="Close (⌘K)" onClick={onClose}><Close /></IconBtn>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[11px]">
          <span className="live-dot shrink-0" />
          <span className="text-faint">Following you on</span>
          {here ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="rounded bg-ink px-1 py-px font-mono text-[10px] font-semibold text-white">{here.ticker}</span>
              <span className="truncate font-medium text-ink">{here.name}</span>
            </span>
          ) : (
            <span className="truncate font-medium text-ink">{VIEW_NAMES[context.view]}</span>
          )}
        </div>
      </header>

      <div ref={list} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
        className="guide-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4" aria-live="polite">
        {msgs.length === 0 && <Welcome count={dataset.companies.length} onAsk={ask} disabled={busy} />}
        {msgs.map((m) => m.role === "user" ? (
          <div key={m.id} className="guide-in flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-[13px] leading-snug text-white">{m.text}</div>
          </div>
        ) : (
          <GuideMessage key={m.id} m={m} placeName={placeName(m.place)} dataset={dataset} snapshot={snapshot} onAction={onAction}
            onAsk={ask} busy={busy} showSuggestions={m.id === lastGuide?.id} />
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="border-t border-line px-3 pb-2.5 pt-3">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas py-1.5 pl-3 pr-1.5 transition-[border-color,background-color,box-shadow] focus-within:border-ink/30 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(47,84,84,0.08)]">
          <input ref={box} value={input} placeholder={placeholder} aria-label="Ask the guide" maxLength={500} enterKeyHint="send"
            onChange={(e) => setInput(e.target.value)}
            className="min-w-0 flex-1 truncate bg-transparent py-1 text-[13px] text-ink outline-none placeholder:text-faint" />
          <button type="submit" disabled={!input.trim() || busy} aria-label="Send"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ink text-white transition-colors hover:bg-teal disabled:bg-soft disabled:text-faint">
            <ArrowUp />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-faint">
          <span>Scripted demo · not investment advice</span>
          <kbd className="rounded border border-line bg-canvas px-1 font-mono text-[10px] text-muted">⌘K</kbd>
        </div>
      </form>
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className="grid h-7 w-7 place-items-center rounded-md text-faint transition-colors hover:bg-soft hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-faint">
      {children}
    </button>
  );
}

function Welcome({ count, onAsk, disabled }: { count: number; onAsk: (q: string) => void; disabled: boolean }) {
  return (
    <div className="guide-in pt-2">
      <h3 className="text-[15px] font-semibold tracking-tight text-ink">Ask about any of the {count} companies.</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        I follow you around the site and point out what matters on each page. Every answer is read from the site&apos;s own data: no AI model, nothing invented.
      </p>
      <div className="mt-4 space-y-1.5">
        {STARTERS.map((q) => (
          <button key={q} type="button" onClick={() => onAsk(q)} disabled={disabled}
            className="group flex w-full items-center justify-between rounded-lg border border-line px-3 py-2.5 text-left text-[13px] text-ink transition-colors hover:border-ink/25 hover:bg-canvas disabled:opacity-50">
            {q}
            <span className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink"><ArrowRight /></span>
          </button>
        ))}
      </div>
    </div>
  );
}

function GuideMessage({ m, placeName, dataset, snapshot, onAction, onAsk, busy, showSuggestions }: {
  m: GuideMsg;
  placeName: string;
  dataset: Dataset;
  snapshot: IndexSnapshot;
  onAction: (a: Action) => void;
  onAsk: (q: string) => void;
  busy: boolean;
  showSuggestions: boolean;
}) {
  const notice = m.kind === "notice";
  return (
    <div className={`guide-in ${notice ? "rounded-xl border border-line bg-canvas px-3.5 py-3" : ""}`}>
      {notice && (
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
          <Sparkle className="h-2.5 w-2.5 text-teal" /> On this page{placeName ? <span className="text-muted">· {placeName}</span> : null}
        </div>
      )}
      {!notice && <Trace steps={m.steps} streaming={m.streaming} started={m.text.length > 0} />}
      {notice && !m.text && m.streaming && <Dots />}
      {m.text && <RichText text={m.text} streaming={m.streaming} dataset={dataset} onAction={onAction} />}
      {m.error && <p className="rounded-lg bg-badsoft px-3 py-2 text-[12px] text-bad">{m.error}</p>}
      {m.blocks.length > 0 && (
        <div className="mt-3 space-y-2">
          {m.blocks.map((b, i) => <AnswerBlock key={i} block={b} dataset={dataset} snapshot={snapshot} onAction={onAction} />)}
        </div>
      )}
      {m.sourceIds.length > 0 && <Sources ids={m.sourceIds} dataset={dataset} snapshot={snapshot} />}
      {m.actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {m.actions.map((a, i) => (
            <button key={i} type="button" onClick={() => onAction(a)}
              className={`guide-in inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors ${i === 0
                ? "border-ink bg-ink text-white hover:border-teal hover:bg-teal"
                : "border-line bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-ink/40"}`}>
              {a.label} <ArrowRight className="h-2.5 w-2.5" />
            </button>
          ))}
        </div>
      )}
      {showSuggestions && m.suggestions.length > 0 && (
        <div className="mt-3.5">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-faint">Ask next</div>
          <div className="flex flex-wrap gap-1.5">
            {m.suggestions.map((p) => (
              <button key={p} type="button" onClick={() => onAsk(p)} disabled={busy}
                className="rounded-full border border-line bg-white px-2.5 py-1 text-left text-[12px] text-muted transition-colors hover:border-ink/30 hover:text-ink disabled:opacity-40">
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** What the guide looked at. Live while it works, then folded into one line. */
function Trace({ steps, streaming, started }: { steps: string[]; streaming: boolean; started: boolean }) {
  const [open, setOpen] = useState(false);
  if (!steps.length) return streaming ? <Dots /> : null;
  if (streaming && !started) {
    return (
      <ul className="mb-2 space-y-1">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          return (
            <li key={i} className="guide-in flex items-center gap-2 text-[12px] text-muted">
              {last
                ? <span className="guide-spin h-3 w-3 shrink-0 rounded-full border-[1.5px] border-teal/20 border-t-teal" />
                : <span className="text-teal"><Check /></span>}
              <span className={last ? "guide-pulse" : "text-faint"}>{s}</span>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <div className="mb-1.5">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} disabled={steps.length < 2}
        className="flex items-center gap-1.5 text-[11px] text-faint transition-colors hover:text-muted disabled:hover:text-faint">
        <span className="text-teal"><Check className="h-2.5 w-2.5" /></span>
        {steps.length === 1 ? steps[0] : `Looked at ${steps.length} things`}
        {steps.length > 1 && <span className={`transition-transform ${open ? "rotate-90" : ""}`}><Chevron className="h-2.5 w-2.5" /></span>}
      </button>
      {open && steps.length > 1 && (
        <ul className="mt-1 ml-1 space-y-0.5 border-l border-line pl-3">
          {steps.map((s, i) => <li key={i} className="text-[11px] text-faint">{s}</li>)}
        </ul>
      )}
    </div>
  );
}

function Dots() {
  return (
    <span className="inline-flex gap-1 py-1" aria-label="Working">
      {[0, 1, 2].map((i) => <span key={i} className="guide-dot h-1.5 w-1.5 rounded-full bg-teal" style={{ animationDelay: `${i * 160}ms` }} />)}
    </span>
  );
}

/** Text with [[TICKER]] chips, **bold**, "• " bullets and blank-line paragraphs. Half-streamed markers stay hidden. */
function RichText({ text, streaming, dataset, onAction }: { text: string; streaming: boolean; dataset: Dataset; onAction: (a: Action) => void }) {
  let t = text;
  if (streaming) {
    if ((t.match(/\*\*/g)?.length ?? 0) % 2) t = t.slice(0, t.lastIndexOf("**"));
    const o = t.lastIndexOf("[[");
    if (o > t.lastIndexOf("]]")) t = t.slice(0, o);
  }
  const inline = (s: string) => s.split(/(\[\[[A-Z0-9.]+\]\]|\*\*[^*]+\*\*)/).map((part, i) => {
    if (part.startsWith("[[") && part.endsWith("]]")) return <TickerChip key={i} ticker={part.slice(2, -2)} dataset={dataset} onAction={onAction} />;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
    return <span key={i}>{part}</span>;
  });
  const paras = t.split(/\n{2,}/);
  return (
    <div className="space-y-2 text-[13px] leading-[1.6] text-ink/80">
      {paras.map((p, i) => (
        <div key={i} className="space-y-1">
          {p.split("\n").map((line, j, lines) => {
            const tail = streaming && i === paras.length - 1 && j === lines.length - 1 ? <span className="guide-caret" /> : null;
            return line.startsWith("• ") ? (
              <div key={j} className="flex gap-2.5">
                <span className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-ink/30" aria-hidden />
                <span className="min-w-0">{inline(line.slice(2))}{tail}</span>
              </div>
            ) : (
              <p key={j}>{inline(line)}{tail}</p>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Source chips: one per filing family. Hover for every filing and any word-for-word quote. */
function Sources({ ids, dataset, snapshot }: { ids: string[]; dataset: Dataset; snapshot: IndexSnapshot }) {
  const [all, setAll] = useState(false);
  const groups = new Map<string, { label: string; lines: string[]; count: number; quote: boolean }>();
  for (const id of ids) {
    if (id === INDEX_SOURCE) {
      groups.set("index", { label: "Organizers' live index", lines: [snapshot.source, `Holdings as of ${new Date(snapshot.updatedAt).toLocaleString("en-CA")}`], count: 1, quote: false });
      continue;
    }
    const s = dataset.sources.find((x) => x.id === id);
    if (!s) continue;
    const label = s.label.replace(/,?\s*FY\d{4}$/, "");
    const g = groups.get(label) ?? { label, lines: [], count: 0, quote: false };
    g.lines.push(s.quote ? `${s.label}\n“${s.quote}”` : s.label);
    g.count += 1;
    g.quote ||= !!s.quote;
    groups.set(label, g);
  }
  const list = [...groups.values()];
  const shown = all ? list : list.slice(0, 3);
  if (!list.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1">
      <span className="mr-1 text-[10px] font-medium uppercase tracking-[0.12em] text-faint">Sources</span>
      {shown.map((g) => (
        <span key={g.label} title={g.lines.join("\n\n")}
          className="max-w-full cursor-help truncate rounded bg-soft px-1.5 py-0.5 font-mono text-[10px] text-muted transition-colors hover:bg-line hover:text-ink">
          {g.quote && <span className="mr-1 text-teal">❝</span>}
          {g.label}{g.count > 1 ? ` ×${g.count}` : ""}
        </span>
      ))}
      {list.length > 3 && (
        <button type="button" onClick={() => setAll(!all)} className="px-1 text-[10px] text-faint hover:text-ink">
          {all ? "fewer" : `+${list.length - 3}`}
        </button>
      )}
    </div>
  );
}
