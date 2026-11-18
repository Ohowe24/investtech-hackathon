// Jarvis's ears: one spoken turn (16 kHz WAV from the in-browser speech detector) in, ElevenLabs Scribe text out.
// Guarded like the voice (src/lib/server/voiceLimits.ts): this site only, per-visitor rate limit, daily cap.
// Over a limit it answers 429 and the browser switches to its own speech recogniser.

import { allowVisitor, sameSite, spendListen, visitorOf } from "@/lib/server/voiceLimits";

export const maxDuration = 30;

export async function POST(request: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return Response.json({ error: "Speech-to-text not configured" }, { status: 501 });
  if (!sameSite(request)) return Response.json({ error: "Not allowed" }, { status: 403 });
  if (!allowVisitor(visitorOf(request)) || !spendListen()) return Response.json({ error: "Transcription limit reached" }, { status: 429 });

  let audio: Blob | null = null;
  try {
    const form = await request.formData();
    const f = form.get("audio");
    audio = f instanceof Blob ? f : null;
  } catch {}
  if (!audio || audio.size === 0) return Response.json({ error: "Send multipart field 'audio'" }, { status: 400 });
  if (audio.size > 10_000_000) return Response.json({ error: "Clip too long" }, { status: 413 });

  const out = new FormData();
  out.append("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v1");
  out.append("file", audio, "turn.wav");
  out.append("language_code", "en");
  out.append("tag_audio_events", "false");
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: out,
    signal: request.signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[jarvis/listen]", res.status, detail.slice(0, 300));
    return Response.json({ error: `ElevenLabs ${res.status}` }, { status: res.status === 401 || res.status === 429 ? 429 : 502 });
  }
  const data = (await res.json()) as { text?: string };
  return Response.json({ text: (data.text ?? "").trim() });
}
