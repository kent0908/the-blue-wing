# 部署到 Vercel

專案已經是 Vercel 可直接部署的標準 Next.js App Router 結構，不需要額外設定檔。

---

## 路線 A：Vercel CLI（最快，不需要 GitHub）

在你電腦上，解開 zip 後進到 `blue-wing/` 資料夾：

```bash
npm install
npx vercel login          # 用瀏覽器登入 Vercel
npx vercel                # 第一次部署，會問幾個問題，全部按預設即可
```

問題怎麼答：

| 問題 | 答案 |
| --- | --- |
| Set up and deploy? | `y` |
| Which scope? | 你的個人帳號 |
| Link to existing project? | `n` |
| Project name? | `blue-wing`（或你想要的名字） |
| In which directory is your code? | `./` |
| Modify settings? | `n` |

部署完會給你一個 `https://blue-wing-xxxx.vercel.app` 網址。**但這時模型下拉會是空的**，
因為還沒設 API key。接著：

```bash
npx vercel env add SIRAYA_API_KEY production
# 貼上你的 sk-... 然後 Enter

npx vercel env add SIRAYA_API_KEY preview
# 同一把 key 再貼一次（讓 preview 部署也能用）

npx vercel --prod          # 重新部署，讓環境變數生效
```

之後每次改完程式碼，`npx vercel --prod` 就會更新線上版本。

---

## 路線 B：GitHub + Vercel 儀表板（適合長期維護）

1. 在 GitHub 開一個新的空 repo（不要勾 README／gitignore）。

2. 本機推上去：

   ```bash
   cd blue-wing
   git init                      # 如果 zip 裡已有 .git 就跳過
   git add -A
   git commit -m "The Blue Wing: Lumina-style shell + SIRAYA API integration"
   git branch -M main
   git remote add origin https://github.com/<你的帳號>/blue-wing.git
   git push -u origin main
   ```

3. 到 <https://vercel.com/new>，選這個 repo，按 **Import**。

4. 在 Import 畫面展開 **Environment Variables**，加一筆：

   - Name：`SIRAYA_API_KEY`
   - Value：你的 `sk-...`
   - Environments：Production、Preview、Development 三個都勾

5. 按 **Deploy**。Framework 會自動偵測成 Next.js，Build Command 和 Output Directory
   都不用改。

之後 push 到 `main` 就會自動部署。

---

## 部署後的檢查清單

1. 開網址 → 首頁輪播、模型卡、底部 composer 都要正常。
2. 進 `/studio?mode=video` → 點模型下拉。
   - **看到真實模型清單** = API key 設對了。
   - 看到「無可用模型」或紅色錯誤訊息 = key 沒吃到，回 Vercel 專案的
     Settings → Environment Variables 確認，改完要 **Redeploy** 才生效。
3. 送一個短 prompt 測生成，確認進度動畫跑完會出現結果。

---

## 幾個部署上的注意事項

**API key 絕對不要用 `NEXT_PUBLIC_` 開頭。** 現在的寫法只有 `app/api/**` 底下的
route handler 讀得到 `SIRAYA_API_KEY`，key 不會進瀏覽器 bundle。加了
`NEXT_PUBLIC_` 前綴就會被打包進前端，等於公開你的 key。

**影片生成是非同步的。** `/api/videos` 用 `async: true` 送出後馬上回 job id，
前端每 4 秒輪詢一次 `/api/videos/{id}`，所以不會撞到 serverless 的執行時間上限。
`maxDuration` 設 60 秒是為了相容 Vercel Hobby 方案。

**圖片如果回傳外部網址**，Next.js 的 `<img>` 沒有走 image optimization（我用的是
原生 `<img>` 不是 `next/image`），所以不需要在 `next.config.ts` 設 `remotePatterns`。
之後若改用 `next/image`，要把 `resources.siraya.ai` 加進去。

**自訂網域**：Vercel 專案 → Settings → Domains → 加入你的網域，照它給的 DNS 指示設定。
