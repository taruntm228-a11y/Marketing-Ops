import type { HarvestResult } from "./types";
import { fetchPage, htmlToText } from "./html";
import { extractStructural } from "./extract-structural";
import { extractWithAi } from "./extract-ai";
import { activeProvider } from "./ai";

/**
 * Read one directory page into rows.
 *
 * Lives here rather than in the route because the Watcher runs the same job on
 * a schedule. Calling our own HTTP endpoint from a cron would mean a second
 * function invocation, a second cold start, and a timeout budget inside another
 * timeout budget — for a function call we can just make directly.
 */
export async function harvestUrl(rawUrl: string): Promise<HarvestResult> {
  const parsed = normaliseUrl(rawUrl);
  const sourceUrl = parsed.toString();
  const notes: string[] = [];

  const html = await fetchPage(sourceUrl);
  const pageText = htmlToText(html);
  const scrapedAt = new Date().toISOString();

  // The structural parse always runs: free, instant, and the fallback.
  const structural = extractStructural(html, sourceUrl);

  let result: HarvestResult;

  if (activeProvider() === "none") {
    notes.push(
      "Read without a model — no API key is set, so this used the structural parser only."
    );
    result = { sourceUrl, scrapedAt, method: "structural", companies: structural, rejected: 0, notes };
  } else {
    try {
      const ai = await extractWithAi(pageText, sourceUrl);
      // Trust the plain parser when the model materially under-reads the page.
      if (ai.companies.length < structural.length * 0.5 && structural.length >= 5) {
        notes.push(
          `Used the structural parser: it found ${structural.length} rows against the model's ${ai.companies.length}.`
        );
        result = {
          sourceUrl,
          scrapedAt,
          method: "structural",
          companies: structural,
          rejected: ai.rejected,
          notes: [...notes, ...ai.notes],
        };
      } else {
        result = {
          sourceUrl,
          scrapedAt,
          method: "ai",
          companies: ai.companies,
          rejected: ai.rejected,
          notes: [...notes, ...ai.notes],
        };
      }
    } catch (err) {
      notes.push(
        `Model extraction failed (${(err as Error).message}). Fell back to the structural parser.`
      );
      result = { sourceUrl, scrapedAt, method: "structural", companies: structural, rejected: 0, notes };
    }
  }

  if (result.companies.length === 0) {
    result.notes.push(
      pageText.length < 1000
        ? "Nothing found, and this page carries very little text of its own — the list is probably drawn by JavaScript after the page opens. Look for the organiser's plain 'all exhibitors' or print view."
        : "Nothing found. This is most likely a search page rather than a full list — look for a link like 'View all exhibitors', or try adding ?Index=All to the URL."
    );
  }

  return result;
}

export function normaliseUrl(raw: string): URL {
  const trimmed = raw.trim();
  const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only http and https pages can be read.");
  }
  return parsed;
}

/**
 * Last resort for naming a show when the user hasn't given one: the directory
 * URL usually carries it. ".../clients/BICSI/Winter2027/Public/exhibitors.aspx"
 * gives "BICSI Winter2027".
 */
export function nameFromUrl(u: URL): string {
  const parts = u.pathname.split("/").filter(Boolean);
  const skip = /^(clients?|public|exhibitors?|default|index|home|en|www)$/i;
  const words = parts
    .filter((p) => !skip.test(p) && !p.includes("."))
    .slice(-2)
    .map((p) => p.replace(/[-_]+/g, " ").trim())
    .filter(Boolean);
  return words.length ? words.join(" ") : u.hostname.replace(/^www\./, "");
}
