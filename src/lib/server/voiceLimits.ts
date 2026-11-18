// Guards on the ElevenLabs key, so Jarvis can't run up the bill:
//  • a daily character budget for the voice (JARVIS_VOICE_DAILY_CHARS, default 25,000 ≈ 12,500 credits on Flash)
//  • a daily cap on transcriptions (JARVIS_LISTEN_DAILY, default 600 clips)
//  • a per-visitor rate limit (JARVIS_VOICE_PER_HOUR sentences, default 300)
//  • only this site may call the voice routes (no other website can use our key)
// Counters live in server memory: they reset when the server restarts, and on Vercel each running instance
// counts separately. That makes them a seatbelt, not a guarantee; the hard cap is the credit limit set on
// the key itself in the ElevenLabs dashboard.

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const limits = () => ({
  dailyChars: num(process.env.JARVIS_VOICE_DAILY_CHARS, 25_000),
  dailyListens: num(process.env.JARVIS_LISTEN_DAILY, 600),
  perHour: num(process.env.JARVIS_VOICE_PER_HOUR, 300),
});

const today = () => new Date().toISOString().slice(0, 10);

interface Day {
  day: string;
  chars: number;
  listens: number;
}
const usage: Day = { day: today(), chars: 0, listens: 0 };
function rollover() {
  const d = today();
  if (usage.day !== d) Object.assign(usage, { day: d, chars: 0, listens: 0 });
}

/** Spends voice characters if today's budget allows. false = over budget. */
export function spendChars(n: number): boolean {
  rollover();
  if (usage.chars + n > limits().dailyChars) return false;
  usage.chars += n;
  return true;
}

export function spendListen(): boolean {
  rollover();
  if (usage.listens + 1 > limits().dailyListens) return false;
  usage.listens += 1;
  return true;
}

export function usageToday() {
  rollover();
  return { ...usage, ...limits() };
}

// ── Per-visitor rate limit: a sliding one-hour window per IP ──
const hits = new Map<string, number[]>();
export function allowVisitor(ip: string, now = Date.now()): boolean {
  const hour = 3_600_000;
  const list = (hits.get(ip) ?? []).filter((t) => now - t < hour);
  if (list.length >= limits().perHour) {
    hits.set(ip, list);
    return false;
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear(); // never let the table grow without bound
  return true;
}

export function visitorOf(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "local";
}

/** True when the call comes from a page on this same site (its Origin or Referer names this host). */
export function sameSite(request: Request): boolean {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const from = request.headers.get("origin") ?? request.headers.get("referer");
  if (!from) return process.env.NODE_ENV === "development"; // curl and tests, locally only
  try {
    return !!host && new URL(from).host === host;
  } catch {
    return false;
  }
}

// ── Reuse audio for phrases said again (the greeting, the apology) ──
const audio = new Map<string, ArrayBuffer>();
export function cachedAudio(key: string): ArrayBuffer | undefined {
  const a = audio.get(key);
  if (a) { audio.delete(key); audio.set(key, a); } // most recently used goes to the back
  return a;
}
export function keepAudio(key: string, a: ArrayBuffer) {
  if (a.byteLength > 400_000) return;
  audio.set(key, a);
  while (audio.size > 60) audio.delete(audio.keys().next().value!);
}

/** Test hook: start a fresh day and empty the tables. */
export function resetVoiceLimits() {
  Object.assign(usage, { day: today(), chars: 0, listens: 0 });
  hits.clear();
  audio.clear();
}
