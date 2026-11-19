import { NextResponse } from "next/server";

/**
 * Diagnostic for the database connection. Reports what Postgres actually says
 * back, rather than the tidied message the harvest route shows. Reveals no
 * secrets: the key is only ever sent, never returned.
 *
 * GET /api/db-check
 */
export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    return NextResponse.json({
      configured: false,
      hasUrl: Boolean(url),
      hasKey: Boolean(key),
    });
  }

  const base = `${url.replace(/\/$/, "")}/rest/v1`;
  const probes: Record<string, unknown> = {
    keyPrefix: key.slice(0, 11), // "sb_secret_" or "eyJ" for a legacy JWT
    keyIsJwt: key.startsWith("ey"),
  };

  // Probe every table the app needs. A missing one means the schema hasn't been
  // re-run since it was added, which otherwise shows up much later as a feature
  // that silently does nothing.
  const tables: Record<string, unknown> = {};
  for (const t of ["events", "companies", "harvests", "icp"]) {
    const r = await probe(`${base}/${t}?select=*&limit=1`, { apikey: key });
    tables[t] =
      r.status === 200
        ? "ok"
        : r.status === 404
          ? "MISSING — re-run supabase/setup.sql"
          : `${r.status}: ${String(r.body ?? r.error).slice(0, 160)}`;
  }
  probes.tables = tables;

  // Is the identity rule actually holding? Two rows with the same name_key
  // means the unique index is missing, and the next harvest will announce a
  // company that has been on the floor for a week as a new booking. That is
  // the one failure that would make the morning digest worth ignoring, so it
  // gets a permanent check rather than being rediscovered in live data.
  // This one reads the whole response rather than going through probe(), which
  // truncates to 400 characters for safety — a truncated body would fail to
  // parse and report "not checked" on every real floor.
  if (tables.companies === "ok") {
    try {
      const res = await fetch(`${base}/companies?select=event_id,name_key&limit=20000`, {
        headers: { apikey: key, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      const rows = (await res.json()) as { event_id: string; name_key: string | null }[];
      const seen = new Set<string>();
      const clashes: string[] = [];
      let missingKey = 0;

      for (const r of rows) {
        if (!r.name_key) {
          missingKey++;
          continue;
        }
        const k = `${r.event_id}|${r.name_key}`;
        if (seen.has(k)) clashes.push(r.name_key);
        seen.add(k);
      }

      probes.identity = missingKey
        ? `${missingKey} row(s) have no name_key — re-run supabase/setup.sql`
        : clashes.length === 0
          ? `ok — ${rows.length} rows, no duplicates`
          : `${clashes.length} DUPLICATE(S): ${clashes.slice(0, 5).join(", ")}`;
    } catch (err) {
      probes.identity = `not checked — ${(err as Error).message}`;
    }
  }

  return NextResponse.json(probes);
}

async function probe(target: string, headers: Record<string, string>) {
  try {
    const res = await fetch(target, {
      headers: { ...headers, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    return { status: res.status, ok: res.ok, body: text.slice(0, 400) };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
