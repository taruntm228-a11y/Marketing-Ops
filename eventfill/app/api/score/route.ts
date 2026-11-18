import { NextResponse } from "next/server";
import { companiesForScoring, getIcp, saveScores } from "@/lib/db";
import { scoreCompanies } from "@/lib/score";
import { activeProvider } from "@/lib/ai";

export const maxDuration = 300;

/**
 * POST /api/score  { eventId, rescore? }
 *
 * Scores the companies on an event against the saved customer profile.
 * By default only the ones never scored, so running it again after a harvest
 * costs one call per new arrival rather than re-scoring the whole floor.
 */
export async function POST(req: Request) {
  let eventId: string;
  let rescore = false;
  try {
    ({ eventId, rescore = false } = await req.json());
  } catch {
    return NextResponse.json({ error: "Send a JSON body with an eventId." }, { status: 400 });
  }

  if (!eventId) {
    return NextResponse.json({ error: "Which event? Send an eventId." }, { status: 400 });
  }
  if (activeProvider() === "none") {
    return NextResponse.json(
      { error: "Scoring needs a model key. Set GOOGLE_AI_API_KEY or ANTHROPIC_API_KEY." },
      { status: 400 }
    );
  }

  const icp = await getIcp();
  if (!icp || !icp.whatYouSell.trim()) {
    return NextResponse.json(
      { error: "No customer profile saved yet. Fill in the customer form first." },
      { status: 400 }
    );
  }

  const companies = await companiesForScoring(eventId, !rescore);
  if (companies.length === 0) {
    return NextResponse.json({
      scored: 0,
      written: 0,
      message: rescore ? "No companies on this event." : "Everything here is already scored.",
      notes: [],
    });
  }

  const run = await scoreCompanies(
    companies.map((c) => ({ name: c.name, category: c.category })),
    icp
  );
  const written = await saveScores(eventId, run.scored);

  return NextResponse.json({
    scored: run.scored.length,
    written,
    considered: companies.length,
    failedBatches: run.failedBatches,
    notes: run.notes,
    top: run.scored
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, 10),
  });
}
