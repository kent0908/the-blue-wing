const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, imports = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => {
    if (name in imports) return imports[name];
    throw new Error(`Unexpected dependency: ${name}`);
  }, mod, mod.exports);
  return mod.exports;
}
const profile = load('lib/characterProfile.ts');
const characters = load('lib/characters.ts', { './characterProfile': profile, './db': { sql: () => { throw new Error('Unit tests must not access a database'); } } });
for (const invalid of [null, [], 'profile', { age: 17 }, { age: 121 }, { age: 25.5 }, { age: '25' }, { greeting: 'x'.repeat(601) }, { skin: [] }, { version: 2 }]) {
  assert.throws(() => profile.validateProfile(invalid));
}
const p = profile.validateProfile({ age: 30, style: '寫實', relationship: '同事', occupation: '設計師', speaking: '自然簡短', greeting: '今天一起喝咖啡吧', scenario: '咖啡店初見', tags: 'private-index-tag' });
assert.deepEqual(profile.validateProfile(JSON.parse(JSON.stringify(p))), p);
assert.equal(profile.readProfile({}).age, 25);
const c = { id: 10, name: '測試角色', personality: '喜歡觀察世界', likes: '咖啡', avatar_asset_id: null, profile: p, affection: 0, memory_summary: '', created_at: '', updated_at: '' };
const prompt = characters.buildSystemPrompt(c, { name: '', bio: '' });
for (const text of ['同事', '設計師', '自然簡短', '今天一起喝咖啡吧', '咖啡店初見']) assert.ok(prompt.includes(text));
assert.ok(!prompt.includes('private-index-tag'));
const scene = characters.buildScenePrompt(c, 'image');
assert.ok(scene.includes('寫實'));
assert.ok(!scene.includes('精緻插畫風格'));
assert.ok(!scene.includes('說話方式'));
assert.deepEqual(characters.toPublicCharacter(c).profile, p);
assert.equal(characters.toPublicCharacter({ ...c, profile: {} }).personality, c.personality);
console.log('Character profile: validation, round-trip, legacy compatibility, chat and scene prompts passed. No network or paid API calls.');
