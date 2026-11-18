import type { Company } from "./types";
import { complete, parseJsonLoose, salvageObjects } from "./ai";

/**
 * Read a directory page with a model — and then check its work.
 *
 * The risk with asking a model "who is exhibiting at X" is that it will happily
 * invent plausible companies. So we never ask it to recall anything. We hand it
 * the page text and require an `evidence` string copied verbatim from that text
 * for every row. If we can't find the evidence in the source, the row is a
 * fabrication and we throw it away.
 */

const SYSTEM = `You extract structured records from the text of event websites.

Hard rules:
- Only report organisations that literally appear in the text you are given.
- Never add a company from your own knowledge, however likely it seems.
- For every record, copy an "evidence" string of 10-200 characters EXACTLY as it
  appears in the source text. Do not paraphrase, reorder, fix spelling or change
  capitalisation in the evidence.
- If the page is not a list of organisations, return [].
- Return raw JSON only. No prose, no code fences.`;

type RawRow = {
  name?: string;
  website?: string | null;
  booth?: string | null;
  category?: string | null;
  role?: string;
  evidence?: string;
};

/** Normalise for comparison: collapse whitespace, lowercase, drop punctuation noise. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[^\w\s.&/-]/g, "").trim();
}

export async function extractWithAi(
  pageText: string,
  sourceUrl: string
): Promise<{ companies: Company[]; rejected: number; notes: string[] }> {
  const notes: string[] = [];
  const scrapedAt = new Date().toISOString();

  // Chunk size is set by the OUTPUT budget, not the input.
  //
  // Each record costs roughly 60-80 tokens of JSON once the evidence string is
  // included, so a chunk dense enough to hold 200 listings cannot be answered
  // inside any sane response limit — the reply gets cut off mid-record. 5,000
  // characters of directory text is about 60-80 listings, which answers well
  // inside the budget. Overlap keeps a row from being split across chunks.
  const chunks = chunkLines(pageText, 5_000, 300);
  if (chunks.length > 1) notes.push(`Page split into ${chunks.length} chunks for extraction.`);

  const haystack = norm(pageText);
  const seen = new Set<string>();
  const companies: Company[] = [];
  let rejected = 0;

  for (const [i, chunk] of chunks.entries()) {
    const prompt = `Below is the text of a page at ${sourceUrl}.

Extract every exhibiting company, sponsor, or speaker's organisation listed on it.

Return a JSON array. Each element:
{
  "name": "organisation name exactly as written",
  "website": "their URL if the text shows one, else null",
  "booth": "booth or stand number if shown, else null",
  "category": "product category or sponsor tier if shown, else null",
  "role": one of "exhibitor" | "speaker" | "sponsor" | "unknown",
  "evidence": "10-200 characters copied verbatim from the text below that contains this record"
}

--- PAGE TEXT ---
${chunk}
--- END PAGE TEXT ---`;

    let rows: RawRow[];
    try {
      const { text, truncated } = await complete(prompt, { system: SYSTEM, maxTokens: 16000 });

      if (truncated) {
        // Ran out of budget mid-answer. The completed records are still good,
        // so keep those rather than discarding the whole chunk.
        rows = salvageObjects<RawRow>(text);
        notes.push(
          `Part ${i + 1} of ${chunks.length} was cut short; kept the ${rows.length} complete record${
            rows.length === 1 ? "" : "s"
          } from it.`
        );
      } else {
        rows = parseJsonLoose<RawRow[]>(text);
      }
    } catch (err) {
      // Last resort: a parse failure can still hold whole objects.
      notes.push(`Part ${i + 1} of ${chunks.length} failed: ${(err as Error).message}`);
      continue;
    }
    if (!Array.isArray(rows)) continue;

    for (const row of rows) {
      const name = (row.name ?? "").replace(/\s+/g, " ").trim();
      if (!name) continue;

      // --- The guard. Both the name and the evidence must exist in the page. ---
      const evidence = (row.evidence ?? "").trim();
      const evidenceOk = evidence.length >= 6 && haystack.includes(norm(evidence));
      const nameOk = haystack.includes(norm(name));

      if (!evidenceOk || !nameOk) {
        rejected++;
        continue;
      }

      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      companies.push({
        name,
        website: row.website?.trim() || null,
        booth: row.booth?.trim() || null,
        category: row.category?.trim() || null,
        role: (["exhibitor", "speaker", "sponsor"] as const).includes(row.role as never)
          ? (row.role as Company["role"])
          : "unknown",
        sourceUrl,
        scrapedAt,
        evidence: evidence.slice(0, 300),
      });
    }
  }

  if (rejected > 0) {
    notes.push(
      `${rejected} row${rejected === 1 ? "" : "s"} discarded — the model could not point to them in the page.`
    );
  }

  return { companies, rejected, notes };
}

function chunkLines(text: string, size: number, overlap: number): string[] {
  if (text.length <= size) return [text];
  const lines = text.split("\n");
  const chunks: string[] = [];
  let buf = "";

  for (const line of lines) {
    if (buf.length + line.length + 1 > size && buf) {
      chunks.push(buf);
      buf = buf.slice(-overlap) + "\n";
    }
    buf += line + "\n";
  }
  if (buf.trim()) chunks.push(buf);
  return chunks;
}
