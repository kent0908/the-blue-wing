/** Only same-origin app paths may survive login and email verification. */
export function authDestination(value: unknown, fallback = "/studio?mode=image"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://blue-wing.local");
    if (url.origin !== "https://blue-wing.local" || ["/login", "/register", "/verify"].includes(url.pathname)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}
