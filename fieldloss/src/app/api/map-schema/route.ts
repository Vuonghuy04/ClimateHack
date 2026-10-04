import { aiConfigured, providerFailure, suggestSchemaMappings } from "@/lib/openai.server";
import { schemaMappingRequestSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export async function POST(request: Request) {
  let input: unknown;
  try { input = await request.json(); } catch { return Response.json({ error: "Send dataset headers and sample rows." }, { status: 400 }); }
  const parsed = schemaMappingRequestSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: "Check the dataset headers and sample rows before requesting suggestions." }, { status: 422 });
  if (!aiConfigured()) return Response.json({ error: "Live AI is not configured. Map the source columns manually.", code: "AI_NOT_CONFIGURED" }, { status: 503 });
  try { return Response.json(await suggestSchemaMappings(parsed.data)); }
  catch (error) { return Response.json(providerFailure(error), { status: 502 }); }
}
