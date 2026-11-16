import { NextResponse } from "next/server";
import type { HarvestResult } from "@/lib/types";
import { fetchPage, htmlToText } from "@/lib/html";
import { extractStructural } from "@/lib/extract-structural";
import { extractWithAi } from "@/lib/extract-ai";
import { activeProvider } from "@/lib/ai";
import { saveHarvest } from "@/lib/db";

export const maxDuration = 300;

/**
 * GET /api/harvest?url=...
 * Same work as POST, reachable from a browser address bar. Useful for checking
 * a directory parses without going through the UI.
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

/**
 * Last resort for naming a show when the user hasn't given one: the directory
 * URL usually carries it. ".../clients/BICSI/Winter2027/Public/exhibitors.aspx"
 * gives "BICSI Winter2027". Crude, but better than showing a raw URL in a list,
 * and the user can rename it later.
 */
function nameFromUrl(u: URL): string {
  const parts = u.pathname.split("/").filter(Boolean);
  const skip = /^(clients?|public|exhibitors?|default|index|home|en|www)$/i;
  const words = parts
    .filter((p) => !skip.test(p) && !p.includes("."))
    .slice(-2)
    .map((p) => p.replace(/[-_]+/g, " ").trim())
    .filter(Boolean);
  return words.length ? words.join(" ") : u.hostname.replace(/^www\./, "");
}

async function harvest(url: string, name?: string) {

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Paste the directory URL first." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`);
  } catch {
    return NextResponse.json({ error: "That doesn't look like a web address." }, { status: 400 });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return NextResponse.json({ error: "Only http and https pages can be read." }, { status: 400 });
  }

  const sourceUrl = parsed.toString();
  const notes: string[] = [];

  let html: string;
  try {
    html = await fetchPage(sourceUrl);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  const pageText = htmlToText(html);

  // Structural parse always runs: it's free, instant, and it's the fallback.
  const structural = extractStructural(html, sourceUrl);

  let result: HarvestResult;

  if (activeProvider() === "none") {
    notes.push(
      "Read without a model — no API key is set, so this used the structural parser only. Add a key for better coverage and role labels."
    );
    result = {
      sourceUrl,
      scrapedAt: new Date().toISOString(),
      method: "structural",
      companies: structural,
      rejected: 0,
      notes,
    };
  } else {
    try {
      const ai = await extractWithAi(pageText, sourceUrl);
      // If the model found materially less than the plain parser, trust the parser.
      if (ai.companies.length < structural.length * 0.5 && structural.length >= 5) {
        notes.push(
          `Used the structural parser: it found ${structural.length} rows against the model's ${ai.companies.length}.`
        );
        result = {
          sourceUrl,
          scrapedAt: new Date().toISOString(),
          method: "structural",
          companies: structural,
          rejected: ai.rejected,
          notes: [...notes, ...ai.notes],
        };
      } else {
        result = {
          sourceUrl,
          scrapedAt: new Date().toISOString(),
          method: "ai",
          companies: ai.companies,
          rejected: ai.rejected,
          notes: [...notes, ...ai.notes],
        };
      }
    } catch (err) {
      notes.push(`Model extraction failed (${(err as Error).message}). Fell back to the structural parser.`);
      result = {
        sourceUrl,
        scrapedAt: new Date().toISOString(),
        method: "structural",
        companies: structural,
        rejected: 0,
        notes,
      };
    }
  }

  // Only diagnose when there's actually nothing to show. A thin page that still
  // yielded rows needs no warning.
  if (result.companies.length === 0) {
    result.notes.push(
      pageText.length < 1000
        ? "Nothing found, and this page carries very little text of its own — the list is probably drawn by JavaScript after the page opens. Look for the organiser's plain 'all exhibitors' or print view."
        : "Nothing found. This is most likely a search page rather than a full list — look for a link like 'View all exhibitors', or try adding ?Index=All to the URL."
    );
  }

  // Persist. Saving is best-effort on purpose: if the database is asleep or
  // misconfigured the user still gets their list, with a note saying it wasn't
  // kept, rather than an error page after a 60-second harvest.
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
