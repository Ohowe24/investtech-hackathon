// Which parts of Jarvis are switched on. Says only yes or no, never a key.
// Read per request (not at build time), so a key added to the environment shows after a restart.

import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json({
    claude: !!process.env.ANTHROPIC_API_KEY,
    voice: !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID),
    ears: !!process.env.ELEVENLABS_API_KEY,
  });
}
