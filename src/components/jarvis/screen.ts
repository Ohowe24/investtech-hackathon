// Jarvis's hands and eyes on the page. It reads what's on screen as a numbered list of elements (headings,
// panels, rows, buttons, charts), and acts on them: go to a page, scroll, spotlight, point at a company, click.
// Works on any page without per-component wiring: element ids are stamped onto the DOM as it reads.

const ATTR = "data-jv";
const PAGE_NAMES: Record<string, string> = {
  "": "Ranking (home)", ranking: "Ranking (home)", recommendation: "Recommendation", companies: "Companies table", map: "Map", xray: "X-ray",
};

export interface ScreenElement {
  id: string;
  kind: string;
  text: string;
  visible: boolean;
}

export interface Screen {
  page: string;
  elements: ScreenElement[];
}

/** Which page is showing, in words. */
export function pageName(): string {
  const h = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  if (h.startsWith("c/")) return `Company page: ${h.slice(2)}`;
  if (h.startsWith("xray/")) return `X-ray: ${h.slice(5)}`;
  return PAGE_NAMES[h] ?? h;
}

const clean = (s: string | null | undefined, max = 110) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
/** Text as laid out (spaces between chips and cells), not glued together like textContent. */
const said = (el: Element) => (el as HTMLElement).innerText ?? el.textContent ?? "";

function inView(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight && r.width > 0 && r.height > 0;
}

function shown(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const s = getComputedStyle(el);
  // Not opacity: the site fades panels in as they scroll into view, and those still count.
  return s.visibility !== "hidden" && s.display !== "none";
}

/** Things outside the app (Jarvis itself, overlays) are never part of the screen. */
const ours = (el: Element) => !el.closest("[data-jarvis-ui]");

/** Reads the page into a numbered list Claude can refer to. Ids are stable until the next read. */
export function readScreen(): Screen {
  document.querySelectorAll(`[${ATTR}]`).forEach((e) => e.removeAttribute(ATTR));
  const root = document.querySelector("main") ?? document.body;
  const items: { el: Element; kind: string; text: string }[] = [];
  const seen = new Set<Element>();
  const add = (el: Element, kind: string, text: string) => {
    if (seen.has(el) || !ours(el) || !shown(el) || !text) return;
    seen.add(el);
    items.push({ el, kind, text });
  };

  document.querySelectorAll('nav[aria-label="Main navigation"] button').forEach((b) => add(b, b.getAttribute("aria-current") === "page" ? "tab (current)" : "tab", clean(b.textContent, 40)));
  root.querySelectorAll("section").forEach((s) => {
    const head = s.querySelector("h1, h2, h3");
    const h = head ? clean(said(head)) : "";
    add(s, "panel", clean(h ? `${h} — ${said(s).replace(said(head!), "")}` : said(s), 160));
  });
  root.querySelectorAll("h1, h2, h3, h4").forEach((h) => add(h, "heading", clean(h.textContent)));
  root.querySelectorAll("tbody tr").forEach((tr) => add(tr, "row", clean(said(tr), 110)));
  root.querySelectorAll("svg").forEach((svg) => {
    const r = svg.getBoundingClientRect();
    if (r.width > 240 && r.height > 140) add(svg, "chart", clean(svg.getAttribute("aria-label") || svg.closest("section")?.querySelector("h2, h3")?.textContent || "chart"));
  });
  root.querySelectorAll("button, a[href], [role='button'], [role='tab'], select").forEach((b) => {
    const t = clean(b.getAttribute("aria-label") || b.textContent, 60);
    if (t.length > 1) add(b, b.tagName === "A" ? "link" : b.tagName === "SELECT" ? "select" : "button", t);
  });

  // On screen first, then the rest in page order; at most 80.
  const ordered = [...items.filter((i) => inView(i.el)), ...items.filter((i) => !inView(i.el))].slice(0, 80);
  const elements = ordered.map((i, n) => {
    const id = `e${n + 1}`;
    i.el.setAttribute(ATTR, id);
    return { id, kind: i.kind, text: i.text, visible: inView(i.el) };
  });
  return { page: pageName(), elements };
}

/** The screen as text, for Claude. */
export function describeScreen(s: Screen): string {
  return [
    `Page: ${s.page}`,
    ...s.elements.map((e) => `${e.id} ${e.kind}${e.visible ? "" : " (below/above, scroll to see)"}: ${e.text}`),
  ].join("\n");
}

