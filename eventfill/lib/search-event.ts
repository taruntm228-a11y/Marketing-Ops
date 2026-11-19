import { fetchPage } from "./html";
import { extractStructural } from "./extract-structural";

/**
 * Finding an event's exhibitor directory from its name.
 *
 * The problem this solves: a directory URL is not guessable. BICSI's list
 * lives at s36.a2zinc.net under a client code; SLAS's is an ExpoFP floor plan;
 * CES uses Map Your Show. Asking a user to find that page themselves is asking
 * them to do the hard part.
 *
 * Why a search API and not the model: a search engine knows what exists today.
 * A model knows what existed when it was trained, and an event directory URL
 * changes every year — a confidently wrong URL is worse than no URL, because
 * the user cannot tell the difference until the harvest comes back empty.
 *
 * The ranking below is deliberately rule-based rather than model-judged. The
 * signals are strong and cheap, and a rule that is wrong is a rule that can be
 * read and corrected.
 */

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

export type Candidate = {
  url: string;
  title: string;
  /** The directory software behind it, when recognisable. */
  platform: string | null;
  /** Ranking confidence, 0–100. Not a probability, just an ordering. */
  score: number;
  /** How many organisations a quick free read found. null = not checked. */
  names: number | null;
  /** Why this one ranked where it did, in words. */
  why: string;
};

export type SearchOutcome = {
  candidates: Candidate[];
  notes: string[];
  /** false when no key is configured, so the UI can say so rather than fail. */
  configured: boolean;
};

export function searchConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

// ---------------------------------------------------------------------------
// Signals.
//
// Directory platforms are the strongest signal by far. These are the few
// systems most trade shows run their exhibitor lists on, and a URL on one of
// them is almost always the actual list rather than a page about the list.
// ---------------------------------------------------------------------------

const PLATFORMS: { test: RegExp; name: string; points: number }[] = [
  { test: /a2zinc\.net/i, name: "a2z Events", points: 55 },
  { test: /mapyourshow\.com/i, name: "Map Your Show", points: 55 },
  { test: /expofp\.com/i, name: "ExpoFP", points: 50 },
  { test: /expocad\.com/i, name: "ExpoCAD", points: 50 },
  { test: /eventscribe\.(net|com)/i, name: "eventScribe", points: 45 },
  { test: /swapcard\.com/i, name: "Swapcard", points: 40 },
  { test: /\bcvent\.com/i, name: "Cvent", points: 35 },
  { test: /expoplatform\.com/i, name: "ExpoPlatform", points: 35 },
  { test: /\bmapsked\.com|\bshowcase\w*\.(net|com)/i, name: "show directory", points: 25 },
];

/** Path and title words that suggest a list of names. */
const LIST_WORDS: { test: RegExp; points: number; label: string }[] = [
  { test: /exhibitor[-_ ]?(list|directory|search|index)/i, points: 40, label: "exhibitor list" },
  { test: /\bexhibitors?\b/i, points: 25, label: "exhibitors" },
  { test: /\b(sponsors?|supporters)\b/i, points: 18, label: "sponsors" },
  { test: /\b(speakers?|faculty|presenters)\b/i, points: 15, label: "speakers" },
  { test: /\b(participants?|attendees)\b/i, points: 12, label: "participants" },
  { test: /floor[-_ ]?plan|floorplan/i, points: 12, label: "floor plan" },
  { test: /\bdirectory\b/i, points: 12, label: "directory" },
];

/**
 * Pages that rank well and contain nothing useful.
 *
 * "Become an exhibitor" is the trap worth naming. It is the page an organiser
 * pays to promote, so it outranks the actual list on almost every query, and it
 * contains exactly zero company names. Without these penalties the top result
 * is reliably the sales pitch.
 */
