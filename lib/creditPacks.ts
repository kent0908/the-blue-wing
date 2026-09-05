/**
 * One-time credit top-up packs. Same $0.01/credit retail peg as the
 * subscription plans (lib/plans.ts), with a bulk discount curve that never
 * goes deep enough to threaten the ≥3x margin built into the model rate
 * card (worst case, the 100,000-credit pack, is a 20% discount — combined
 * with the ~4x nominal margin most model rates carry, realized margin stays
 * ≥3x even if every credit spent came from this pack).
 *
 * Unlike subscription credits (reset on renewal — see ensureDailyFreeCredits
 * / the plan_grant expiry in the admin route), a purchased pack is valid for
 * CREDIT_PACK_EXPIRY_DAYS from the day it's granted, not tied to any billing
 * cycle.
 *
 * No payment processor is wired yet — same as plans, an admin grants a pack
 * from /admin (POST /api/admin/users/:id with action "grant_pack").
 */
export interface CreditPack {
  code: string;
  credits: number;
  priceUSD: number;
}

export const CREDIT_PACKS: CreditPack[] = [
  { code: "pack_100", credits: 100, priceUSD: 1 }, // $0.01/credit — no discount
  { code: "pack_1000", credits: 1_000, priceUSD: 9 }, // $0.009/credit — 10% off
  { code: "pack_10000", credits: 10_000, priceUSD: 85 }, // $0.0085/credit — 15% off
  { code: "pack_100000", credits: 100_000, priceUSD: 800 }, // $0.008/credit — 20% off
];

export function getCreditPack(code: string | null | undefined): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.code === code);
}

/** 2 years, from the day a pack is granted. */
export const CREDIT_PACK_EXPIRY_DAYS = 730;
