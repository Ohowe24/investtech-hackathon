"use client";

// The Guide: a panel that follows you around the site, points things out and answers questions.
// It talks to /api/assistant (a scripted demo, no AI model) and renders what streams back.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Dataset, IndexSnapshot } from "@contract/types";
import { INDEX_SOURCE } from "@/lib/assistant/brain";
import type { Action, AskRequest, Block, GuideContext, StreamEvent, View } from "@/lib/assistant/types";
import { AnswerBlock, TickerChip } from "./AnswerBlocks";

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

const STARTERS = ["What can you do?", "How does the model work?", "Which companies pass the model?", "Who sits top-right?"];

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
  const box = useRef<HTMLTextAreaElement>(null);

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
    if (open && focusKey > 0) box.current?.focus();
  }, [open, focusKey]);

  const here = context.ticker ? dataset.companies.find((c) => c.ticker === context.ticker) : undefined;
  const following = here ? `${here.ticker} · ${here.name}` : VIEW_NAMES[context.view];
  const watch = dataset.companies.find((c) => !c.inIndex && c.verdict === "watch");
  const placeholder = `Ask about a stock, like “${watch ? `Why is ${watch.ticker} on watch?` : "How does the model work?"}”`;
  const lastGuide = [...msgs].reverse().find((m): m is GuideMsg => m.role === "guide" && !m.streaming);

  const placeName = (place?: string) => {
    if (!place) return "";
    if (place.startsWith("c/")) return place.slice(2);
    return VIEW_NAMES[place as View] ?? place;
  };

  return (
    <div className="flex h-full flex-col text-white">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="guide-star text-[15px] text-[#3ddc6c]" aria-hidden>✦</span>
        <h2 className="text-[14px] font-semibold tracking-tight">Guide</h2>
        <span title="A scripted demo: every answer is assembled from data/companies.json and data/indexes.json. No AI model and no API key, so it cannot invent a number."
          className="cursor-help rounded-full border border-[#3ddc6c]/30 bg-[#3ddc6c]/10 px-2 py-0.5 text-[10px] font-medium text-[#3ddc6c]">
          Demo · answers from the data
        </span>
        <div className="ml-auto flex items-center gap-1">
          <IconBtn label="Clear the conversation" onClick={() => { setMsgs([]); stick.current = true; }} disabled={!msgs.length || busy}>⟲</IconBtn>
          <IconBtn label="Close the guide (⌘K)" onClick={onClose}>✕</IconBtn>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2 text-[11px] text-white/55">
        <span className="live-dot" />
        <span>Following you on:</span>
        <span className="truncate font-medium text-white/85">{following}</span>
      </div>

      <div ref={list} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
        className="guide-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {msgs.length === 0 && (
          <div className="guide-in space-y-3">
            <p className="text-[13px] leading-relaxed text-white/75">
              Hi, I&apos;m the Guide. I follow you around the site, point out what matters on each page, and answer questions about any of the {dataset.companies.length} companies.
            </p>
            <p className="text-[12px] leading-relaxed text-white/50">Everything I say is read from the site&apos;s own data. No AI model, nothing invented.</p>
            <Suggestions prompts={STARTERS} onAsk={ask} disabled={busy} />
          </div>
        )}
        {msgs.map((m) => m.role === "user" ? (
          <div key={m.id} className="guide-in flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-white px-3 py-2 text-[13px] leading-snug text-black">{m.text}</div>
          </div>
        ) : (
          <GuideMessage key={m.id} m={m} placeName={placeName(m.place)} dataset={dataset} snapshot={snapshot} onAction={onAction}
            onAsk={ask} busy={busy} showSuggestions={m.id === lastGuide?.id} />
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="border-t border-white/10 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 transition-colors focus-within:border-[#3ddc6c]/60">
          <textarea ref={box} value={input} rows={1} placeholder={placeholder} aria-label="Ask the guide"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
            className="max-h-28 min-h-[22px] flex-1 resize-none bg-transparent text-[13px] leading-snug text-white outline-none placeholder:text-white/35" />
          <button type="submit" disabled={!input.trim() || busy} aria-label="Send"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#3ddc6c] text-[13px] font-bold text-black transition-opacity disabled:opacity-30">
            ↑
          </button>
        </div>
        <div className="mt-1.5 flex justify-between px-1 text-[10px] text-white/35">
          <span>Scripted demo · not investment advice</span>
          <span>⌘K</span>
        </div>
      </form>
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className="grid h-7 w-7 place-items-center rounded-md text-[13px] text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent">
      {children}
    </button>
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
    <div className={`guide-in ${notice ? "rounded-xl border border-[#3ddc6c]/20 bg-[#3ddc6c]/[0.04] p-3" : ""}`}>
      {notice && (
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3ddc6c]/80">
          <span aria-hidden>✦</span> Noticed{placeName ? ` · ${placeName}` : ""}
        </div>
      )}
      {!notice && <Trace steps={m.steps} streaming={m.streaming} started={m.text.length > 0} />}
      {notice && !m.text && m.streaming && <Dots />}
      {m.text && <RichText text={m.text} streaming={m.streaming} dataset={dataset} onAction={onAction} />}
      {m.error && <p className="text-[13px] text-[#ff6b5e]">{m.error}</p>}
      {m.blocks.length > 0 && (
        <div className="mt-3 space-y-2">
          {m.blocks.map((b, i) => <AnswerBlock key={i} block={b} dataset={dataset} snapshot={snapshot} onAction={onAction} />)}
        </div>
      )}
      {m.sourceIds.length > 0 && <Sources ids={m.sourceIds} dataset={dataset} snapshot={snapshot} />}
      {m.actions.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {m.actions.map((a, i) => (
            <button key={i} type="button" onClick={() => onAction(a)}
              className="guide-in flex items-center gap-1 rounded-lg border border-[#3ddc6c]/40 bg-[#3ddc6c]/10 px-2.5 py-1 text-[12px] font-medium text-[#3ddc6c] transition-colors hover:bg-[#3ddc6c]/20">
              {a.label} <span aria-hidden>→</span>
            </button>
          ))}
        </div>
      )}
      {showSuggestions && m.suggestions.length > 0 && <div className="mt-3"><Suggestions prompts={m.suggestions} onAsk={onAsk} disabled={busy} /></div>}
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
            <li key={i} className="guide-in flex items-center gap-2 text-[12px] text-white/60">
              {last ? <span className="guide-spin h-3 w-3 rounded-full border-[1.5px] border-[#3ddc6c]/30 border-t-[#3ddc6c]" /> : <span className="text-[#3ddc6c]">✓</span>}
              <span className={last ? "shimmer-text" : ""}>{s}</span>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <div className="mb-1.5">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex items-center gap-1.5 text-[11px] text-white/40 transition-colors hover:text-white/70">
        <span className="text-[#3ddc6c]/70">✓</span>
        {steps.length === 1 ? steps[0] : `Looked at ${steps.length} things`}
        {steps.length > 1 && <span className={`transition-transform ${open ? "rotate-90" : ""}`}>›</span>}
      </button>
      {open && steps.length > 1 && (
        <ul className="mt-1 space-y-0.5 border-l border-white/10 pl-3">
          {steps.map((s, i) => <li key={i} className="text-[11px] text-white/45">{s}</li>)}
        </ul>
      )}
    </div>
  );
}

