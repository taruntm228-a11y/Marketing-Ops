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
          ? "MISSING — re-run supabase/schema.sql"
          : `${r.status}: ${String(r.body ?? r.error).slice(0, 160)}`;
  }
  probes.tables = tables;

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
