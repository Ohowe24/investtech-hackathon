"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useInView } from "./live/motion";

/** Dashboard panel: a short title, optional controls on the right. */
export function Card({ title, right, children, className = "" }: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLElement>();
  return (
    <section ref={ref} className={`spot reveal ${inView ? "is-in" : ""} min-w-0 rounded-xl border border-line bg-white ${className}`}>
      {(title || right) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
          {right}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Segmented control. */
export function Segmented<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg bg-soft p-0.5 text-xs font-medium">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={`rounded-md px-3 py-1.5 transition-all ${value === o.id ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Pass / fail / no-data dot. */
export function Dot({ pass, size = 10 }: { pass: boolean | null; size?: number }) {
  const style = { width: size, height: size };
  if (pass === null) return <span style={style} className="inline-block rounded-full border border-dashed border-faint" />;
  return <span style={style} className={`inline-block rounded-full ${pass ? "bg-teal" : "bg-bad"}`} />;
}

/** What a number is and how it is calculated. Every field is one or two plain sentences. */
export interface Explanation {
  title: string;
  what?: string;
  how?: string;
  why?: string;
  /** figures from the data, one per line */
  facts?: string[];
  pass?: string;
  weight?: string;
  note?: string;
}

/**
 * A label you can click to read how the number is calculated.
 * The popover is portalled and fixed-positioned so scroll containers never clip it.
 */
export function Explain({ info, children, className = "" }: { info: Explanation; children: ReactNode; className?: string }) {
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const WIDTH = 340;

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !pop.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    // Scrolling the page closes it; scrolling inside the popover does not.
    const onScroll = (e: Event) => !pop.current?.contains(e.target as Node) && close();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pos) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left + r.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 8);
    // Open below, or above when there is more room there.
    const below = window.innerHeight - r.bottom - 14;
    const above = r.top - 14;
    setPos(below >= 380 || below >= above ? { top: r.bottom + 6, left, maxHeight: below } : { bottom: window.innerHeight - r.top + 6, left, maxHeight: above });
  };

  const rows: [string, string | undefined][] = [
    ["What", info.what],
    ["How", info.how],
    ["Why it matters", info.why],
    ["Pass if", info.pass],
    ["Weight in score", info.weight],
    ["", info.note],
  ];

  return (
    <>
      <button ref={btn} type="button" onClick={toggle} aria-expanded={pos != null}
        className={`cursor-help underline decoration-faint decoration-dotted underline-offset-[3px] hover:text-ink hover:decoration-ink ${pos ? "text-ink decoration-ink" : ""} ${className}`}>
        {children}
      </button>
      {pos && createPortal(
        <div ref={pop} role="dialog" onClick={(e) => e.stopPropagation()} style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: WIDTH, maxHeight: pos.maxHeight }}
          className="fixed z-50 overflow-y-auto rounded-lg bg-ink p-3.5 text-left text-xs leading-relaxed text-white shadow-xl">
          <div className="text-[13px] font-semibold">{info.title}</div>
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k || "note"} className="mt-2">
              {k && <div className="text-[10px] font-medium uppercase tracking-wide text-white/50">{k}</div>}
              <div className={k ? "text-white/90" : "text-white/60"}>{v}</div>
              {k === "Why it matters" && info.facts && (
                <ul className="mt-2 space-y-1.5 border-l border-white/20 pl-2.5 text-white/75">
                  {info.facts.map((f) => <li key={f}>{f}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
