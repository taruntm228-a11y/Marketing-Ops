"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type NewCompany = {
  name: string;
  booth: string | null;
  score: number | null;
  reason: string | null;
};

type Report = {
  event: string;
  eventId: string;
  found: number;
  newCount: number;
  newCompanies: NewCompany[];
  error?: string;
};

type WatchResult = {
  summary?: string;
  checked?: number;
  totalNew?: number;
  scored?: boolean;
  reports?: Report[];
  message?: string;
  error?: string;
};

export function WatchNow({ trackedCount }: { trackedCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WatchResult | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/watch");
      if (res.status === 401) {
        setResult({ error: "This check is locked to the morning schedule." });
        return;
      }
      setResult((await res.json()) as WatchResult);
      router.refresh();
    } catch (err) {
      setResult({ error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (trackedCount === 0) return null;

  return (
    <section className="mt-10 rounded-2xl border-2 border-sand bg-card px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="text-[17px] font-semibold">The morning check</h2>
          <p className="mt-1 max-w-[52ch] text-[14.5px] leading-relaxed text-ink-soft">
            Every day at 6:12am, Lanyard re-reads each show above and tells you who booked a booth
            since yesterday. You can also run it now.
          </p>
        </div>
        <button className="btn-primary" disabled={busy} onClick={run}>
          {busy ? "Checking…" : "Check now"}
        </button>
      </div>

      {busy && (
        <p className="mt-4 text-[13.5px] text-ink-soft">
          Re-reading {trackedCount} show{trackedCount === 1 ? "" : "s"} and scoring anything new.
        </p>
      )}

      {result && (
        <div className="mt-5 border-t-2 border-sand pt-5">
          {result.error ? (
            <p className="text-[14.5px] text-coral">{result.error}</p>
          ) : (
            <>
              <p className="text-[15px] font-semibold">
                {result.message ?? result.summary}
              </p>

              {result.reports?.map((r) => (
                <div key={r.eventId} className="mt-4">
                  <p className="text-[14px]">
                    <Link href={`/events/${r.eventId}`} className="font-medium hover:text-teal">
                      {r.event}
                    </Link>{" "}
                    <span className="text-ink-soft">
                      {r.error
                        ? `— ${r.error}`
                        : r.newCount > 0
                          ? `— ${r.newCount} new of ${r.found}`
                          : `— ${r.found} on the floor, nothing new`}
                    </span>
                  </p>

                  {r.newCompanies.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {r.newCompanies.slice(0, 15).map((c) => (
                        <li key={c.name} className="flex items-baseline gap-2.5 text-[14px]">
                          {c.score != null && (
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[12.5px] font-semibold ${
                                c.score >= 7
                                  ? "bg-teal text-paper"
                                  : "bg-peach/60 text-ink-soft"
                              }`}
                            >
                              {c.score}
                            </span>
                          )}
                          <span className="font-medium">{c.name}</span>
                          {c.booth && <span className="text-[13px] text-ink-soft">{c.booth}</span>}
                          {c.reason && (
                            <span className="text-[13px] text-ink-soft">{c.reason}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              {result.scored === false && (result.totalNew ?? 0) > 0 && (
                <p className="mt-4 text-[13px] text-ink-soft">
                  New arrivals weren&rsquo;t scored — no customer profile saved yet.{" "}
                  <Link href="/icp" className="underline underline-offset-2 hover:text-teal">
                    Fill it in
                  </Link>
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
