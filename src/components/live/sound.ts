/*
  Quiet blips for the engine run: a high tick for a pass, a low one for a fail.
  Made with Web Audio, no files. Starts only after a click (browsers require it),
  and the viewer's on/off choice is remembered.
*/

const KEY = "xray-sound";
let ctx: AudioContext | null = null;
let lastAt = 0;

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private window: the choice lasts for this page only */
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a click handler so the browser lets sound play later in the run. */
export function primeSound() {
  if (soundEnabled()) audio();
}

export function blip(freq: number, { dur = 0.05, gain = 0.03, type = "sine" as OscillatorType, at = 0, force = false } = {}) {
  if (!soundEnabled()) return;
  const a = audio();
  if (!a || a.state !== "running") return;
  const now = a.currentTime + at;
  // Never stack more than one blip every 18 ms: a run fires a lot of checks.
  if (!force && now - lastAt < 0.018) return;
  lastAt = now;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, now);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gain, now + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g).connect(a.destination);
  o.start(now);
  o.stop(now + dur + 0.02);
}

export const sfx = {
  pass: () => blip(1320, { dur: 0.045, gain: 0.022 }),
  fail: () => blip(180, { dur: 0.08, gain: 0.04, type: "triangle" }),
  none: () => blip(660, { dur: 0.03, gain: 0.012 }),
  read: () => blip(2400, { dur: 0.012, gain: 0.006, type: "square" }),
  done: () => {
    blip(523, { dur: 0.09, gain: 0.03, force: true });
    blip(784, { dur: 0.12, gain: 0.03, at: 0.07, force: true });
  },
  pick: () => {
    blip(523, { dur: 0.35, gain: 0.035, force: true });
    blip(659, { dur: 0.35, gain: 0.03, at: 0.06, force: true });
    blip(988, { dur: 0.5, gain: 0.03, at: 0.12, force: true });
  },
};
