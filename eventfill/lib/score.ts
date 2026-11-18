import type { IcpProfile } from "./types";
import { complete, parseJsonLoose, salvageObjects } from "./ai";

/**
 * Rate companies against the client's ideal customer.
 *
 * Two rules shape this and both are deliberate.
 *
 * Every score carries a reason. A bare number is a black box — nobody trusts
 * it and nobody can tell when it is wrong. A sentence can be argued with, which
 * is the only way the profile ever gets sharpened.
 *
 * Disqualifiers beat qualifiers. Half of list quality is removing competitors,
 * existing customers and companies too small to buy, so the prompt is told to
 * treat the disqualifier list as a hard floor rather than one signal of several.
 */

const SYSTEM = `You rate how well a company fits a stated ideal customer profile.

Rules:
- Judge only on the company name and any category given. You will often have
  little to go on; say so in the reason rather than inventing detail.
- Never invent facts about a company. If the name alone is not enough to judge,
  score it 5 and say the name is not informative.
- Anything matching a disqualifier scores 1-2, whatever else it has going for it.
- Be decisive in the 7-10 range. A list where everything scores 5-6 is useless.
- The reason is one short sentence, under 15 words, written to be disagreed with.
- Return raw JSON only. No prose, no code fences.`;

export type Scored = {
  name: string;
  score: number;
  reason: string;
};

function icpBlock(icp: IcpProfile): string {
  const lines = [
    icp.companyName && `The client: ${icp.companyName}`,
    icp.whatYouSell && `Sells: ${icp.whatYouSell}`,
    icp.industries && `Target industries: ${icp.industries}`,
    icp.sizeBand && `Target size: ${icp.sizeBand}`,
    icp.geography && `Target geography: ${icp.geography}`,
    icp.titles && `Wants to reach: ${icp.titles}`,
    icp.exampleCustomers && `Customers they want more of:\n${icp.exampleCustomers}`,
    icp.disqualifiers && `DISQUALIFIERS — score 1-2 if any apply:\n${icp.disqualifiers}`,
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * Score one batch. Kept small on purpose: output is only a name, a number and a
 * short sentence per company, so 40 fits inside the budget with room to spare
 * and a failure costs 40 records rather than the whole event.
 */
async function scoreBatch(
  companies: { name: string; category?: string | null }[],
  icp: IcpProfile
): Promise<Scored[]> {
  const list = companies
    .map((c, i) => `${i + 1}. ${c.name}${c.category ? ` (${c.category})` : ""}`)
    .join("\n");

  const prompt = `${icpBlock(icp)}

Rate each company below from 1 to 10 on how well it fits that profile.

Return a JSON array, one element per company, in the same order:
{"name": "the company name exactly as given", "score": 1-10, "reason": "under 15 words"}

--- COMPANIES ---
${list}
--- END ---`;

  const { text, truncated } = await complete(prompt, { system: SYSTEM, maxTokens: 8000 });
  const rows = truncated ? salvageObjects<Scored>(text) : parseJsonLoose<Scored[]>(text);
  if (!Array.isArray(rows)) return [];

  return rows
    .filter((r) => r && typeof r.name === "string")
    .map((r) => ({
      name: r.name.trim(),
      // Clamp rather than trust: a model that returns 0, 11 or "high" should
      // not put an out-of-range value into the database.
      score: Math.max(1, Math.min(10, Math.round(Number(r.score) || 5))),
      reason: String(r.reason ?? "").trim().slice(0, 200),
    }));
}

export type ScoreRun = {
  scored: Scored[];
  failedBatches: number;
  notes: string[];
};

/** Score a whole list, in batches, surviving a failure in any one of them. */
export async function scoreCompanies(
  companies: { name: string; category?: string | null }[],
  icp: IcpProfile,
  batchSize = 40
): Promise<ScoreRun> {
  const scored: Scored[] = [];
  const notes: string[] = [];
  let failedBatches = 0;

  const batches: (typeof companies)[] = [];
  for (let i = 0; i < companies.length; i += batchSize) {
    batches.push(companies.slice(i, i + batchSize));
  }

  for (const [i, batch] of batches.entries()) {
    try {
      const out = await scoreBatch(batch, icp);

      // The model is asked to echo names back; match on those rather than on
      // position, because a dropped element would silently shift every score
      // after it onto the wrong company.
      const byName = new Map(out.map((r) => [r.name.toLowerCase(), r]));
      for (const c of batch) {
        const hit = byName.get(c.name.toLowerCase());
        if (hit) scored.push({ ...hit, name: c.name });
      }

      const missed = batch.length - out.length;
      if (missed > 0) {
        notes.push(`Batch ${i + 1}: ${missed} compan${missed === 1 ? "y" : "ies"} came back unscored.`);
      }
    } catch (err) {
      failedBatches++;
      notes.push(`Batch ${i + 1} of ${batches.length} failed: ${(err as Error).message}`);
    }
  }

  return { scored, failedBatches, notes };
}
