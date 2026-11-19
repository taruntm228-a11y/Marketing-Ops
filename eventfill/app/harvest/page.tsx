"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Company, HarvestResult, IcpProfile } from "@/lib/types";
import { EMPTY_ICP } from "@/lib/types";
import { hasIcp, loadIcp } from "@/lib/icp-store";
import { EventSearch } from "./event-search";

export default function HarvestPage() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HarvestResult | null>(null);
  const [icp, setIcp] = useState<IcpProfile>(EMPTY_ICP);
  const [query, setQuery] = useState("");
  const [showPaste, setShowPaste] = useState(false);

  useEffect(() => setIcp(loadIcp()), []);

  async function run(target: string, name?: string) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/harvest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: target, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong reading that page.");
      setResult(data as HarvestResult);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const rows =
    result?.companies.filter((c) =>
      query.trim() ? c.name.toLowerCase().includes(query.trim().toLowerCase()) : true
    ) ?? [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Find an event</h1>
      <p className="mt-3 max-w-2xl text-ink-soft leading-relaxed">
        Type the show&rsquo;s name. Lanyard finds its exhibitor list, opens the best matches to
        count how many names each one really has, and reads the one you pick.
      </p>

      {!hasIcp(icp) && (
        <div className="mt-6 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-2xl border-2 border-sand bg-peach/40 px-5 py-3.5 text-[14.5px]">
          <span className="font-semibold">No customer profile yet.</span>{" "}
          <span className="text-ink-soft">
            Harvesting works without one, but scoring needs it.
          </span>{" "}
          <Link href="/icp" className="underline underline-offset-2 hover:text-ink">
            Fill it in
          </Link>
        </div>
      )}

      <div className="mt-8">
        <EventSearch busy={busy} onPick={(u, name) => run(u, name)} />
      </div>

      <div className="mt-10 border-t-2 border-sand pt-6">
        {showPaste ? (
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) run(url.trim());
            }}
          >
            <input
              className="field flex-1 font-mono text-xs sm:text-sm"
              placeholder="https://someshow.com/exhibitors"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy}
              autoFocus
              aria-label="Directory URL"
            />
            <button className="btn-ghost sm:w-36" disabled={busy || !url.trim()}>
              {busy ? "Reading…" : "Read it"}
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="text-[14px] text-ink-soft underline underline-offset-2 hover:text-teal"
            onClick={() => setShowPaste(true)}
          >
            Already have the link? Paste it instead
          </button>
        )}
      </div>

      {busy && (
        <p className="mt-8 text-sm text-ink-soft">
          Fetching the page and reading it. Large directories take 30–60 seconds.
        </p>
      )}

      {error && (
        <div className="mt-8 rounded-2xl border-2 border-coral bg-peach/40 px-5 py-3.5 text-[14.5px] text-ink">
          {error}
        </div>
      )}

      {result && <Results result={result} rows={rows} query={query} setQuery={setQuery} />}
    </div>
  );
}

function Results({
  result,
  rows,
  query,
  setQuery,
}: {
  result: HarvestResult;
  rows: Company[];
  query: string;
  setQuery: (s: string) => void;
}) {
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium">
          {result.companies.length} organisation{result.companies.length === 1 ? "" : "s"}
          <span className="ml-2 text-xs font-normal text-ink-soft">
            read {result.method === "ai" ? "by model" : "structurally"} on{" "}
            {new Date(result.scrapedAt).toLocaleString()}
          </span>
        </h2>
        {result.companies.length > 0 && (
          <div className="flex items-center gap-2">
            <input
              className="field w-44 !py-1.5 text-[13px]"
              placeholder="Filter by name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="btn-small" onClick={() => downloadCsv(result.companies)}>
              Export CSV
            </button>
          </div>
        )}
      </div>

      {result.notes.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {result.notes.map((n, i) => (
            <li key={i} className="text-xs leading-relaxed text-ink-soft">
              — {n}
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-2xl border-2 border-sand bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand text-left text-xs uppercase tracking-wide text-ink-soft">
                <th className="px-4 py-2.5 font-medium">Organisation</th>
                <th className="px-4 py-2.5 font-medium">Booth</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={`${c.name}-${i}`} className="border-b border-sand/70 last:border-0">
                  <td className="px-4 py-2.5">
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
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-soft">{c.booth ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-soft">{c.category ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-soft">{c.role}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className="cursor-help text-xs text-ink-soft underline decoration-dotted underline-offset-2"
                      title={c.evidence}
                    >
                      evidence
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function downloadCsv(companies: Company[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = [
    "name",
    "website",
    "booth",
    "category",
    "role",
    "source_url",
    "scraped_at",
    "evidence",
  ];
  const lines = [
    header.join(","),
    ...companies.map((c) =>
      [c.name, c.website, c.booth, c.category, c.role, c.sourceUrl, c.scrapedAt, c.evidence]
        .map(esc)
        .join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `exhibitors-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
