import { k } from "./i18n/k";

/**
 * Age gate for the 陪聊 area.
 *
 * Scoped to companions on the owner's call (2026-09-27): the rest of the site
 * — 文字/圖片/影片創作, 資產庫, 方案 — is unchanged and needs no declaration.
 *
 * What this is and is not: a self-declared date of birth checked on the
 * server. It is not identity verification. Jurisdictions that regulate adult
 * content (the UK Online Safety Act, a growing list of US states) require a
 * real assurance step — an ID or payment-instrument check through a provider.
 * The column layout here is deliberately ready for that: birth_date is kept
 * rather than discarded after the check, so a provider can be layered on later
 * without re-asking everyone, and adult_confirmed_at stays the single flag the
 * gates read.
 *
 * Pure date arithmetic, no database and no request objects, so both the API
 * route and the tests can use it directly.
 */

/** The platform's own floor. Characters a user creates already carry the same one. */
export const ADULT_MIN_AGE = 18;
/** Nobody alive is older; a date beyond this is a typo or a probe, not a person. */
const MAX_AGE = 120;

export const AGE_GATE_REJECTED = k("這個區域限 18 歲以上使用。");
export const AGE_GATE_INVALID = k("請輸入有效的出生日期。");

export interface AdultGateUser {
  birth_date?: string | Date | null;
  adult_confirmed_at?: string | Date | null;
}

/**
 * Completed years between two dates, calendar-correct.
 *
 * Not `(now - dob) / 365.25 days`: that drifts across leap years and would let
 * someone through up to a day early. Comparing month/day directly cannot.
 */
export function ageOn(birth: Date, on: Date): number {
  let age = on.getUTCFullYear() - birth.getUTCFullYear();
  const month = on.getUTCMonth() - birth.getUTCMonth();
  if (month < 0 || (month === 0 && on.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

/**
 * Postgres `date` → `YYYY-MM-DD`, reading the calendar day the column holds.
 *
 * @vercel/postgres hands a `date` column back as a JS Date at LOCAL midnight,
 * so its UTC fields are not the stored day. Measured on this database from
 * UTC+8: `'2008-09-28'::date` arrives as 2008-09-27T16:00:00Z, and
 * `'2008-01-01'::date` as 2007-12-31T16:00:00Z — a day early, and across New
 * Year a whole year early. Reading that with getUTC* made isAdultVerified
 * compute an age up to a day too high, which let a 17-year-old through on the
 * day before their eighteenth birthday. Local getters are the correct ones for
 * this value; the string form is then re-parsed as UTC like any other.
 */
function calendarDay(value: Date): string {
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** `YYYY-MM-DD` → a UTC date, or null. Rejects a rolled-over date like 2007-02-30. */
export function parseBirthDate(value: unknown): Date | null {
  const text = value instanceof Date
    ? (Number.isNaN(value.getTime()) ? "" : calendarDay(value))
    : String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC happily turns Feb 30 into Mar 2 — catch that by reading it back.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

export type GateVerdict =
  | { ok: true; birthDate: string; age: number }
  | { ok: false; code: "invalid_date" | "under_age"; message: string };

/** Validate a submitted date of birth. `now` is injectable so tests are not time-dependent. */
export function checkBirthDate(value: unknown, now: Date = new Date()): GateVerdict {
  const birth = parseBirthDate(value);
  if (!birth) return { ok: false, code: "invalid_date", message: AGE_GATE_INVALID };
  const age = ageOn(birth, now);
  // A future date or an implausible one is malformed input, not a minor: say
  // "invalid" rather than "too young", which would be both wrong and a hint.
  if (age < 0 || age > MAX_AGE) return { ok: false, code: "invalid_date", message: AGE_GATE_INVALID };
  if (age < ADULT_MIN_AGE) return { ok: false, code: "under_age", message: AGE_GATE_REJECTED };
  return { ok: true, birthDate: birth.toISOString().slice(0, 10), age };
}

/**
 * Has this user cleared the gate?
 *
 * Re-derives from birth_date when it is present instead of trusting the stored
 * flag alone, so a row written before a threshold change — or by a future
 * import — cannot carry someone under the floor past it. A user who declared a
 * date while under 18 clears the gate by themselves on their birthday.
 */
export function isAdultVerified(user: AdultGateUser | null | undefined, now: Date = new Date()): boolean {
  if (!user) return false;
  if (user.birth_date) {
    // parseBirthDate handles both shapes: the Date @vercel/postgres returns for
    // a date column (see calendarDay) and a plain or timestamp-suffixed string.
    const birth = parseBirthDate(
      user.birth_date instanceof Date ? user.birth_date : String(user.birth_date).slice(0, 10)
    );
    if (birth) return ageOn(birth, now) >= ADULT_MIN_AGE;
  }
  return !!user.adult_confirmed_at;
}
