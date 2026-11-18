import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { listEvents } from "@/lib/db";
import { WatchNow } from "./watch-now";

type EventRow = {
  id: string;
  name: string;
  source_url: string;
  created_at: string;
  companies?: { count: number }[];
  harvests?: { ran_at: string }[];
};

/**
 * Next 16 runs Cache Components, which prerenders a page by default and
 * rejects the old `export const dynamic`. The heading is static and ships
 * immediately; the list is request-time data, so it lives in its own async
 * component behind Suspense with connection() to opt out of prerendering.
 */
export default function EventsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="display text-[34px]">Shows you&rsquo;re tracking</h1>
      <p className="mt-3 max-w-[56ch] text-ink-soft leading-relaxed">
        Every harvest is kept, so the list can be compared against itself later. That comparison
        is how you find out who booked a booth this week.
      </p>

      <Suspense fallback={<p className="mt-10 text-[15px] text-ink-soft">Loading…</p>}>
        <EventList />
      </Suspense>
    </div>
  );
}

async function EventList() {
  await connection();
  const events = (await listEvents()) as unknown as EventRow[];

  if (events.length === 0) {
    return (
      <div className="mt-10 rounded-2xl border-2 border-dashed border-sand px-7 py-10">
        <p className="text-[17px] font-semibold">Nothing tracked yet.</p>
        <p className="mt-2 max-w-[48ch] text-[15px] leading-relaxed text-ink-soft">
          Harvest a show and it will appear here. If you have already harvested one and this is
          still empty, the database tables probably haven&rsquo;t been created yet.
        </p>
        <Link href="/harvest" className="btn-primary mt-6">
          Find an event
        </Link>
      </div>
    );
  }

  return (
    <>
    <ul className="mt-10 space-y-3">
      {events.map((e) => {
        const count = e.companies?.[0]?.count ?? 0;
        const last = e.harvests?.length ? e.harvests.map((h) => h.ran_at).sort().at(-1) : null;
        return (
          <li key={e.id}>
            <Link
              href={`/events/${e.id}`}
              className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rounded-2xl border-2 border-sand bg-card px-6 py-5 transition-colors hover:border-teal"
            >
              <span className="text-[18px] font-semibold">{e.name}</span>
              <span className="text-[14px] text-ink-soft">
                {count} organisation{count === 1 ? "" : "s"}
                {last && ` · last checked ${new Date(last).toLocaleDateString()}`}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
    <WatchNow trackedCount={events.length} />
    </>
  );
}
