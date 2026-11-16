import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Company, HarvestResult } from "./types";

/**
 * Server-side Supabase client.
 *
 * Uses the SECRET key, which bypasses Row Level Security — so this module must
 * never be imported into anything that runs in the browser. Every table has RLS
 * on with no policies, meaning the public key can read nothing at all and this
 * is the only way in.
 */
let client: SupabaseClient | null = null;

export function db(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null; // app still works, it just won't remember

  if (!client) {
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
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
 * Persist a harvest, and work out what is new.
 *
 * Every row is upserted on (event_id, name). An insert stamps first_seen_at;
 * a row we have seen before only has last_seen_at moved forward. The rows whose
 * first_seen_at lands in this run are, by definition, the new arrivals.
 */
export async function saveHarvest(
  result: HarvestResult,
  eventName: string
): Promise<SaveOutcome> {
  const supabase = db();
  if (!supabase) {
    return { saved: false, newCount: 0, totalKnown: 0, newCompanies: [], error: "no-db" };
  }

  try {
    // 1. the event, keyed on its directory URL
    const { data: event, error: eventErr } = await supabase
      .from("events")
      .upsert({ name: eventName, source_url: result.sourceUrl }, { onConflict: "source_url" })
      .select("id")
      .single();

    if (eventErr || !event) {
      return {
        saved: false,
        newCount: 0,
        totalKnown: 0,
        newCompanies: [],
        error: eventErr?.message ?? "could not save the event",
      };
    }
    const eventId = event.id as string;

    // 2. which names do we already have? anything else is new.
    const { data: existing } = await supabase
      .from("companies")
      .select("name")
      .eq("event_id", eventId);

    const known = new Set((existing ?? []).map((r) => (r.name as string).toLowerCase()));
    const newCompanies = result.companies
      .filter((c) => !known.has(c.name.toLowerCase()))
      .map((c) => c.name);

    // 3. upsert the rows. last_seen_at always moves; first_seen_at only on insert.
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

    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase
        .from("companies")
        .upsert(rows.slice(i, i + 500), { onConflict: "event_id,name", ignoreDuplicates: false });
      if (error) {
        return {
          saved: false,
          newCount: 0,
          totalKnown: known.size,
          newCompanies: [],
          error: error.message,
        };
      }
    }

    // 4. log the run
    await supabase.from("harvests").insert({
      event_id: eventId,
      method: result.method,
      total_found: result.companies.length,
      new_count: newCompanies.length,
      rejected: result.rejected,
      notes: result.notes,
    });

    return {
      saved: true,
      eventId,
      newCount: newCompanies.length,
      totalKnown: known.size + newCompanies.length,
      newCompanies,
    };
  } catch (err) {
    return {
      saved: false,
      newCount: 0,
      totalKnown: 0,
      newCompanies: [],
      error: (err as Error).message,
    };
  }
}

/** Every show being tracked, most recently harvested first. */
export async function listEvents() {
  const supabase = db();
  if (!supabase) return [];

  const { data } = await supabase
    .from("events")
    .select("id, name, source_url, created_at, companies(count), harvests(ran_at)")
    .order("created_at", { ascending: false });

  return data ?? [];
}

/** One show, its companies newest-first so arrivals sit at the top. */
export async function getEvent(eventId: string) {
  const supabase = db();
  if (!supabase) return null;

  const [{ data: event }, { data: companies }, { data: harvests }] = await Promise.all([
    supabase.from("events").select("*").eq("id", eventId).single(),
    supabase
      .from("companies")
      .select("*")
      .eq("event_id", eventId)
      .order("first_seen_at", { ascending: false })
      .order("name"),
    supabase
      .from("harvests")
      .select("*")
      .eq("event_id", eventId)
      .order("ran_at", { ascending: false })
      .limit(10),
  ]);

  if (!event) return null;
  return { event, companies: companies ?? [], harvests: harvests ?? [] };
}
