import { NextResponse } from "next/server";
import { companiesForScoring, getEvent, getIcp } from "@/lib/db";
import { draftOutreach, type DraftTarget } from "@/lib/draft";
import { activeProvider } from "@/lib/ai";

export const maxDuration = 300;

/**
 * POST { eventId, limit?, minScore? } -> drafts for the best-fitting companies.
 *
 * Drafts are not stored. They are a starting point to be edited and sent from
 * the client's own mailbox, and a table of stale drafts would only ever be
 * read once. Scores are stored, because those are what the drafts are chosen
 * from and what the morning digest ranks by.
 */
export async function POST(req: Request) {
  let eventId = "";
  let limit = 10;
  let minScore = 7;

  try {
    const body = (await req.json()) as { eventId?: string; limit?: number; minScore?: number };
    eventId = (body.eventId ?? "").trim();
    if (typeof body.limit === "number") limit = Math.max(1, Math.min(25, body.limit));
    if (typeof body.minScore === "number") minScore = Math.max(1, Math.min(10, body.minScore));
  } catch {
    return NextResponse.json({ error: "Send a JSON body with an eventId." }, { status: 400 });
  }

  if (!eventId) {
    return NextResponse.json({ error: "Which event?" }, { status: 400 });
  }

  if (activeProvider() === "none") {
    return NextResponse.json({ error: "No model key is set, so drafts can't be written." }, { status: 400 });
  }

  const icp = await getIcp();
  if (!icp?.whatYouSell?.trim()) {
    return NextResponse.json(
      { error: "Fill in your customer profile first — a draft needs to know what you sell." },
      { status: 400 }
    );
  }

  const event = await getEvent(eventId);
  if (!event) {
    return NextResponse.json({ error: "That event isn't on file." }, { status: 404 });
  }

  // Draft for the best fits, which means the floor has to be scored first.
  const all = await companiesForScoring(eventId, false);
  const targets: DraftTarget[] = all
    .filter((c) => (c.icp_score ?? 0) >= minScore)
    .sort((a, b) => (b.icp_score ?? 0) - (a.icp_score ?? 0))
    .slice(0, limit)
    .map((c) => ({
      name: c.name,
      booth: c.booth,
      category: c.category,
      score: c.icp_score,
      reason: c.icp_reason,
    }));

  if (targets.length === 0) {
    const anyScored = all.some((c) => c.icp_score != null);
    return NextResponse.json({
      drafts: [],
      notes: [
        anyScored
          ? `Nothing scored ${minScore} or above on this floor. Lower the bar, or sharpen the profile.`
          : "This floor hasn't been scored yet — score it first and the best fits become the draft list.",
      ],
    });
  }

  const run = await draftOutreach(targets, icp, event.event.name);
  return NextResponse.json({ ...run, event: event.event.name });
}
