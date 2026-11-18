import { NextResponse } from "next/server";
import { activeProvider } from "@/lib/ai";

export const maxDuration = 120;

/**
 * Diagnostic for the model connection, mirroring /api/db-check.
 *
 * Calls Google directly rather than going through lib/ai, so the raw response
 * is visible: finishReason, token usage, and any error text. Guessing at a model
 * failure from a tidied-up message cost us an evening; this shows the truth.
 *
 * GET /api/ai-check
 */
export async function GET() {
  const key = process.env.GOOGLE_AI_API_KEY;
  const model = process.env.GOOGLE_MODEL ?? "gemini-3.5-flash-lite";
  const thinking = process.env.GOOGLE_THINKING ?? "low";

  if (!key) {
    return NextResponse.json({ provider: activeProvider(), hasGoogleKey: false });
  }

  // A miniature version of the real extraction job: same shape, tiny input.
  const prompt = `Extract every company from the text below.
Return a JSON array; each element {"name": string, "evidence": string copied verbatim}.

--- TEXT ---
Acme Press Brakes   Booth A1042
Northstar Laser Systems   Booth B2210
Lakeside Packaging Group   Booth C3310
--- END ---`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 16000,
          temperature: 0,
          thinkingConfig: { thinkingLevel: thinking },
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(90_000),
    }
  ).catch((err) => ({ ok: false, status: 0, text: async () => String(err) }) as Response);

  const body = await res.text();
  if (!res.ok) {
    return NextResponse.json({ model, thinking, status: res.status, error: body.slice(0, 700) });
  }

  const data = JSON.parse(body);
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");

  return NextResponse.json({
    model,
    thinking,
    status: res.status,
    finishReason: cand?.finishReason,
    usage: data.usageMetadata, // includes thoughtsTokenCount — the budget thief
    textLength: text.length,
    text: text.slice(0, 600),
  });
}
