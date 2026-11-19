import { NextResponse } from "next/server";
import { findDirectories } from "@/lib/search-event";

export const maxDuration = 60;

/**
 * Turn an event's name into candidate directory pages.
 *
 * POST { query: "HLTH 2027" } -> { candidates: [...], notes: [...] }
 *
 * Separate from /api/harvest on purpose: searching is cheap and wrong often,
 * harvesting is slow and should only run on a page a human has chosen.
 */
export async function POST(req: Request) {
  let query = "";
  try {
    const body = (await req.json()) as { query?: string };
    query = (body.query ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Send a JSON body with a query." }, { status: 400 });
  }

  if (!query) {
    return NextResponse.json({ error: "Type the name of an event." }, { status: 400 });
  }

  try {
    const outcome = await findDirectories(query);
    return NextResponse.json(outcome);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
