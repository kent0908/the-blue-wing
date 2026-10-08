import { AsyncLocalStorage } from "node:async_hooks";
const context = new AsyncLocalStorage<{ chargeId: string }>();
export const billingChargeId = () => context.getStore()?.chargeId ?? null;
export function withBillingCharge<T>(chargeId: string, call: () => Promise<T>): Promise<T> {
  return context.run({ chargeId }, call);
}
