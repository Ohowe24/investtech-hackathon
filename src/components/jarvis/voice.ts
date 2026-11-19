// Jarvis's ears and mouth in the browser. No React here: plain classes the component drives.
//
// Listener: the microphone stays open for the whole conversation. Silero VAD (a small speech-detection model
// running in the page) says when you start and stop talking. Start → Jarvis goes quiet at once (barge-in).
// Stop → the clip goes to ElevenLabs Scribe for text, or the browser's own recogniser when no key is set.
//
// Speaker: sentences in, audio out, in order. Each sentence goes to ElevenLabs the moment it arrives, so the
// next is ready while the current one plays. Falls back to the browser's voice when no key is set.

import type { MicVAD } from "@ricky0123/vad-web";

/** One shared AudioContext, created on the first click (browsers refuse to start audio before one). */
let sharedCtx: AudioContext | null = null;
export function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedCtx) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    sharedCtx = new Ctx();
  }
  if (sharedCtx.state === "suspended") void sharedCtx.resume();
  return sharedCtx;
}

/** A soft two-note chime: "I heard you". */
export function chime(kind: "heard" | "start" | "end" = "heard") {
  const ctx = audioContext();
  if (!ctx) return;
  const notes = kind === "start" ? [523.25, 783.99] : kind === "end" ? [659.25, 392] : [880, 1174.66];
  notes.forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    const t = ctx.currentTime + i * 0.07;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.25);
  });
}

function rms(data: ArrayLike<number>, centered: boolean): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = centered ? (data[i] - 128) / 128 : data[i];
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / Math.max(1, data.length)) * 3.2);
}

/** 16 kHz float samples → a 16-bit WAV file. */
export function toWav(samples: Float32Array, rate = 16000): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

// ───────────────────────── Speaker ─────────────────────────

/** How one sentence is voiced. Used by the briefing; conversation uses the defaults. */
export interface VoiceOpts {
  /** voice speed, 1 = normal (ElevenLabs takes 0.7 to 1.2) */
  speed?: number;
  /** cut the silence at both ends of the clip, so sentences follow each other closely */
  tight?: boolean;
}

/** A voiced sentence, and the silence to skip at its start and end (seconds). */
interface Clip {
  url: string;
  lead: number;
  tail: number;
}

interface Item {
  speech: string;
  opts: VoiceOpts;
  audio: Promise<Clip | null>;
  onStart: () => void;
}

/** Leading and trailing silence of an mp3, measured from its decoded samples. Zero when it can't be decoded. */
async function silences(blob: Blob): Promise<{ lead: number; tail: number }> {
  const ctx = audioContext();
  if (!ctx) return { lead: 0, tail: 0 };
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const d = buf.getChannelData(0);
    const quiet = 0.012;
    let a = 0;
    while (a < d.length && Math.abs(d[a]) < quiet) a++;
    let b = d.length - 1;
    while (b > a && Math.abs(d[b]) < quiet) b--;
    // Keep a breath either side so words aren't clipped.
    const lead = Math.max(0, a / buf.sampleRate - 0.04);
    // A short, natural pause after each sentence; only the dead air beyond it goes.
    const tail = Math.max(0, (d.length - 1 - b) / buf.sampleRate - 0.3);
    return { lead, tail };
  } catch {
    return { lead: 0, tail: 0 };
  }
}

function pickBrowserVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  const vs = speechSynthesis.getVoices();
  // A calm, crisp British male voice in the spirit of an AI butler. Best-sounding first: Edge's neural UK voices,
  // then macOS's Enhanced/Premium downloads, then the standard ones.
  const gb = vs.filter((x) => x.lang.replace("_", "-").startsWith("en-GB"));
  const wanted = [
    "Ryan Online", "Thomas Online", "Oliver Online",
    "Daniel (Premium)", "Daniel (Enhanced)", "Arthur (Premium)", "Arthur (Enhanced)", "Jamie (Premium)", "Jamie (Enhanced)",
    "Daniel", "Arthur", "Google UK English Male", "Oliver", "George", "Malcolm",
  ];
  for (const name of wanted) {
    const v = gb.find((x) => x.name.includes(name)) ?? vs.find((x) => x.name.includes(name) && x.lang.startsWith("en"));
    if (v) return v;
  }
  return vs.find((x) => x.lang === "en-GB") ?? vs.find((x) => x.lang.startsWith("en")) ?? null;
}

export class Speaker {
  mode: "eleven" | "browser" = "eleven";
  /** everything queued has been spoken and no more is coming */
  onIdle: (() => void) | null = null;
  /** the ElevenLabs voice hit a usage limit; the browser's voice takes over */
  onLimited: (() => void) | null = null;

