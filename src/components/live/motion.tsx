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

/**
 * A value shown as is. It used to scramble and "decode" into place; that effect is gone, and the
 * component stays so every caller keeps working. The props other than `text`, `className` and
 * `style` are accepted and ignored.
 */
export function Decode({ text, className = "", style }: {
  text: string;
  delay?: number;
  duration?: number;
  letters?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return <span className={className} style={style}>{text}</span>;
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
  return <Decode {...props} />;
}
