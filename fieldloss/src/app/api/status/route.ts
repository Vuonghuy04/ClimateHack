import { aiConfigured } from "@/lib/openai.server";
export async function GET() { return Response.json({ configured: aiConfigured() }, { headers: { "Cache-Control": "no-store" } }); }
