const fs = require('node:fs'), assert = require('node:assert/strict'), ts = require('typescript');
const load = (file, mocks = {}) => {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', js)(exports, id => mocks[id] ?? require(id));
  return exports;
};
const calc = load('lib/businessPricePreview.ts');
const settings = { model: 'SIRAYA-Seedance-2.5', kind: 'video', seconds: 8, resolution: '1080p', aspect: '16:9', audio: true, videoInput: false, referenceCount: 0, rewrite: false };
const predicate = (attribute, operator, value) => ({ attribute, operator, value });
const units = (billingUnit, salePrice, unitScale = '1000000') => ({ billingUnit, salePrice, unitScale });
const tier = (conditions, ...units) => ({ currency: 'USD', conditions, units });
const rules = calc.priceRules({ pricing: [
  tier([predicate('Video Resolution', 'lte', '720'), predicate('Include Video URL', 'eq', 'false')], units('Output Tokens', '10.70')),
  tier([predicate('Video Resolution', 'gt', '720'), predicate('Include Video URL', 'eq', 'false')], units('Output Tokens', '11.70'), units('Reasoning Tokens', '11.7')),
  tier([predicate('Video Resolution', 'gt', '720'), predicate('Include Video URL', 'eq', 'true')], units('Output Tokens', '7.00')),
] }, 'public');
const price = (change, schedule = rules) => calc.estimateBusinessPrice({ ...settings, ...change }, schedule);
assert.deepEqual(price({}).total, { low: '4.5489600000', high: '4.5489600000', basis: 'videoTokens' });
assert.equal(price({ resolution: '720p' }).total.low, '1.8489600000');
assert(price({ aspect: 'adaptive' }).total.high > price({ aspect: 'adaptive' }).total.low);
const edit = price({ seconds: -1, videoInput: true });
assert.equal(edit.reason, 'duration'); assert.equal(edit.total, undefined); assert.equal(edit.rates[0].low, '7.0000000000');
assert.equal(price({}, []).reason, 'unavailable');
const wan = calc.priceRules({ pricing: [tier([], units('Video Seconds', '0.14', '1'))] }, 'public');
assert.equal(price({ model: 'wan3.0-video-prime', seconds: 6 }, wan).total.low, '0.8400000000');
assert.equal(price({ model: 'wan3.0-video-prime', seconds: 6, rewrite: true }, wan).total, undefined);
const images = calc.priceRules({ pricing: [tier([], units('Image Generation', '0.035', '1'))] }, 'public');
assert.equal(price({ kind: 'image', model: 'Dola-Seedream-5.0-lite', count: 2 }, images).total.low, '0.0700000000');
assert.equal(price({ kind: 'image', model: 'Dola-Seedream-5.0-pro', count: 1, referenceCount: 2 }, images).total, undefined);
const chat = calc.priceRules({ pricing: [
  tier([], units('Input Tokens', '0.15'), units('Output Tokens', '0.60')),
  tier([predicate('Apply time (time of day)', 'gte', '01:00 UTC')], units('Input Tokens', '0.30'), units('Output Tokens', '1.20')),
] }, 'public');
assert.deepEqual(price({ kind: 'text' }, chat).rates[0], { unit: 'input', low: '0.1500000000', high: '0.3000000000' });
const tokenImage = calc.priceRules({ pricing: [tier([], units('Input Image Tokens', '8'), units('Output Image Tokens', '30'))] }, 'public');
assert.equal(price({ kind: 'image' }, tokenImage).reason, 'usage');
const unrecognized = calc.priceRules({ pricing: [tier([], units('Image Generation', '0.035', '1'), units('Reference Images', '0.01', '1'))] }, 'public');
assert.equal(price({ kind: 'image', count: 1 }, unrecognized).total, undefined);
const adult = calc.priceRules({ currency: 'USD', rules: [{
  conditions: [], sale_prices_by_billing_unit: [{ billing_unit: { code: 'output_tokens' }, sale_price: '13.0', unit_scale: '1000000' }],
}] }, 'console');
const privateId = 'NSFW-SIRAYA-Seedance-2.5';
let allowed = true, adultVerified = true, consoleReads = 0;
class BusinessError extends Error { constructor(code, status) { super(code); this.status = status; } }
const route = load('app/api/business/price-preview/route.ts', {
  '@/lib/adultGate': { isAdultVerified: () => adultVerified },
  '@/lib/business': {
    assertBusinessOrigin() {}, requireBusiness: async () => ({ user: { id: 1 }, account: { id: 'fixture' } }),
    readBusinessJson: request => request.json(), BusinessError,
    businessJson: body => Response.json(body), businessErrorResponse: (_, error) => Response.json({}, { status: error.status ?? 500 }),
  },
  '@/lib/businessGeneration': { availableBusinessModels: async () => ({ models: allowed ? [{ id: privateId, modality: 'video', nsfw: true }] : [] }) },
  '@/lib/businessPricePreview': calc,
  '@/lib/sirayaPriceCatalog': { sirayaPriceRules: async (id, source) => {
    if (source === 'console') { consoleReads++; return id === privateId ? adult : []; }
    return id === settings.model ? rules : [];
  } },
});
const quote = body => route.POST(new Request('http://localhost/quote', { method: 'POST', body: JSON.stringify(body) }));

(async () => {
  assert.equal((await (await quote(settings)).json()).preview.total.low, '4.5489600000');
  assert.equal((await (await quote({ ...settings, model: privateId })).json()).preview.total.low, '5.0544000000');
  allowed = false;
  assert.equal((await (await quote({ ...settings, model: privateId })).json()).preview.reason, 'unavailable');
  adultVerified = false;
  assert.equal((await quote({ ...settings, model: privateId })).status, 403);
  assert.equal(consoleReads, 1);
  console.log('PASS: Seedance rates, adaptive and reference modes, image and video estimates, variable-token rates, and exact-model access checks');
})().catch(error => { console.error(error); process.exitCode = 1; });