  private queue: Item[] = [];
  private playing = false;
  private more = false;
  private ctrl = new AbortController();
  private el: HTMLAudioElement | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Uint8Array<ArrayBuffer> | null = null;
  private fake = 0;
  private gen = 0;

  /** Call from a click: routes the voice through an analyser so the orb can follow it. */
  prime() {
    if (this.el || typeof window === "undefined") return;
    this.el = new Audio();
    this.el.preload = "auto";
    const ctx = audioContext();
    if (ctx) {
      try {
        const src = ctx.createMediaElementSource(this.el);
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 512;
        this.buf = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
        src.connect(this.analyser);
        this.analyser.connect(ctx.destination);
      } catch {
        this.analyser = null;
      }
    }
    if (typeof speechSynthesis !== "undefined") speechSynthesis.getVoices();
  }

  begin() {
    this.more = true;
  }

  enqueue(speech: string, onStart: () => void, opts: VoiceOpts = {}) {
    this.queue.push({ speech, opts, onStart, audio: this.fetchAudio(speech, opts) });
    void this.next();
  }

  finish() {
    this.more = false;
    if (!this.playing && this.queue.length === 0) this.onIdle?.();
  }

  /** Silence, now. */
  stop() {
    this.gen++;
    this.ctrl.abort();
    this.ctrl = new AbortController();
    for (const it of this.queue) void it.audio.then((c) => c && URL.revokeObjectURL(c.url));
    this.queue = [];
    this.more = false;
    this.playing = false;
    if (this.el) {
      this.el.pause();
      this.el.removeAttribute("src");
      this.el.volume = 1;
    }
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    this.fake = 0;
  }

  /** Dip the voice while someone may be starting to talk; undo if it was a cough. */
  duck(on: boolean) {
    if (this.el) this.el.volume = on ? 0.18 : 1;
  }

  get busy() {
    return this.playing || this.queue.length > 0;
  }

  level(): number {
    if (this.analyser && this.buf && this.el && !this.el.paused) {
      this.analyser.getByteTimeDomainData(this.buf);
      return rms(this.buf, true);
    }
    if (this.fake > 0) this.fake = Math.max(0, this.fake * 0.9);
    return this.fake;
  }

  private async fetchAudio(speech: string, opts: VoiceOpts): Promise<Clip | null> {
    if (this.mode === "browser") return null;
    try {
      const res = await fetch("/api/jarvis/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: speech, speed: opts.speed }),
        signal: this.ctrl.signal,
      });
      // Not set up (501) or over a limit (429): use the browser's own voice from here on, without asking again.
      if (res.status === 501 || res.status === 429) {
        this.mode = "browser";
        if (res.status === 429) this.onLimited?.();
        return null;
      }
      if (!res.ok) return null;
      const blob = await res.blob();
      const cut = opts.tight ? await silences(blob) : { lead: 0, tail: 0 };
      return { url: URL.createObjectURL(blob), ...cut };
    } catch {
      return null;
    }
  }

  private async next() {
    if (this.playing) return;
    const it = this.queue.shift();
    if (!it) {
      if (!this.more) this.onIdle?.();
      return;
    }
    this.playing = true;
    const gen = this.gen;
    const clip = await it.audio;
    if (gen !== this.gen) return;
    it.onStart();
    if (clip && this.el) await this.playUrl(clip);
    else await this.speakBrowser(it.speech, it.opts.speed);
    if (clip) URL.revokeObjectURL(clip.url);
    if (gen !== this.gen) return;
    this.playing = false;
    void this.next();
  }

  private playUrl(clip: Clip): Promise<void> {
    const el = this.el!;
    return new Promise((resolve) => {
      let timer = 0;
      let over = false;
      const done = () => {
        if (over) return;
        over = true;
        clearTimeout(timer);
        el.onended = el.onerror = el.onplaying = null;
        resolve();
      };
      el.onended = done;
      el.onerror = done;
      // Trimmed clips: start past the silence, and move on as the last word ends instead of waiting out the tail.
      el.onplaying = () => {
        el.onplaying = null;
        if (!clip.tail || !Number.isFinite(el.duration)) return;
        const left = (el.duration - clip.tail - el.currentTime) / (el.playbackRate || 1);
        if (left > 0) timer = window.setTimeout(done, left * 1000);
      };
      el.src = clip.url;
      if (clip.lead) el.currentTime = clip.lead;
      el.play().catch(done);
    });
  }

  private speakBrowser(text: string, speed = 1): Promise<void> {
    if (typeof speechSynthesis === "undefined") return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      const v = pickBrowserVoice();
      if (v) u.voice = v;
      // Measured and slightly low: unhurried, dry, composed.
      u.rate = speed;
      u.pitch = 0.86;
      u.onboundary = () => { this.fake = 0.55 + Math.random() * 0.35; };
      u.onend = () => resolve();
      u.onerror = () => resolve();
      this.fake = 0.5;
      speechSynthesis.speak(u);
    });
  }
}

