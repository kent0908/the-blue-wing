/** Executes the real foundation and routes against an in-memory transactional DB. No network or paid calls. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { randomBytes } = require('node:crypto');
const { NextRequest, NextResponse } = require('next/server');

function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(id => Object.hasOwn(mocks, id) ? mocks[id] : require(id), module, module.exports);
  return module.exports;
}

const types = load('lib/businessTypes.ts');
const secrets = load('lib/businessSecrets.ts', { 'server-only': {}, './businessTypes': types });
const adult = load('lib/adultGate.ts', { './i18n/k': { k: s => s } });
let state = { accounts: [], credentials: [], audit: [] };
let actor = { id: 7, email: 'business@example.test', role: 'user', email_verified: true, birth_date: null, adult_confirmed_at: null };
let tail = Promise.resolve();
let reads = 0;
let writes = 0;
const clone = value => structuredClone(value);
const bump = row => new Date(new Date(row.updated_at).getTime() + 1).toISOString();

async function acquire() {
  const previous = tail;
  let unlock;
  tail = new Promise(resolve => { unlock = resolve; });
  await previous;
  return unlock;
}

async function query(text, params = [], tx) {
  const q = text.replace(/\s+/g, ' ').trim().toLowerCase();
  if (q === 'begin') { tx.unlock = await acquire(); tx.snapshot = clone(state); return { rows: [] }; }
  if (q === 'commit' || q === 'rollback') {
    if (q === 'rollback') state = tx.snapshot;
    tx.unlock(); tx.unlock = null;
    return { rows: [] };
  }
  reads++;
  if (q.startsWith('select id from users')) return { rows: [{ id: params[0] }] };
  if (q.startsWith('select * from business_accounts where user_id=')) return { rows: clone(state.accounts.filter(a => a.user_id === params[0])) };
  if (q.startsWith('select status from business_accounts where id=')) return { rows: clone(state.accounts.filter(a => a.id === params[0] && a.user_id === params[1]).map(a => ({ status: a.status }))) };
  if (q.startsWith('select id,user_id,company_name')) return { rows: clone(state.accounts.filter(a => a.user_id === params[0])) };
  if (q.startsWith('select id,provider,label,last_four')) return { rows: clone(state.credentials.filter(c => c.user_id === params[0] && c.account_id === params[1] && c.is_active && !c.revoked_at).map(({ id, provider, label, last_four, updated_at }) => ({ id, provider, label, last_four, updated_at }))) };
  if (q.startsWith('select c.id,c.secret_envelope')) {
    const approved = state.accounts.some(a => a.id === params[1] && a.user_id === params[0] && a.status === 'approved');
    return { rows: approved ? clone(state.credentials.filter(c => c.user_id === params[0] && c.account_id === params[1] && !c.revoked_at && (params[2] === null ? c.is_active : c.id === params[2])).map(c => ({ id: c.id, secret_envelope: c.secret_envelope }))) : [] };
  }
  if (q.startsWith('select a.id,a.user_id')) return { rows: clone(state.accounts.map(a => ({ ...a, email: `user-${a.user_id}@example.test` }))) };
  assert.ok(tx?.unlock || q.startsWith('update users set birth_date='), `mutation requires a transaction: ${q}`);
  writes++;
  if (q.startsWith('insert into business_accounts')) {
    const row = { id: params[0], user_id: params[1], company_name: params[2], use_case: params[3], status: 'pending', review_note: null, created_at: '2026-10-19T00:00:00.000Z', updated_at: '2026-10-19T00:00:00.000Z' };
    assert.equal(state.accounts.some(a => a.user_id === row.user_id), false, 'one account per user');
    state.accounts.push(row); return { rows: clone([row]) };
  }
  if (q.startsWith('update business_accounts set company_name=')) {
    const row = state.accounts.find(a => a.id === params[0]);
    Object.assign(row, { company_name: params[1], use_case: params[2], status: 'pending', review_note: null, updated_at: bump(row) });
    return { rows: clone([row]) };
  }
  if (q.startsWith('update business_accounts set status=')) {
    const row = state.accounts.find(a => a.id === params[0]);
    Object.assign(row, { status: params[1], review_note: params[2], updated_at: bump(row) });
    return { rows: clone([row]) };
  }
  if (q.startsWith('insert into business_audit_events')) {
    state.audit.push({ account_id: params[0], actor_user_id: params[1], action: params[2], details: JSON.parse(params[3]) }); return { rows: [] };
  }
  if (q.startsWith('update business_credentials set is_active=false,updated_at=')) {
    state.credentials.filter(c => c.account_id === params[0] && c.user_id === params[1] && c.is_active).forEach(c => { c.is_active = false; }); return { rows: [] };
  }
  if (q.startsWith('insert into business_credentials')) {
    const row = { id: params[0], account_id: params[1], user_id: params[2], provider: 'siraya', label: params[3], last_four: params[4], secret_envelope: JSON.parse(params[5]), is_active: true, revoked_at: null, updated_at: '2026-10-19T00:00:01.000Z' };
    state.credentials.push(row); return { rows: clone([{ id: row.id, provider: row.provider, label: row.label, last_four: row.last_four, updated_at: row.updated_at }]) };
  }
  if (q.startsWith('update business_credentials set is_active=false,revoked_at=')) {
    const rows = state.credentials.filter(c => c.account_id === params[0] && c.user_id === params[1] && !c.revoked_at);
    rows.forEach(c => { c.is_active = false; c.revoked_at = '2026-10-19T00:01:00.000Z'; c.secret_envelope = null; });
    return { rows: rows.map(c => ({ id: c.id })) };
  }
  if (q.startsWith('update users set birth_date=')) {
    const approved = state.accounts.some(a => a.id === params[2] && a.user_id === params[1] && a.status === 'approved');
    if (!approved) return { rows: [] };
    actor.birth_date = params[0]; actor.adult_confirmed_at = '2026-10-19T00:00:00.000Z'; return { rows: [{ id: actor.id }] };
  }
  throw new Error(`Unexpected fixture query: ${q}`);
}

const sql = (strings, ...params) => query(strings.join('?'), params);
sql.query = (text, params) => query(text, params);
sql.connect = async () => {
  const tx = {};
  return { query: (text, params) => query(text, params, tx), release() { assert.equal(tx.unlock, null, 'connection released only after commit/rollback'); } };
};
const auth = {
  requireUser: async () => actor ? { user: clone(actor) } : { error: NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 }) },
  requireAdmin: async () => !actor ? { error: NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 }) } : actor.role === 'admin' ? { user: clone(actor) } : { error: NextResponse.json({ error: { code: 'forbidden' } }, { status: 403 }) },
};
const locale = req => req.cookies.get('bw_lang')?.value || 'en';
const business = load('lib/business.ts', { 'server-only': {}, './apiauth': auth, './adultGate': adult, './db': { sql }, './i18n/server': { localeFromRequest: locale }, './businessSecrets': secrets, './businessTypes': types });
const mocks = { '@/lib/business': business, '@/lib/apiauth': auth, '@/lib/adultGate': adult, '@/lib/db': { sql } };
const access = load('app/api/business/access/route.ts', mocks);
const credentials = load('app/api/business/credentials/route.ts', mocks);
const admin = load('app/api/admin/business/route.ts', mocks);
const age = load('app/api/business/adult/route.ts', mocks);
function request(path, method = 'GET', body, extraHeaders = {}) {
  return new NextRequest(`https://test.example${path}`, { method, headers: { origin: 'https://test.example', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...extraHeaders }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function expectResponse(promise, status, code) {
  const result = await promise;
  assert.equal(result.status, status);
  assert.match(result.headers.get('cache-control'), /private.*no-store/);
  const body = await result.json();
  if (code) assert.equal(body.error.code, code);
  return body;
}

(async () => {
  const original = process.env.BYOK_ENCRYPTION_KEY;
  try {
    delete process.env.BYOK_ENCRYPTION_KEY;
    assert.equal(secrets.isBusinessEncryptionReady(), false);
    assert.throws(() => secrets.encryptBusinessSecret('sk-fixture_key_1234567890', 7, 'account', 'credential'), /encryption_unavailable/);
    process.env.BYOK_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    assert.equal(secrets.isBusinessEncryptionReady(), true);
    const secret = 'sk-fixture_only_12345678901234567890';
    const envelope = secrets.encryptBusinessSecret(secret, 7, 'a', 'c');
    assert.equal(JSON.stringify(envelope).includes(secret), false);
    assert.notDeepEqual(envelope, secrets.encryptBusinessSecret(secret, 7, 'a', 'c'), 'random nonce per encryption');
    assert.equal(secrets.decryptBusinessSecret(envelope, 7, 'a', 'c'), secret);
    for (const wrong of [[8, 'a', 'c'], [7, 'b', 'c'], [7, 'a', 'd']]) assert.throws(() => secrets.decryptBusinessSecret(envelope, ...wrong), /credential_unavailable/);
    assert.throws(() => secrets.decryptBusinessSecret({ ...envelope, tag: randomBytes(16).toString('base64') }, 7, 'a', 'c'), /credential_unavailable/);
    const keyBefore = process.env.BYOK_ENCRYPTION_KEY;
    process.env.BYOK_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    assert.throws(() => secrets.decryptBusinessSecret(envelope, 7, 'a', 'c'), /credential_unavailable/);
    process.env.BYOK_ENCRYPTION_KEY = keyBefore;

    actor = null;
    await expectResponse(access.GET(request('/api/business/access')), 401, 'unauthorized');
    await expectResponse(credentials.GET(request('/api/business/credentials')), 401, 'unauthorized');
    actor = { id: 7, role: 'user', email_verified: true, birth_date: null, adult_confirmed_at: null };
    const empty = await expectResponse(access.GET(request('/api/business/access')), 200);
    assert.deepEqual(empty, { account: null, keyConfigured: false, encryptionReady: true, adultVerified: false });
    const before = writes;
    await expectResponse(access.POST(request('/api/business/access', 'POST', { companyName: 'Studio', useCase: 'A detailed business use case', status: 'approved' })), 400, 'invalid_application');
    await expectResponse(access.POST(request('/api/business/access', 'POST', { companyName: 'Studio', useCase: 'A detailed business use case' }, { origin: 'https://evil.example' })), 403, 'invalid_origin');
    await expectResponse(credentials.PUT(request('/api/business/credentials', 'PUT', { apiKey: secret })), 403, 'business_not_approved');
    assert.equal(writes, before, 'denied inputs never create a key or application');
    const appBody = { companyName: 'Test Studio', useCase: 'Business images and independent projects' };
    const application = (await expectResponse(access.POST(request('/api/business/access', 'POST', appBody)), 200)).account;
    assert.equal(application.status, 'pending');
    const again = (await expectResponse(access.POST(request('/api/business/access', 'POST', appBody)), 200)).account;
    assert.equal(again.id, application.id);
    assert.equal(state.audit.length, 1, 'identical application retry is a no-op');
    await expectResponse(credentials.PUT(request('/api/business/credentials', 'PUT', { apiKey: secret })), 403, 'business_not_approved');
    await expectResponse(admin.PATCH(request('/api/admin/business', 'PATCH', { userId: 7, status: 'approved', expectedUpdatedAt: application.updatedAt })), 403, 'forbidden');
    await expectResponse(admin.GET(request('/api/admin/business')), 403, 'forbidden');
    actor.role = 'admin';
    const reviewBody = { userId: 7, status: 'approved', reviewNote: 'Approved for the declared business workflow.', expectedUpdatedAt: application.updatedAt };
    const reviewed = await Promise.all([admin.PATCH(request('/api/admin/business', 'PATCH', reviewBody)), admin.PATCH(request('/api/admin/business', 'PATCH', reviewBody))]);
    assert.deepEqual(reviewed.map(r => r.status).sort(), [200, 409], 'stale concurrent admin review cannot overwrite a newer version');
    const approved = await business.getBusinessAccount(7);
    assert.equal(approved.status, 'approved');
    assert.equal(state.audit.filter(a => a.action === 'access_reviewed').length, 1);
    const adminAccounts = await expectResponse(admin.GET(request('/api/admin/business')), 200);
    assert.equal(adminAccounts.accounts[0].email, 'user-7@example.test');
    assert.equal(JSON.stringify(adminAccounts).includes('secret_envelope'), false);
    actor.role = 'user';
    await expectResponse(access.POST(request('/api/business/access', 'POST', appBody)), 409, 'application_locked');
    await expectResponse(credentials.PUT(request('/api/business/credentials', 'PUT', { apiKey: 'csk_not_allowed' })), 400, 'invalid_key');
    const saved = await expectResponse(credentials.PUT(request('/api/business/credentials', 'PUT', { apiKey: secret, label: 'Studio SIRAYA' })), 200);
    assert.equal(saved.credential.last4, secret.slice(-4));
    assert.equal(saved.credential.provider, 'siraya');
    assert.deepEqual(Object.keys(saved.credential).sort(), ['id', 'label', 'last4', 'provider', 'updatedAt']);
    assert.equal(JSON.stringify(saved).includes(secret), false);
    assert.equal(JSON.stringify(state).includes(secret), false);
    assert.equal((await business.getBusinessCredential(7, approved.id)).apiKey, secret);
    assert.equal(await business.getBusinessCredential(8, approved.id), null, 'cross-user secret read is denied');
    const activeAccess = await expectResponse(access.GET(request('/api/business/access')), 200);
    assert.equal(activeAccess.keyConfigured, true);
    const second = 'sk-second_fixture_1234567890123456789';
    const rotated = await expectResponse(credentials.PUT(request('/api/business/credentials', 'PUT', { apiKey: second })), 200);
    assert.notEqual(rotated.credential.id, saved.credential.id);
    assert.equal((await business.getBusinessCredential(7, approved.id)).apiKey, second);
    assert.equal((await business.getBusinessCredential(7, approved.id, saved.credential.id)).apiKey, secret, 'owned existing jobs keep their historical key after rotation');
    assert.equal(state.credentials.filter(c => c.is_active).length, 1);
    await expectResponse(age.POST(request('/api/business/adult', 'POST', { birthDate: '2015-10-19' })), 403, 'under_age');
    await expectResponse(age.POST(request('/api/business/adult', 'POST', { birthDate: '1994-02-30' })), 400, 'invalid_date');
    const deniedAdult = await business.requireBusiness(request('/api/business/models'), { adult: true });
    assert.equal(deniedAdult.error.status, 403);
    await expectResponse(age.POST(request('/api/business/adult', 'POST', { birthDate: '1994-09-08' })), 200);
    assert.ok((await business.requireBusiness(request('/api/business/models'), { adult: true })).account);
    assert.equal((await expectResponse(access.GET(request('/api/business/access')), 200)).adultVerified, true);
    await expectResponse(credentials.DELETE(request('/api/business/credentials', 'DELETE')), 200);
    assert.equal(await business.getBusinessCredential(7, approved.id), null);
    assert.equal(await business.getBusinessCredential(7, approved.id, saved.credential.id), null, 'explicit removal revokes historical polling key');
    assert.equal(state.credentials.every(c => c.revoked_at && c.secret_envelope === null), true, 'explicit removal erases every encrypted version');
    assert.equal((await expectResponse(credentials.GET(request('/api/business/credentials')), 200)).credential, null);
    actor.role = 'admin';
    const current = await business.getBusinessAccount(7);
    await expectResponse(admin.PATCH(request('/api/admin/business', 'PATCH', { userId: 7, status: 'suspended', expectedUpdatedAt: current.updatedAt })), 200);
    assert.equal((await business.requireBusiness(request('/api/business/credentials'))).error.status, 403, 'suspension also blocks an administrator from bypassing business approval');
    actor.role = 'user';
    await expectResponse(credentials.PUT(request('/api/business/credentials', 'PUT', { apiKey: secret })), 403, 'business_suspended');
    await expectResponse(access.POST(request('/api/business/access', 'POST', appBody)), 403, 'business_suspended');
    assert.equal(await business.getBusinessCredential(7, approved.id, saved.credential.id), null);
    actor.id = 8;
    const other = (await expectResponse(access.POST(request('/api/business/access', 'POST', appBody)), 200)).account;
    assert.notEqual(other.id, approved.id);
    assert.equal(other.status, 'pending');
    assert.equal((await business.requireBusiness(request('/api/business/credentials'))).error.status, 403);
    await assert.rejects(() => business.readBusinessJson(request('/api/business/access', 'POST', { pad: 'a'.repeat(17000) })), error => error.code === 'invalid_body' && error.status === 413);
    await assert.rejects(() => business.readBusinessJson(request('/api/business/access', 'POST', [])), /invalid_body/);
    const bigger = await business.readBusinessJson(request('/api/business/jobs', 'POST', { prompt: '字'.repeat(12000) }), 65536);
    assert.equal(bigger.prompt.length, 12000, 'generation may explicitly raise its bounded byte limit');
    for (const lang of ['zh-Hant', 'en', 'ja']) {
      const error = await expectResponse(Promise.resolve(business.businessErrorResponse(request('/api/business/access', 'GET', undefined, { cookie: `bw_lang=${lang}` }), new types.BusinessError('encryption_unavailable', 503))), 503, 'encryption_unavailable');
      assert.ok(error.error.message.length > 10);
    }
    const safeError = await expectResponse(Promise.resolve(business.businessErrorResponse(request('/api/business/access'), new Error(secret))), 503, 'unavailable');
    assert.equal(JSON.stringify(safeError).includes(secret), false);
    assert.ok(reads > 30);
    console.log('PASS business foundation: authenticated application isolation, admin-only review and concurrent version conflicts, fresh approval/adult checks, same-origin writes, bounded JSON, 3-language private errors, AES-256-GCM AAD isolation/tamper rejection, encrypted rotation, irreversible key revocation, metadata/audit secrecy. No paid/network calls.');
  } finally {
    if (original === undefined) delete process.env.BYOK_ENCRYPTION_KEY;
    else process.env.BYOK_ENCRYPTION_KEY = original;
  }
})().catch(error => { console.error('FAIL business foundation fixture:', String(error?.stack ?? error).replace(/sk-[A-Za-z0-9_-]+/g, '[fixture-key]')); process.exitCode = 1; });
