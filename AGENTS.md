<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Codex / Claude 共用同步與部署規則

- 正式環境只能由 GitHub `main` 自動部署。遵循 `CLAUDE.md`，禁止 `vercel --prod` 或 `vercel deploy --prod`。
- 推送前，`blue-wing`、`blue-wing-claude` 和發布工作目錄必須指向同一提交，追蹤檔案乾淨，沒有未追蹤原始碼。先備份、整合及驗證，再同步；不要自動 stash、reset 或覆寫另一個工作階段。
- 執行 `node scripts/check-worktree-sync.cjs`；它會取得最新 `origin/main` 並檢查祖先與工作目錄狀態。任何不一致或網路錯誤都必須停止，不可跳過守門或強制推送。
- 建議用 `node scripts/push-synced-main.cjs` 發布；它以共用 Git 目錄鎖防止兩邊同時推送，並執行相同 pre-push 檢查。不要在另一個發布程序持鎖時移除鎖。
- 管理員一次性設定 `git config core.hooksPath .githooks` 以啟用共用 pre-push 守門。發布後確認 GitHub 提交、Vercel 自動部署和實際網頁。