const TRAPS: { test: RegExp; points: number; label: string }[] = [
  { test: /become[-_ ]an?[-_ ]exhibitor|exhibit[-_ ]with[-_ ]us|why[-_ ]exhibit/i, points: -70, label: "a pitch to exhibitors, not a list" },
  { test: /exhibitor[-_ ](resources?|portal|manual|kit|faq|services|prospectus|login)/i, points: -60, label: "exhibitor admin page" },
  { test: /\/(blog|news|press|article|insights?)\//i, points: -45, label: "an article" },
  { test: /\b(register|registration|pricing|tickets?|book(ing)?)\b/i, points: -35, label: "a registration page" },
  { test: /\.(pdf|docx?|xlsx?|zip)(\?|$)/i, points: -30, label: "a file, not a page" },
];

/** Sites that aggregate events rather than host a show's own directory. */
const AGGREGATORS =
  /(10times|tradefairdates|eventseye|expodatabase|allconferences|conferenceindex|eventbrite|linkedin|facebook|twitter|x\.com|instagram|youtube|reddit|wikipedia|glassdoor|crunchbase)\./i;

/**
 * Flatten text for loose matching: lowercase, split letter/digit runs apart,
 * and reduce everything else to single spaces.
 *
 * The letter/digit split is what makes event URLs comparable. Organisers write
 * "hlth2027.mapyourshow.com", "slas2026.expofp.com", "Winter2027" — the show's
 * name and its year fused into one token. Separating them lets "HLTH 2027"
 * match the first and not the second.
 */
function flatten(s: string): string {
  return s
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Words that appear in half of all event names and identify nothing. */
const GENERIC =
  /^(the|and|expo|exposition|conference|conf|show|summit|event|events|forum|congress|convention|annual|international|global|world|national|america|americas|usa|group|fair|trade|week|days?)$/;

/** Distinctive words from what the user typed. */
function queryTokens(query: string): string[] {
  return [
    ...new Set(
      flatten(query)
        .split(" ")
        .filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !GENERIC.test(t))
    ),
  ];
}

function mentions(haystack: string, token: string): boolean {
  // A long token can match inside a fused domain ("healthandsafetyevent").
  // A short one cannot, or "ces" would match "process" and "services".
  return token.length >= 5
    ? haystack.includes(token)
    : new RegExp(`\\b${token}\\b`).test(haystack);
}

/**
 * Exported so the ranking can be tested without a network call. The signals
 * are the whole quality of this feature, and they are worth asserting on.
 */
export function rank(
  url: string,
  title = "",
  snippet = "",
  tokens: string[] = []
): { score: number; platform: string | null; why: string } {
  let score = 10;
  const reasons: string[] = [];

  // Hosted on a known directory platform. Scored below, once it is known
  // whether the page also looks like a list — see the note there.
  let platform: string | null = null;
  let platformPoints = 0;
  for (const p of PLATFORMS) {
    if (p.test.test(url)) {
      platform = p.name;
      platformPoints = p.points;
      reasons.push(`runs on ${p.name}`);
      break;
    }
  }

  // The URL path is worth more than the title: a title can say "Exhibitors"
  // on a page that only invites you to become one, but a path of
  // /Public/Exhibitors.aspx is what the list itself looks like.
  const path = (() => {
    try {
      const u = new URL(url);
      return u.pathname + u.search;
    } catch {
      return url;
    }
  })();

  // Best path match and best title match, scored separately and then compared.
  //
  // An earlier version took the first entry below that matched either one and
  // stopped, which quietly inverted the rule above: a real directory at
  // /exhibitors titled "Exhibitor Directory" matched the title of the
  // higher-priority "exhibitor directory" pattern before anything tested the
  // path against plain "exhibitors", so it scored as a title match and lost to
  // pages that were not lists at all. Seen on live BICSI results.
  let pathPoints = 0;
  let pathLabel = "";
  let titlePoints = 0;
  let titleLabel = "";

  for (const w of LIST_WORDS) {
    if (w.points > pathPoints && w.test.test(path)) {
      pathPoints = w.points;
      pathLabel = w.label;
    }
    if (w.points > titlePoints && w.test.test(title)) {
      titlePoints = w.points;
      titleLabel = w.label;
    }
  }

  const halvedTitle = Math.round(titlePoints * 0.5);
  let listPoints = 0;
  if (pathPoints >= halvedTitle && pathPoints > 0) {
    listPoints = pathPoints;
    reasons.push(pathLabel);
  } else if (halvedTitle > 0) {
    listPoints = halvedTitle;
    reasons.push(`titled "${titleLabel}"`);
  }
  score += listPoints;

  // Being on a known platform is only strong evidence alongside a list signal.
  // On its own it says "a page belonging to this show's directory software",
  // which is also true of the show's schedule, its venue map and its sponsor
  // pitch. Live BICSI results had three a2z pages, and a flat platform bonus
  // put two non-lists above a real directory on another host.
  if (platformPoints > 0) {
    score += listPoints > 0 ? platformPoints : Math.round(platformPoints * 0.35);
  }

  // Penalties, all of them — a page can be both an article and a pitch.
  for (const t of TRAPS) {
    if (t.test.test(url) || t.test.test(title)) {
      score += t.points;
      reasons.push(t.label);
    }
  }

  if (AGGREGATORS.test(url)) {
    score -= 50;
    reasons.push("an event aggregator, not the organiser");
  }

  // "Index=All", "show all", "view all" — the full list rather than page one.
  if (/index=all|all=true|showall|view[-_ ]?all|per[-_ ]?page=\d{3}/i.test(path)) {
    score += 20;
    reasons.push("the full list, not page one");
  }

  // A snippet thick with commas is often the list itself bleeding through.
  if ((snippet.match(/,/g)?.length ?? 0) > 12) {
    score += 8;
    reasons.push("the preview already shows names");
  }

  // Is this even the event that was asked for?
  //
  // A search for "HLTH 2027" returns the exhibitor lists of the Health &
  // Safety Event, IPPE and CES Unveiled — all genuine directories, none of
  // them the one wanted. Nothing above would catch that, and the verify step
  // adds 25 points to any page with names on it, so a wrong event's large
  // floor could be promoted over the right event's page and then tracked.
  //
  // One matching distinctive word is enough. Requiring all of them would
  // reject the organiser's own page whenever a show is known by a short name.
  if (tokens.length > 0) {
    const haystack = `${flatten(url)} ${flatten(title)}`;
    if (!tokens.some((t) => mentions(haystack, t))) {
      score -= 40;
      reasons.push("may be a different event");
    }
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    platform,
    why: reasons.length ? reasons.join(", ") : "a plain match on the name",
  };
}

// ---------------------------------------------------------------------------
// Search.
// ---------------------------------------------------------------------------

type TavilyResult = { title?: string; url?: string; content?: string };

/**
 * Sites that list events rather than host a show's own directory. They rank
 * well on exactly the queries below and never carry the real exhibitor list,
 * so they are excluded at the API rather than only penalised afterwards: ten
 * result slots is a small budget and three of them going to aggregators is
 * three real candidates never seen. AGGREGATORS below still penalises any that
 * slip through under another domain.
 */
const EXCLUDE_DOMAINS = [
  "10times.com",
  "tradefairdates.com",
  "eventseye.com",
  "expodatabase.com",
  "conferenceindex.org",
  "allconferences.com",
  "eventbrite.com",
  "linkedin.com",
  "facebook.com",
  "x.com",
  "twitter.com",
  "instagram.com",
  "youtube.com",
  "reddit.com",
  "crunchbase.com",
];

async function tavily(query: string, key: string): Promise<TavilyResult[]> {
  const res = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Bearer only. Tavily's current spec defines no api_key body field, and
      // sending one risks a 400 from a strict validator — which would make
      // every search fail for the sake of a parameter that is not read.
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      query,
      // "basic" is one credit, "advanced" is two. The free tier is 1,000 a
      // month and two searches run per lookup, so basic keeps this at roughly
      // 500 event lookups a month.
      search_depth: "basic",
      max_results: 10,
      include_answer: false,
      exclude_domains: EXCLUDE_DOMAINS,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Search failed (${res.status}): ${body.slice(0, 160)}`);
  }

  const data = (await res.json()) as { results?: TavilyResult[] };
  return data.results ?? [];
}

/**
 * Find candidate directory pages for an event.
 *
 * Two queries, not one. "HLTH 2027 exhibitor list" and "HLTH 2027 exhibitor
 * directory" return meaningfully different sets, because organisers name the
 * page one thing or the other and search engines do not treat them as
 * synonyms. Two basic searches cost less than one advanced one.
 */
export async function findDirectories(
  rawQuery: string,
  opts: { verify?: boolean } = {}
): Promise<SearchOutcome> {
  const query = rawQuery.trim();
  const key = process.env.TAVILY_API_KEY;
  const notes: string[] = [];

  if (!key) {
    return {
      candidates: [],
      notes: ["No search key is set, so an event can only be reached by pasting its URL."],
      configured: false,
    };
  }
  if (query.length < 3) {
    return { candidates: [], notes: ["Give the event's name."], configured: true };
  }

  const queries = [
    `${query} exhibitor list`,
    `${query} exhibitor directory floor plan`,
  ];
  const tokens = queryTokens(query);

  const settled = await Promise.allSettled(queries.map((q) => tavily(q, key)));
  const failures = settled.filter((s) => s.status === "rejected");

  if (failures.length === queries.length) {
    const reason = (failures[0] as PromiseRejectedResult).reason as Error;
    return { candidates: [], notes: [reason.message], configured: true };
  }
  if (failures.length > 0) {
    notes.push("One of the two searches failed, so this list may be short.");
  }

  // Dedupe on URL, keeping the first title seen.
  const seen = new Map<string, Candidate>();
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    for (const r of s.value) {
      if (!r.url) continue;
      const url = r.url.trim();
      if (seen.has(url)) continue;
      const { score, platform, why } = rank(url, r.title ?? "", r.content ?? "", tokens);
      seen.set(url, {
        url,
        title: (r.title ?? url).trim(),
        platform,
        score,
        names: null,
        why,
      });
    }
  }

  const ranked = [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 6);

  if (ranked.length === 0) {
    notes.push("Nothing came back. Try the show's full name, or the year.");
    return { candidates: ranked, notes, configured: true };
  }

  // Verify the strongest few by actually reading them.
  //
  // This is the part a search engine cannot do. Ranking says "this looks like
  // an exhibitor list"; reading it says "this one has 122 names and that one
  // has none." It uses the structural parser only — no model, no quota, no
  // cost — so it is free to be wrong.
  if (opts.verify !== false) {
    const toCheck = ranked.slice(0, 3);
    await Promise.allSettled(
      toCheck.map(async (c) => {
        try {
          const html = await fetchPage(c.url);
          c.names = extractStructural(html, c.url).length;
          // A page that reads as a real list outranks any ranking guess.
          if (c.names >= 10) c.score = Math.min(100, c.score + 25);
          if (c.names === 0) c.score = Math.max(0, c.score - 15);
        } catch {
          c.names = null;
        }
      })
    );
    ranked.sort((a, b) => b.score - a.score);

    if (ranked.every((c) => (c.names ?? 0) === 0)) {
      notes.push(
        "None of the top pages gave up names on a quick read. Many directories draw their list with JavaScript after opening — the full read may still work, so it is worth trying the best match."
      );
    }
  }

  return { candidates: ranked, notes, configured: true };
}
