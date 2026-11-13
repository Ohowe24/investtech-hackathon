"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/*
  Motion helpers for the "alive" layer. They only change how a value arrives on
  screen, never the value: Decode always settles on the exact text it was given.
*/

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The time now, refreshed every `ms`. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const DIGITS = "0123456789";
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+<>/";

function scramble(text: string, locked: number, letters: boolean): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (i < locked) out += ch;
    else if (/[0-9]/.test(ch)) out += DIGITS[(Math.random() * 10) | 0];
    else if (letters && /[A-Za-z]/.test(ch)) out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
    else out += ch;
  }
  return out;
}

/**
 * Text that decodes into place: characters flicker, then lock left to right.
 * Digits flicker by default; `letters` makes words flicker too. The final text
 * is exactly `text`.
 */
export function Decode({ text, delay = 0, duration = 650, letters = false, className = "", style }: {
  text: string;
  delay?: number;
  duration?: number;
  letters?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? text : scramble(text, 0, letters)));

  useEffect(() => {
    let raf = 0;
    if (prefersReducedMotion()) {
      raf = requestAnimationFrame(() => setShown(text));
      return () => cancelAnimationFrame(raf);
    }
    let last = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const p = (now - start) / duration;
      if (p >= 1) {
        setShown(text);
        return;
      }
      raf = requestAnimationFrame(tick);
      if (now - last < 45) return; // ~22 frames a second reads as flicker, not blur
      last = now;
      setShown(scramble(text, p < 0 ? 0 : Math.floor(p * text.length), letters));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, delay, duration, letters]);

  return <span className={className} style={style} aria-label={text}><span aria-hidden>{shown}</span></span>;
}

// One shared observer for every Reveal on the page.
let observer: IntersectionObserver | null = null;
const callbacks = new WeakMap<Element, () => void>();
function observe(el: Element, onIn: () => void) {
  if (typeof IntersectionObserver === "undefined") return onIn();
  observer ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        callbacks.get(e.target)?.();
        callbacks.delete(e.target);
        observer?.unobserve(e.target);
      }
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
  callbacks.set(el, onIn);
  observer.observe(el);
}
function unobserve(el: Element) {
  callbacks.delete(el);
  observer?.unobserve(el);
}

/** True once the element has scrolled into view. */
export function useInView<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    observe(el, () => setInView(true));
    return () => unobserve(el);
  }, []);
  return [ref, inView];
}

/** Holds every animation inside it until it scrolls into view. */
export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return <div ref={ref} className={`reveal ${inView ? "is-in" : ""} ${className}`}>{children}</div>;
}

/** Decodes only once it is on screen. */
export function DecodeInView(props: Parameters<typeof Decode>[0]) {
  const [ref, inView] = useInView<HTMLSpanElement>();
  return (
    <span ref={ref} className="inline-block">
      {inView ? <Decode {...props} /> : <span className={`${props.className ?? ""} opacity-0`}>{props.text}</span>}
    </span>
  );
}
