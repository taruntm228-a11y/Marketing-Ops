import { NextResponse } from "next/server";
import { harvestUrl } from "@/lib/harvest";
import {
  companiesForScoring,
  getIcp,
  listEvents,
  saveHarvest,
  saveScores,
  type EventSummary,
} from "@/lib/db";
import { scoreCompanies } from "@/lib/score";
import { activeProvider } from "@/lib/ai";

export const maxDuration = 300;

/**
 * The Watcher.
 *
 * Re-reads every tracked show, notices who was added since last time, and
 * scores the new arrivals so they are ranked before anyone looks.
 *
 * The point is not that it harvests — a person can press a button for that.
 * The point is that it ran yesterday too. A company that booked a booth this
 * week has budget just approved and an empty calendar, and that fact only
 * exists if something was watching before today.
 *
 * Runs on a schedule (see vercel.json) and can be triggered by hand.
 */

// Vercel's own ceiling is a hard stop; finishing some shows and saying so beats
// being killed mid-write with no record of what happened.
const TIME_BUDGET_MS = 240_000;

type EventReport = {
  event: string;
  eventId: string;
  found: number;
  newCount: number;
  newCompanies: { name: string; booth: string | null; score: number | null; reason: string | null }[];
  error?: string;
};

/**
 * GET is the scheduled entry point and is locked to CRON_SECRET, which Vercel
 * sends on every scheduled request. Unauthenticated, it would be an open
 * invitation to make the app re-harvest every tracked show on demand.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const manual = new URL(req.url).searchParams.get("key");

  if (secret && auth !== `Bearer ${secret}` && manual !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  return runWatch();
}

/**
 * POST is the "check now" button. It carries no secret because the browser has
 * none to carry — there are no accounts yet, so every other button on the site
 * is equally open. Guarding this one while /api/harvest stands wide open would
 * be security theatre at the cost of the feature being demonstrable.
 */
export async function POST() {
  return runWatch();
}

async function runWatch() {
  const started = Date.now();
  const events = (await listEvents()) as EventSummary[];

  if (events.length === 0) {
    return NextResponse.json({ checked: 0, reports: [], message: "No shows are being tracked yet." });
  }

  const icp = await getIcp();
  const canScore = Boolean(icp?.whatYouSell?.trim()) && activeProvider() !== "none";

  const reports: EventReport[] = [];
  let skipped = 0;

  for (const event of events) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      skipped++;
      continue;
    }

    try {
      const result = await harvestUrl(event.source_url);
      if (result.companies.length === 0) {
        reports.push({
          event: event.name,
          eventId: event.id,
          found: 0,
          newCount: 0,
          newCompanies: [],
          error: "The directory came back empty.",
        });
        continue;
      }

      const save = await saveHarvest(result, event.name);
      if (!save.saved) {
        reports.push({
          event: event.name,
          eventId: event.id,
          found: result.companies.length,
          newCount: 0,
          newCompanies: [],
          error: save.error,
        });
        continue;
      }

      // Score only what arrived. Re-scoring the whole floor every morning would
      // burn the daily model quota on answers we already have.
      const details = new Map(result.companies.map((c) => [c.name.toLowerCase(), c]));
      let scoredNew: { name: string; score: number; reason: string }[] = [];

      if (canScore && save.newCount > 0) {
        const unscored = await companiesForScoring(event.id, true);
        if (unscored.length > 0) {
          const run = await scoreCompanies(
            unscored.map((c) => ({ name: c.name, category: c.category })),
            icp!
          );
          await saveScores(event.id, run.scored);
          scoredNew = run.scored;
        }
      }

      const scoreByName = new Map(scoredNew.map((s) => [s.name.toLowerCase(), s]));

      reports.push({
        event: event.name,
        eventId: event.id,
        found: result.companies.length,
        newCount: save.newCount,
        newCompanies: save.newCompanies
          .map((name) => {
            const hit = scoreByName.get(name.toLowerCase());
            return {
              name,
              booth: details.get(name.toLowerCase())?.booth ?? null,
              score: hit?.score ?? null,
              reason: hit?.reason ?? null,
            };
          })
          // Best fits first, so the digest leads with what matters.
          .sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
      });
    } catch (err) {
      reports.push({
        event: event.name,
        eventId: event.id,
        found: 0,
        newCount: 0,
        newCompanies: [],
        error: (err as Error).message,
      });
    }
  }

  const totalNew = reports.reduce((n, r) => n + r.newCount, 0);

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    checked: reports.length,
    skipped,
    totalNew,
    scored: canScore,
    // The one-line version, which is what a notification would carry.
    summary:
      totalNew === 0
        ? `Checked ${reports.length} show${reports.length === 1 ? "" : ""}. Nothing new.`
        : `${totalNew} new exhibitor${totalNew === 1 ? "" : "s"} across ${
            reports.filter((r) => r.newCount > 0).length
          } show${reports.filter((r) => r.newCount > 0).length === 1 ? "" : "s"}.`,
    reports,
  });
}
