const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const file = require('node:path').resolve('lib/officialCompanionStory.ts');
const mod = new Module(file, module);
mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { OFFICIAL_STORIES, openingSuggestions, storyPrompt, parseStoryReply, decodeStoryMessage, STORY_MESSAGE_PREFIX } = mod.exports;
assert.equal(Object.keys(OFFICIAL_STORIES).length, 10);
for (const [key, story] of Object.entries(OFFICIAL_STORIES)) {
  assert.equal(story.events.length, 4);
  assert.equal(openingSuggestions(key).length, 3);
  assert.match(storyPrompt(key), /不是已發生的正史/);
  const raw = JSON.stringify({reply:'先一起確認現場。', suggestions: story.opening});
  const parsed = parseStoryReply(raw);
  assert.equal(parsed.suggestions.length, 3);
  assert.deepEqual(decodeStoryMessage(STORY_MESSAGE_PREFIX + raw), parsed);
}
assert.equal(decodeStoryMessage('舊對話內容'), null);
for (const invalid of ['{', '{}', '{"reply":"hi","suggestions":["a","a","a"]}', '{"reply":"hi","suggestions":[1,2,3]}', '{"reply":"","suggestions":["a","b","c"]}']) assert.equal(parseStoryReply(invalid), null);
assert.equal(parseStoryReply('```json\n{"reply":"好","suggestions":["甲","乙","丙"]}\n```').reply, '好');
console.log('PASS: 10 official stories, suggestions, persistence envelopes, legacy text and malformed output.');
