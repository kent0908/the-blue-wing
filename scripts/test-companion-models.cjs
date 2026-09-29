/**
 * The five companion chat tiers: that the credits shown match what the billing
 * formula actually charges, that every tier clears the rate card's >=4x margin
 * floor against its MEASURED cost, and that only allowlisted ids can be set.
 * No network, no database.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- .cjs script, require() is the point */
const fs = require('node:fs'), ts = require('typescript'), assert = require('node:assert/strict');
function load(file) {
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)((id) => (/i18n[\\/]k$/.test(id) ? { k: (s) => s } : require(id)), mod, mod.exports);
  return mod.exports;
}
const m = load('lib/companionModels.ts');
const { creditCostFromRate } = load('lib/creditFormula.ts');
let checks = 0; const check = (fn) => { fn(); checks++; };

/** companion chat sends max_tokens 700 (app/api/characters/[id]/messages/route.ts) */
const COMPANION_MAX_TOKENS = 700;
/** scripts/apply-rate-card.mjs: $0.01 per credit, sized for >=4x nominal margin */
const CREDIT_USD = 0.01, MIN_MARGIN = 4;

check(() => assert.equal(m.COMPANION_MODELS.length, 5, 'five tiers'));
check(() => assert.deepEqual(m.COMPANION_MODELS.map((x) => x.tier), [1, 2, 3, 4, 5], 'tiers numbered in order'));
check(() => assert.equal(new Set(m.COMPANION_MODELS.map((x) => x.id)).size, 5, 'no duplicate model ids'));

for (const model of m.COMPANION_MODELS) {
  const where = `tier ${model.tier} (${model.id})`;
  // the price on the button must be the price the biller charges
  check(() => assert.equal(
    creditCostFromRate({ modality: 'text', credits: model.rate, maxTokens: COMPANION_MAX_TOKENS }),
    model.credits,
    `${where}: declared credits must equal the billing formula's result`
  ));
  // and it must clear the margin floor against what the model actually cost
  const margin = (model.credits * CREDIT_USD) / model.measured.usd;
  check(() => assert.ok(margin >= MIN_MARGIN, `${where}: margin ${margin.toFixed(2)}x is under the ${MIN_MARGIN}x floor`));
  check(() => assert.ok(model.measured.usd > 0 && model.measured.chars > 0 && model.measured.ms > 0,
    `${where}: must carry real measurements`));
  check(() => assert.ok(model.label && model.blurb, `${where}: needs a label and a blurb`));
  check(() => assert.ok(Number.isSafeInteger(model.rate) && model.rate >= 0, `${where}: rate must be a whole number`));
}

// price must rise with the tier, or the ladder is not a ladder
const credits = m.COMPANION_MODELS.map((x) => x.credits);
check(() => assert.deepEqual(credits, [...credits].sort((a, b) => a - b), 'credits must not decrease as tiers rise'));

/* ---- the allowlist ---- */
check(() => assert.ok(m.isCompanionModel(m.DEFAULT_COMPANION_MODEL), 'the default must be selectable'));
for (const bad of [null, undefined, 42, {}, [], '', 'gpt-4o', 'deepseek-v4.1-flash ', 'NSFW-Seed-SC;drop'])
  check(() => assert.equal(m.isCompanionModel(bad), false, `must reject ${JSON.stringify(bad)}`));
for (const model of m.COMPANION_MODELS) check(() => assert.ok(m.isCompanionModel(model.id)));
check(() => assert.equal(m.companionModel('nope'), undefined));
check(() => assert.equal(m.companionModel(null), undefined));
check(() => assert.equal(m.companionModel('gemini-3.5-flash').tier, 3));

/* ---- exactly one unfiltered tier, and it is labelled as such ---- */
const unfiltered = m.COMPANION_MODELS.filter((x) => x.unfiltered);
check(() => assert.equal(unfiltered.length, 1, 'one unfiltered tier'));
check(() => assert.ok(/NSFW-|uncensored-/i.test(unfiltered[0].id), 'the unfiltered tier must actually be an unfiltered model'));
// ...and nothing is silently unfiltered: an NSFW/uncensored id must carry the flag
for (const model of m.COMPANION_MODELS)
  check(() => assert.equal(/NSFW-|uncensored-/i.test(model.id), !!model.unfiltered,
    `${model.id}: the unfiltered flag must match the model id`));

/* ---- every tier must be seeded in the rate card, or every message 402s ---- */
const card = fs.readFileSync('scripts/apply-rate-card.mjs', 'utf8');
const textBlock = card.slice(card.indexOf('const TEXT_RATES'), card.indexOf('const SPEECH_RATES'));
for (const model of m.COMPANION_MODELS) {
  const row = new RegExp(`"${model.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}":\\s*(\\d+)`).exec(textBlock);
  check(() => assert.ok(row, `${model.id} has no row in TEXT_RATES — creditCost() has no fallback, so every message would fail`));
  check(() => assert.equal(Number(row[1]), model.rate, `${model.id}: rate card says ${row && row[1]}, the tier says ${model.rate}`));
}

/* ---- the route validates against the allowlist ---- */
const route = fs.readFileSync('app/api/characters/[id]/model/route.ts', 'utf8');
check(() => assert.ok(/isCompanionModel\(/.test(route), 'PUT must validate against the allowlist'));
check(() => assert.ok(/requireAdultUser\(/.test(route), 'the model route is a companion route and must carry the age gate'));

console.log(`PASS ${checks} companion model tier checks; no network or database calls`);