function Dots() {
  return (
    <span className="inline-flex gap-1 py-1" aria-label="Working">
      {[0, 1, 2].map((i) => <span key={i} className="guide-dot h-1.5 w-1.5 rounded-full bg-[#3ddc6c]" style={{ animationDelay: `${i * 160}ms` }} />)}
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
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    return <span key={i}>{part}</span>;
  });
  const paras = t.split(/\n{2,}/);
  return (
    <div className="space-y-2 text-[13px] leading-relaxed text-white/85">
      {paras.map((p, i) => (
        <div key={i} className="space-y-1">
          {p.split("\n").map((line, j, lines) => {
            const tail = streaming && i === paras.length - 1 && j === lines.length - 1 ? <span className="caret" /> : null;
            return line.startsWith("• ") ? (
              <div key={j} className="flex gap-2 pl-0.5">
                <span className="text-[#3ddc6c]" aria-hidden>•</span>
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

function Suggestions({ prompts, onAsk, disabled }: { prompts: string[]; onAsk: (q: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {prompts.map((p) => (
        <button key={p} type="button" onClick={() => onAsk(p)} disabled={disabled}
          className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-left text-[12px] text-white/80 transition-colors hover:border-white/40 hover:text-white disabled:opacity-40">
          {p}
        </button>
      ))}
    </div>
  );
}

/** Source chips: one per filing family. Hover for every filing and any word-for-word quote. */
function Sources({ ids, dataset, snapshot }: { ids: string[]; dataset: Dataset; snapshot: IndexSnapshot }) {
  const [all, setAll] = useState(false);
  const groups = new Map<string, { label: string; lines: string[]; quote: boolean }>();
  for (const id of ids) {
    if (id === INDEX_SOURCE) {
      groups.set("index", { label: "Organizers' live index", lines: [snapshot.source, `Holdings as of ${new Date(snapshot.updatedAt).toLocaleString("en-CA")}`], quote: false });
      continue;
    }
    const s = dataset.sources.find((x) => x.id === id);
    if (!s) continue;
    const label = s.label.replace(/,?\s*FY\d{4}$/, "");
    const g = groups.get(label) ?? { label, lines: [], quote: false };
    g.lines.push(s.quote ? `${s.label}\n“${s.quote}”` : s.label);
    g.quote ||= !!s.quote;
    groups.set(label, g);
  }
  const list = [...groups.values()];
  const shown = all ? list : list.slice(0, 4);
  if (!list.length) return null;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1">
      <span className="mr-0.5 text-[10px] uppercase tracking-wide text-white/35">Sources</span>
      {shown.map((g) => (
        <span key={g.label} title={g.lines.join("\n\n")}
          className="max-w-full cursor-help truncate rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/60 hover:border-white/30 hover:text-white/90">
          {g.quote && <span className="mr-1 text-[#3ddc6c]">❝</span>}
          {g.label}{g.lines.length > 1 ? ` ×${g.lines.length}` : ""}
        </span>
      ))}
      {list.length > 4 && (
        <button type="button" onClick={() => setAll(!all)} className="text-[10px] text-white/45 hover:text-white">
          {all ? "fewer" : `+${list.length - 4} more`}
        </button>
      )}
    </div>
  );
}
