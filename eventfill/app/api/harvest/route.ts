import { NextResponse } from "next/server";
import { harvestUrl, nameFromUrl, normaliseUrl } from "@/lib/harvest";
import { saveHarvest } from "@/lib/db";

export const maxDuration = 300;

/**
 * GET /api/harvest?url=…&name=…
 * Same work as POST, reachable from a browser address bar for quick checks.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const target = params.get("url");
  if (!target) {
    return NextResponse.json({ error: "Add ?url= with the directory address." }, { status: 400 });
  }
  return harvest(target, params.get("name") ?? undefined);
}

export async function POST(req: Request) {
  let url: string;
  let name: string | undefined;
  try {
    ({ url, name } = await req.json());
  } catch {
    return NextResponse.json({ error: "Send a JSON body with a url." }, { status: 400 });
  }
  return harvest(url, name);
}

async function harvest(url: string, name?: string) {
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Paste the directory URL first." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = normaliseUrl(url);
  } catch {
    return NextResponse.json({ error: "That doesn't look like a web address." }, { status: 400 });
  }

  let result;
  try {
    result = await harvestUrl(parsed.toString());
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  // Saving is best-effort on purpose: if the database is asleep the user still
  // gets their list, with a note, rather than an error after a long harvest.
  let save = null;
  if (result.companies.length > 0) {
    save = await saveHarvest(result, name?.trim() || nameFromUrl(parsed));
    if (!save.saved && save.error !== "no-db") {
      result.notes.push(`Found, but not saved: ${save.error}`);
    }
  }

  return NextResponse.json({
    ...result,
    eventId: save?.eventId ?? null,
    saved: save?.saved ?? false,
    newCount: save?.newCount ?? null,
    newCompanies: save?.newCompanies ?? [],
  });
}
