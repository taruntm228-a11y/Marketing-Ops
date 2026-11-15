import * as cheerio from "cheerio";

/** Chrome-ish UA. Some organiser sites 403 anything that looks like a script. */
export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    // Vercel functions cap at 300s; well under that.
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(
      `The page returned ${res.status} ${res.statusText}. ` +
        (res.status === 403
          ? "The site is blocking automated requests."
          : res.status === 404
            ? "Check the URL is right."
            : "Try again, or try a different page on the same site.")
    );
  }
  return await res.text();
}

/**
 * Strip a page down to readable text, keeping line structure.
 * The AI extractor reads this, and we check its evidence snippets against it.
 */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, head").remove();
  $("nav, footer, header[role=banner]").remove();

  // Put a newline after anything block-level so rows don't run together.
  $("br, tr, li, p, div, h1, h2, h3, h4, h5, h6, td, th").after("\n");

  return $("body")
    .text()
    .replace(/ /g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Junk that shows up in every nav bar and is never an exhibitor. */
const NOISE =
  /^(home|login|log in|sign in|sign up|register|menu|search|contact|contact us|about|about us|faq|faqs|privacy|privacy policy|terms|terms of use|cookies?|cookie policy|back|next|previous|prev|close|skip to (main )?content|view all|show all|see all|more|read more|learn more|download|share|print|filter|filters|sort|reset|clear|a|b|c|d|e|f|g|h|i|j|k|l|m|n|o|p|q|r|s|t|u|v|w|x|y|z|0-9|all|\d+)$/i;

const SOCIAL = /(facebook|twitter|x)\.com|linkedin\.com|instagram\.com|youtube\.com|t\.me|tiktok\.com/i;

export function looksLikeCompany(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || t.length > 120) return false;
  if (NOISE.test(t)) return false;
  if (!/[a-z]/i.test(t)) return false;
  // A sentence is a description, not a company name.
  if (t.split(/\s+/).length > 12) return false;
  return true;
}

export function absolutise(href: string | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}
