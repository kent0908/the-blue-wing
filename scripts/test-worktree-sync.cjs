/** Local disposable Git repos only: no GitHub / Vercel / production writes. */
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { check, isReport } = require('./check-worktree-sync.cjs');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'blue-wing-sync-test-'));
const main = path.join(base, 'blue-wing');
const claude = path.join(base, 'blue-wing-claude');
const bare = path.join(base, 'origin.git');
function git(cwd, ...args) { return cp.execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function identity(cwd) { git(cwd, 'config', 'user.name', 'Local sync test'); git(cwd, 'config', 'user.email', 'sync-test@example.invalid'); git(cwd, 'config', 'core.autocrlf', 'false'); }
function expectBlocked(pattern, opts = {}) { assert.throws(() => check({ cwd: main, ...opts }), pattern); }
try {
  fs.mkdirSync(main);
  git(base, 'init', '--bare', '--initial-branch=main', bare);
  git(main, 'init', '--initial-branch=main'); identity(main);
  fs.writeFileSync(path.join(main, 'README.md'), 'initial\n');
  git(main, 'add', 'README.md'); git(main, 'commit', '-m', 'local fixture');
  git(main, 'remote', 'add', 'origin', bare); git(main, 'push', '-u', 'origin', 'main');
  git(main, 'worktree', 'add', '-b', 'agent/claude', claude, 'main');
  const first = git(main, 'rev-parse', 'HEAD');
  assert.equal(check({ cwd: main }).head, first);
  assert.equal(check({ cwd: claude }).head, first);
  fs.writeFileSync(path.join(claude, 'README.md'), 'unfinished\n');
  expectBlocked(/追蹤檔案/); fs.writeFileSync(path.join(claude, 'README.md'), 'initial\n');
  fs.writeFileSync(path.join(claude, 'new-feature.ts'), 'export {};\n');
  expectBlocked(/未追蹤原始碼/); fs.unlinkSync(path.join(claude, 'new-feature.ts'));
  fs.mkdirSync(path.join(claude, 'public')); fs.writeFileSync(path.join(claude, 'public', 'brand.png'), 'not a screenshot');
  expectBlocked(/未追蹤原始碼/); fs.unlinkSync(path.join(claude, 'public', 'brand.png')); fs.rmdirSync(path.join(claude, 'public'));
  fs.writeFileSync(path.join(claude, 'review.png'), 'screenshot'); fs.writeFileSync(path.join(claude, 'ui-test-results.json'), '{}');
  assert.equal(check({ cwd: main }).head, first);
  fs.unlinkSync(path.join(claude, 'review.png')); fs.unlinkSync(path.join(claude, 'ui-test-results.json'));
  assert.equal(isReport('package.json'), false); assert.equal(isReport('AGENTS.md'), false); assert.equal(isReport('scripts/test.cjs'), false);
  assert.equal(isReport('live-generation-budget-audit.json'), true);assert.equal(isReport('credit-confirmation-test-results.json'), true);assert.equal(isReport('src/budget-audit.json'), false);
  const line = `refs/heads/main ${first} refs/heads/main ${first}\n`;
  assert.equal(check({ cwd: main, prePush: true, remote: 'origin', input: line }).head, first);
  expectBlocked(/只能推送/, { prePush: true, input: line.replace(first, '1'.repeat(40)) });
  expectBlocked(/禁止刪除/, { prePush: true, input: `(delete) ${'0'.repeat(40)} refs/heads/main ${first}\n` });
  expectBlocked(/僅能推送至 origin/, { prePush: true, remote: 'other', input: line });
  expectBlocked(/pre-push 輸入/, { prePush: true, input: 'invalid input' });
  assert.deepEqual(check({ cwd: main, prePush: true, input: `refs/heads/feature ${first} refs/heads/feature ${'0'.repeat(40)}\n` }), { skipped: true });
  fs.writeFileSync(path.join(main, 'README.md'), 'new commit\n');git(main, 'add', 'README.md');git(main, 'commit', '-m', 'new local change');
  expectBlocked(/提交不同/);
  const second = git(main, 'rev-parse', 'HEAD');git(claude, 'checkout', '--detach', second);
  assert.equal(check({ cwd: main }).head, second);
  // Simulate another publisher advancing local origin; the gate must not overwrite it.
  const publisher = path.join(base, 'publisher');git(base, 'clone', bare, publisher);identity(publisher);
  fs.writeFileSync(path.join(publisher, 'remote.txt'), 'remote change\n');git(publisher, 'add', 'remote.txt');git(publisher, 'commit', '-m', 'other publisher');git(publisher, 'push', 'origin', 'main');
  expectBlocked(/origin\/main 含有/);
  const common = path.resolve(main, git(main, 'rev-parse', '--git-common-dir'));
  const lock = path.join(common, 'blue-wing-main-push.lock');fs.mkdirSync(lock);
  const locked = cp.spawnSync(process.execPath, [path.join(__dirname, 'push-synced-main.cjs')], { cwd: main, encoding: 'utf8' });
  assert.equal(locked.status, 1);assert.match(locked.stderr, /另一個發布正在執行/);assert.equal(fs.existsSync(lock), true);fs.rmdirSync(lock);
  console.log('PASS sync gate: aligned worktrees, dirty/untracked sources, report exemption, actual pre-push refs, deletion/wrong remote/commit, remote divergence, shared-lock rejection. Local Git fixtures only.');
} finally {
  // Exact mkdtemp result under os.tmpdir, never a project/worktree path.
  if (path.dirname(base) !== path.resolve(os.tmpdir()) || !path.basename(base).startsWith('blue-wing-sync-test-')) throw Error('Unsafe test cleanup path');
  fs.rmSync(base, { recursive: true, force: true });
}
