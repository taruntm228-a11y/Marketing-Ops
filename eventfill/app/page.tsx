import Link from "next/link";

const STATIONS = [
  { n: "1", t: "Describe your customer", d: "Once. It applies to every event after that." },
  { n: "2", t: "Pick an event", d: "Paste the link to its public exhibitor directory." },
  { n: "3", t: "Harvest", d: "Every exhibitor, sponsor and speaker on the page." },
  { n: "4", t: "Score", d: "Each one rated against your customer, with a reason you can check." },
  { n: "5", t: "Write", d: "Drafts that name the event, the date and a time slot." },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-6">
      <section className="py-16 sm:py-24">
        <p className="text-sm font-medium text-accent mb-3">Pre-show outreach</p>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight max-w-2xl leading-[1.1]">
          Fill your calendar before you get on the plane.
        </h1>
        <p className="mt-5 max-w-xl text-muted leading-relaxed">
          Three out of four attendees decide which booths to visit before they arrive. This turns
          a conference&rsquo;s public directory into a scored shortlist and a set of drafted
          emails, six weeks out, so you walk in with meetings already booked.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/icp" className="btn-primary">
            Describe your customer
          </Link>
          <Link href="/harvest" className="btn-ghost">
            Skip ahead and try an event
          </Link>
        </div>
      </section>

      <section className="pb-20">
        <h2 className="text-sm font-medium text-muted mb-5">How it runs</h2>
        <ol className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-5">
          {STATIONS.map((s) => (
            <li key={s.n} className="bg-panel p-5">
              <div className="mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                {s.n}
              </div>
              <h3 className="text-sm font-medium leading-snug">{s.t}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{s.d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-muted leading-relaxed max-w-2xl">
          It does not send the emails. You review the drafts and send them from your own inbox —
          which keeps your sending reputation yours, and keeps the list honest.
        </p>
      </section>
    </div>
  );
}
