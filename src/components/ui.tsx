"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Dashboard panel: a short title, optional controls on the right. */
export function Card({ title, right, children, className = "" }: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-xl border border-line bg-white ${className}`}>
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
  pass?: string;
  note?: string;
}

/**
 * A label you can click to read how the number is calculated.
 * The popover is portalled and fixed-positioned so scroll containers never clip it.
 */
export function Explain({ info, children, className = "" }: { info: Explanation; children: ReactNode; className?: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const WIDTH = 288;

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
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pos) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left + r.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 8);
    setPos({ top: r.bottom + 6, left });
  };

  const rows: [string, string | undefined][] = [
    ["What it shows", info.what],
    ["How it's calculated", info.how],
    ["Pass if", info.pass],
    ["", info.note],
  ];

  return (
    <>
      <button ref={btn} type="button" onClick={toggle} aria-expanded={pos != null}
        className={`cursor-help underline decoration-faint decoration-dotted underline-offset-[3px] hover:text-ink hover:decoration-ink ${pos ? "text-ink decoration-ink" : ""} ${className}`}>
        {children}
      </button>
      {pos && createPortal(
        <div ref={pop} role="dialog" onClick={(e) => e.stopPropagation()} style={{ top: pos.top, left: pos.left, width: WIDTH }}
          className="fixed z-50 rounded-lg bg-ink p-3.5 text-left text-xs leading-relaxed text-white shadow-xl">
          <div className="text-[13px] font-semibold">{info.title}</div>
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k || "note"} className="mt-2">
              {k && <div className="text-[10px] font-medium uppercase tracking-wide text-white/50">{k}</div>}
              <div className={k ? "text-white/90" : "text-white/60"}>{v}</div>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
