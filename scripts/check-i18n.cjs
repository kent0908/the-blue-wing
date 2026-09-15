/**
 * Lists every tr("…") / k("…") key in app/, components/ and lib/ and reports
 * which ones the English and Japanese tables still lack. Exit code 1 when
 * any are missing so it can gate a push.
 *
 *   node scripts/check-i18n.cjs             summary
 *   node scripts/check-i18n.cjs --missing   print the missing keys per language
 *   node scripts/check-i18n.cjs --all       print every key
 */
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p, out); }
    else if (/\.(tsx?|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = ['app', 'components', 'lib'].flatMap((d) => walk(d, []));
const keys = new Set();
const re = /\b(?:tr|k)\(\s*(["'])((?:\\.|(?!\1).)*)\1/g;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = re.exec(s))) keys.add(m[2].replace(/\\(["'])/g, '$1'));
}
function load(file) {
  const m = { exports: {} };
  const dir = path.dirname(path.resolve(file));
  const req = (id) => (id.startsWith('.') ? load(path.resolve(dir, id + '.ts')) : require(id));
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(req, m, m.exports);
  return m.exports;
}
const { EN } = load('lib/i18n/strings/en.ts'), { JA } = load('lib/i18n/strings/ja.ts');
const missEn = [...keys].filter((k) => !(k in EN)), missJa = [...keys].filter((k) => !(k in JA));
if (process.argv.includes('--all')) console.log([...keys].join('\n'));
if (process.argv.includes('--missing')) { console.log('--- en'); console.log(missEn.join('\n')); console.log('--- ja'); console.log(missJa.join('\n')); }
console.log(`tr()/k() keys: ${keys.size} · en missing: ${missEn.length} · ja missing: ${missJa.length}`);
process.exitCode = missEn.length || missJa.length ? 1 : 0;
