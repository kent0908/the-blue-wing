#!/usr/bin/env node
/** Main-push gate shared by Codex and Claude. Never modifies another worktree. */
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function git(cwd, args, options = {}) {
  return cp.execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}
function stop(message) { throw new Error(message); }
function isReport(file) {
  // Only root-level review artifacts are exempt. Source/assets below a directory
  // (including public/*.png) must be committed before a production push.
  if (file.includes('/') || file.includes('\\')) return false;
  return /\.(?:png|jpe?g|webp)$/i.test(file)
    || /(?:^|[-_])(?:results?|report|audit)\.json$/i.test(file)
    || (/\.md$/i.test(file) && !/^(?:AGENTS|CLAUDE|README|SECURITY|CONTRIBUTING|LICENSE)\.md$/i.test(file));
}
function worktrees(cwd) {
  return git(cwd, ['worktree', 'list', '--porcelain', '-z']).split('\0\0').filter(Boolean).map(record => {
    const fields = record.split('\0');
    return { path: fields.find(f => f.startsWith('worktree '))?.slice(9), head: fields.find(f => f.startsWith('HEAD '))?.slice(5) };
  }).filter(w => w.path);
}
function ancestor(cwd, older, newer) {
  try { git(cwd, ['merge-base', '--is-ancestor', older, newer]); return true; } catch { return false; }
}
function ensureClean(cwd, expected) {
  if (git(cwd, ['rev-parse', 'HEAD']).trim() !== expected) stop(`工作目錄提交不同：${cwd}`);
  if (git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=no']).trim()) stop(`工作目錄有尚未提交的追蹤檔案：${cwd}`);
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
    const location = git(cwd, ['rev-parse', '--git-path', marker]).trim();
    if (fs.existsSync(path.resolve(cwd, location))) stop(`工作目錄仍在合併或重整歷史：${cwd}`);
  }
  const untracked = git(cwd, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(f => f && !isReport(f));
  if (untracked.length) stop(`工作目錄有未追蹤原始碼或設定：${cwd}\n${untracked.slice(0, 12).map(f => `  ${f}`).join('\n')}`);
}
function check({ cwd = process.cwd(), prePush = false, remote = 'origin', input = '' } = {}) {
  const current = git(cwd, ['rev-parse', '--show-toplevel']).trim();
  const head = git(current, ['rev-parse', 'HEAD']).trim();
  let updates = [];
  if (prePush) {
    updates = input.trim().split(/\r?\n/).filter(Boolean).map(line => {
      const fields = line.trim().split(/\s+/);
      if (fields.length !== 4) stop('無法驗證 pre-push 輸入，已停止推送。');
      return { localRef: fields[0], localOid: fields[1], remoteRef: fields[2], remoteOid: fields[3] };
    }).filter(u => u.remoteRef === 'refs/heads/main');
    if (!updates.length) return { skipped: true };
    if (remote !== 'origin') stop('正式 main 僅能推送至 origin。');
    for (const update of updates) {
      if (/^0+$/.test(update.localOid)) stop('禁止刪除正式 main。');
      if (update.localOid !== head) stop('只能推送目前已核對的 HEAD 至 main；禁止推送另一個提交。');
    }
  }
  const found = worktrees(current);
  const required = ['blue-wing', 'blue-wing-claude'].map(name => {
    const matches = found.filter(w => path.basename(w.path.replace(/\\/g, '/')) === name);
    if (matches.length !== 1) stop(`找不到唯一的必要工作目錄 ${name}；請確認 git worktree list。`);
    return matches[0].path;
  });
  const paths = [...new Set([...required, current])];
  paths.forEach(p => ensureClean(p, head));
  try {
    // Fetch changes refs only, never worktree files. No '+' forced ref update.
    git(current, ['fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main']);
  } catch { stop('無法取得最新 origin/main，或遠端歷史已重寫；已停止推送，請人工核對。'); }
  const upstream = git(current, ['rev-parse', 'refs/remotes/origin/main']).trim();
  if (!ancestor(current, upstream, head)) stop('origin/main 含有本機尚未整合的提交；請先合併並重新同步，禁止強制推送。');
  for (const update of updates) {
    if (!/^0+$/.test(update.remoteOid) && !ancestor(current, update.remoteOid, head)) stop('推送目標不是 fast-forward；禁止強制覆寫 main。');
  }
  // Recheck after fetch, catching work that arrived while the network was busy.
  paths.forEach(p => ensureClean(p, head));
  return { head, paths };
}
function inspectLocal(cwd = process.cwd()) {
  return worktrees(cwd).filter(w => ['blue-wing', 'blue-wing-claude'].includes(path.basename(w.path.replace(/\\/g, '/')))).map(w => {
    const untracked = git(w.path, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
    return { path: w.path, head: w.head, trackedDirty: Boolean(git(w.path, ['status', '--porcelain=v1', '-z', '--untracked-files=no']).trim()), untrackedSources: untracked.filter(f => !isReport(f)), untrackedReports: untracked.filter(isReport) };
  });
}
if (require.main === module) {
  try {
    if (process.argv[2] === '--inspect') {
      console.log('僅本機診斷；未 fetch，不代表可發布。');
      console.log(JSON.stringify(inspectLocal(), null, 2));
    } else {
      const prePush = process.argv[2] === '--pre-push';
      const result = check({ prePush, remote: prePush ? process.argv[3] : 'origin', input: prePush ? fs.readFileSync(0, 'utf8') : '' });
      console.log(result.skipped ? '非 main 推送：略過正式同步守門。' : `同步守門通過：${result.paths.length} 個工作目錄，HEAD ${result.head.slice(0, 12)}。`);
    }
  } catch (e) { console.error(`同步守門停止：${e.message}\n不會自動 stash、reset 或覆蓋其他工作目錄。`); process.exitCode = 1; }
}
module.exports = { check, isReport, inspectLocal };
