/**
 * Companion TTS: what gets spoken, what it costs, and what the voice
 * allowlist accepts. No provider calls, no database, no credentials.
 */
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), assert = require('node:assert/strict');
const cache = new Map();
function load(file, overrides = {}) {
  file = path.resolve(file);
  const key = file + JSON.stringify(Object.keys(overrides));
  if (cache.has(key)) return cache.get(key);
  const mod = { exports: {} };
  const req = (id) => {
    if (id in overrides) return overrides[id];
    if (/i18n[\\/]k$/.test(id)) return { k: (s) => s };
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'));
    return require(id);
  };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(req, mod, mod.exports);
  cache.set(key, mod.exports);
  return mod.exports;
}

const story = load('lib/officialCompanionStory.ts');
const { spokenText, speechUnits, SPEECH_CHARS_PER_UNIT, MAX_SPEECH_CHARS } = load('lib/speechText.ts');
const voices = load('lib/voices.ts');
const { creditCostFromRate } = load('lib/creditFormula.ts');
const speech = load('lib/speech.ts', { './siraya': { SirayaApiError: Error, SirayaConfigError: Error }, './voices': voices });

let checks = 0;
const check = (fn) => { fn(); checks++; };

/* ---- what gets spoken ---- */
check(() => assert.equal(spokenText('今天天氣真好。'), '今天天氣真好。'));
// stage directions are written to be read, not heard — and not paid for
check(() => assert.equal(spokenText('（輕輕望向窗外）今天天氣真好。'), '今天天氣真好。'));
check(() => assert.equal(spokenText('(smiles) hello there'), 'hello there'));
check(() => assert.equal(spokenText('*笑* 好啊'), '好啊'));
// an official reply is stored as a JSON envelope; only the reply is spoken
check(() => assert.equal(
  spokenText(story.STORY_MESSAGE_PREFIX + JSON.stringify({ reply: '我也這麼覺得。', suggestions: ['a', 'b', 'c'] })),
  '我也這麼覺得。'
));
// a malformed envelope must not leak the prefix into the audio
check(() => assert.ok(!spokenText(story.STORY_MESSAGE_PREFIX + 'not json').includes('bluewing-story')));
check(() => assert.equal(spokenText('（全部都是動作）'), ''));
check(() => assert.equal(spokenText(null), ''));
check(() => assert.equal(spokenText('字'.repeat(5000)).length, MAX_SPEECH_CHARS));

/* ---- what it costs ---- */
check(() => assert.equal(speechUnits('a'), 1)); // never free
check(() => assert.equal(speechUnits('字'.repeat(SPEECH_CHARS_PER_UNIT)), 1));
check(() => assert.equal(speechUnits('字'.repeat(SPEECH_CHARS_PER_UNIT + 1)), 2));
const cost = (chars, credits = 1) => creditCostFromRate({ modality: 'speech', credits, speechChars: chars });
check(() => assert.equal(cost(40), 1));
check(() => assert.equal(cost(96), 3));  // the site's median stored reply
check(() => assert.equal(cost(104), 3)); // the site's mean stored reply
check(() => assert.equal(cost(166), 5)); // p90
check(() => assert.equal(cost(0), 1));
check(() => assert.equal(cost(96, 2), 6)); // rate is per unit, so it scales
// billing is computed from the SPOKEN text, not the stored text
check(() => {
  const stored = '（輕輕望向窗外）' + '字'.repeat(40);
  assert.equal(speechUnits(spokenText(stored)), 1);
  assert.ok(speechUnits(stored) > 1);
});

/* ---- voice allowlist ---- */
check(() => assert.ok(voices.isVoice(voices.DEFAULT_VOICE)));
check(() => assert.ok(!voices.isVoice('Kore; DROP TABLE')));
check(() => assert.ok(!voices.isVoice(null) && !voices.isVoice(undefined) && !voices.isVoice(42)));
// an unknown or cleared pick falls back rather than reaching the provider
check(() => assert.equal(voices.resolveVoice('made-up'), voices.DEFAULT_VOICE));
check(() => assert.equal(voices.resolveVoice(null), voices.DEFAULT_VOICE));
check(() => assert.equal(voices.resolveVoice('Puck'), 'Puck'));
check(() => assert.ok(voices.VOICES.every((v) => /^[A-Za-z]{3,20}$/.test(v.id) && v.tone)));
check(() => assert.equal(new Set(voices.VOICES.map((v) => v.id)).size, voices.VOICES.length));

/* ---- WAV container ---- */
const pcm = Buffer.alloc(48_000 * 2); // 1 second at 48kHz, 16-bit mono
const wav = speech.wavFromPcm16(pcm, 48_000);
check(() => assert.equal(wav.length, pcm.length + 44));
check(() => assert.equal(wav.toString('latin1', 0, 4), 'RIFF'));
check(() => assert.equal(wav.toString('latin1', 8, 12), 'WAVE'));
check(() => assert.equal(wav.readUInt32LE(4), 36 + pcm.length));
check(() => assert.equal(wav.readUInt16LE(22), 1));          // mono
check(() => assert.equal(wav.readUInt32LE(24), 48_000));     // sample rate
check(() => assert.equal(wav.readUInt32LE(28), 48_000 * 2)); // byte rate
check(() => assert.equal(wav.readUInt16LE(34), 16));         // bit depth
check(() => assert.equal(wav.readUInt32LE(40), pcm.length));
check(() => assert.equal(speech.sampleRateOf('audio/L16;codec=pcm;rate=24000'), 24_000));
check(() => assert.equal(speech.sampleRateOf(undefined), 24_000)); // documented default
check(() => assert.equal(speech.sampleRateOf('audio/L16;rate=99'), 24_000)); // out of range -> default

/* ---- the feature flag really gates on the credential ---- */
check(() => {
  const saved = process.env.GOOGLE_AI_API_KEY;
  delete process.env.GOOGLE_AI_API_KEY;
  assert.equal(speech.speechConfigured(), false);
  process.env.GOOGLE_AI_API_KEY = '  ';
  assert.equal(speech.speechConfigured(), false, 'blank key must not count as configured');
  process.env.GOOGLE_AI_API_KEY = 'k';
  assert.equal(speech.speechConfigured(), true);
  if (saved === undefined) delete process.env.GOOGLE_AI_API_KEY; else process.env.GOOGLE_AI_API_KEY = saved;
});

console.log(`PASS ${checks} companion speech checks; no provider, storage or database calls`);
