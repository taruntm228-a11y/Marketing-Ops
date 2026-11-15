import assert from "node:assert";
import { extractStructural } from "../lib/extract-structural";
import { htmlToText } from "../lib/html";
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

console.log(
  failures === 0
    ? `\nAll checks passed.\n`
    : `\n${failures} check${failures === 1 ? "" : "s"} failed.\n`
);
process.exit(failures === 0 ? 0 : 1);
