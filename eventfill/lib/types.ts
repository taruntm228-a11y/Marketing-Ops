// Shared shapes for the whole app.
// Keep this file boring — if a shape changes, it changes here and nowhere else.

/** One organisation found on an event's public directory. */
export type Company = {
  name: string;
  website: string | null;
  booth: string | null;
  category: string | null;
  /** Which bucket of the event page this came from. */
  role: "exhibitor" | "speaker" | "sponsor" | "unknown";

  // --- Provenance. Not optional. See architecture.md. ---
  /** The exact page this row was read from. */
  sourceUrl: string;
  /** ISO timestamp of when we read it. */
  scrapedAt: string;
  /** The literal text on the page that this row came from. Our receipt. */
  evidence: string;

  // --- Filled in later, at the scoring station. ---
  icpScore?: number;
  icpReason?: string;
};

export type HarvestResult = {
  sourceUrl: string;
  scrapedAt: string;
  /** "ai" when a model read the page, "structural" when we parsed the HTML ourselves. */
  method: "ai" | "structural";
  companies: Company[];
  /** Rows the model claimed but we could not find in the page text. Dropped, but counted. */
  rejected: number;
  notes: string[];
};

/** What the client tells us about who they want to meet. */
export type IcpProfile = {
  companyName: string;
  whatYouSell: string;
  industries: string;
  sizeBand: string;
  geography: string;
  titles: string;
  /** The field that does the most work. See architecture.md. */
  disqualifiers: string;
  /** Websites of existing customers they'd like more of. */
  exampleCustomers: string;
};

export const EMPTY_ICP: IcpProfile = {
  companyName: "",
  whatYouSell: "",
  industries: "",
  sizeBand: "",
  geography: "",
  titles: "",
  disqualifiers: "",
  exampleCustomers: "",
};
