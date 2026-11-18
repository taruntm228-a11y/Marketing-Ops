# Lanyard

Fill your calendar before the show.

Three in four trade show attendees decide which booths to visit before they arrive. Lanyard works the six weeks before the doors open: it reads a show's public exhibitor directory, ranks it against your ideal customer, and tells you every morning who booked a booth since yesterday.

Live at **[lanyard-show.vercel.app](https://lanyard-show.vercel.app)**.

---

## What it does

| Page | What happens there |
|---|---|
| `/icp` | Describe your ideal customer. Saved once, used for every show. |
| `/harvest` | Paste a directory URL. Get every exhibitor, sponsor and speaker on it. |
| `/events` | Shows you're tracking, plus the morning check. |
| `/events/[id]` | One show: the full floor, ranked, with new arrivals pulled to the top. |

---

## The idea it rests on

A chat window can read a directory page too. What it cannot do is tell you **what changed**, because it wasn't there yesterday.

Exhibitor lists keep growing until the show opens. A company that booked a booth this week has budget just approved and three empty days in its calendar, and nobody has contacted it yet. That fact only exists if something was watching last week.

So every row carries `first_seen_at`. "New since Tuesday" is one indexed query, and it stays cheap whether you track one show or fifty.

---

## Running it

Node 18+.

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 15 checks against fixture directories
```

It works with no API keys at all — harvesting falls back to the structural parser. Keys unlock scoring and the morning check.

### Keys

```bash
cp .env.example .env.local
```

| Variable | For | Free? |
|---|---|---|
| `GOOGLE_AI_API_KEY` | Scoring and AI extraction | Yes — [AI Studio](https://aistudio.google.com/apikey) |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Remembering anything | Yes |
| `CRON_SECRET` | Locks `/api/watch` to the schedule | n/a |

`.env.local` is git-ignored and must stay that way. On Vercel the same names go in **Settings → Environment Variables**.

### Database

Run `supabase/schema.sql` in the Supabase SQL editor. Safe to re-run.

Note the grants at the bottom. Newer Supabase projects don't automatically give `service_role` table privileges, and without them every query fails `42501: permission denied` even though the key authenticates fine. RLS and SQL grants are two separate locks.

---

## How a page gets read

**Structural** (default, free, instant). Directory pages are machine-generated, so the same markup repeats once per exhibitor. The parser finds the largest repeating group — a long table, or a cluster of links pointing into the same folder at the same DOM depth — and reads it. Platform-agnostic: a2z, MapYourShow, ExpoFP and custom sites all work without a parser each.

**AI** (when a key is set). Hands the page text to a model. Models will invent plausible companies, so this one never asks for recall: every row must carry an `evidence` string copied verbatim from the page, and a row whose evidence can't be found in the source is discarded and counted as rejected.

If the model under-reads the page relative to the plain parser, the parser's answer wins.

### Things that bit us

**Gemini counts thinking tokens against `maxOutputTokens`,** and it's a hard cutoff — hit it mid-reasoning and the answer comes back truncated or empty with `finishReason: MAX_TOKENS`. Fixed with `thinkingConfig.thinkingLevel` (the Gemini 3 spelling; `thinkingBudget` is 2.5's and errors). Chunks are sized by expected *output*, not input.

**Truncation isn't fatal.** A cut-off JSON array still holds whole records, so `salvageObjects` keeps every object whose braces balance instead of discarding the chunk.

**Supabase secret keys aren't JWTs.** They go on the `apikey` header. We talk to PostgREST directly rather than through the SDK.

---

## Layout

```
app/
  icp/            customer profile form
  harvest/        paste a URL
  events/         tracking + the morning check
  api/
    harvest/      fetch → parse → save
    score/        rank a floor against the profile
    watch/        the Watcher (scheduled)
    icp/          read and write the profile
    db-check/     what Postgres actually says
    ai-check/     what the model actually returns
lib/
  harvest.ts      shared by the route and the schedule
  extract-structural.ts   the no-AI parser
  extract-ai.ts   the AI parser and its hallucination guard
  score.ts        ranking against the profile
  ai.ts           model wrapper, truncation handling, JSON salvage
  db.ts           PostgREST
test/             fixtures and checks
```

Both diagnostic endpoints exist because guessing at a failure cost an evening, twice. They report what the service actually said.

---

## Known limits

- **JavaScript-rendered directories return nothing.** Some sites draw their list after load, so there's no list in the HTML we fetch. The app says so when it detects it.
- **Some organisers return 403** to automated requests. Reported plainly rather than failing silently.
- **No contact emails yet.** That's the next phase, and it's where free tiers get thin.
- **One customer profile.** No accounts yet, so one profile per deployment.
- **The free Gemini tier is 500 requests a day.** Roughly 80 harvests, or a lot more scoring. Enough for now, not forever.