export function byId(id: unknown): Element | null {
  return typeof id === "string" ? document.querySelector(`[${ATTR}="${CSS.escape(id)}"]`) : null;
}

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Goes to a page and waits for it to draw. */
export async function goTo(page?: string, ticker?: string): Promise<void> {
  const hash = ticker && page === "xray" ? `xray/${ticker}` : ticker ? `c/${ticker}` : page === "ranking" || !page ? "" : page;
  if (decodeURIComponent(window.location.hash.replace(/^#/, "")) !== hash) {
    window.location.assign(`#${hash}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
    await settle(650);
  }
}

export async function scrollPage(to: string): Promise<void> {
  const h = window.innerHeight * 0.75;
  if (to === "top") window.scrollTo({ top: 0, behavior: "smooth" });
  else if (to === "bottom") window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  else window.scrollBy({ top: to === "up" ? -h : h, behavior: "smooth" });
  await settle(500);
}

/** Finds a company on the page: its map dot, table row, card or chip. */
export function findTicker(ticker: string): Element | null {
  const root = document.querySelector("main") ?? document.body;
  const t = ticker.toUpperCase();
  const exact = (el: Element) => clean(el.textContent, 200).toUpperCase().replace(/\s*\(OFF CHART\)/, "") === t;
  // A map dot: the <g> around its label.
  for (const tx of root.querySelectorAll("svg text")) if (exact(tx) && ours(tx)) return tx.closest("g") ?? tx;
  // A row in a table.
  for (const tr of root.querySelectorAll("tbody tr")) {
    if ([...tr.querySelectorAll("td *, td")].some(exact)) return tr;
  }
  // A chip or label: the smallest element whose text is exactly the ticker, lifted to its card if it has one.
  const hits = [...root.querySelectorAll("span, div, button, a, p, b, strong, code")].filter((e) => exact(e) && shown(e) && ours(e));
  if (!hits.length) return null;
  const chip = hits.sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
  const card = chip.closest("a, li, article, [class*='rounded-xl'], [class*='rounded-2xl']");
  return card && card.getBoundingClientRect().height < window.innerHeight * 0.7 ? card : chip;
}

/** Finds the panel or chart whose heading contains this text (case-insensitive). Exact headings win over partial ones. */
export function findByText(find: string): Element | null {
  const root = document.querySelector("main") ?? document.body;
  const want = find.trim().toLowerCase();
  if (!want) return null;
  const heads = [...root.querySelectorAll("h1, h2, h3, h4, [class*='uppercase']")].filter((h) => ours(h) && shown(h));
  const text = (h: Element) => clean(said(h), 200).toLowerCase();
  const hit = heads.find((h) => text(h) === want) ?? heads.find((h) => text(h).startsWith(want)) ?? heads.find((h) => text(h).includes(want));
  if (hit) {
    // The panel the heading belongs to; if that panel is enormous, the heading's own block.
    const panel = hit.closest("section, [class*='rounded-xl'], [class*='rounded-2xl']");
    if (panel && panel.getBoundingClientRect().height < window.innerHeight * 1.4) return panel;
    return hit.parentElement ?? hit;
  }
  // No heading matched: any panel whose text contains it.
  return [...root.querySelectorAll("section")].find((s) => ours(s) && clean(said(s), 400).toLowerCase().includes(want)) ?? null;
}

/** Hover a map dot or row so the page shows its own detail for it. */
export function hover(el: Element) {
  el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
}

export function clickEl(el: Element) {
  (el as HTMLElement).click();
}

// ───────────────────────── The spotlight ─────────────────────────

type Listener = (s: Spot | null) => void;
export interface Spot {
  el: Element;
  caption?: string;
}
let current: Spot | null = null;
const listeners = new Set<Listener>();

export function spotlight(el: Element | null, caption?: string) {
  current = el ? { el, caption } : null;
  if (el) {
    const r = el.getBoundingClientRect();
    // Tall panels: bring their top (the heading) into view, below the sticky header. Small things: centre them.
    if (r.height > window.innerHeight * 0.6) window.scrollTo({ top: window.scrollY + r.top - 84, behavior: "smooth" });
    else el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  listeners.forEach((l) => l(current));
}

export function onSpot(l: Listener): () => void {
  listeners.add(l);
  l(current);
  return () => listeners.delete(l);
}
