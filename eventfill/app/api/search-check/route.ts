import { NextResponse } from "next/server";
import { findDirectories } from "@/lib/search-event";

/**
 * Diagnostic for event search. Reports what Tavily actually said.
 *
 * GET /api/search-check?q=BICSI%20Winter%202027
 *
 * The third of these. /api/db-check and /api/ai-check each solved in one shot
 * what guessing had failed at over an evening, so search gets one before it is
 * needed rather than after. Costs two credits of a thousand.
 *
 * Reveals no secrets: the key is only ever sent, never returned.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "BICSI Winter 2027";
  const key = process.env.TAVILY_API_KEY;

  if (!key) {
    return NextResponse.json({ configured: false, hint: "TAVILY_API_KEY is not set" });
  }

  const started = Date.now();
  try {
    // verify: false keeps this to the search itself. Opening candidate pages is
    // where a slow directory would hide a search problem behind a timeout.
    const out = await findDirectories(q, { verify: false });
    return NextResponse.json({
      configured: true,
      keyPrefix: key.slice(0, 5),
      query: q,
      ms: Date.now() - started,
      count: out.candidates.length,
      notes: out.notes,
      candidates: out.candidates.map((c) => ({
        url: c.url,
        title: c.title,
        score: c.score,
        platform: c.platform,
        why: c.why,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { configured: true, keyPrefix: key.slice(0, 5), error: (err as Error).message },
      { status: 500 }
    );
  }
}
