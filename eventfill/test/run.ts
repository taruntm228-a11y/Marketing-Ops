import assert from "node:assert";
import { extractStructural } from "../lib/extract-structural";
import { htmlToText } from "../lib/html";
import { rank } from "../lib/search-event";
import { nameKey } from "../lib/db";
import { audit } from "../lib/draft";
import { A2Z_TABLE, CARD_GRID, SPONSOR_LIST, NOT_A_DIRECTORY } from "./fixtures";

let failures = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${(err as Error).message.split("\n")[0]}`);
  }
}

const BASE = "https://example-show.com/exhibitors";

console.log("\nStructural extractor\n");

test("reads a table directory and gets every row", () => {
  const rows = extractStructural(A2Z_TABLE, BASE);
  assert.equal(rows.length, 6, `expected 6 companies, got ${rows.length}`);
  assert.equal(rows[0].name, "Acme Press Brakes");
  assert.equal(rows[5].name, "Hoosier Metal Finishing");
});

test("picks up booth numbers from the right column", () => {
  const rows = extractStructural(A2Z_TABLE, BASE);
  assert.equal(rows[0].booth, "A1042");
  assert.equal(rows[4].booth, "D4001");
});

test("picks up the category column", () => {
  const rows = extractStructural(A2Z_TABLE, BASE);
  assert.equal(rows[0].category, "Bending");
  assert.equal(rows[2].category, "Packaging");
});

test("turns relative links into absolute ones", () => {
  const rows = extractStructural(A2Z_TABLE, BASE);
  assert.ok(
    rows[0].website?.startsWith("https://example-show.com/"),
    `got ${rows[0].website}`
  );
});

test("keeps nav and footer links out of a table directory", () => {
  const names = extractStructural(A2Z_TABLE, BASE).map((r) => r.name.toLowerCase());
  for (const junk of ["home", "login", "contact us", "privacy policy", "terms", "a", "b"]) {
    assert.ok(!names.includes(junk), `"${junk}" should not be a company`);
  }
});

test("reads a card grid with no table", () => {
  const rows = extractStructural(CARD_GRID, BASE);
  assert.equal(rows.length, 5, `expected 5 companies, got ${rows.length}`);
  assert.equal(rows[0].name, "Riverbend Controls");
});

test("finds booth numbers in a sibling element, not the link", () => {
  const rows = extractStructural(CARD_GRID, BASE);
  assert.equal(rows[0].booth, "418");
  assert.equal(rows[4].booth, "601");
});

test("keeps social links out of a card grid", () => {
  const names = extractStructural(CARD_GRID, BASE).map((r) => r.name.toLowerCase());
  assert.ok(!names.includes("twitter") && !names.includes("linkedin"));
});

test("reads a sponsor list across multiple tiers", () => {
  const rows = extractStructural(SPONSOR_LIST, BASE);
  assert.equal(rows.length, 5, `expected 5 sponsors, got ${rows.length}`);
  assert.equal(rows[0].name, "Meridian Packaging");
  assert.equal(rows[4].name, "Dunmore Industrial");
});

test("keeps external sponsor URLs intact", () => {
  const rows = extractStructural(SPONSOR_LIST, BASE);
  assert.equal(rows[0].website, "https://meridianpack.com/");
});

test("finds nothing on a page that is not a directory", () => {
  const rows = extractStructural(NOT_A_DIRECTORY, BASE);
  assert.equal(rows.length, 0, `expected 0, got ${rows.length}: ${rows.map((r) => r.name)}`);
});

test("stamps every row with its source and a timestamp", () => {
  const rows = extractStructural(A2Z_TABLE, BASE);
  for (const r of rows) {
    assert.equal(r.sourceUrl, BASE);
    assert.ok(!Number.isNaN(Date.parse(r.scrapedAt)), "scrapedAt must parse as a date");
    assert.ok(r.evidence.length > 0, "every row needs evidence");
  }
});

console.log("\nHTML to text\n");

test("strips scripts, nav and footer but keeps the names", () => {
  const text = htmlToText(A2Z_TABLE);
  assert.ok(text.includes("Acme Press Brakes"));
  assert.ok(!text.includes("Privacy Policy"), "footer should be gone");
});

test("puts each record on its own line", () => {
  const text = htmlToText(CARD_GRID);
  const line = text.split("\n").find((l) => l.includes("Riverbend"));
  assert.ok(line, "Riverbend should be on a line");
  assert.ok(!line!.includes("Pellsworth"), "records should not run together");
});

test("evidence snippets are findable in the page text — the AI guard works", () => {
  // This is the check the AI extractor runs against every row it is given.
  const text = htmlToText(A2Z_TABLE).toLowerCase().replace(/\s+/g, " ");
  for (const row of extractStructural(A2Z_TABLE, BASE)) {
    assert.ok(
      text.includes(row.name.toLowerCase()),
      `"${row.name}" must be findable in the page text`
    );
  }
});

console.log("\nCompany identity (must match the SQL generated column)\n");

test("the three real Longtek spellings are one company", () => {
  const keys = new Set(
    [
      "Longtek Technology (Thailand) CO., LTD",
      "Longtek Technology (Thailand) Co., Ltd",
      "LONGTEK TECHNOLOGY (THAILAND) CO., LTD.",
      "Longtek  Technology  (Thailand)  Co.,  Ltd.",
    ].map(nameKey)
  );
  assert.equal(keys.size, 1, `expected one key, got ${[...keys].join(" | ")}`);
});

test("Inc and Ltd at different booths stay different companies", () => {
  assert.notEqual(
    nameKey("Riverbend Controls Inc"),
    nameKey("Riverbend Controls Ltd"),
    "stripping the legal suffix would merge two real companies"
  );
});

test("punctuation around a suffix does not split a company", () => {
  assert.equal(nameKey("Riverbend Controls Inc"), nameKey("Riverbend Controls, Inc."));
});

test("accents survive, so two foreign names are not merged", () => {
  assert.notEqual(nameKey("Société Générale"), nameKey("Societe Generale Americas"));
  assert.ok(nameKey("Société Générale").includes("é"), "accents should not be stripped");
});

test("an ampersand reads the same as the space it replaces", () => {
  assert.equal(nameKey("A&B Cabling"), nameKey("A B Cabling"));
  assert.equal(nameKey("Smith & Co"), nameKey("Smith Co"));
});

test("a known limit: punctuation inside a word still splits it", () => {
  // "3M" and "3-M" do not match, because punctuation becomes a space rather
  // than nothing. Collapsing it to nothing instead would fix this rare case
  // and break the common one — "Smith & Co" would stop matching "Smith Co".
  // Verified against PostgreSQL 16: the database does exactly the same thing,
  // which is the property that matters.
  assert.notEqual(nameKey("3M"), nameKey("3-M"));
  assert.equal(nameKey("3-M"), "3 m");
});

test("the key matches what Postgres produced for these rows", () => {
  // Verified against PostgreSQL 16 running
  //   lower(btrim(regexp_replace(name, '[[:punct:][:space:]]+', ' ', 'g')))
  const expected: [string, string][] = [
    ["Longtek Technology (Thailand) CO., LTD", "longtek technology thailand co ltd"],
    ["Riverbend Controls, Inc.", "riverbend controls inc"],
    ["Acme  Press   Brakes", "acme press brakes"],
    ["Construction Monkey", "construction monkey"],
  ];
  for (const [input, want] of expected) {
    assert.equal(nameKey(input), want, `"${input}"`);
  }
});

console.log("\nDraft audit (catching facts nobody supplied)\n");

const ALLOWED = ["1520", "BICSI Winter 2027", "Longtek Technology", "Acme Cabling", "2026", "2027"];

test("a clean draft raises nothing", () => {
  const w = audit(
    "Both at BICSI Winter 2027 — booth 1520. [first name], we fit out cable plant for data centres and I would rather talk for ten minutes at the show than send a deck. Free on the Tuesday? [your name]",
    ALLOWED
  );
  assert.deepEqual(w, [], `unexpected: ${w.join("; ")}`);
});

test("an invented statistic is caught", () => {
  const w = audit("You could cut install time 40% across your 200-person team.", ALLOWED);
  assert.ok(
    w.some((x) => x.includes("40") && x.includes("200")),
    `expected both numbers flagged, got: ${w.join("; ")}`
  );
});

test("the booth number and the event year are not flagged", () => {
  assert.deepEqual(audit("See you at booth 1520 in 2027.", ALLOWED), []);
});

test("an invented dollar figure is caught", () => {
  assert.ok(audit("Since your $2M round closed...", ALLOWED).length > 0);
});

test("fake familiarity is caught", () => {
  for (const phrase of [
    "I noticed you are expanding",
    "I saw your new product",
    "I've been following your work",
    "I came across your site",
  ]) {
    assert.ok(audit(phrase, ALLOWED).length > 0, `missed: "${phrase}"`);
  }
});

test("filler phrases are caught", () => {
  assert.ok(audit("Hope this finds you well — wanted to reach out.", ALLOWED).length >= 2);
});

test("an over-long draft is flagged", () => {
  const w = audit("word ".repeat(120), ALLOWED);
  assert.ok(w.some((x) => x.includes("words")), `got: ${w.join("; ")}`);
});

test("a trailing full stop does not turn a known booth into an invention", () => {
  assert.deepEqual(audit("Find us opposite 1520.", ALLOWED), []);
});

console.log("\nEvent search ranking\n");

const score = (url: string, title = "", snippet = "") => rank(url, title, snippet).score;

test("a real a2z exhibitor list beats the organiser's own pitch page", () => {
  const real = score(
    "https://s36.a2zinc.net/clients/BICSI/Winter2027/Public/exhibitors.aspx?Index=All",
    "Exhibitor List - BICSI Winter 2027"
  );
  const pitch = score(
    "https://www.bicsi.org/conferences/winter/become-an-exhibitor",
    "Become an Exhibitor | BICSI Winter 2027"
  );
  assert.ok(real > pitch, `list ${real} should beat pitch ${pitch}`);
});

test("'exhibitor resources' loses to the actual list", () => {
  const list = score("https://show.com/exhibitor-directory", "Exhibitor Directory");
  const admin = score("https://show.com/exhibitor-resources", "Exhibitor Resources");
  assert.ok(list > admin, `list ${list} should beat admin ${admin}`);
});

test("an aggregator does not outrank the organiser", () => {
  const real = score("https://slas2026.expofp.com/", "SLAS 2026 Floor Plan");
  const agg = score("https://10times.com/slas-2026/exhibitors", "SLAS 2026 Exhibitors - 10times");
  assert.ok(real > agg, `organiser ${real} should beat aggregator ${agg}`);
});

test("a blog post about exhibitors scores low", () => {
  assert.ok(
    score("https://show.com/blog/top-exhibitors-to-watch", "Top exhibitors to watch") < 30,
    "an article should not look like a directory"
  );
});

test("the full-list parameter is rewarded over page one", () => {
  const all = score("https://s36.a2zinc.net/clients/X/Y/Public/exhibitors.aspx?Index=All");
  const one = score("https://s36.a2zinc.net/clients/X/Y/Public/exhibitors.aspx");
  assert.ok(all > one, `Index=All ${all} should beat plain ${one}`);
});

test("known platforms are named, so the UI can say what it found", () => {
  assert.equal(rank("https://s36.a2zinc.net/clients/X/Y/exhibitors.aspx", "").platform, "a2z Events");
  assert.equal(rank("https://ces.mapyourshow.com/8_0/explore/", "").platform, "Map Your Show");
  assert.equal(rank("https://randomshow.com/exhibitors", "").platform, null);
});

test("a PDF is penalised — we cannot read it as a page", () => {
  const pdf = score("https://show.com/exhibitor-list.pdf", "Exhibitor List");
  const page = score("https://show.com/exhibitor-list", "Exhibitor List");
  assert.ok(page > pdf, `page ${page} should beat pdf ${pdf}`);
});

test("scores stay inside 0-100 however many penalties stack", () => {
  const s = score(
    "https://10times.com/blog/become-an-exhibitor/register/exhibitor-portal.pdf",
    "Become an exhibitor — register | blog"
  );
  assert.ok(s >= 0 && s <= 100, `score ${s} out of range`);
});

console.log(
  failures === 0
    ? `\nAll checks passed.\n`
    : `\n${failures} check${failures === 1 ? "" : "s"} failed.\n`
);
process.exit(failures === 0 ? 0 : 1);
