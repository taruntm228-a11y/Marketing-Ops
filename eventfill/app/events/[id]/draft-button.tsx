"use client";

import { useState } from "react";
import Link from "next/link";

type Draft = {
  company: string;
  booth: string | null;
  score: number | null;
  subject: string;
  body: string;
  angle: string;
  warnings: string[];
};

type Result = {
  drafts?: Draft[];
  notes?: string[];
  event?: string;
  error?: string;
};

export function DraftButton({ eventId, scored }: { eventId: string; scored: number }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, limit: 10, minScore: 7 }),
      });
      setResult((await res.json()) as Result);
    } catch (err) {
      setResult({ error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function copy(d: Draft) {
    try {
      await navigator.clipboard.writeText(`Subject: ${d.subject}\n\n${d.body}`);
      setCopied(d.company);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* a browser that blocks the clipboard is not worth an error message */
    }
  }

  const drafts = result?.drafts ?? [];

  return (
    <section className="mt-10 rounded-2xl border-2 border-sand bg-card px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="text-[17px] font-semibold">The first email</h2>
          <p className="mt-1 max-w-[56ch] text-[14.5px] leading-relaxed text-ink-soft">
            One draft for each company scoring 7 or above. Written only from what the directory
            actually says — the name, the booth, the category — so there is nothing in them to
            walk back.
          </p>
        </div>
        <button className="btn-primary" disabled={busy || scored === 0} onClick={run}>
          {busy ? "Writing…" : "Draft the top 10"}
        </button>
      </div>

      {scored === 0 && (
        <p className="mt-4 text-[13.5px] text-ink-soft">Score the floor first and these appear.</p>
      )}

      {busy && (
        <p className="mt-4 text-[13.5px] text-ink-soft">
          Writing ten emails and checking each one for facts nobody gave it.
        </p>
      )}

      {result?.error && (
        <div className="mt-5 rounded-xl border-2 border-coral bg-peach/40 px-5 py-3.5 text-[14.5px]">
          {result.error}
          {result.error.includes("customer profile") && (
            <>
              {" "}
              <Link href="/icp" className="underline underline-offset-2 hover:text-teal">
                Fill it in
              </Link>
            </>
          )}
        </div>
      )}

      {drafts.length > 0 && (
        <ul className="mt-6 space-y-4">
          {drafts.map((d) => (
            <li key={d.company} className="rounded-xl border-2 border-sand bg-paper px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  {d.score != null && (
                    <span className="rounded-full bg-teal px-2 py-0.5 text-[12.5px] font-semibold text-paper">
                      {d.score}
                    </span>
                  )}
                  <span className="text-[15px] font-semibold">{d.company}</span>
                  {d.booth && <span className="text-[13px] text-ink-soft">booth {d.booth}</span>}
                  {d.angle && <span className="text-[13px] text-ink-soft">· {d.angle}</span>}
                </div>
                <button className="btn-small" onClick={() => copy(d)}>
                  {copied === d.company ? "Copied" : "Copy"}
                </button>
              </div>

              <p className="mt-3 text-[14.5px] font-medium">{d.subject}</p>
              <p className="mt-1.5 whitespace-pre-wrap text-[14.5px] leading-relaxed text-ink-soft">
                {d.body}
              </p>

              {d.warnings.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-sand pt-2.5">
                  {d.warnings.map((w, i) => (
                    <li key={i} className="text-[13px] text-coral">
                      check before sending — {w}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {result?.notes?.length ? (
        <ul className="mt-5 space-y-1.5">
          {result.notes.map((n, i) => (
            <li key={i} className="text-[13px] leading-relaxed text-ink-soft">
              — {n}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
