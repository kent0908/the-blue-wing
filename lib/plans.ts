/**
 * Subscription plans. Credits are granted on activation and again on each
 * monthly renewal. 1 credit ≈ US$0.005 (matches the Composer's display unit).
 *
 * No payment processor is wired yet — an admin activates a plan from
 * /admin, which grants that month's credits immediately. Stripe can later
 * drive the same `activatePlan` path from its webhook.
 */
export interface Plan {
  code: string;
  name: string;
  /** monthly price in USD, for display only until Stripe is added */
  priceUSD: number;
  /** credits granted on activation and every renewal */
  monthlyCredits: number;
  blurb: string;
}

export const PLANS: Plan[] = [
  { code: "free", name: "免費", priceUSD: 0, monthlyCredits: 0, blurb: "註冊即有，0 點，先逛逛" },
  { code: "starter", name: "入門", priceUSD: 5, monthlyCredits: 1200, blurb: "每月 1,200 點，約 100 張圖" },
  { code: "pro", name: "專業", priceUSD: 15, monthlyCredits: 4000, blurb: "每月 4,000 點，圖片影片都夠用" },
  { code: "studio", name: "工作室", priceUSD: 40, monthlyCredits: 12000, blurb: "每月 12,000 點，高頻創作" },
];

export function getPlan(code: string | null | undefined): Plan {
  return PLANS.find((p) => p.code === code) ?? PLANS[0];
}
