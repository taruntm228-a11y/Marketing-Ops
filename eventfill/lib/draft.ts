import type { IcpProfile } from "./types";
import { complete, parseJsonLoose, salvageObjects } from "./ai";

/**
 * Write the first email.
 *
 * The hard constraint here is not tone, it is honesty. We know four things
 * about a company: its name, its booth, whatever category the organiser filed
 * it under, and that it is exhibiting at this show. We do not know its
 * headcount, its funding, its roadmap, or the name of anyone who works there.
 *
 * A model asked to "personalise" will cheerfully supply all of those, and a
 * cold email containing one invented fact is worse than no email at all — it
 * is the thing that gets a domain blocked and a sender remembered. So the
 * prompt is told what it may use and the output is audited afterwards for
 * numbers nobody gave it.
 *
 * The real hook does not need invention. "We'll both be at BICSI in February
 * and you're at booth 1520" is specific, true, checkable, and arrives six
 * weeks before anyone else thinks to send it.
 */

const SYSTEM = `You write short first-contact emails from one exhibitor or attendee to another before a trade show.

What you may refer to:
- the company's name
- the event's name
- the company's booth number, when given
- the category the organiser filed them under, when given
- what the sender sells

What you must never do:
- state any fact about the recipient's company beyond the above: no headcount,
  revenue, funding, customers, tooling, growth, hiring or plans
- invent a statistic, a percentage, a dollar figure or a year
- invent a person's name, a mutual connection, or a past interaction
- claim to have read, seen, heard about or used anything of theirs
- write "I noticed", "I saw", "I came across" or "I've been following"

Style:
- under 80 words in the body. Shorter is better.
- plain words. No "reach out", "circle back", "synergy", "excited to connect",
  "hope this finds you well", "in today's fast-paced".
- one clear ask, and make it small: a short conversation at the show.
- write like one human to another, not like a company to a lead.
- use [first name] where a name would go, and [your name] for the sender.

Return raw JSON only. No prose, no code fences.`;

export type Draft = {
  company: string;
  booth: string | null;
  score: number | null;
  subject: string;
  body: string;
  /** Short label for the approach taken, so two drafts are comparable. */
  angle: string;
  /** Anything the audit below could not verify. Shown, never hidden. */
  warnings: string[];
};

type RawDraft = { company?: string; subject?: string; body?: string; angle?: string };

export type DraftTarget = {
  name: string;
  booth: string | null;
  category: string | null;
  score: number | null;
  reason: string | null;
};

/**
 * Audit a draft for facts nobody supplied.
 *
 * Numbers are the test that earns its keep. Invented specifics in cold email
 * are almost always numeric — "cut costs 40%", "your 200-person team",
 * "since 2019" — and every number we legitimately have is known here, so
 * anything else is the model filling a gap. This cannot catch a fabricated
 * qualitative claim, which is why the prompt forbids those separately and the
 * warnings are shown to a human rather than used to silently drop the draft.
 */
