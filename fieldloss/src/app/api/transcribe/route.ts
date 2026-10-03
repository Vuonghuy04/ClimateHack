import { aiConfigured, transcribeObservation, providerFailure } from "@/lib/openai.server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  let data: FormData;
  try { data = await request.formData(); } catch { return Response.json({ error: "Send a recorded audio file." }, { status: 400 }); }
  const file = data.get("audio");
  if (!file || typeof file === "string" || file.size === 0) return Response.json({ error: "No audio was recorded. Try again or type your observation." }, { status: 422 });
  if (file.size > 10 * 1024 * 1024) return Response.json({ error: "Keep the recording under 60 seconds and 10 MB." }, { status: 413 });
  const type = file.type.split(";")[0];
  if (!["audio/webm", "video/webm", "audio/mp4", "video/mp4", "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/m4a"].includes(type)) return Response.json({ error: "This audio format is not supported. Try again or type your observation." }, { status: 415 });
  if (!aiConfigured()) return Response.json({ error: "Live AI is not configured. You can type the observation and enter its fields manually.", code: "AI_NOT_CONFIGURED" }, { status: 503 });
  try {
    const transcript = (await transcribeObservation(file)).trim();
    if (!transcript) return Response.json({ error: "No speech was detected. Try again or type your observation." }, { status: 422 });
    return Response.json({ transcript });
  } catch (error) { return Response.json(providerFailure(error), { status: 502 }); }
}
