import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allowVisitor, cachedAudio, keepAudio, resetVoiceLimits, sameSite, spendChars, spendListen } from "./voiceLimits";

const req = (headers: Record<string, string>) => new Request("http://localhost:3060/api/jarvis/speak", { method: "POST", headers });

describe("voice limits", () => {
  beforeEach(() => {
    resetVoiceLimits();
    process.env.JARVIS_VOICE_DAILY_CHARS = "100";
    process.env.JARVIS_LISTEN_DAILY = "2";
    process.env.JARVIS_VOICE_PER_HOUR = "3";
  });
  afterEach(() => {
    delete process.env.JARVIS_VOICE_DAILY_CHARS;
    delete process.env.JARVIS_LISTEN_DAILY;
    delete process.env.JARVIS_VOICE_PER_HOUR;
  });

  it("stops at the daily character budget", () => {
    expect(spendChars(60)).toBe(true);
    expect(spendChars(60)).toBe(false); // would pass 100
    expect(spendChars(40)).toBe(true);
    expect(spendChars(1)).toBe(false);
  });

  it("stops at the daily transcription cap", () => {
    expect(spendListen()).toBe(true);
    expect(spendListen()).toBe(true);
    expect(spendListen()).toBe(false);
  });

  it("rate-limits each visitor separately, over a sliding hour", () => {
    const t = 1_000_000;
    expect([allowVisitor("a", t), allowVisitor("a", t + 1), allowVisitor("a", t + 2)]).toEqual([true, true, true]);
    expect(allowVisitor("a", t + 3)).toBe(false);
    expect(allowVisitor("b", t + 3)).toBe(true);
    expect(allowVisitor("a", t + 3_600_001)).toBe(true); // the first hit has aged out
  });

  it("only lets this site call the voice", () => {
    expect(sameSite(req({ host: "localhost:3060", origin: "http://localhost:3060" }))).toBe(true);
    expect(sameSite(req({ host: "localhost:3060", referer: "http://localhost:3060/analyze?x=1" }))).toBe(true);
    expect(sameSite(req({ host: "localhost:3060", origin: "https://evil.example" }))).toBe(false);
  });

  it("replays a phrase it already paid for", () => {
    const clip = new ArrayBuffer(10);
    expect(cachedAudio("v|m|Hello")).toBeUndefined();
    keepAudio("v|m|Hello", clip);
    expect(cachedAudio("v|m|Hello")).toBe(clip);
  });
});
