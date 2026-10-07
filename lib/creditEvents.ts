/** Re-read the authoritative balance after a charge or refund; never estimate it in the browser. */
export const CREDITS_UPDATED_EVENT = "credits-updated";

export function notifyCreditsUpdated() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CREDITS_UPDATED_EVENT));
}
