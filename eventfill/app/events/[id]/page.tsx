import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getEvent } from "@/lib/db";

type Row = {
  id: string;
  name: string;
  website: string | null;
  booth: string | null;
  category: string | null;
  role: string;
  evidence: string | null;
  first_seen_at: string;
  icp_score: number | null;
  icp_reason: string | null;
};

const WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Static shell, request-time body. See the note in app/events/page.tsx — Cache
 * Components requires the dynamic part to sit behind its own Suspense boundary.
 */
export default function EventPage({ params }: PageProps<"/events/[id]">) {
  // params is request-time data in Next 16, so it is passed down unawaited and
  // resolved inside the boundary. Awaiting it here would make the shell dynamic
  // and the build would refuse to prerender the route.
  return (
    <Suspense
      fallback={<div className="mx-auto max-w-5xl px-6 py-12 text-[15px] text-ink-soft">Loading…</div>}
    >
      <EventDetail params={params} />
    </Suspense>
  );
}

async function EventDetail({ params }: { params: PageProps<"/events/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const data = await getEvent(id);
  if (!data) notFound();

  const companies = data.companies as Row[];
  const cutoff = Date.now() - WEEK;
  const fresh = companies.filter((c) => new Date(c.first_seen_at).getTime() > cutoff);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <Link href="/events" className="text-[14px] text-ink-soft hover:text-teal">
        All shows
      </Link>

      <h1 className="display mt-3 text-[34px]">{data.event.name}</h1>
      <p className="mt-2 text-[14.5px] text-ink-soft">
        {companies.length} organisation{companies.length === 1 ? "" : "s"} on record
        {fresh.length > 0 && ` · ${fresh.length} first seen in the last 7 days`}
      </p>

      {fresh.length > 0 && (
        <div className="mt-7 rounded-2xl border-2 border-coral bg-peach/40 px-6 py-5">
          <h2 className="text-[17px] font-semibold">New this week</h2>
          <p className="mt-1 text-[14.5px] leading-relaxed text-ink-soft">
            These booked a booth recently. Budget is fresh and their days are still open.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {fresh.slice(0, 24).map((c) => (
              <li
                key={c.id}
                className="rounded-full border-2 border-sand bg-card px-3 py-1 text-[13.5px] font-medium"
              >
                {c.name}
                {c.booth && <span className="ml-1.5 text-ink-soft">{c.booth}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 overflow-x-auto rounded-2xl border-2 border-sand bg-card">
        <table className="w-full text-[14.5px]">
          <thead>
            <tr className="border-b-2 border-sand text-left text-[12.5px] font-semibold text-ink-soft">
              <th className="px-5 py-3">Organisation</th>
              <th className="px-5 py-3">Booth</th>
              <th className="px-5 py-3">Score</th>
              <th className="px-5 py-3">First seen</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-b border-sand/70 last:border-0">
                <td className="px-5 py-2.5">
                  {c.website ? (
                    <a
                      href={c.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="hover:text-teal hover:underline underline-offset-2"
                    >
                      {c.name}
                    </a>
                  ) : (
                    c.name
                  )}
                </td>
                <td className="px-5 py-2.5 text-ink-soft">{c.booth ?? "—"}</td>
                <td className="px-5 py-2.5 text-ink-soft">
                  {c.icp_score != null ? (
                    <span title={c.icp_reason ?? ""}>{c.icp_score}/10</span>
                  ) : (
                    "not scored"
                  )}
                </td>
                <td className="px-5 py-2.5 text-ink-soft">
                  {new Date(c.first_seen_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.harvests.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[15px] font-semibold">Check history</h2>
          <ul className="mt-3 space-y-1.5">
            {data.harvests.map((h: { id: string; ran_at: string; total_found: number; new_count: number; method: string }) => (
              <li key={h.id} className="text-[13.5px] text-ink-soft">
                {new Date(h.ran_at).toLocaleString()} — found {h.total_found}
                {h.new_count > 0 ? `, ${h.new_count} new` : ", nothing new"} ({h.method})
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
