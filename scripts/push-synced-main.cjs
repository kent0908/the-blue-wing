#!/usr/bin/env node
/** Optional coordinated publisher. The common-dir lock spans check AND push. */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { check } = require('./check-worktree-sync.cjs');
const cwd = process.cwd();
let lock;
let acquired = false;
try {
  const common = cp.execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim();
  lock = path.join(path.resolve(cwd, common), 'blue-wing-main-push.lock');
  try { fs.mkdirSync(lock); acquired = true; } catch { throw Error(`另一個發布正在執行，或上次中斷留下鎖：${lock}。請確認沒有發布程序後再由人工移除。`); }
  fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, cwd, startedAt: new Date().toISOString() }));
  check();
  // Run the committed hook even if the local hooksPath setting was lost. Never --force.
  const result = cp.spawnSync('git', ['-c', 'core.hooksPath=.githooks', 'push', 'origin', 'HEAD:main'], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error('Git 推送未完成；保留目前工作檔案，請查看上方錯誤。');
} catch (e) { console.error(e.message); process.exitCode = 1; }
finally {
  if (acquired) {
    const ownerFile = path.join(lock, 'owner.json');
    if (fs.existsSync(ownerFile)) fs.unlinkSync(ownerFile);
    fs.rmdirSync(lock);
  }
}
