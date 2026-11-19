import type { Company, HarvestResult, IcpProfile } from "./types";
import { EMPTY_ICP } from "./types";

/**
 * Supabase access, over PostgREST directly rather than @supabase/supabase-js.
 *
 * Why not the SDK: Supabase's new secret keys (sb_secret_…) are not JWTs, and
 * must travel on the `apikey` header. The SDK also sets
 * `Authorization: Bearer <key>`, where a non-JWT is rejected and the request
 * quietly falls back to the anonymous role — which, with RLS on and no
 * policies, fails as "permission denied for table events". Sending only
 * `apikey` avoids the whole problem, and PostgREST is a plain REST API.
 *
 * This module uses the SECRET key, so it must never be imported by client code.
 */

function conf() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return { base: `${url.replace(/\/$/, "")}/rest/v1`, key };
}

export function dbConfigured(): boolean {
  return conf() !== null;
}

type RestOpts = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** PostgREST Prefer header, e.g. "resolution=merge-duplicates,return=representation" */
  prefer?: string;
};

async function rest<T>(path: string, opts: RestOpts = {}): Promise<T> {
  const c = conf();
  if (!c) throw new Error("no-db");

  const headers: Record<string, string> = {
    apikey: c.key,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (opts.prefer) headers.Prefer = opts.prefer;

  const res = await fetch(`${c.base}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text);
      msg = j.message ?? j.error ?? msg;
    } catch {
      /* keep the raw text */
    }
    throw new Error(`${res.status}: ${msg}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

export type SaveOutcome = {
  saved: boolean;
  eventId?: string;
  newCount: number;
  totalKnown: number;
  /** Companies seen for the first time in this run — the Watcher's payload. */
  newCompanies: string[];
  error?: string;
};

/**
 * Persist a harvest and work out what is new.
 *
 * Rows upsert on (event_id, name). A company already on file only has
 * last_seen_at moved forward; a new one gets a fresh first_seen_at. The names
 * absent before this run are, by definition, the new arrivals.
 */
export async function saveHarvest(
  result: HarvestResult,
  eventName: string
): Promise<SaveOutcome> {
  const empty = { saved: false, newCount: 0, totalKnown: 0, newCompanies: [] };
  if (!dbConfigured()) return { ...empty, error: "no-db" };

  try {
    // 1. the event, keyed on its directory URL
    const events = await rest<{ id: string }[]>("/events?on_conflict=source_url", {
      method: "POST",
      body: [{ name: eventName, source_url: result.sourceUrl }],
      prefer: "resolution=merge-duplicates,return=representation",
    });
    const eventId = events?.[0]?.id;
    if (!eventId) return { ...empty, error: "the event row came back without an id" };

    // 2. what do we already have? anything else is new.
    const existing = await rest<{ name: string }[]>(
      `/companies?event_id=eq.${eventId}&select=name`
    );
    const known = new Set((existing ?? []).map((r) => r.name.toLowerCase()));
    const newCompanies = result.companies
      .filter((c) => !known.has(c.name.toLowerCase()))
      .map((c) => c.name);

    // 3. upsert, in batches so a big floor doesn't make one huge request
    const now = new Date().toISOString();
    const rows = result.companies.map((c: Company) => ({
      event_id: eventId,
      name: c.name,
      website: c.website,
      booth: c.booth,
      category: c.category,
      role: c.role,
      source_url: c.sourceUrl,
      evidence: c.evidence,
      last_seen_at: now,
    }));

    for (let i = 0; i < rows.length; i += 400) {
      // Conflict on the normalised key, not the raw name: organisers change
      // capitalisation between harvests and a case-sensitive key turns the same
      // company into a second row reported as a new arrival.
      await rest("/companies?on_conflict=event_id,name_key", {
        method: "POST",
        body: rows.slice(i, i + 400),
        prefer: "resolution=merge-duplicates,return=minimal",
      });
    }

    // 4. log the run, so "checked, nothing new" is distinguishable from "never ran"
    await rest("/harvests", {
      method: "POST",
      body: [
        {
          event_id: eventId,
          method: result.method,
          total_found: result.companies.length,
          new_count: newCompanies.length,
          rejected: result.rejected,
          notes: result.notes,
        },
      ],
      prefer: "return=minimal",
    });

    return {
      saved: true,
      eventId,
      newCount: newCompanies.length,
      totalKnown: known.size + newCompanies.length,
      newCompanies,
    };
  } catch (err) {
    return { ...empty, error: (err as Error).message };
  }
}

export type EventRow = {
  id: string;
  name: string;
  source_url: string;
  city: string | null;
  starts_on: string | null;
  created_at: string;
};

export type CompanyRow = {
  id: string;
  event_id: string;
  name: string;
  website: string | null;
  booth: string | null;
  category: string | null;
  role: string;
  source_url: string;
  evidence: string | null;
  first_seen_at: string;
  last_seen_at: string;
  icp_score: number | null;
  icp_reason: string | null;
  scored_at: string | null;
};

export type HarvestRow = {
  id: string;
  event_id: string;
  ran_at: string;
  method: string;
  total_found: number;
  new_count: number;
  rejected: number;
  notes: string[] | null;
};

export type EventSummary = {
  id: string;
  name: string;
  source_url: string;
  created_at: string;
  companies: { count: number }[];
  harvests: { ran_at: string }[];
};

/** Every show being tracked, newest first. */
export async function listEvents(): Promise<EventSummary[]> {
  if (!dbConfigured()) return [];
  try {
    return await rest<EventSummary[]>(
      "/events?select=id,name,source_url,created_at,companies(count),harvests(ran_at)" +
        "&order=created_at.desc"
    );
  } catch {
    return [];
  }
}

/** One show: its companies newest-first, so arrivals sit at the top. */
export async function getEvent(eventId: string) {
  if (!dbConfigured()) return null;
  try {
    const [event] = await rest<EventRow[]>(`/events?id=eq.${eventId}&select=*&limit=1`);
    if (!event) return null;

    const [companies, harvests] = await Promise.all([
      rest<CompanyRow[]>(
        `/companies?event_id=eq.${eventId}&select=*&order=first_seen_at.desc,name.asc`
      ),
      rest<HarvestRow[]>(`/harvests?event_id=eq.${eventId}&select=*&order=ran_at.desc&limit=10`),
    ]);

    return { event, companies: companies ?? [], harvests: harvests ?? [] };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The customer profile.
//
// One row, enforced by a unique `singleton` column. It lives in the database
// rather than the browser because the Watcher runs with nobody present and
// still has to score whoever showed up overnight.
// ---------------------------------------------------------------------------

type IcpRow = {
  company_name: string | null;
  what_you_sell: string | null;
  industries: string | null;
  size_band: string | null;
  geography: string | null;
  titles: string | null;
  disqualifiers: string | null;
  example_customers: string | null;
};

export async function getIcp(): Promise<IcpProfile | null> {
  if (!dbConfigured()) return null;
  try {
    const [row] = await rest<IcpRow[]>("/icp?singleton=eq.true&select=*&limit=1");
    if (!row) return null;
    return {
      companyName: row.company_name ?? "",
      whatYouSell: row.what_you_sell ?? "",
      industries: row.industries ?? "",
      sizeBand: row.size_band ?? "",
      geography: row.geography ?? "",
      titles: row.titles ?? "",
      disqualifiers: row.disqualifiers ?? "",
      exampleCustomers: row.example_customers ?? "",
    };
  } catch {
    return null;
  }
}

export async function saveIcpToDb(icp: IcpProfile): Promise<{ ok: boolean; error?: string }> {
  if (!dbConfigured()) return { ok: false, error: "no-db" };
  try {
    await rest("/icp?on_conflict=singleton", {
      method: "POST",
      body: [
        {
          singleton: true,
          company_name: icp.companyName,
          what_you_sell: icp.whatYouSell,
          industries: icp.industries,
          size_band: icp.sizeBand,
          geography: icp.geography,
          titles: icp.titles,
          disqualifiers: icp.disqualifiers,
          example_customers: icp.exampleCustomers,
          updated_at: new Date().toISOString(),
        },
      ],
      prefer: "resolution=merge-duplicates,return=minimal",
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Companies for an event, optionally only the ones never scored. */
export async function companiesForScoring(
  eventId: string,
  onlyUnscored: boolean
): Promise<CompanyRow[]> {
  if (!dbConfigured()) return [];
  const filter = onlyUnscored ? "&icp_score=is.null" : "";
  try {
    return await rest<CompanyRow[]>(
      `/companies?event_id=eq.${eventId}${filter}&select=*&order=name.asc`
    );
  } catch {
    return [];
  }
}

/**
 * Write scores back.
 *
 * One PATCH per company, because PostgREST has no bulk update by differing
 * values. Run in small waves so a 400-company event doesn't open 400 sockets
 * at once and trip the connection limit.
 */
export async function saveScores(
  eventId: string,
  scores: { name: string; score: number; reason: string }[]
): Promise<number> {
  if (!dbConfigured()) return 0;
  const now = new Date().toISOString();
  let written = 0;

  for (let i = 0; i < scores.length; i += 10) {
    const wave = scores.slice(i, i + 10);
    const results = await Promise.allSettled(
      wave.map((s) =>
        rest(
          `/companies?event_id=eq.${eventId}&name=eq.${encodeURIComponent(s.name)}`,
          {
            method: "PATCH",
            body: { icp_score: s.score, icp_reason: s.reason, scored_at: now },
            prefer: "return=minimal",
          }
        )
      )
    );
    written += results.filter((r) => r.status === "fulfilled").length;
  }

  return written;
}

export { EMPTY_ICP };
