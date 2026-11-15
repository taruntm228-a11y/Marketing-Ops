"use client";

import { EMPTY_ICP, type IcpProfile } from "./types";

/**
 * Phase 1 storage: the browser.
 *
 * This is deliberately temporary. In Phase 2 it moves to Supabase so a profile
 * belongs to an account rather than to one laptop. Keeping it here for now means
 * the app works with zero signups and zero keys, which is the point of Phase 1.
 */
const KEY = "eventfill.icp.v1";

export function loadIcp(): IcpProfile {
  if (typeof window === "undefined") return EMPTY_ICP;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_ICP;
    return { ...EMPTY_ICP, ...(JSON.parse(raw) as Partial<IcpProfile>) };
  } catch {
    return EMPTY_ICP;
  }
}

export function saveIcp(icp: IcpProfile): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(icp));
  } catch {
    /* private browsing, quota, etc. Not worth failing the page over. */
  }
}

export function hasIcp(icp: IcpProfile): boolean {
  return Boolean(icp.whatYouSell.trim() && (icp.industries.trim() || icp.exampleCustomers.trim()));
}
