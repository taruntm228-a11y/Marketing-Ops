# Lanyard

Turn a conference's public exhibitor directory into a scored outreach list, six weeks before the doors open.

Phase 1 of the build plan in `architecture.md`. It harvests and displays. It does not yet score, write, or send.

---

## Run it on your Mac

You need Node 18 or newer. Check with `node --version`. If that errors, install Node from [nodejs.org](https://nodejs.org).

```bash
npm install
npm run dev
```

Open http://localhost:3000.

No API keys needed to try it. Without a key it uses the structural parser, which reads most directories perfectly well.

---

## What works right now

- **Homepage** → button to the customer form
- **`/icp`** → describe your ideal customer. Saved in your browser for now, moves to a database in Phase 2.
- **`/harvest`** → paste a directory URL, get a table of every organisation on it, export to CSV.

Every row carries the URL it came from, the time it was read, and the literal text on the page it was read from. That provenance is what makes the outreach defensible later.

---

## Two ways it reads a page

**Structural** (default, free, instant). Directory pages are machine-generated, so the same markup repeats once per exhibitor. The parser finds the biggest repeating group — a long table or a cluster of identical links — and reads it. It doesn't care whether the site is a2z, MapYourShow, ExpoFP or something custom.

**AI** (when a key is set). Hands the page text to a model and asks it to extract rows. The catch with models is that they will invent plausible companies, so this one never asks the model to recall anything. Every row must come with an `evidence` string copied verbatim from the page. If that string isn't findable in the source text, **the row is thrown away and counted as rejected**. You'll see the rejected count in the results.

If the model finds materially fewer rows than the plain parser, the app keeps the parser's answer.

---

## Adding a key

```bash
cp .env.example .env.local
```

Then open `.env.local` and paste in one key. [Google AI Studio](https://aistudio.google.com/apikey) has a free tier and is the one to start with.

**`.env.local` is git-ignored and must stay that way.** A key pushed to a public repo gets found by scanners within minutes. The `.gitignore` already handles this — don't edit that section.

On Vercel the same variables go in **Settings → Environment Variables**. Vercel never reads your `.env.local`.

---

## Deploying

1. Push this repo to GitHub
2. At [vercel.com](https://vercel.com), sign in **with GitHub**, then Add New → Project → import the repo
3. Accept the defaults and deploy

Every `git push` after that redeploys automatically.

Vercel's free Hobby plan is licensed for personal, non-commercial use. Fine for a portfolio project. The moment there's a paying customer it's $20/month for Pro.

---

## Tests

```bash
npm test
```

15 checks against fixture pages shaped like real directories — a table-based one, a card grid, a sponsor list, and a page with no directory on it at all. The last one matters: it proves the parser returns nothing rather than guessing.

Fixtures live in `test/fixtures.ts`. When a real directory parses badly, paste its HTML in as a new fixture, write the assertion you want, then fix the parser until it passes.

---

## Layout

```
app/
  page.tsx              homepage
  icp/page.tsx          customer profile form
  harvest/page.tsx      paste a URL, see the table
  api/harvest/route.ts  fetch → parse → respond
lib/
  types.ts              every shape in the app
  html.ts               fetching, HTML→text, noise filtering
  extract-structural.ts the no-AI parser
  extract-ai.ts         the AI parser and its hallucination guard
  ai.ts                 thin wrapper over Google / Anthropic
  icp-store.ts          browser storage (temporary)
test/
  fixtures.ts           fake directory pages
  run.ts                the checks
```

---

## Known limits

- **JavaScript-rendered directories return nothing.** Some sites draw their list after the page loads, so there's no list in the HTML we fetch. The app tells you when it thinks this happened. Phase 2 can add a headless browser.
- **Some organisers block automated requests** and return 403. The app reports this plainly rather than failing silently.
- **No contact emails yet.** That's Phase 4, and it's where free tiers get thin.
- **Role labels are weak without a model.** The structural parser marks everything `unknown`.
