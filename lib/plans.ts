/**
 * Subscription plans.
 *
 * Pricing redesign (this pass): plain English tier names (no Chinese
 * prefix — Free/Basic/Standard/Premium), and every number below is derived
 * from real BytePlus per-model costs (see lib/rateCard.ts and
 * scripts/apply-rate-card.mjs) at a fixed retail peg of $0.01/credit, sized
 * so realized margin holds at ≥3x even after a plan's own bulk discount —
 * see the comment on each plan for its effective $/credit.
 *
 * No payment processor is wired yet — an admin activates a plan from
 * /admin, which grants that period's credits immediately (monthlyCredits on
 * renewal, dailyCredits once per calendar day for Free — see
 * ensureDailyFreeCredits() in lib/credits.ts). Stripe can later drive the
 * same `activatePlan` path from its webhook.
 *
 * `tier` is a plain ascending rank so feature gates can just check
 * "at least tier N" without string-matching plan codes (see
 * SCENE_UNLOCK_MIN_TIER below).
 */
export interface Plan {
  code: string;
  name: string;
  /** 0 = free, rising with plan level — use for "at least this plan" gates */
  tier: number;
  /** monthly price in USD, for display only until Stripe is added */
  priceUSD: number;
  /** credits granted on activation and every renewal (paid tiers) */
  monthlyCredits: number;
  /** Free tier only — granted once per calendar day instead of once a month,
   *  see ensureDailyFreeCredits(). Doesn't carry over day to day. */
  dailyCredits?: number;
  blurb: string;
}

export const PLANS: Plan[] = [
  {
    code: "free",
    name: "Free",
    tier: 0,
    priceUSD: 0,
    monthlyCredits: 0,
    dailyCredits: 10,
    blurb: "10 credits every day, granted the moment you sign up",
  },
  {
    code: "basic",
    name: "Basic",
    tier: 1,
    priceUSD: 9,
    monthlyCredits: 900, // $0.01/credit — no bulk discount at the entry tier
    blurb: "900 credits / month",
  },
  {
    code: "standard",
    name: "Standard",
    tier: 2,
    priceUSD: 29,
    monthlyCredits: 3200, // $0.00906/credit — ~9% bulk discount
    blurb: "3,200 credits / month",
  },
  {
    code: "premium",
    name: "Premium",
    tier: 3,
    priceUSD: 99,
    monthlyCredits: 11000, // $0.009/credit — ~10% bulk discount
    blurb: "11,000 credits / month — unlocks 陪聊角色 exclusive scenes",
  },
];

export function getPlan(code: string | null | undefined): Plan {
  return PLANS.find((p) => p.code === code) ?? PLANS[0];
}

/** 陪聊角色的「解鎖場景」（生成專屬圖片／影片）只開放給最高階方案。 */
export const SCENE_UNLOCK_MIN_TIER = 3;

export function canUnlockScenes(planCode: string | null | undefined): boolean {
  return getPlan(planCode).tier >= SCENE_UNLOCK_MIN_TIER;
}
