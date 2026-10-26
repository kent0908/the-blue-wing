/** Real MotionCover lifecycle and Hub controls. Deterministic hooks/media/observer fixtures only.
 * No browser-layout claims, provider requests, network, credentials or paid generation.
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true };
const cache = new Map();
let active = null, environment = null, requests = 0;
const jsx = (type, props, key) => ({ type, props: props || {}, key });
const hooks = {
  useState(initial) {
    const owner = active, index = owner.stateCursor++;
    if (!(index in owner.states)) owner.states[index] = typeof initial === 'function' ? initial() : initial;
    return [owner.states[index], value => {
      const next = typeof value === 'function' ? value(owner.states[index]) : value;
      if (!Object.is(next, owner.states[index])) { owner.states[index] = next; owner.dirty = true; }
    }];
  },
  useRef(initial) { const owner = active, index = owner.refCursor++; return owner.refs[index] ||= { current: initial }; },
  useMemo: fn => fn(),
  useEffect(fn, deps) {
    const owner = active, index = owner.effectCursor++, previous = owner.dependencies[index];
    if (!previous || !deps || deps.length !== previous.length || deps.some((value, i) => !Object.is(value, previous[i]))) {
      owner.pending.push({ index, fn }); owner.dependencies[index] = deps;
    }
  },
};
function load(relative) {
  const full = path.resolve(root, relative);
  if (cache.has(full)) return cache.get(full);
  const fixture = { exports: {} };
  // Expose the actual private component for this fixture, without changing product source.
  const source = fs.readFileSync(full, 'utf8') + (relative === 'components/IndustryCreativeHub.tsx' ? '\nexport { MotionCover };\n' : '');
  const code = ts.transpileModule(source, { compilerOptions: options }).outputText;
  new Function('require', 'module', 'exports', code)(id => {
    if (id === 'react') return hooks;
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: Symbol('Fragment') };
    if (id === 'next/navigation') return { useRouter: () => ({ push() { throw Error('Motion must not navigate'); } }) };
    if (id === '@/lib/i18n/client') return { useLocale: () => 'en' };
    if (id.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (id.startsWith('@/')) return load(id.slice(2) + '.ts');
    if (id.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(full), id + '.ts')));
    return require(id);
  }, fixture, fixture.exports);
  cache.set(full, fixture.exports);
  return fixture.exports;
}
const { default: Hub, MotionCover } = load('components/IndustryCreativeHub.tsx');
const flatten = value => value == null || typeof value === 'boolean' ? [] : Array.isArray(value) ? value.flatMap(flatten) : typeof value === 'object' ? [value, ...flatten(value.props?.children)] : [value];
const elements = tree => flatten(tree).filter(value => value && typeof value === 'object');
function instance() { return { states: [], refs: [], dependencies: [], cleanups: [], pending: [], stateCursor: 0, refCursor: 0, effectCursor: 0, dirty: false, videos: [] }; }
function render(Component, props, owner) {
  owner.stateCursor = owner.refCursor = owner.effectCursor = 0; owner.dirty = false; active = owner;
  try { owner.tree = Component(props); return owner.tree; } finally { active = null; }
}
function target() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    dispatch(type) { for (const listener of [...(listeners.get(type) || [])]) listener(); },
    count(type) { return listeners.get(type)?.size || 0; },
  };
}
function setup({ reduced = false, hidden = false, rejection = false } = {}) {
  const mq = { ...target(), matches: reduced }, page = { ...target(), visibilityState: hidden ? 'hidden' : 'visible' }, observers = [];
  global.window = { matchMedia: query => { assert.equal(query, '(prefers-reduced-motion: reduce)'); return mq; } };
  global.document = page;
  global.IntersectionObserver = class {
    constructor(callback, options) { this.callback = callback; this.options = options; this.observed = new Set(); this.disconnected = false; observers.push(this); }
    observe(node) { this.observed.add(node); }
    disconnect() { this.disconnected = true; this.observed.clear(); }
    emit(intersecting) { if (!this.disconnected) this.callback([{ isIntersecting: intersecting }]); }
  };
  environment = { mq, page, observers, rejection };
  return environment;
}
function media() {
  return {
    playCalls: 0, pauseCalls: 0,
    play() { this.playCalls++; return environment.rejection ? Promise.reject(Error('Autoplay denied')) : Promise.resolve(); },
    pause() { this.pauseCalls++; },
  };
}
function commitMotion(props, owner) {
  let rounds = 0;
  do {
    assert.ok(rounds++ < 10, 'Motion effects settle without an update loop');
    const tree = render(MotionCover, props, owner), nodes = elements(tree), video = nodes.find(node => node.type === 'video');
    owner.region ||= { role: 'cover-region' };
    tree.props.ref.current = owner.region;
    // React clears refs during the mutation phase before passive effect setup.
    if (video) {
      if (!owner.mountedVideo) { owner.mountedVideo = media(); owner.videos.push(owner.mountedVideo); }
      video.props.ref.current = owner.mountedVideo;
    } else { if (owner.refs[1]) owner.refs[1].current = null; owner.mountedVideo = null; }
    for (const effect of owner.pending.splice(0)) { owner.cleanups[effect.index]?.(); owner.cleanups[effect.index] = effect.fn(); }
  } while (owner.dirty);
  return owner.tree;
}
function unmount(owner) {
  for (const ref of owner.refs) ref.current = null;
  for (const cleanup of owner.cleanups) cleanup?.();
  owner.cleanups = []; owner.mountedVideo = null;
}
const cover = { image: '/local-fixture-poster.jpg', video: '/local-fixture-motion.mp4', tone: 'photo' };
const videoIn = owner => elements(owner.tree).find(node => node.type === 'video');
const imageIn = owner => elements(owner.tree).find(node => node.type === 'img');
function activeCover(options = {}) {
  const env = setup(options), owner = instance(), props = { cover, enabled: true };
  commitMotion(props, owner); assert.equal(env.observers.length, 1); env.observers[0].emit(true); commitMotion(props, owner);
  return { env, owner, props };
}
let passed = 0;
async function test(name, run) { await run(); passed++; console.log('PASS industry motion: ' + name); }
const previous = { window: global.window, document: global.document, IntersectionObserver: global.IntersectionObserver, fetch: global.fetch };
global.fetch = () => { requests++; throw Error('Motion fixtures cannot use any network or paid API'); };
(async () => {
  await test('real component initially shows its poster and observes only its own region', () => {
    const env = setup(), owner = instance(); commitMotion({ cover, enabled: true }, owner);
    assert.equal(videoIn(owner), undefined); assert.equal(imageIn(owner).props.src, cover.image);
    assert.equal(env.observers.length, 1); assert.deepEqual([...env.observers[0].observed], [owner.region]);
    assert.equal(env.observers[0].options.threshold, 0.2); assert.equal(env.mq.count('change'), 1); assert.equal(env.page.count('visibilitychange'), 1); unmount(owner);
  });
  await test('all sixteen visibility, enabled, motion-preference and page-state combinations gate actual play', () => {
    for (const enabled of [false, true]) for (const visible of [false, true]) for (const reduced of [false, true]) for (const hidden of [false, true]) {
      const env = setup({ reduced, hidden }), owner = instance(), props = { cover, enabled }; commitMotion(props, owner);
      env.observers[0].emit(visible); commitMotion(props, owner);
      const calls = owner.videos.reduce((total, video) => total + video.playCalls, 0);
      assert.equal(calls > 0, enabled && visible && !reduced && !hidden, JSON.stringify({ enabled, visible, reduced, hidden }));
      if (reduced || !visible) assert.equal(videoIn(owner), undefined);
      if (videoIn(owner)) { const attrs = videoIn(owner).props; assert.equal(attrs.muted, true); assert.equal(attrs.loop, true); assert.equal(attrs.playsInline, true); assert.equal(attrs.preload, 'none'); assert.equal(attrs.poster, cover.image); }
      unmount(owner);
    }
  });
  await test('pause toggle and background tabs explicitly pause a mounted player and can resume', () => {
    const { env, owner, props } = activeCover(); const player = owner.mountedVideo; assert.ok(player.playCalls);
    commitMotion({ ...props, enabled: false }, owner); assert.ok(player.pauseCalls); assert.equal(owner.mountedVideo, player);
    const pausedCalls = player.playCalls; commitMotion(props, owner); assert.ok(player.playCalls > pausedCalls);
    const pauses = player.pauseCalls; env.page.visibilityState = 'hidden'; env.page.dispatch('visibilitychange'); commitMotion(props, owner); assert.ok(player.pauseCalls > pauses);
    const plays = player.playCalls; env.page.visibilityState = 'visible'; env.page.dispatch('visibilitychange'); commitMotion(props, owner); assert.ok(player.playCalls > plays); unmount(owner);
  });
  await test('leaving the viewport unmounts the video and pauses the previously captured media element', () => {
    const { env, owner, props } = activeCover(), player = owner.mountedVideo, pauses = player.pauseCalls;
    env.observers[0].emit(false); commitMotion(props, owner);
    assert.equal(videoIn(owner), undefined); assert.equal(imageIn(owner).props.src, cover.image); assert.equal(owner.refs[1].current, null);
    assert.ok(player.pauseCalls > pauses, 'Cleanup must pause the old element even after React clears player.current'); unmount(owner);
  });
  await test('a reduced-motion change removes playback and keeps the poster', () => {
    const { env, owner, props } = activeCover(), player = owner.mountedVideo, pauses = player.pauseCalls;
    env.mq.matches = true; env.mq.dispatch('change'); commitMotion(props, owner);
    assert.equal(videoIn(owner), undefined); assert.equal(imageIn(owner).props.src, cover.image); assert.ok(player.pauseCalls > pauses); unmount(owner);
  });
  await test('autoplay rejection leaves the existing poster and does not crash or retry on unrelated renders', async () => {
    const { owner, props } = activeCover({ rejection: true }), player = owner.mountedVideo;
    await Promise.resolve(); await Promise.resolve();
    assert.ok(videoIn(owner)); assert.equal(videoIn(owner).props.poster, cover.image); assert.equal(player.playCalls, 1);
    assert.doesNotThrow(() => commitMotion(props, owner)); assert.equal(player.playCalls, 1); unmount(owner);
  });
  await test('a media error falls back to the image, pauses the failed element and never remounts it on toggle', () => {
    const { owner, props } = activeCover(), player = owner.mountedVideo, pauses = player.pauseCalls;
    videoIn(owner).props.onError(); commitMotion(props, owner); assert.equal(videoIn(owner), undefined); assert.equal(imageIn(owner).props.src, cover.image); assert.ok(player.pauseCalls > pauses);
    commitMotion({ ...props, enabled: false }, owner); commitMotion(props, owner); assert.equal(videoIn(owner), undefined); assert.equal(owner.videos.length, 1); unmount(owner);
  });
  await test('unmount disconnects the observer, removes both listeners and pauses a playing element', () => {
    const { env, owner } = activeCover(), player = owner.mountedVideo, pauses = player.pauseCalls;
    unmount(owner); assert.equal(env.observers[0].disconnected, true); assert.equal(env.observers[0].observed.size, 0); assert.equal(env.mq.count('change'), 0); assert.equal(env.page.count('visibilitychange'), 0); assert.ok(player.pauseCalls > pauses);
    const states = [...owner.states]; env.mq.dispatch('change'); env.page.dispatch('visibilitychange'); env.observers[0].emit(false); assert.deepEqual(owner.states, states);
  });
  await test('a static or typographic cover registers no media observers or preference listeners', () => {
    for (const staticCover of [{ image: cover.image, tone: 'photo' }, { word: 'STUDIO', tone: 'paper' }]) {
      const env = setup(), owner = instance(); commitMotion({ cover: staticCover, enabled: true }, owner);
      assert.equal(videoIn(owner), undefined); assert.equal(env.observers.length, 0); assert.equal(env.mq.count('change'), 0); assert.equal(env.page.count('visibilitychange'), 0); unmount(owner);
    }
  });
  await test('real Hub pause control and an open brief disable every MotionCover', () => {
    setup(); const owner = instance();
    const cards = () => elements(render(Hub, {}, owner)).filter(node => node.type === MotionCover);
    assert.ok(cards().length); assert.ok(cards().every(node => node.props.enabled));
    elements(owner.tree).find(node => node.type === 'button' && node.props.className === 'motionToggle').props.onClick(); assert.ok(cards().every(node => !node.props.enabled));
    elements(owner.tree).find(node => node.type === 'button' && node.props.className === 'motionToggle').props.onClick(); assert.ok(cards().every(node => node.props.enabled));
    elements(owner.tree).find(node => node.type === 'button' && node.props.className === 'cardButton').props.onClick({ currentTarget: { focus() {} } }); assert.ok(cards().every(node => !node.props.enabled));
    const brief = elements(owner.tree).find(node => typeof node.type === 'function' && node.props.id && node.props.onClose); assert.ok(brief); brief.props.onClose(); assert.ok(cards().every(node => node.props.enabled));
  });
  assert.equal(requests, 0);
  console.log(`PASS ${passed} actual MotionCover lifecycle/control groups; zero network or paid calls. Native playback and layout require separate browser verification.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete global[key]; else global[key] = value; }
});
