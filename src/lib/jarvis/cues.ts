// Screen cues: Jarvis writes short tags inside its speech, like <go page="map"/> or
// <point ticker="CSU" caption="Constellation"/>. The server lifts them out of the text as it streams
// (so they are never spoken or number-checked as speech) and sends each one just before the sentence it
// was written in, so the screen moves exactly as that sentence is heard. One reply, no tool round trips.

export type CueKind = "go" | "point" | "spot" | "show" | "scroll" | "clear";

export interface Cue {
  kind: CueKind;
  attrs: Record<string, string>;
}

const KINDS = new Set<CueKind>(["go", "point", "spot", "show", "scroll", "clear"]);

/** Reads one tag's insides: `go page="map"` → { kind: "go", attrs: { page: "map" } }. null if it isn't a cue. */
export function parseTag(inner: string): Cue | null {
  const m = inner.trim().replace(/\/$/, "").trim().match(/^([a-z]+)\b([\s\S]*)$/i);
  if (!m) return null;
  const kind = m[1].toLowerCase() as CueKind;
  if (!KINDS.has(kind)) return null;
  const attrs: Record<string, string> = {};
  for (const a of m[2].matchAll(/([a-z_]+)\s*=\s*"([^"]*)"/gi)) attrs[a[1].toLowerCase()] = a[2].trim();
  return { kind, attrs };
}

export type Piece = { text: string } | { cue: Cue };

/** Feeds streamed text in, gets text and cues out in order. A tag split across chunks is held until it closes. */
export class CueStream {
  private held = "";

  feed(chunk: string): Piece[] {
    const out: Piece[] = [];
    let s = this.held + chunk;
    this.held = "";
    for (;;) {
      const open = s.indexOf("<");
      if (open < 0) {
        if (s) out.push({ text: s });
        break;
      }
      if (open > 0) out.push({ text: s.slice(0, open) });
      const close = s.indexOf(">", open);
      if (close < 0) {
        // Not closed yet. A real tag is short; a stray "<" in prose is let through.
        if (s.length - open > 240) { out.push({ text: s.slice(open) }); }
        else this.held = s.slice(open);
        break;
      }
      const cue = parseTag(s.slice(open + 1, close));
      if (cue) out.push({ cue });
      else out.push({ text: s.slice(open, close + 1) });
      s = s.slice(close + 1);
    }
    return out.filter((p) => !("text" in p) || p.text !== "");
  }

  /** End of the reply: whatever is held is plain text. */
  flush(): Piece[] {
    const t = this.held;
    this.held = "";
    return t ? [{ text: t }] : [];
  }
}
