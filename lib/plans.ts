/**
 * Subscription plans. Credits are granted on activation and again on each
 * monthly renewal. 1 credit ≈ US$0.005 (matches the Composer's display unit).
 *
 * No payment processor is wired yet — an admin activates a plan from
 * /admin, which grants that month's credits immediately. Stripe can later
 * drive the same `activatePlan` path from its webhook.
 *
 * Three paid tiers, named after the most globally recognisable 3-tier
 * pattern (Netflix's Basic/Standard/Premium) rather than something invented —
 * subscribers already know what these words mean relative to each other.
 * `tier` is a plain ascending rank so feature gates can just check
 * "at least tier N" without string-matching plan codes (see
 * SCENE_UNLOCK_MIN_TIER below).
 */
export interface Plan {
  code: string;
  /** shown to users: Chinese label + the English tier name */
  name: string;
  /** 0 = free, rising with plan level — use for "at least this plan" gates */
  tier: number;
  /** monthly price in USD, for display only until Stripe is added */
  priceUSD: number;
  /** credits granted on activation and every renewal */
  monthlyCredits: number;
  blurb: string;
}

export const PLANS: Plan[] = [
  { code: "free", name: "免費 Free", tier: 0, priceUSD: 0, monthlyCredits: 0, blurb: "註冊即有，0 點，先逛逛" },
  { code: "basic", name: "一般 Basic", tier: 1, priceUSD: 5, monthlyCredits: 1200, blurb: "每月 1,200 點，約 100 張圖" },
  { code: "standard", name: "中階 Standard", tier: 2, priceUSD: 15, monthlyCredits: 4000, blurb: "每月 4,000 點，圖片影片都夠用" },
  {
    code: "premium",
    name: "高階 Premium",
    tier: 3,
    priceUSD: 40,
    monthlyCredits: 12000,
    blurb: "每月 12,000 點，解鎖陪聊角色的專屬圖片／影片場景",
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
