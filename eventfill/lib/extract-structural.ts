import * as cheerio from "cheerio";
// cheerio 1.x re-exports its node types from domhandler rather than its own namespace.
import type { AnyNode, Element } from "domhandler";
import type { Company } from "./types";
import { absolutise, looksLikeCompany } from "./html";

/**
 * Parse an exhibitor directory WITHOUT an AI model.
 *
 * Directory pages are machine-generated, so the same markup repeats once per
 * exhibitor. We don't need to know whether this is a2z, MapYourShow or ExpoFP —
 * we just need to find the biggest repeating group and read it.
 *
 * Two strategies, we keep whichever finds more rows:
 *   A. a long table  → one company per row
 *   B. repeated link containers → one company per link
 */
export function extractStructural(html: string, sourceUrl: string): Company[] {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, head, nav, footer").remove();

  const fromTable = tableStrategy($, sourceUrl);
  const fromLinks = linkClusterStrategy($, sourceUrl);

  return fromTable.length >= fromLinks.length ? fromTable : fromLinks;
}

function tableStrategy($: cheerio.CheerioAPI, sourceUrl: string): Company[] {
  let best: Company[] = [];
  const scrapedAt = new Date().toISOString();

  $("table").each((_, table) => {
    const rows = $(table).find("tr");
    if (rows.length < 4) return;

    // Read the header so we can find the booth column rather than guess at it.
    const headers = $(rows[0])
      .find("th, td")
      .map((_, c) => $(c).text().trim().toLowerCase())
      .get();
    const boothCol = headers.findIndex((h) => /booth|stand|space/.test(h));
    const catCol = headers.findIndex((h) => /categor|sector|product|type/.test(h));
    const hasHeader = headers.some((h) => /company|exhibitor|name|booth|stand/.test(h));

    const out: Company[] = [];
    rows.slice(hasHeader ? 1 : 0).each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length === 0) return;

      const link = $(row).find("a").first();
      const name = (link.text().trim() || $(cells[0]).text().trim()).replace(/\s+/g, " ");
      if (!looksLikeCompany(name)) return;

      out.push({
        name,
        website: absolutise(link.attr("href"), sourceUrl),
        booth: boothCol >= 0 ? $(cells[boothCol]).text().trim() || null : null,
        category: catCol >= 0 ? $(cells[catCol]).text().trim() || null : null,
        role: "unknown",
        sourceUrl,
        scrapedAt,
        evidence: spacedText($, $(row)).slice(0, 300),
      });
    });

    if (out.length > best.length) best = out;
  });

  return best;
}

/**
 * cheerio's .text() concatenates sibling elements with no separator, so
 * `<a>Riverbend Controls</a><span>Booth 418</span>` comes back as
 * "Riverbend ControlsBooth 418" and a \bbooth\b regex can never match.
 * Clone the subtree, put a space after every element, then read it.
 */
function spacedText($: cheerio.CheerioAPI, $node: cheerio.Cheerio<AnyNode>): string {
  if ($node.length === 0) return "";
  const $clone = $node.clone();
  // Braces matter: .each() expects void or boolean, and .after() returns a Cheerio.
  $clone.find("*").each((_, child) => {
    $(child).after(" ");
  });
  return $clone.text().replace(/\s+/g, " ").trim();
}

function linkClusterStrategy($: cheerio.CheerioAPI, sourceUrl: string): Company[] {
  const scrapedAt = new Date().toISOString();

  // Fingerprint each link by its own class + its parent's class. Links rendered
  // by the same loop share a fingerprint; nav links don't.
  const clusters = new Map<string, Element[]>();

  $("a").each((_, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, " ").trim();
    if (!looksLikeCompany(text)) return;

    const href = $el.attr("href") ?? "";
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) return;

    const sig = [
      $el.attr("class") ?? "",
      $el.parent().prop("tagName") ?? "",
      $el.parent().attr("class") ?? "",
    ].join("|");

    if (!clusters.has(sig)) clusters.set(sig, []);
    clusters.get(sig)!.push(el);
  });

  let best: Element[] = [];
  for (const group of clusters.values()) {
    if (group.length > best.length) best = group;
  }
  if (best.length < 4) return [];

  const seen = new Set<string>();
  const out: Company[] = [];

  for (const el of best) {
    const $el = $(el);
    const name = $el.text().replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // Booth numbers usually sit in a sibling node, not the link itself.
    const context = spacedText($, $el.closest("li, tr, article, div").first());
    const boothMatch = context.match(/\b(?:booth|stand|space)\s*#?\s*([A-Z0-9][A-Z0-9\-.]{0,9})\b/i);

    out.push({
      name,
      website: absolutise($el.attr("href"), sourceUrl),
      booth: boothMatch ? boothMatch[1] : null,
      category: null,
      role: "unknown",
      sourceUrl,
      scrapedAt,
      evidence: (context || name).slice(0, 300),
    });
  }

  return out;
}
