import type { PriceComponent } from "./sirayaPublicPrices";

/** Pure scenario arithmetic. Quantities are raw tokens, seconds or images. */
export function simulateCost(components: PriceComponent[], quantities: Record<string, number>, discount: number) {
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) return null;
  const scenarios = new Set(components.filter(c => (quantities[c.id] ?? 0) > 0 && c.scenario).map(c => c.scenario));
  if (scenarios.size > 1) return null;
  let list = 0;
  let hasUsage = false;
  for (const c of components) {
    const q = quantities[c.id] ?? 0;
    if (!Number.isFinite(q) || q < 0 || q > 1e12) return null;
    if (q > 0) hasUsage = true;
    list += q * c.price / (c.unit === "million_tokens" ? 1e6 : 1);
  }
  if (!hasUsage || !Number.isFinite(list)) return null;
  return { list, discounted: list * (1 - discount / 100) };
}

/** Planning only: bonus credits dilute cash per credit; free grants create no revenue. */
export function promotionEconomics(input: { paidUsd: number; baseCredits: number; bonusCredits: number; callCredits: number; costUsd: number; feePct: number }) {
  const { paidUsd, baseCredits, bonusCredits, callCredits, costUsd, feePct } = input;
  if (Object.values(input).some(n => !Number.isFinite(n) || n < 0) || feePct > 100 || baseCredits + bonusCredits <= 0) return null;
  const cashPerCredit = paidUsd * (1 - feePct / 100) / (baseCredits + bonusCredits);
  const allocatedCash = cashPerCredit * callCredits;
  return { cashPerCredit, allocatedCash, contribution: allocatedCash - costUsd, marginPct: allocatedCash > 0 ? (allocatedCash - costUsd) / allocatedCash * 100 : null, breakEvenCredits: cashPerCredit > 0 ? Math.ceil(costUsd / cashPerCredit) : null };
}
