// The company page comes alive under the briefing: when Jarvis turns to a part of the page, that part replays
// itself. Bars rise, lines draw, dots pop, figures count up to their value, table rows cascade in. It works on
// whatever the part contains, with no per-chart wiring. Everything runs through the Web Animations API with
// fill "backwards", so nothing is left behind on the page; figures always end on exactly the text the page had.

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const ours = (el: Element) => !el.closest("[data-jarvis-ui]");

/** Replays the part of the page Jarvis is about. */
export function animateWithin(root: Element, opts: { glow?: { selector: string; at: number }[] } = {}): void {
  if (reduced()) return;
  bars(root);
  lines(root);
  dots(root);
  strips(root);
  rows(root);
  figures(root);
  for (const g of opts.glow ?? []) {
    const el = root.querySelector(g.selector) ?? document.querySelector(g.selector);
    if (el) glow(el, g.at);
  }
}

/** Chart bars: each rises into place, left to right. */
function bars(root: Element) {
  for (const svg of root.querySelectorAll("svg")) {
    if (!ours(svg)) continue;
    const box = svg.getBoundingClientRect();
    if (box.width < 120 || box.height < 60) continue;
    const rects = [...svg.querySelectorAll("rect")].filter((r) => {
      const b = r.getBoundingClientRect();
      const fill = getComputedStyle(r).fill;
      // Skip backgrounds and hit areas: anything nearly as big as the chart, or invisible.
      return b.width > 1 && b.height > 1 && b.width * b.height < box.width * box.height * 0.5 && fill !== "none" && getComputedStyle(r).opacity !== "0";
    });
    rects.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    rects.slice(0, 60).forEach((r, i) => {
      (r as SVGElement).style.transformBox = "fill-box";
      (r as SVGElement).style.transformOrigin = "center bottom";
      r.animate([{ opacity: 0, transform: "scaleY(0.15)" }, { opacity: 1, transform: "scaleY(1)" }], { duration: 700, delay: 80 + i * 45, easing: EASE, fill: "backwards" });
    });
  }
}

/** Chart lines: drawn from start to end. */
function lines(root: Element) {
  const paths = [...root.querySelectorAll("svg path, svg polyline")].filter((p) => {
    if (!ours(p)) return false;
    const s = getComputedStyle(p);
    return s.fill === "none" && s.stroke !== "none" && (p as SVGGeometryElement).getTotalLength?.() > 40;
  }) as SVGGeometryElement[];
  paths.slice(0, 12).forEach((p, i) => {
    const len = p.getTotalLength();
    p.animate([{ strokeDasharray: `${len}`, strokeDashoffset: `${len}` }, { strokeDasharray: `${len}`, strokeDashoffset: "0" }], { duration: 1200, delay: 200 + i * 120, easing: EASE, fill: "backwards" });
  });
}

/** Chart dots: pop in after the lines start. */
function dots(root: Element) {
  const cs = [...root.querySelectorAll("svg circle")].filter((c) => ours(c) && c.getBoundingClientRect().width < 18);
  cs.slice(0, 40).forEach((c, i) => {
    (c as SVGElement).style.transformBox = "fill-box";
    (c as SVGElement).style.transformOrigin = "center";
    c.animate([{ opacity: 0, transform: "scale(0)" }, { opacity: 1, transform: "scale(1)" }], { duration: 450, delay: 500 + i * 50, easing: EASE, fill: "backwards" });
  });
}

/** Strips of small segments (rank bars, check pips, the analysts' split): each slides in from the left. */
function strips(root: Element) {
  for (const strip of root.querySelectorAll('[role="img"]')) {
    if (!ours(strip) || strip.tagName.toLowerCase() === "svg") continue;
    [...strip.children].slice(0, 60).forEach((seg, i) => {
      (seg as HTMLElement).style.transformOrigin = "left center";
      seg.animate([{ opacity: 0, transform: "scaleX(0.2)" }, { opacity: 1, transform: "scaleX(1)" }], { duration: 500, delay: 120 + i * 22, easing: EASE, fill: "backwards" });
    });
  }
}

/** Table rows: cascade in, top to bottom. */
function rows(root: Element) {
  const trs = [...root.querySelectorAll("tbody tr")].filter(ours);
  trs.slice(0, 30).forEach((tr, i) => {
    tr.animate([{ opacity: 0, transform: "translateX(-14px)" }, { opacity: 1, transform: "none" }], { duration: 520, delay: 60 + i * 35, easing: EASE, fill: "backwards" });
  });
}

const NUMBER = /^(.*?)(-?)(\d[\d,]*)(\.\d+)?(.*)$/;

/** Figures: count up from zero and land on exactly the page's own text. Only the site's figure styles, not axis labels. */
function figures(root: Element) {
  const els = [...root.querySelectorAll<HTMLElement>(".font-mono, .tabular-nums")].filter((el) => {
    if (!ours(el) || el.children.length > 0) return false;
    const t = el.textContent?.trim() ?? "";
    return t.length > 0 && t.length < 16 && NUMBER.test(t) && /\d/.test(t);
  });
  els.slice(0, 48).forEach((el, i) => countUp(el, 100 + i * 25));
}

function countUp(el: HTMLElement, delay: number) {
  const orig = el.textContent ?? "";
  const m = orig.trim().match(NUMBER);
  if (!m) return;
  const target = Number(`${m[3].replace(/,/g, "")}${m[4] ?? ""}`);
  if (!Number.isFinite(target) || target === 0) return;
  const decimals = m[4] ? m[4].length - 1 : 0;
  const commas = m[3].includes(",");
  const fmt = (v: number) => (commas ? v.toLocaleString("en", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : v.toFixed(decimals));
  const start = performance.now() + delay;
  const dur = 900;
  let last = orig;
  const tick = (now: number) => {
    // The page re-rendered it meanwhile: leave it to the page.
    if (el.textContent !== last) return;
    const t = Math.max(0, Math.min(1, (now - start) / dur));
    if (t >= 1) { el.textContent = orig; return; }
    const e = 1 - Math.pow(1 - t, 3);
    last = `${m[1]}${m[2]}${fmt(target * e)}${m[5]}`;
    el.textContent = last;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** A soft highlight that swells and fades on one row, as the voice reaches it. */
function glow(el: Element, at: number) {
  el.animate(
    [
      { backgroundColor: "rgba(61,220,108,0)", boxShadow: "0 0 0 0 rgba(61,220,108,0)" },
      { backgroundColor: "rgba(61,220,108,0.16)", boxShadow: "0 0 0 1px rgba(61,220,108,0.45)", offset: 0.25 },
      { backgroundColor: "rgba(61,220,108,0.08)", boxShadow: "0 0 0 1px rgba(61,220,108,0.2)", offset: 0.7 },
      { backgroundColor: "rgba(61,220,108,0)", boxShadow: "0 0 0 0 rgba(61,220,108,0)" },
    ],
    { duration: 2600, delay: at, easing: "ease-in-out", fill: "none" },
  );
}
