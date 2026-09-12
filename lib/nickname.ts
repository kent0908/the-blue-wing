/** Public display label, not an identifier or an authorization credential. */
export function normalizeNickname(value: unknown): string {
  if (typeof value !== "string") throw new Error("請輸入暱稱");
  const name = value.normalize("NFC").trim();
  if (Array.from(name).length < 2 || Array.from(name).length > 24 || /[\p{Cc}\p{Cf}<>]/u.test(name)) throw new Error("暱稱需為 2–24 個字，不可含控制字元或角括號");
  return name;
}
