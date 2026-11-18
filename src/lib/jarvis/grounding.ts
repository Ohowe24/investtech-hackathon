// Zero tolerance, out loud: before Jarvis speaks a sentence, every number in it must trace to
// something it was given (tool results, the briefing, the person's own words). A sentence that
// fails is shown struck through and never spoken. Also: sentence splitting and text-to-speech prep.

/** Numbers in a piece of text, as plain values: "4.1%" -> 4.1, "$1,234" -> 1234, "3×" -> 3. Years and ordinals included. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  // Strip ticker chips first: [[X1]] is a name, not a number.
  const clean = text.replace(/\[\[[A-Z0-9.\-]+\]\]/g, " ");
  for (const m of clean.matchAll(/(?<![A-Za-z])-?\d[\d,]*(?:\.\d+)?/g)) {
    const v = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(v)) out.push(Math.abs(v));
  }
  return out;
}

/** Everything Jarvis may quote: numbers from tool results, the briefing and the person's questions. */
export class Ground {
  private values = new Set<string>();

  add(text: string): void {
    for (const v of numbersIn(text)) {
      this.values.add(key(v));
      // Allow the same figure said more simply: 34.25 -> 34.3 -> 34.
      this.values.add(key(round(v, 1)));
      // Whole numbers only for big figures, where rounding moves the value by under 5%: 1.5 is never "2".
      if (v >= 10) this.values.add(key(Math.round(v)));
    }
  }

  has(v: number): boolean {
    return this.values.has(key(v));
  }

  /** Numbers in the sentence that trace to nothing. Empty means the sentence is safe to speak. */
  unverified(sentence: string): number[] {
    return numbersIn(sentence).filter((v) => !this.has(v) && !trivial(v, sentence));
  }
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const key = (v: number) => String(round(v, 4));

/** Counting words said as digits ("2 companies", "check 1 of 5") are fine; financial figures never are. */
function trivial(v: number, sentence: string): boolean {
  if (!Number.isInteger(v) || v > 10) return false;
  // A small whole number followed by a %, ×, x, $ or currency word is a financial figure: no free pass.
  const re = new RegExp(`(?<![\\d.])${v}(?![\\d.])\\s*(%|×|x\\b|times|percent|per cent|dollars|million|billion|bn|m\\b)`, "i");
  if (re.test(sentence)) return false;
  return !new RegExp(`\\$\\s*${v}(?![\\d.])`).test(sentence);
}

// ───────────────────────── Sentences ─────────────────────────

/**
 * Splits finished sentences off the front of a growing text buffer. A period between digits (4.1),
 * after a single capital (U.S.) or after common abbreviations is not an end.
 * Returns the finished sentences and whatever is left over.
 */
export function takeSentences(buf: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    const ch = buf[i];
    const isEnd = ch === "." || ch === "!" || ch === "?" || ch === "\n";
    if (!isEnd) continue;
    if (ch === "\n") {
      push(buf.slice(start, i));
      start = i + 1;
      continue;
    }
    const next = buf[i + 1];
    if (next === undefined) break; // can't tell yet: wait for more text
    if (!/\s/.test(next) && !/["”')\]]/.test(next)) continue;
    if (ch === ".") {
      const before = buf.slice(Math.max(start, i - 6), i);
      if (/(^|\s)(e\.g|i\.e|vs|approx|Inc|Corp|Ltd|Co|St|Mr|Ms|Dr|No|etc)$/i.test(before)) continue;
      if (/(^|[\s.])[A-Z]$/.test(before)) continue;
    }
    // Swallow a closing quote or bracket.
    let end = i + 1;
    while (end < buf.length && /["”')\]]/.test(buf[end])) end++;
    push(buf.slice(start, end));
    start = end;
  }
  function push(s: string) {
    const t = s.trim();
    if (t) sentences.push(t);
  }
  return { sentences, rest: buf.slice(start) };
}

// ───────────────────────── Speech ─────────────────────────

/** Turns a caption into something a voice reads well: chips become names, symbols become words, markdown goes. */
export function forSpeech(text: string, names: Record<string, string>): string {
  return text
    .replace(/\[\[([A-Z0-9.\-]+)\]\]/g, (_, t: string) => names[t] ?? t.split("").join(" "))
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^[•\-*]\s+/gm, "")
    .replace(/(\d)\s*×/g, "$1 times")
    .replace(/(\d)x\b/g, "$1 times")
    .replace(/≥/g, " at least ")
    .replace(/≤/g, " at most ")
    .replace(/→/g, " to ")
    .replace(/\bFCF\b/g, "free cash flow")
    .replace(/\bEBITDA\b/g, "ee-bit-dah")
    .replace(/\bFY\s?(\d{4})\b/g, "fiscal $1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
