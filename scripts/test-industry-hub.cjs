/** Real IndustryCreativeHub / SkillBrief render and handlers, with deterministic hooks/DOM/navigation fixtures.
 * No browser-layout claims, API requests, database changes, model calls or paid generation.
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true };
const cache = new Map();
let active, locale = 'zh-Hant', navigations = [], fetches = [], activeFocus = null, copied = [];
const jsx = (type, props, key) => ({ type, props: props || {}, key });
function instance() { return { states: [], refs: [], effects: [], pending: [], cleanups: [], stateCursor: 0, refCursor: 0, effectCursor: 0 }; }
const hooks = {
  useState(initial) { const owner = active, index = owner.stateCursor++; if (!(index in owner.states)) owner.states[index] = typeof initial === 'function' ? initial() : initial; return [owner.states[index], value => { owner.states[index] = typeof value === 'function' ? value(owner.states[index]) : value; }]; },
  useRef(initial) { const owner = active, index = owner.refCursor++; return owner.refs[index] ||= { current: initial }; },
  useMemo: fn => fn(),
  useEffect(fn, deps) { const owner = active, index = owner.effectCursor++, previous = owner.effects[index]; if (!previous || deps?.some((value, i) => !Object.is(value, previous[i]))) { owner.pending.push({ index, fn }); owner.effects[index] = deps; } },
};
const router = { push: href => navigations.push(href) };
function load(relative) {
  const full = path.resolve(root, relative); if (cache.has(full)) return cache.get(full);
  const fixtureModule = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: options }).outputText)(id => {
    if (id === 'react') return hooks;
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: Symbol('Fragment') };
    if (id === 'next/navigation') return { useRouter: () => router };
    if (id === '@/lib/i18n/client') return { useLocale: () => locale };
    if (id.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (id.startsWith('@/')) return load(id.slice(2) + '.ts');
    if (id.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(full), id + '.ts')));
    return require(id);
  }, fixtureModule, fixtureModule.exports);
  cache.set(full, fixtureModule.exports); return fixtureModule.exports;
}
const flatten = value => value == null || typeof value === 'boolean' ? [] : Array.isArray(value) ? value.flatMap(flatten) : typeof value === 'object' ? [value, ...flatten(value.props?.children)] : [value];
const text = value => flatten(value).filter(item => typeof item === 'string' || typeof item === 'number').join(' ');
const elements = value => flatten(value).filter(item => item && typeof item === 'object');
function reactTree(value) {
  if (value == null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') return value;
  if (Array.isArray(value)) return value.map((item, index) => { const element = reactTree(item); return React.isValidElement(element) && element.key === null ? React.cloneElement(element, { key: index }) : element; });
  assert.ok(value.type, 'A production brief cannot render a plain object as a React child');
  return React.createElement(typeof value.type === 'symbol' ? React.Fragment : value.type, { ...value.props, key: value.key }, reactTree(value.props?.children));
}
function render(Component, props, owner) { owner.stateCursor = owner.refCursor = owner.effectCursor = 0; active = owner; try { return Component(props); } finally { active = null; } }
function focusable(name) { return { name, focus() { activeFocus = name; } }; }
function attachDialog(tree, owner) {
  const dialog = elements(tree).find(node => node.type === 'dialog');
  if (dialog && !owner.dialog) owner.dialog = { open: false, showCount: 0, closeCount: 0, showModal() { this.open = true; this.showCount++; }, close() { this.open = false; this.closeCount++; }, querySelector(selector) { return focusable(selector); } };
  if (dialog) dialog.props.ref.current = owner.dialog;
  for (const item of owner.pending.splice(0)) { owner.cleanups[item.index]?.(); owner.cleanups[item.index] = item.fn(); }
}
function unmount(owner) { for (const cleanup of owner.cleanups) cleanup?.(); }
global.fetch = async (...args) => { fetches.push(args); throw Error('Industry UI must never call any paid or server API'); };
global.navigator ||= {};
Object.defineProperty(global.navigator, 'clipboard', { configurable: true, value: { writeText: async value => copied.push(value) } });
const { INDUSTRY_SKILLS, getLocalizedSkill, buildIndustryPrompt } = load('lib/industrySkills.ts');
const { readIndustryHandoff } = load('lib/industryHandoff.ts');
const { default: Hub } = load('components/IndustryCreativeHub.tsx');
function setup(language = 'zh-Hant') {
  locale = language; navigations = []; fetches = []; copied = []; activeFocus = null;
  const storage = new Map(); global.sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const hub = instance(), state = { hub, props: null, brief: null };
  state.render = () => state.tree = render(Hub, {}, hub);
  state.open = id => {
    const title = getLocalizedSkill(id, locale).title;
    const button = elements(state.render()).find(node => node.type === 'button' && String(node.props['aria-label'] || '').endsWith('：' + title));
    assert.ok(button, 'real card button exists for ' + id);
    state.trigger = focusable('card:' + id); button.props.onClick({ currentTarget: state.trigger });
    const briefElement = elements(state.render()).find(node => typeof node.type === 'function' && node.props?.id === id && typeof node.props?.onClose === 'function');
    assert.ok(briefElement, 'real selected SkillBrief child'); state.Component = briefElement.type; state.props = briefElement.props; state.brief = instance(); return state.renderBrief();
  };
  state.renderBrief = () => { const tree = render(state.Component, state.props, state.brief); attachDialog(tree, state.brief); return state.briefTree = tree; };
  state.change = (name, value) => { const field = elements(state.renderBrief()).find(node => node.type === 'textarea' && node.props.name === name); assert.ok(field, 'editable field: ' + name); field.props.onChange({ target: { value } }); return state.renderBrief(); };
  state.submit = () => { const form = elements(state.renderBrief()).find(node => node.type === 'form'); assert.ok(form); form.props.onSubmit({ preventDefault() {} }); return state.renderBrief(); };
  state.fillRequired = id => { const skill = getLocalizedSkill(id, locale); for (const field of skill.fields.filter(item => item.required)) state.change(field.key, `${field.label} — original cobalt study`); };
  return state;
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS industry hub: ' + name); }
(async () => {
  await test('catalogue has sixteen distinct plans and complete localized fields', () => {
    assert.equal(INDUSTRY_SKILLS.length, 16); assert.equal(new Set(INDUSTRY_SKILLS.map(item => item.id)).size, 16);
    for (const category of ['commerce', 'advertising', 'games', 'art']) assert.equal(INDUSTRY_SKILLS.filter(item => item.category === category).length, 4);
    for (const language of ['zh-Hant', 'en', 'ja']) for (const item of INDUSTRY_SKILLS) { const skill = getLocalizedSkill(item.id, language); assert.equal(skill.id, item.id); assert.ok(skill.title && skill.summary && skill.deliverable); assert.ok(['image', 'video'].includes(skill.mediaType)); assert.ok(skill.fields.some(field => field.required)); assert.equal(new Set(skill.fields.map(field => field.key)).size, skill.fields.length); for (const field of skill.fields) assert.ok(field.label && field.placeholder); assert.ok(skill.workflow.length); }
  });
  await test('category and keyword search change real rendered cards without API calls', () => {
    for (const language of ['zh-Hant', 'en', 'ja']) {
      const state = setup(language), first = INDUSTRY_SKILLS.find(item => item.category === 'commerce'), title = getLocalizedSkill(first.id, language).title;
      const cardCount = () => elements(state.render()).filter(node => node.type === 'article').length;
      assert.equal(cardCount(), 8); const more = elements(state.render()).find(node => node.type === 'button' && node.props['aria-expanded'] !== undefined); assert.ok(more); more.props.onClick(); assert.equal(cardCount(), 16);
      const categories = elements(state.render()).filter(node => node.type === 'button' && node.props['aria-pressed'] !== undefined && !node.props['aria-label']); assert.equal(categories.length, 5);
      categories[1].props.onClick(); assert.equal(cardCount(), 4);
      const search = elements(state.render()).find(node => node.type === 'input' && node.props.type === 'search'); search.props.onChange({ target: { value: title } }); assert.equal(cardCount(), 1);
      search.props.onChange({ target: { value: '___no_matching_industry_skill___' } }); assert.equal(cardCount(), 0);
      const reset = elements(state.render()).find(node => node.type === 'button' && node.props.onClick && node.props['aria-pressed'] === undefined && node.props['aria-label'] === undefined && node.props['aria-expanded'] === undefined); assert.ok(reset); reset.props.onClick(); assert.equal(cardCount(), 16); assert.equal(fetches.length, 0);
    }
  });
  await test('each real card opens its named modal and validates required fields before navigation', () => {
    for (const language of ['zh-Hant', 'en', 'ja']) {
      const id = INDUSTRY_SKILLS[0].id, state = setup(language); state.open(id); assert.equal(state.brief.dialog.showCount, 1);
      const dialog = elements(state.briefTree).find(node => node.type === 'dialog'), heading = elements(state.briefTree).find(node => node.props?.id === dialog.props['aria-labelledby']); assert.equal(text(heading), getLocalizedSkill(id, language).title);
      state.submit(); assert.equal(navigations.length, 0); assert.ok(elements(state.briefTree).some(node => node.props?.role === 'alert' && text(node).trim()));
      const firstRequired = getLocalizedSkill(id, language).fields.find(field => field.required); assert.equal(activeFocus, `[name="${firstRequired.key}"]`); assert.equal(fetches.length, 0);
    }
  });
  await test('actual React can render each localized review including structured workflow steps', () => {
    for (const language of ['zh-Hant', 'en', 'ja']) for (const category of ['commerce', 'advertising', 'games', 'art']) {
      const item = INDUSTRY_SKILLS.find(skill => skill.category === category), state = setup(language); state.open(item.id); const html = renderToStaticMarkup(reactTree(state.briefTree)); assert.ok(html.startsWith('<dialog')); assert.equal((html.match(/<li>/g) || []).length, getLocalizedSkill(item.id, language).workflow.length); assert.ok(html.includes('industry-prompt')); unmount(state.brief);
    }
  });
  await test('filled brief rebuilds the prompt, manual edits survive into same-origin studio handoff', () => {
    for (const language of ['zh-Hant', 'en', 'ja']) for (const category of ['commerce', 'advertising', 'games', 'art']) {
      const item = INDUSTRY_SKILLS.find(skill => skill.category === category), state = setup(language); state.open(item.id); state.fillRequired(item.id);
      const builtPrompt = elements(state.renderBrief()).find(node => node.props?.name === 'editedPrompt').props.value; assert.ok(builtPrompt.includes('original cobalt study'));
      const manual = `  Original edited direction — 藍羽と光 / ${category} & 50%  `; state.change('editedPrompt', manual); state.submit(); assert.equal(navigations.length, 1);
      const url = new URL(navigations[0], 'https://thebluewing.studio'); assert.equal(url.origin, 'https://thebluewing.studio'); assert.equal(url.pathname, '/studio'); assert.equal(url.searchParams.get('mode'), getLocalizedSkill(item.id, language).mediaType); assert.deepEqual([...url.searchParams.keys()].sort(), ['brief', 'mode']); assert.ok(url.searchParams.get('brief')); const stored = readIndustryHandoff(global.sessionStorage, url.searchParams.get('brief')); assert.ok(stored); assert.equal(stored.prompt, manual.trim()); assert.equal(stored.mode, getLocalizedSkill(item.id, language).mediaType); assert.equal(stored.locale, language); assert.equal(navigations[0].includes('Original'), false); assert.equal(fetches.length, 0);
      unmount(state.brief);
    }
  });
  await test('empty or oversized edited prompt never navigates even when the brief is complete', () => {
    const id = INDUSTRY_SKILLS[0].id, state = setup('en'); state.open(id); state.fillRequired(id);
    for (const value of ['', ' '.repeat(20), 'x'.repeat(12001)]) { state.change('editedPrompt', value); state.submit(); assert.equal(navigations.length, 0); assert.ok(elements(state.briefTree).some(node => node.props?.role === 'alert')); }
    assert.equal(fetches.length, 0);
  });
  await test('storage failure retains the reviewed prompt and shows an error without navigation', () => {
    const id = INDUSTRY_SKILLS[0].id, state = setup('en'); state.open(id); state.fillRequired(id); state.change('editedPrompt', 'Keep my complete draft'); global.sessionStorage.setItem = () => { throw Error('Storage blocked'); }; state.submit(); assert.equal(navigations.length, 0); assert.equal(elements(state.briefTree).find(node => node.props?.name === 'editedPrompt').props.value, 'Keep my complete draft'); assert.ok(elements(state.briefTree).some(node => node.props?.role === 'alert')); assert.equal(fetches.length, 0);
  });
  await test('a subsequent brief edit deliberately rebuilds an overridden prompt', () => {
    const id = INDUSTRY_SKILLS[0].id, state = setup('en'); state.open(id); state.fillRequired(id); state.change('editedPrompt', 'My manual override'); const field = getLocalizedSkill(id, 'en').fields.find(item => item.required); state.change(field.key, 'New subject direction'); const prompt = elements(state.renderBrief()).find(node => node.props?.name === 'editedPrompt').props.value; assert.notEqual(prompt, 'My manual override'); assert.ok(prompt.includes('New subject direction'));
  });
  await test('Cancel, Escape and backdrop close the real modal and restore the invoking card focus', () => {
    for (const kind of ['cancel', 'escape', 'backdrop']) {
      const state = setup('en'); state.open(INDUSTRY_SKILLS[0].id); const dialog = elements(state.briefTree).find(node => node.type === 'dialog');
      if (kind === 'cancel') elements(state.briefTree).find(node => node.type === 'button' && text(node) === 'Keep exploring').props.onClick();
      else if (kind === 'escape') { let prevented = false; dialog.props.onCancel({ preventDefault() { prevented = true; } }); assert.equal(prevented, true); }
      else { const target = {}; dialog.props.onClick({ target, currentTarget: target }); }
      assert.equal(state.brief.dialog.open, false); assert.equal(activeFocus, 'card:' + INDUSTRY_SKILLS[0].id); assert.equal(elements(state.render()).some(node => typeof node.type === 'function' && node.props?.onClose), false); assert.equal(navigations.length, 0); assert.equal(fetches.length, 0); unmount(state.brief);
    }
  });
  await test('copy writes only the reviewed prompt and gives feedback without a server call', async () => {
    const state = setup('en'); state.open(INDUSTRY_SKILLS[0].id); state.change('editedPrompt', 'Reviewable local text'); const button = elements(state.renderBrief()).find(node => node.type === 'button' && text(node) === 'Copy prompt'); await button.props.onClick(); state.renderBrief(); assert.deepEqual(copied, ['Reviewable local text']); assert.ok(text(state.briefTree).includes('Prompt copied')); assert.equal(fetches.length, 0);
  });
  await test('builder reports missing required fields and completes every plan without unresolved placeholders', () => {
    for (const language of ['zh-Hant', 'en', 'ja']) for (const item of INDUSTRY_SKILLS) {
      const skill = getLocalizedSkill(item.id, language), empty = buildIndustryPrompt(item.id, {}, language); assert.equal(empty.isComplete, false); assert.ok(empty.missingFields.length);
      const values = Object.fromEntries(skill.fields.map(field => [field.key, `${field.label} original study`])); const built = buildIndustryPrompt(item.id, values, language); assert.equal(built.isComplete, true); assert.deepEqual(built.missingFields, []); assert.ok(built.prompt.trim().length > 100); assert.equal(/\{\{[^}]+\}\}|\[object Object\]|undefined/.test(built.prompt), false);
    }
  });
  console.log(`PASS ${passed} actual industry UI/builder groups; three locales, zero network or paid requests. Browser layout/native dialog behavior is verified separately.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
