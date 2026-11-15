/**
 * Stand-ins for the three directory shapes that cover most B2B shows.
 * These exist so the parser can be checked without hitting a live site.
 * They include the junk real pages carry: nav bars, A-Z filters, footers.
 */

/** a2z / Personify style: a long table with a header row. */
export const A2Z_TABLE = `<!doctype html><html><body>
<nav><a href="/">Home</a><a href="/login">Login</a><a href="/contact">Contact Us</a></nav>
<div class="alpha"><a href="?i=A">A</a><a href="?i=B">B</a><a href="?i=C">C</a></div>
<h1>Exhibitor List</h1>
<table class="exhibitorTable">
  <tr><th>Company Name</th><th>Booth</th><th>Category</th></tr>
  <tr><td><a href="/Public/eBooth.aspx?id=101">Acme Press Brakes</a></td><td>A1042</td><td>Bending</td></tr>
  <tr><td><a href="/Public/eBooth.aspx?id=102">Northstar Laser Systems</a></td><td>B2210</td><td>Cutting</td></tr>
  <tr><td><a href="/Public/eBooth.aspx?id=103">Lakeside Packaging Group</a></td><td>C3310</td><td>Packaging</td></tr>
  <tr><td><a href="/Public/eBooth.aspx?id=104">Vermeer Tooling Co.</a></td><td>A1180</td><td>Tooling</td></tr>
  <tr><td><a href="/Public/eBooth.aspx?id=105">Brightline Robotics</a></td><td>D4001</td><td>Automation</td></tr>
  <tr><td><a href="/Public/eBooth.aspx?id=106">Hoosier Metal Finishing</a></td><td>B2044</td><td>Finishing</td></tr>
</table>
<footer><a href="/privacy">Privacy Policy</a><a href="/terms">Terms</a></footer>
</body></html>`;

/** MapYourShow / ExpoFP style: a grid of cards, no table at all. */
export const CARD_GRID = `<!doctype html><html><body>
<header><a href="/">Home</a><a href="/register">Register</a></header>
<div class="toolbar"><a href="#">Filter</a><a href="#">Sort</a><a href="#">View All</a></div>
<section id="exhibitors">
  <div class="card"><a class="exhibitor-link" href="/exhibitors/riverbend">Riverbend Controls</a><span class="booth">Booth 418</span></div>
  <div class="card"><a class="exhibitor-link" href="/exhibitors/castiron">Cast Iron Analytics</a><span class="booth">Booth 420</span></div>
  <div class="card"><a class="exhibitor-link" href="/exhibitors/pellsworth">Pellsworth Hydraulics</a><span class="booth">Booth 512</span></div>
  <div class="card"><a class="exhibitor-link" href="/exhibitors/novaseal">NovaSeal Gaskets</a><span class="booth">Booth 514</span></div>
  <div class="card"><a class="exhibitor-link" href="/exhibitors/tallgrass">Tallgrass Conveyor</a><span class="booth">Booth 601</span></div>
</section>
<footer><a href="https://twitter.com/show">Twitter</a><a href="https://linkedin.com/company/show">LinkedIn</a></footer>
</body></html>`;

/** A sponsor page: plain list, tiers as headings, no booths. */
export const SPONSOR_LIST = `<!doctype html><html><body>
<nav><a href="/">Home</a><a href="/about">About</a></nav>
<h1>Our 2026 Sponsors</h1>
<h2>Platinum</h2>
<ul class="sponsors">
  <li><a class="s" href="https://meridianpack.com">Meridian Packaging</a></li>
  <li><a class="s" href="https://clearfieldlabs.com">Clearfield Labs</a></li>
</ul>
<h2>Gold</h2>
<ul class="sponsors">
  <li><a class="s" href="https://orchardsupply.io">Orchard Supply Systems</a></li>
  <li><a class="s" href="https://kestrelauto.com">Kestrel Automation</a></li>
  <li><a class="s" href="https://dunmoreindustrial.com">Dunmore Industrial</a></li>
</ul>
<footer><a href="/privacy">Privacy</a></footer>
</body></html>`;

/** A page with no list on it at all — the parser should find nothing, not guess. */
export const NOT_A_DIRECTORY = `<!doctype html><html><body>
<nav><a href="/">Home</a><a href="/exhibit">Exhibit</a></nav>
<h1>Welcome to the 2026 Show</h1>
<p>Join us in Chicago this May for three days of the best in manufacturing.
Registration opens in January. Our exhibitor directory will be published in March.</p>
<footer><a href="/privacy">Privacy</a></footer>
</body></html>`;
