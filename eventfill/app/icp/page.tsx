"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EMPTY_ICP, type IcpProfile } from "@/lib/types";
import { loadIcp, saveIcp } from "@/lib/icp-store";

type FieldSpec = {
  key: keyof IcpProfile;
  label: string;
  hint: string;
  placeholder: string;
  rows?: number;
};

const FIELDS: FieldSpec[] = [
  {
    key: "companyName",
    label: "Your company",
    hint: "Used in the drafts later, so write it the way you'd sign an email.",
    placeholder: "Midwest Conveyor Systems",
  },
  {
    key: "whatYouSell",
    label: "What you sell, in a sentence",
    hint: "Plain language. Whatever you'd say to someone at a booth.",
    placeholder: "Conveyor retrofits that cut changeover time on existing packaging lines.",
    rows: 2,
  },
  {
    key: "exampleCustomers",
    label: "Five customers you'd like fifty more of",
    hint: "Websites, one per line. This does more work than any description — real examples beat an abstract profile every time.",
    placeholder: "acmefoods.com\nnorthstarbev.com\nlakesidepack.com",
    rows: 4,
  },
  {
    key: "industries",
    label: "Industries that fit",
    hint: "",
    placeholder: "Food and beverage manufacturing, contract packaging",
    rows: 2,
  },
  {
    key: "sizeBand",
    label: "Company size",
    hint: "",
    placeholder: "50–500 employees, or one to three production sites",
  },
  {
    key: "geography",
    label: "Where they are",
    hint: "",
    placeholder: "US Midwest and Great Lakes",
  },
  {
    key: "titles",
    label: "Who you need to reach",
    hint: "Job titles, not names.",
    placeholder: "Plant Manager, VP Operations, Director of Engineering",
    rows: 2,
  },
  {
    key: "disqualifiers",
    label: "Who to rule out",
    hint: "The most valuable box on this page. Existing customers, competitors, anyone already in your pipeline, anyone too small to afford you. Half your list quality comes from here.",
    placeholder:
      "Existing customers\nCompetitors (anyone selling conveyor equipment)\nDistributors and resellers\nUnder 25 employees",
    rows: 4,
  },
];

export default function IcpPage() {
  const router = useRouter();
  // Starts empty on both server and client (so no hydration mismatch), then
  // fills in from storage once we're in the browser. No loading gate needed.
  const [icp, setIcp] = useState<IcpProfile>(EMPTY_ICP);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setIcp(loadIcp());
  }, []);

  function update(key: keyof IcpProfile, value: string) {
    setIcp((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function handleSave(thenGo: boolean) {
    saveIcp(icp);
    setSaved(true);
    if (thenGo) router.push("/harvest");
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Describe your customer</h1>
      <p className="mt-3 text-muted leading-relaxed">
        You fill this in once. Every event you run after this gets scored against it. Nothing here
        has to be perfect — you&rsquo;ll see the scores and the reasoning, and you can come back
        and sharpen it.
      </p>

      <form
        className="mt-10 space-y-7"
        onSubmit={(e) => {
          e.preventDefault();
          handleSave(true);
        }}
      >
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="label" htmlFor={f.key}>
              {f.label}
            </label>
            {f.hint && <p className="hint">{f.hint}</p>}
            {f.rows ? (
              <textarea
                id={f.key}
                className="field resize-y"
                rows={f.rows}
                value={icp[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => update(f.key, e.target.value)}
              />
            ) : (
              <input
                id={f.key}
                className="field"
                value={icp[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => update(f.key, e.target.value)}
              />
            )}
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
          <button type="submit" className="btn-primary">
            Save and pick an event
          </button>
          <button type="button" className="btn-ghost" onClick={() => handleSave(false)}>
            Save
          </button>
          {saved && <span className="text-sm text-accent">Saved.</span>}
          <Link href="/harvest" className="ml-auto text-sm text-muted hover:text-ink">
            Skip for now
          </Link>
        </div>
      </form>

      <p className="mt-8 text-xs leading-relaxed text-muted">
        Stored in this browser for now, not on a server. Phase 2 moves it to an account.
      </p>
    </div>
  );
}