// ───────────────────────── Listener ─────────────────────────

export interface ListenerEvents {
  /** you started talking (fires fast; may be a cough) */
  onSpeechStart: () => void;
  /** it's really speech: long enough to count */
  onSpeechReal: () => void;
  /** it was a blip, not speech */
  onMisfire: () => void;
  /** you finished a turn: here is what you said ("" when nothing intelligible) */
  onTurn: (text: string) => void;
  /** transcription is running for a turn that just ended */
  onTranscribing: () => void;
  onError: (message: string) => void;
}

interface RecResultList { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } }
interface Rec {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { resultIndex: number; results: RecResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}

export class Listener {
  private vad: MicVAD | null = null;
  private lvl = 0;
  private useScribe = true;
  private rec: Rec | null = null;
  private recText: { at: number; text: string }[] = [];
  private turnStart = 0;
  private alive = false;
  muted = false;

  level() {
    return this.muted ? 0 : this.lvl;
  }

  async start(ev: ListenerEvents, scribe: boolean) {
    this.alive = true;
    this.useScribe = scribe;
    if (!scribe) this.startBrowserRecognition();
    try {
      const { MicVAD } = await import("@ricky0123/vad-web");
      this.vad = await MicVAD.new({
        model: "v5",
        baseAssetPath: "/vad/",
        onnxWASMBasePath: "/vad/",
        positiveSpeechThreshold: 0.6,
        negativeSpeechThreshold: 0.4,
        redemptionMs: 550,
        minSpeechMs: 280,
        preSpeechPadMs: 320,
        onFrameProcessed: (p, frame) => {
          this.lvl = this.lvl * 0.6 + Math.max(rms(frame, false), p.isSpeech > 0.6 ? 0.25 : 0) * 0.4;
        },
        onSpeechStart: () => {
          if (this.muted) return;
          this.turnStart = Date.now();
          ev.onSpeechStart();
        },
        onSpeechRealStart: () => { if (!this.muted) ev.onSpeechReal(); },
        onVADMisfire: () => { if (!this.muted) ev.onMisfire(); },
        onSpeechEnd: async (audio) => {
          if (this.muted || !this.alive) return;
          ev.onTranscribing();
          ev.onTurn(await this.transcribe(audio));
        },
      });
      if (!this.alive) return this.vad.destroy();
      await this.vad.start();
    } catch (err) {
      console.error("[jarvis] mic", err);
      const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
      ev.onError(denied ? "Microphone access is blocked. Allow it in the address bar, then start again." : "I couldn't start the microphone.");
    }
  }

  async stop() {
    this.alive = false;
    this.rec?.abort();
    this.rec = null;
    const v = this.vad;
    this.vad = null;
    this.lvl = 0;
    if (v) await v.destroy().catch(() => {});
  }

  private async transcribe(audio: Float32Array): Promise<string> {
    if (this.useScribe) {
      try {
        const form = new FormData();
        form.append("audio", toWav(audio));
        const res = await fetch("/api/jarvis/listen", { method: "POST", body: form });
        if (res.ok) return ((await res.json()) as { text?: string }).text?.trim() ?? "";
        if (res.status !== 501 && res.status !== 429) return "";
        // Not set up or over a limit: the browser's own recogniser takes over (this turn is lost; the next works).
        this.useScribe = false;
        this.startBrowserRecognition();
      } catch {
        return "";
      }
    }
    // Browser recogniser: give it a moment to finalise, then take what it heard since this turn began.
    await new Promise((r) => setTimeout(r, 700));
    const since = this.turnStart - 400;
    const text = this.recText.filter((t) => t.at >= since).map((t) => t.text).join(" ").trim();
    this.recText = this.recText.filter((t) => t.at >= since + 1);
    return text;
  }

  private startBrowserRecognition() {
    if (this.rec || typeof window === "undefined") return;
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal && !this.muted) this.recText.push({ at: Date.now(), text: e.results[i][0].transcript });
      }
    };
    rec.onerror = () => {};
    rec.onend = () => {
      // Chrome ends continuous recognition every so often: keep it going for the whole conversation.
      if (this.alive && this.rec === rec) try { rec.start(); } catch {}
    };
    this.rec = rec;
    try { rec.start(); } catch {}
  }
}
