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
// Model choice here is driven by the FREE TIER quota, not by capability.
//   gemini-2.5-flash   — closed to accounts created after mid-2026 (404)
//   gemini-3.8-flash   — open, but 20 requests/day free. A single large
//                        directory costs ~6 requests, so that is three
//                        harvests a day. Unusable.
//   gemini-3.5-flash-lite — 500 requests/day, 15/min. ~80 harvests a day.
// Extraction is a mechanical job, so the lighter model is no real loss.
// Override with GOOGLE_MODEL when these numbers move again.
const GOOGLE_MODEL = process.env.GOOGLE_MODEL ?? "gemini-3.5-flash-lite";

// "low" is accepted by every current Flash and Flash-Lite model. "minimal" is
// cheaper still but 3.8-flash rejects it outright, so it is not a safe default
// for a model name someone might change later.
const GOOGLE_THINKING = process.env.GOOGLE_THINKING ?? "low";

export type Completion = {
  text: string;
  /** True when the model ran out of budget mid-answer, so `text` is cut off. */
  truncated: boolean;
};

/** Send a prompt, get raw text back. Throws with a readable message on failure. */
export async function complete(
  prompt: string,
  opts: { maxTokens?: number; system?: string } = {}
): Promise<Completion> {
  const provider = activeProvider();
  // Generous by default. On Gemini this budget is shared with thinking tokens,
  // so a tight limit truncates the answer rather than making it shorter.
  const maxTokens = opts.maxTokens ?? 16000;

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
    return {
      text: (data.content ?? []).map((b: { text?: string }) => b.text ?? "").join(""),
      truncated: data.stop_reason === "max_tokens",
    };
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
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0,
          // Gemini 3 counts thinking tokens against maxOutputTokens, and it is a
          // hard cutoff: hit it while reasoning and the answer comes back empty
          // or cut in half with finishReason MAX_TOKENS. Extraction and scoring
          // are mechanical, so there is nothing to think about. Gemini 3 wants
          // thinkingLevel; thinkingBudget is the 2.5 spelling and errors here.
          thinkingConfig: { thinkingLevel: GOOGLE_THINKING },
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`Google AI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const cand = data.candidates?.[0];
    return {
      text: (cand?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join(""),
      truncated: cand?.finishReason === "MAX_TOKENS",
    };
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
    if (end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        /* fall through to salvage */
      }
    }
    throw new Error("Model returned truncated JSON.");
  }
}

/**
 * Recover whole objects from a cut-off JSON array.
 *
 * A response that ran out of budget looks like `[{...},{...},{...` — the last
 * record is half-written, but the ones before it are perfectly good. Throwing
 * the whole response away loses real data for no reason, so this walks the
 * string and keeps every object whose braces balance.
 *
 * Quote-aware, because a brace inside a company name would otherwise throw the
 * depth count off.
 */
export function salvageObjects<T>(raw: string): T[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const out: T[] = [];

  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          out.push(JSON.parse(cleaned.slice(objStart, i + 1)) as T);
        } catch {
          /* skip a malformed record, keep the rest */
        }
        objStart = -1;
      }
    }
  }

  return out;
}
