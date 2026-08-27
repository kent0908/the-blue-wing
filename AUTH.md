# 會員、點數與後台

會員系統跑在 Vercel Postgres 上，登入用自架的 cookie session（`bw_session`），
密碼用 scrypt 雜湊。點數以帳本（`credit_ledger`）記帳，餘額 = 所有 delta 加總。

## 一次性設定

### 1. 建立資料庫

Vercel 專案 → **Storage** → **Create** → **Postgres**（Neon）→ 連到這個專案。
建立後 Vercel 會自動注入 `POSTGRES_URL` 等環境變數到 Production / Preview / Development。

### 2. 本機抓環境變數並建表

```bash
npx vercel link                  # 選 the-blue-wing（只需一次）
npx vercel env pull .env.local   # 會把 POSTGRES_URL 等寫進 .env.local
npm run db:migrate               # 建立 users / sessions / credit_ledger
```

之後 schema 有變動，改 `scripts/schema.sql` 再跑一次 `npm run db:migrate`。

### 3. 設定管理員

在 Vercel 環境變數加：

```
ADMIN_EMAILS = you@example.com          # 逗號分隔可多個
```

用這些 email 註冊時會**直接是 admin、且免 email 驗證**，可直接登入進 `/admin`。

### 4.（選用）啟用寄驗證信

沒設定的話，註冊後驗證連結會印在 server log、也會回傳到前端畫面，仍可完成驗證測試。
要正式寄信：

```
RESEND_API_KEY = re_...
MAIL_FROM      = The Blue Wing <noreply@你的網域>
```

（用 [resend.com](https://resend.com)，需驗證寄件網域。）

### 5. 重新部署

設完環境變數後到 Deployments 對最新一筆 **Redeploy**，變數才會生效。

## 使用流程

| 路徑 | 說明 |
| --- | --- |
| `/register` | 註冊 → 收驗證信 → 點連結（`/verify?token=...`）完成驗證並自動登入 |
| `/login` | 登入 |
| `/account` | 自己的點數、方案、點數紀錄 |
| `/admin` | 管理員後台：搜尋使用者、加/扣點、改方案、停權、設 admin |

## 點數

- 圖片：約 10–14 點／張（Seedream 4.5 / 5.0、gpt-image、Gemini 3 Pro 較貴）
- 影片：約 50–70 點／秒，送出時先扣，若 render 失敗會自動退點
- 文字：約 2–4 點／次
- 費率定義在 `lib/credits.ts` 的 `creditCost()`，方案點數在 `lib/plans.ts`

生成 API（`/api/images`、`/api/videos`、`/api/chat`）現在都需要登入 + 點數足夠，
否則回 401 / 402，前端會顯示「前往登入 / 查看方案」按鈕。

## 金流（尚未接）

目前方案切換由 admin 在 `/admin` 手動操作，切到付費方案會立即發當月點數並把
`plan_renews_at` 設為 30 天後。之後接 Stripe 時，webhook 呼叫同一套
`set_plan` 邏輯即可自動續期發點。
