import { extractionRequestSchema } from "@/lib/schemas";
import { aiConfigured, extractObservation, providerFailure } from "@/lib/openai.server";
import { applyExtraction } from "@/lib/extraction";
import { createDraft, evaluateDraft } from "@/lib/domain";

export const runtime = "nodejs";
export async function POST(request: Request) {
  let input: unknown;
  try { input = await request.json(); } catch { return Response.json({ error: "Send a valid observation and context." }, { status: 400 }); }
  const parsed = extractionRequestSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: "Check the observation text and selected context before trying again." }, { status: 422 });
  if (!aiConfigured()) return Response.json({ error: "Live AI is not configured. You can enter and review the fields manually.", code: "AI_NOT_CONFIGURED" }, { status: 503 });
  try {
    const extraction = await extractObservation(parsed.data.transcript, parsed.data.context);
    const draft = applyExtraction({ ...createDraft(parsed.data.context), transcript: parsed.data.transcript }, extraction);
    return Response.json({ extraction, issues: evaluateDraft(draft).issues });
  } catch (error) { return Response.json(providerFailure(error), { status: 502 }); }
}
