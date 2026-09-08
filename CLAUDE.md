@AGENTS.md

# 部署規則：只從 GitHub 自動部署

**正式環境一律由推送到 GitHub `main` 觸發自動部署。任何人（包含 AI 工作階段）都不要用 Vercel CLI 手動部署正式環境。**

不要執行：

```
vercel --prod        # ← 禁止
vercel deploy --prod # ← 禁止
```

## 為什麼

2026-09-08 發生過一次真實事故：有工作階段用 CLI 從自己的本機資料夾部署正式站，
而那份本機檔案落後 26 個 commit。結果是**線上被舊版覆蓋**，包含幾個已經修好、
但被退回去的付費相關問題（文字對話沒有計費費率導致每則訊息都失敗、扣款後寫入
失敗不退款、圖生影 camera_fixed 失效）。

CLI 部署是拿「你本機當下的檔案」上傳，不是拿 git 裡的內容，所以只要本機不是最新、
或有沒 commit 的暫時改動，就會直接把線上蓋掉，而且從 git 歷史完全看不出來發生過。

當時的判定證據：正式站可以下載到 `public/brand-particle-source.png`，但那個檔案
當時根本不在 git 儲存庫裡——只存在於某一份本機資料夾。

## 正確做法

1. `git push` 到 `main`（本專案的工作流是 `git push origin <branch>:main`）
2. Vercel 的 GitHub 整合會自動建置並部署，已確認可正常運作
3. 用實際的線上網址驗證結果，不要只看 build 有沒有過

## 多個工作目錄同時開發時

這個專案有時會有一個以上的工作目錄（例如 `blue-wing`、`blue-wing-claude`）同時在動。
推送前務必先確認不會蓋掉別人的東西：

```
git fetch origin
git merge-base --is-ancestor origin/main HEAD   # exit 0 才可以推
```

不是 0 就代表 `origin/main` 有你還沒有的 commit，先合併處理完再推。
