// Jarvis's voice: one sentence in, ElevenLabs audio (mp3) out.
// Needs ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID; without them it answers 501 and the browser uses its own voice.
// Guarded (src/lib/server/voiceLimits.ts): only this site may call it, each visitor is rate-limited, there is a
// daily character budget, and a phrase said before is replayed from memory instead of paid for again.
// Over a limit it answers 429 and the browser switches to its own voice for the rest of the conversation.

import { allowVisitor, cachedAudio, keepAudio, sameSite, spendChars, visitorOf } from "@/lib/server/voiceLimits";

export const maxDuration = 30;

const mp3 = (body: ArrayBuffer) => new Response(body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  const voice = process.env.ELEVENLABS_VOICE_ID;
  if (!key || !voice) return Response.json({ error: "Voice not configured" }, { status: 501 });
  if (!sameSite(request)) return Response.json({ error: "Not allowed" }, { status: 403 });

  let text = "";
  let speed = 1;
  try {
    const body = (await request.json()) as { text?: unknown; speed?: unknown };
    text = typeof body.text === "string" ? body.text.trim().slice(0, 600) : "";
    // ElevenLabs accepts 0.7 to 1.2.
    if (typeof body.speed === "number" && Number.isFinite(body.speed)) speed = Math.min(1.2, Math.max(0.7, body.speed));
  } catch {}
  if (!text) return Response.json({ error: "Send { text }" }, { status: 400 });

  const model = process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
  const cacheKey = `${voice}|${model}|${speed}|${text}`;
  const hit = cachedAudio(cacheKey);
  if (hit) return mp3(hit); // free: already paid for

  if (!allowVisitor(visitorOf(request))) return Response.json({ error: "Too many requests this hour" }, { status: 429 });
  if (!spendChars(text.length)) return Response.json({ error: "Today's voice budget is used up" }, { status: 429 });

  const call = () => fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: model,
      // High stability and little style: an even, composed, dry delivery rather than an expressive one.
      voice_settings: { stability: 0.72, similarity_boost: 0.8, style: 0.05, use_speaker_boost: true, speed },
    }),
    signal: request.signal,
  });

  // ElevenLabs caps requests running at once (6 on our plan, shared with transcription). Over that cap it says
  // "too many concurrent requests": that is a wait, not an empty account, so wait a moment and try again.
  let res = await call();
  let detail = "";
  for (let attempt = 1; !res.ok && attempt <= 3; attempt++) {
    detail = await res.text().catch(() => "");
    if (!(res.status === 429 && /concurrent|too_many/i.test(detail))) break;
    await new Promise((r) => setTimeout(r, 400 * attempt + Math.random() * 300));
    res = await call();
    detail = "";
  }
  if (!res.ok) {
    if (!detail) detail = await res.text().catch(() => "");
    console.error("[jarvis/speak]", res.status, detail.slice(0, 300));
    // Still busy after the retries: 503, so the browser tries again shortly and keeps the ElevenLabs voice.
    if (res.status === 429 && /concurrent|too_many/i.test(detail)) return Response.json({ error: "Voice busy, try again" }, { status: 503 });
    // ElevenLabs itself refused for quota or the key (credit limit, bad key): tell the browser to stop asking.
    return Response.json({ error: `ElevenLabs ${res.status}` }, { status: res.status === 401 || res.status === 429 ? 429 : 502 });
  }
  // The browser waits for the whole clip anyway, so read it here, keep a copy, then send it.
  const body = await res.arrayBuffer();
  keepAudio(cacheKey, body);
  return mp3(body);
}
