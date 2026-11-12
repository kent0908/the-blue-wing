// Use the actual shared converter in fixtures that otherwise mock all imports.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');

const file = path.resolve(__dirname, '../../lib/i18n/simplifyChinese.ts');
const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const fixture = { exports: {} };
new Function('require', 'module', 'exports', output)(createRequire(file), fixture, fixture.exports);
module.exports = fixture.exports;