export function audit(text: string, allowed: string[]): string[] {
  const warnings: string[] = [];

  const permitted = new Set(allowed.flatMap((a) => a.match(/\d+/g) ?? []));
  const found = text.match(/\d[\d,.]*/g) ?? [];
  const invented = [...new Set(found.map((n) => n.replace(/[.,]$/, "")))].filter(
    (n) => !permitted.has(n.replace(/[,.]/g, "")) && !permitted.has(n)
  );

  if (invented.length) {
    warnings.push(`unsourced number${invented.length > 1 ? "s" : ""}: ${invented.join(", ")}`);
  }

  // The phrases the prompt forbids, checked rather than hoped for.
  const tells = [
    /\bI (?:noticed|saw|came across|read|heard)\b/i,
    /\bI(?:'ve| have) been following\b/i,
    /\bhope this (?:finds|email finds)\b/i,
    /\breach out\b/i,
    /\bcircle back\b/i,
    /\bexcited to connect\b/i,
  ];
  for (const t of tells) {
    const hit = text.match(t);
    if (hit) warnings.push(`phrase to cut: "${hit[0]}"`);
  }

  const words = text.trim().split(/\s+/).length;
  if (words > 110) warnings.push(`${words} words — longer than it should be`);

  return warnings;
}

function icpBlock(icp: IcpProfile): string {
  return [
    icp.companyName && `Sender's company: ${icp.companyName}`,
    icp.whatYouSell && `What they sell: ${icp.whatYouSell}`,
    icp.titles && `Who they want to speak to: ${icp.titles}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function draftBatch(
  targets: DraftTarget[],
  icp: IcpProfile,
  eventName: string
): Promise<Draft[]> {
  const list = targets
    .map((t, i) => {
      const bits = [t.booth && `booth ${t.booth}`, t.category].filter(Boolean);
      return `${i + 1}. ${t.name}${bits.length ? ` — ${bits.join(", ")}` : ""}`;
    })
    .join("\n");

  const prompt = `${icpBlock(icp)}

The event: ${eventName}

Write one email per company below. Give each a different angle from the others
where the facts allow it, and name that angle in two or three words.

Return a JSON array, one element per company:
{"company": "name exactly as given", "angle": "2-3 words", "subject": "under 8 words", "body": "under 80 words"}

--- COMPANIES ---
${list}
--- END ---`;

  const { text, truncated } = await complete(prompt, { system: SYSTEM, maxTokens: 12000 });
  const rows = truncated ? salvageObjects<RawDraft>(text) : parseJsonLoose<RawDraft[]>(text);
  if (!Array.isArray(rows)) return [];

  const byName = new Map(targets.map((t) => [t.name.toLowerCase(), t]));

  return rows
    .filter((r): r is RawDraft & { company: string } => Boolean(r?.company && r.body))
    .map((r) => {
      // Match on the echoed name, not on position: a dropped element would
      // otherwise attach every following draft to the wrong company, and a
      // cold email addressed to the wrong firm is the worst output here.
      const target = byName.get(r.company.trim().toLowerCase());
      const subject = String(r.subject ?? "").trim();
      const body = String(r.body ?? "").trim();

      const allowed = [
        target?.booth ?? "",
        eventName,
        target?.name ?? "",
        icp.companyName,
        String(new Date().getFullYear()),
        String(new Date().getFullYear() + 1),
      ];

      return {
        company: target?.name ?? r.company.trim(),
        booth: target?.booth ?? null,
        score: target?.score ?? null,
        subject,
        body,
        angle: String(r.angle ?? "").trim().slice(0, 40),
        warnings: audit(`${subject} ${body}`, allowed),
      };
    })
    // Drop anything we cannot tie back to a company we asked about.
    .filter((d) => byName.has(d.company.toLowerCase()));
}

export type DraftRun = {
  drafts: Draft[];
  notes: string[];
};

/**
 * Draft for a list of companies, in small batches.
 *
 * Eight at a time, not forty like scoring: a draft is eighty words where a
 * score is eight, so the output budget runs out roughly five times sooner.
 */
export async function draftOutreach(
  targets: DraftTarget[],
  icp: IcpProfile,
  eventName: string,
  batchSize = 8
): Promise<DraftRun> {
  const drafts: Draft[] = [];
  const notes: string[] = [];

  const batches: DraftTarget[][] = [];
  for (let i = 0; i < targets.length; i += batchSize) {
    batches.push(targets.slice(i, i + batchSize));
  }

  for (const [i, batch] of batches.entries()) {
    try {
      const out = await draftBatch(batch, icp, eventName);
      drafts.push(...out);

      const missed = batch.length - out.length;
      if (missed > 0) {
        notes.push(`${missed} of ${batch.length} in batch ${i + 1} came back unusable.`);
      }
    } catch (err) {
      notes.push(`Batch ${i + 1} of ${batches.length} failed: ${(err as Error).message}`);
    }
  }

  const flagged = drafts.filter((d) => d.warnings.length).length;
  if (flagged > 0) {
    notes.push(
      `${flagged} draft${flagged === 1 ? " has a warning" : "s have warnings"} — read those before sending.`
    );
  }

  return { drafts, notes };
}
