const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
const moduleUnderTest = { exports: {} };
const source = ts.transpileModule(fs.readFileSync('lib/authDestination.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function('exports', source)(moduleUnderTest.exports);
const { authDestination } = moduleUnderTest.exports;
for (const destination of ['/business?kind=video&tab=workflows', '/studio?mode=video&model=SIRAYA-Seedance-2.5', '/canvas/123#shot-2']) {
  assert.equal(authDestination(destination), destination);
  assert.equal(authDestination(new URLSearchParams(`next=${encodeURIComponent(destination)}`).get('next')), destination);
}
for (const invalid of [null, {}, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/\nevil.example', '/login?next=/login', '/register', '/verify?token=x']) {
  assert.equal(authDestination(invalid, '/account'), '/account');
}
console.log('PASS: auth return paths preserve studio/business context and reject external URLs, control characters and auth loops.');
