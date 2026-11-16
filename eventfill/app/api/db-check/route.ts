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

  // 1. apikey header only — what the app does now
  probes.apikeyOnly = await probe(`${base}/events?select=id&limit=1`, { apikey: key });

  // 2. apikey + Authorization — what the SDK does
  probes.withBearer = await probe(`${base}/events?select=id&limit=1`, {
    apikey: key,
    Authorization: `Bearer ${key}`,
  });

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
