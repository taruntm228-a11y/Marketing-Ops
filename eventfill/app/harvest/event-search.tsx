"use client";

import { useState } from "react";

export type Candidate = {
  url: string;
  title: string;
  platform: string | null;
  score: number;
  names: number | null;
  why: string;
};

type Outcome = {
  candidates?: Candidate[];
  notes?: string[];
  configured?: boolean;
  error?: string;
};

const EXAMPLES = ["BICSI Winter 2027", "FABTECH 2026", "SLAS 2026"];

/**
 * Search by event name instead of hunting for the directory URL.
 *
 * The candidates come back with a count of how many names a quick read found,
 * which is the whole reason this is better than typing the same thing into
 * Google: the list is already checked before anyone clicks.
 */
export function EventSearch({
  onPick,
  busy,
}: {
  onPick: (url: string, name: string) => void;
  busy: boolean;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function search(q: string) {
    setSearching(true);
    setOutcome(null);
    try {
      const res = await fetch("/api/search-event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      setOutcome((await res.json()) as Outcome);
    } catch (err) {
      setOutcome({ error: (err as Error).message });
    } finally {
      setSearching(false);
    }
  }

  const candidates = outcome?.candidates ?? [];

  return (
    <div>
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) search(query.trim());
        }}
      >
        <input
          className="field flex-1"
          placeholder="HLTH 2027, FABTECH, BICSI Winter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={searching || busy}
          aria-label="Event name"
        />
        <button className="btn-primary sm:w-36" disabled={searching || busy || !query.trim()}>
          {searching ? "Looking…" : "Find it"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        <span>Try:</span>
        {EXAMPLES.map((e) => (
          <button
            key={e}
            type="button"
            className="rounded border border-sand px-2 py-1 hover:bg-peach/40 hover:text-ink"
            onClick={() => {
              setQuery(e);
              search(e);
            }}
            disabled={searching || busy}
          >
            {e}
          </button>
        ))}
      </div>

      {searching && (
        <p className="mt-6 text-[14px] text-ink-soft">
          Searching, then opening the best matches to count how many names each one actually has.
        </p>
      )}

      {outcome?.error && (
        <div className="mt-6 rounded-2xl border-2 border-coral bg-peach/40 px-5 py-3.5 text-[14.5px]">
          {outcome.error}
        </div>
      )}

      {outcome?.configured === false && (
        <div className="mt-6 rounded-2xl border-2 border-sand bg-peach/40 px-5 py-3.5 text-[14.5px]">
          <span className="font-semibold">Search isn&rsquo;t switched on yet.</span>{" "}
          <span className="text-ink-soft">Paste the directory link below instead.</span>
        </div>
      )}

      {candidates.length > 0 && (
        <ul className="mt-6 space-y-3">
          {candidates.map((c) => (
            <li
              key={c.url}
              className="rounded-2xl border-2 border-sand bg-card px-5 py-4 transition-colors hover:border-teal/50"
            >
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-snug">{c.title}</p>

                  <p className="mt-1 truncate font-mono text-[12px] text-ink-soft">{c.url}</p>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                    {c.names != null && c.names > 0 ? (
                      <span className="rounded-full bg-teal px-2.5 py-0.5 text-[12.5px] font-semibold text-paper">
                        {c.names} names found
                      </span>
                    ) : c.names === 0 ? (
                      <span className="rounded-full bg-peach/70 px-2.5 py-0.5 text-[12.5px] font-medium text-ink-soft">
                        no names on a quick read
                      </span>
                    ) : null}

                    {c.platform && <span className="text-ink-soft">{c.platform}</span>}
                    <span className="text-ink-soft">{c.why}</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="btn-small"
                  >
                    Open
                  </a>
                  <button
                    className="btn-primary !px-4 !py-2 !text-[14px]"
                    disabled={busy}
                    onClick={() => onPick(c.url, query.trim() || c.title)}
                  >
                    Read this
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {outcome?.notes?.length ? (
        <ul className="mt-4 space-y-1.5">
          {outcome.notes.map((n, i) => (
            <li key={i} className="text-[13px] leading-relaxed text-ink-soft">
              — {n}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
