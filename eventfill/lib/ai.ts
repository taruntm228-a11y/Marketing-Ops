/**
 * One tiny wrapper over whichever model provider has a key set.
 *
 * Why two providers: Google AI Studio has a genuinely free tier, which is what
 * you want while testing. Anthropic is pay-per-use but costs cents at this
 * volume and is better at holding to a strict JSON shape. Set either.
 */

export type Provider = "anthropic" | "google" | "none";

export function activeProvider(): Provider {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GOOGLE_AI_API_KEY) return "google";
  return "none";
}

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5";
const GOOGLE_MODEL = process.env.GOOGLE_MODEL ?? "gemini-2.5-flash";

/** Send a prompt, get raw text back. Throws with a readable message on failure. */
export async function complete(
  prompt: string,
  opts: { maxTokens?: number; system?: string } = {}
): Promise<string> {
  const provider = activeProvider();
  const maxTokens = opts.maxTokens ?? 8000;

  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        system: opts.system,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return (data.content ?? []).map((b: { text?: string }) => b.text ?? "").join("");
  }

  if (provider === "google") {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:generateContent` +
      `?key=${process.env.GOOGLE_AI_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: opts.system ? { parts: [{ text: opts.system }] } : undefined,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0 },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`Google AI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return (data.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? "")
      .join("");
  }

  throw new Error("No model key set. Add ANTHROPIC_API_KEY or GOOGLE_AI_API_KEY.");
}

/**
 * Models like to wrap JSON in prose or fences. Pull out the first array or
 * object and parse that.
 */
export function parseJsonLoose<T>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    if (start === -1) throw new Error("Model returned no JSON.");
    const open = cleaned[start];
    const close = open === "[" ? "]" : "}";
    const end = cleaned.lastIndexOf(close);
    if (end <= start) throw new Error("Model returned truncated JSON.");
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  }
}
