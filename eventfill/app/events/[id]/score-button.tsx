"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Result = {
  scored?: number;
  written?: number;
  considered?: number;
  message?: string;
  notes?: string[];
  error?: string;
};

export function ScoreButton({ eventId, unscored }: { eventId: string; unscored: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function run(rescore: boolean) {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, rescore }),
      });
      const data = (await res.json()) as Result;
      setResult(data);
      if (res.ok) router.refresh(); // pull the new scores into the table
    } catch (err) {
      setResult({ error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-7">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={busy} onClick={() => run(false)}>
          {busy
            ? "Scoring…"
            : unscored > 0
              ? `Score ${unscored} unscored`
              : "Everything is scored"}
        </button>
        <button className="btn-small" disabled={busy} onClick={() => run(true)}>
          Score all again
        </button>
        {busy && (
          <span className="text-[13.5px] text-ink-soft">
            Takes a minute for a big floor.
          </span>
        )}
      </div>

      {result && (
        <div className="mt-4 rounded-2xl border-2 border-sand bg-card px-5 py-4 text-[14.5px]">
          {result.error ? (
            <p className="text-coral">{result.error}</p>
          ) : (
            <p>
              {result.message ??
                `Scored ${result.scored} of ${result.considered}, saved ${result.written}.`}
            </p>
          )}
          {result.notes?.map((n, i) => (
            <p key={i} className="mt-1.5 text-[13px] text-ink-soft">
              {n}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
