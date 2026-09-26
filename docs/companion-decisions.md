# 陪聊決策層（Jev shadow v1）

## 狀態與分工
架構已接入成功對話後的背景工作。預設停用，未設定 key 時零外部呼叫。使用者於本次工作明確同意將最多六則近期訊息與關係設定傳送至 Vercel AI Gateway（由 TypeSafe 提供推論）；不另送帳號 ID、姓名或 Email，訊息本文仍可能含個資。

現有模型負責角色回覆，原程式負責關係、分數與扣點。Jev 只建立待檢視候選，不能修改任何上述狀態。0.9 為試驗門檻，未以繁體中文校準，不能解讀為 90% 正確率。

## 啟用
1. 執行 `node scripts/migrate-companion-decisions.cjs`（新增表，無舊資料改寫）。
2. Vercel 後端環境變數設定 `JEV_MODE=shadow`、`JEV_SAMPLE_PERCENT=10`；Vercel 上使用 OIDC，亦可選擇設定 `AI_GATEWAY_API_KEY`，重新部署。不要使用 NEXT_PUBLIC 前綴。
3. 管理員登入後以 `/api/admin/companion-decisions` 查看最近 100 筆評估。一般用戶無權讀取。這是 JSON 查詢入口，尚未新增 CRM 圖表。
4. 停用時改 `JEV_MODE=off` 並重新部署。不要改角色或刪除對話。

## 執行與紀錄
Gateway 模型 typesafe-ai/jev；記錄回傳模型、Gateway generationId 與實際 cost（若提供）。每輪最多六則、每則最多 1800 字元，關係最多 500 字元；不複製原文進評估表。五秒 API 逾時、無自動重試。message_id + policy_version 唯一申領避免重複評估。結果含實際模型、輸入 tokens、估算成本（每百萬 US$0.042 價格快照）、機率、confidence、耗時；失敗僅存安全錯誤碼。失敗費用可能未知，不能視為免費。

背景 after() 屬盡力執行，共用聊天 maxDuration；非可靠佇列。中斷可能留下 pending，第一版不自動重試，不保證每筆抽樣都完成。來源訊息或角色刪除時連帶刪除評估。設定變更後結果仍只是評估時快照，不作決策依據。

## 驗證與下一階段
`node scripts/test-companion-decisions.cjs`：格式、機率、錯誤、停用、抽樣、申領去重、上下文截斷及不修改角色測試，皆用 mock，沒有實際供應商呼叫。
正式啟用後需使用獲授權資料建立人工標註集，比較中文事件判斷準確率、p95 耗時、token 費用與低信心率，通過後才考慮將候選應用到劇情。

官方協定：https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe

## 2026-09-26 接入狀態
已改用 https://ai-gateway.vercel.sh/typesafe/v1/systemone，沿用 noul 與 choice 協定。OIDC 每次呼叫取得最新 token；AI_GATEWAY_API_KEY 若設定則優先。沒有自動退回 TypeSafe 直連。
本機更新 Vercel OIDC 後，以合成中文對話實測，Gateway 回傳 HTTP 403：團隊需要有效信用卡。沒有完成模型推論；正式模式仍停用。補上付款方式後執行 `vercel env run --environment production -- node scripts/test-jev-live.cjs`。該測試僅兩組合成資料，不讀私人對話。
先確認真實模型回應與用量，再設定 JEV_MODE=shadow 並重新部署。未設定開關時永遠不會背景呼叫。
