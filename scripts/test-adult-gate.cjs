/**
 * 陪聊 18+ gate: the date arithmetic, what counts as verified, and the wiring
 * that makes the API — not the interstitial — the thing that enforces it.
 * No network, no database, no credentials.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- .cjs script, require() is the point */
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), assert = require('node:assert/strict');
function load(file) {
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)((id) => (/i18n[\\/]k$/.test(id) ? { k: (s) => s } : require(id)), mod, mod.exports);
  return mod.exports;
}
const gate = load('lib/adultGate.ts');
let checks = 0; const check = (fn) => { fn(); checks++; };
const at = (s) => new Date(s + 'T00:00:00Z');

/* ---- calendar arithmetic, not 365.25-day arithmetic ---- */
check(() => assert.equal(gate.ageOn(at('2000-06-15'), at('2018-06-15')), 18)); // birthday itself
check(() => assert.equal(gate.ageOn(at('2000-06-15'), at('2018-06-14')), 17)); // the day before
check(() => assert.equal(gate.ageOn(at('2000-06-15'), at('2018-06-16')), 18));
check(() => assert.equal(gate.ageOn(at('2000-12-31'), at('2018-01-01')), 17)); // year rolled, birthday has not
// a leap-day birthday must not come of age early in a common year
check(() => assert.equal(gate.ageOn(at('2004-02-29'), at('2022-02-28')), 17));
check(() => assert.equal(gate.ageOn(at('2004-02-29'), at('2022-03-01')), 18));
// enough leap years in between to drift a day-count approximation past the line
check(() => assert.equal(gate.ageOn(at('2007-03-01'), at('2025-02-28')), 17));

/* ---- parsing ---- */
check(() => assert.equal(gate.parseBirthDate('2000-06-15').toISOString().slice(0, 10), '2000-06-15'));
for (const bad of ['', null, undefined, 42, {}, '2000-6-15', '15/06/2000', '2000-06-15T00:00:00Z', 'yesterday', '0000-00-00'])
  check(() => assert.equal(gate.parseBirthDate(bad), null, String(bad)));
// Date.UTC silently rolls these over; they must be rejected, not become March
check(() => assert.equal(gate.parseBirthDate('2007-02-30'), null));
check(() => assert.equal(gate.parseBirthDate('2007-13-01'), null));
check(() => assert.equal(gate.parseBirthDate('2023-02-29'), null)); // 2023 is not a leap year
check(() => assert.ok(gate.parseBirthDate('2024-02-29'))); // 2024 is

/* ---- the verdict ---- */
const now = at('2026-09-27');
check(() => assert.equal(gate.checkBirthDate('2008-09-27', now).ok, true)); // 18 today
check(() => assert.equal(gate.checkBirthDate('2008-09-28', now).ok, false)); // 18 tomorrow
check(() => assert.equal(gate.checkBirthDate('2008-09-28', now).code, 'under_age'));
check(() => assert.equal(gate.checkBirthDate('2010-01-01', now).code, 'under_age'));
check(() => assert.equal(gate.checkBirthDate('1990-01-01', now).ok, true));
check(() => assert.equal(gate.checkBirthDate('2008-09-27', now).age, 18));
// a future or implausible date is malformed input, not a minor — saying
// "under age" there would be wrong AND would hint at which year passes
check(() => assert.equal(gate.checkBirthDate('2030-01-01', now).code, 'invalid_date'));
check(() => assert.equal(gate.checkBirthDate('1850-01-01', now).code, 'invalid_date'));
check(() => assert.equal(gate.checkBirthDate('not a date', now).code, 'invalid_date'));
check(() => assert.equal(gate.checkBirthDate('2008-09-27', now).birthDate, '2008-09-27'));

/* ---- who counts as verified ---- */
check(() => assert.equal(gate.isAdultVerified(null), false));
check(() => assert.equal(gate.isAdultVerified(undefined), false));
check(() => assert.equal(gate.isAdultVerified({}), false));
check(() => assert.equal(gate.isAdultVerified({ birth_date: null, adult_confirmed_at: null }), false));
check(() => assert.equal(gate.isAdultVerified({ birth_date: '1990-01-01' }, now), true));
check(() => assert.equal(gate.isAdultVerified({ adult_confirmed_at: '2026-01-01T00:00:00Z' }, now), true));
// postgres hands back a Date, or a timestamp-suffixed string, for a date column
check(() => assert.equal(gate.isAdultVerified({ birth_date: new Date('1990-01-01T00:00:00Z') }, now), true));
check(() => assert.equal(gate.isAdultVerified({ birth_date: '1990-01-01T00:00:00.000Z' }, now), true));
// the date wins over a stale flag: a row confirmed under a different threshold,
// or written by an import, must not carry someone under the floor past it
check(() => assert.equal(gate.isAdultVerified({ birth_date: '2015-01-01', adult_confirmed_at: '2026-01-01T00:00:00Z' }, now), false));
// ...and someone who declared while under age clears it on their own birthday
check(() => assert.equal(gate.isAdultVerified({ birth_date: '2008-09-27' }, at('2026-09-26')), false));
check(() => assert.equal(gate.isAdultVerified({ birth_date: '2008-09-27' }, at('2026-09-27')), true));

/* ---- the gate lives in the API, not in the interstitial ---- */
const auth = fs.readFileSync('lib/apiauth.ts', 'utf8');
check(() => assert.ok(/export async function requireAdultUser/.test(auth)));
check(() => assert.ok(auth.includes('age_unverified'), 'the client needs a distinct code to show the gate'));
const routes = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === 'route.ts') routes.push(full);
  }
})('app/api/characters');
routes.push(path.join('app/api/official-characters', '[key]', 'adopt', 'route.ts'));
check(() => assert.ok(routes.length >= 11, `expected the companion routes, found ${routes.length}`));
for (const file of routes) {
  const src = fs.readFileSync(file, 'utf8');
  // A new companion route added without the gate fails here rather than shipping open.
  check(() => assert.ok(!/\brequireUser\s*\(/.test(src), `${file} must use requireAdultUser, not requireUser`));
  check(() => assert.ok(/\brequireAdultUser\s*\(/.test(src), `${file} must guard with requireAdultUser`));
}
// the gate's own endpoint must NOT be gated, or nobody could ever pass it
const ageRoute = fs.readFileSync('app/api/account/age/route.ts', 'utf8');
check(() => assert.ok(!/requireAdultUser/.test(ageRoute), 'the age endpoint must not require what it grants'));
check(() => assert.ok(/requireUser/.test(ageRoute), 'the age endpoint still requires a signed-in user'));

console.log(`PASS ${checks} adult gate checks; no network, database or credentials`);
