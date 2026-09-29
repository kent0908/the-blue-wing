/**
 * The companion history window: how much conversation rides along, and that the
 * budget cannot be turned back into an unbounded prompt. No network, no DB.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- .cjs script, require() is the point */
const fs = require('node:fs'), ts = require('typescript'), assert = require('node:assert/strict');
function load(file) {
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(require, mod, mod.exports);
  return mod.exports;
}
const b = load('lib/chatHistoryBudget.ts');
let checks = 0; const check = (fn) => { fn(); checks++; };

const msg = (n, chars = 40) => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: '字'.repeat(chars) + i }));

/* ---- the window is deeper than the 20 it replaced ---- */
const short = b.withinHistoryBudget(msg(400));
check(() => assert.ok(short.length > 20, `expected more than the old 20, got ${short.length}`));
check(() => assert.ok(short.length >= 60, `expected a meaningfully deeper window, got ${short.length}`));

/* ---- but still bounded ---- */
const total = (list) => list.reduce((sum, m) => sum + b.estimateTokens(m.content), 0);
check(() => assert.ok(total(short) <= b.HISTORY_TOKEN_BUDGET, `${total(short)} over budget`));
// long messages must shrink the window rather than blow the budget — the thing
// a flat message count could not do
const long = b.withinHistoryBudget(msg(400, 600));
check(() => assert.ok(total(long) <= b.HISTORY_TOKEN_BUDGET));
check(() => assert.ok(long.length < short.length, 'longer messages must yield a shorter window'));
for (const chars of [1, 10, 200, 2000, 8000]) {
  const window = b.withinHistoryBudget(msg(400, chars));
  check(() => assert.ok(total(window) <= b.HISTORY_TOKEN_BUDGET || window.length === 1, `chars=${chars}`));
}

/* ---- it keeps the NEWEST messages, in order ---- */
const all = msg(400);
const kept = b.withinHistoryBudget(all);
check(() => assert.deepEqual(kept, all.slice(all.length - kept.length), 'must be the newest slice, order preserved'));
check(() => assert.equal(kept.at(-1).content, all.at(-1).content, 'the newest message must always survive'));

/* ---- edges ---- */
check(() => assert.deepEqual(b.withinHistoryBudget([]), []));
check(() => assert.equal(b.withinHistoryBudget(msg(1)).length, 1));
// a single message over budget is still sent: dropping it would answer a turn
// the model cannot see
const huge = [{ role: 'user', content: '字'.repeat(50_000) }];
check(() => assert.equal(b.withinHistoryBudget(huge).length, 1));
check(() => assert.equal(b.withinHistoryBudget(msg(5), 0).length, 1));
check(() => assert.equal(b.estimateTokens(''), 4)); // envelope only
check(() => assert.ok(b.estimateTokens('字'.repeat(100)) >= 100));
check(() => assert.equal(b.estimateTokens(null), 4));

/* ---- the fetch ceiling is real, and above what the budget admits ---- */
check(() => assert.ok(b.HISTORY_FETCH_LIMIT >= 400));
// For a typical companion message (~19 tokens, measured) the budget — not the
// fetch ceiling — must be what ends the window, or the ceiling is the real cap
// and the budget arithmetic is decoration.
const typical = b.withinHistoryBudget(msg(b.HISTORY_FETCH_LIMIT, 15));
check(() => assert.ok(typical.length < b.HISTORY_FETCH_LIMIT,
  `the budget must bind first: kept ${typical.length} of ${b.HISTORY_FETCH_LIMIT}`));

/* ---- the route actually uses it ---- */
const route = fs.readFileSync('app/api/characters/[id]/messages/route.ts', 'utf8');
check(() => assert.ok(/withinHistoryBudget\(/.test(route), 'the route must apply the budget'));
check(() => assert.ok(/listMessages\(id, HISTORY_FETCH_LIMIT\)/.test(route), 'the query must carry the ceiling'));
check(() => assert.ok(!/HISTORY_TURNS/.test(route), 'the flat 20-message cap must be gone'));
// the budget must stay clear of the reply and system prompt it excludes
check(() => assert.ok(b.HISTORY_TOKEN_BUDGET >= 2_000 && b.HISTORY_TOKEN_BUDGET <= 4_000,
  'outside this range the cold-cache margin arithmetic in the module no longer holds'));

console.log(`PASS ${checks} chat history budget checks; no network or database calls`);
