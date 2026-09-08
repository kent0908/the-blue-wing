const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('lib/promptSafety.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(mod, mod.exports);
const { checkPromptSafety, assertPromptSafety, PromptSafetyError } = mod.exports;
const blocked = [
  ['兒童在公園', 'minors'], ['儿\u200b童', 'minors'], ['小・學・生', 'minors'],
  ['ＣＨＩＬＤ portrait', 'minors'], ['c h i l d', 'minors'], ['a c.h.i.l.d portrait', 'minors'],
  ['17歲角色', 'minors'], ['十七歲角色', 'minors'], ['16-year-old person', 'minors'],
  ['age: 17', 'minors'], ['under 18', 'minors'], ['十八歲以下', 'minors'],
  ['teenager portrait', 'minors'], ['NO CHILDREN', 'minors'], ['毒 品', 'drugs'],
  ['c.o.c.a.i.n.e', 'drugs'], ['ＨＥＲＯＩＮ', 'drugs'], ['marijuana', 'drugs'],
  ['芬太尼', 'drugs'], ['大\u2060麻', 'drugs'], ['LSD', 'drugs'], ['K 粉', 'drugs'],
];
for (const [input, category] of blocked) {
  const result = checkPromptSafety(input);
  assert.equal(result.allowed, false, input);
  assert.equal(result.category, category, input);
  assert.equal(result.code, 'prompt_blocked');
}
for (const input of [
  'adult woman, age 18', '18歲', '十八歲', '二十八歲', '二十一歲', '100歲',
  'an adult heroine', 'minority community', 'a drugstore exterior', 'ice in a glass',
  'methodical architecture', 'an adult person resting, closed lips', '',
]) assert.equal(checkPromptSafety(input).allowed, true, input);
assert.equal(checkPromptSafety('safe', '兒童').allowed, false);
assert.equal(checkPromptSafety(null, undefined, 123).allowed, true);
assert.throws(() => assertPromptSafety('毒品'), error => error instanceof PromptSafetyError && error.status === 400 && error.code === 'prompt_blocked' && !error.message.includes('input:'));
assert.doesNotThrow(() => assertPromptSafety('adult portrait'));
console.log(`PASS ${blocked.length + 17} prompt policy checks; no generation, provider or database calls`);
