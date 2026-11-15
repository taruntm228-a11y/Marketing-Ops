import Link from "next/link";
import { FloorScene, HangingBadge } from "./art";

const STATIONS = [
  {
    kind: "person" as const,
    tilt: -4,
    title: "Say who you want",
    body: "Once. Every event after that gets measured against it.",
  },
  {
    kind: "pin" as const,
    tilt: 3,
    title: "Pick a show",
    body: "Paste the link to its public exhibitor list.",
  },
  {
    kind: "list" as const,
    tilt: -2,
    title: "Pull the floor",
    body: "Every exhibitor, sponsor and speaker on the page.",
  },
  {
    kind: "star" as const,
    tilt: 4,
    title: "Sort the room",
    body: "Each one rated, with a reason you can argue with.",
  },
  {
    kind: "calendar" as const,
    tilt: -3,
    title: "Fill the days",
    body: "Drafts that name the show, the date and a time.",
  },
];

export default function Home() {
  return (
    <div>
      {/* ---------------- hero ---------------- */}
      <section className="mx-auto max-w-6xl px-6 pt-14 pb-10 lg:pt-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
          <div>
            <h1 className="display max-w-[13ch] text-[46px] sm:text-[58px] lg:text-[66px]">
              Three in four people already know which booths they&rsquo;re visiting.
            </h1>

            <p className="mt-7 max-w-[46ch] text-[18px] leading-relaxed text-ink-soft">
              They decide before they get on the plane. Lanyard turns a show&rsquo;s public
              directory into a shortlist worth writing to, six weeks out, while there is still
              room on their calendar.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/icp" className="btn-primary">
                Start with your customer
              </Link>
              <Link href="/harvest" className="btn-ghost">
                Try it on a show
              </Link>
            </div>
          </div>

          <FloorScene className="w-full" />
        </div>
      </section>

      {/* ---------------- the stations ---------------- */}
      <section className="relative mt-10 border-y-2 border-sand bg-peach/35 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="display max-w-[20ch] text-[30px] sm:text-[36px]">
            Five steps, and only the first one is work.
          </h2>

          <ol className="mt-12 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
            {STATIONS.map((s) => (
              <li key={s.title}>
                <HangingBadge kind={s.kind} tilt={s.tilt} className="h-32 w-auto" />
                <h3 className="mt-3 text-[17px] font-semibold leading-snug">{s.title}</h3>
                <p className="mt-1 text-[14.5px] leading-relaxed text-ink-soft">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- the honest bit ---------------- */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="display text-[30px] sm:text-[36px]">It doesn&rsquo;t send the email.</h2>
            <p className="mt-5 text-[17px] leading-relaxed text-ink-soft">
              You read the drafts and send them yourself, from your own inbox. Your sending
              reputation stays yours, and nothing goes out that you haven&rsquo;t looked at.
            </p>
          </div>

          <div>
            <h2 className="display text-[30px] sm:text-[36px]">And it shows its working.</h2>
            <p className="mt-5 text-[17px] leading-relaxed text-ink-soft">
              Every name carries the page it was read from, the date, and the line of text it
              came from. If a row can&rsquo;t point at a source, it gets thrown away rather than
              guessed at.
            </p>
          </div>
        </div>

        <div className="mt-14 rounded-3xl border-2 border-sand bg-card px-7 py-9 sm:px-10">
          <p className="display max-w-[24ch] text-[26px] sm:text-[30px]">
            Your booth is paid for either way.
          </p>
          <p className="mt-4 max-w-[52ch] text-[16.5px] leading-relaxed text-ink-soft">
            The question is whether anyone has a reason to walk to it. Six weeks is enough time
            to give them one.
          </p>
          <Link href="/icp" className="btn-primary mt-7">
            Start with your customer
          </Link>
        </div>
      </section>
    </div>
  );
}
