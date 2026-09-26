# 模型成本核對與活動試算 — 2026-09-26

## 核對範圍

資料庫成本表共 43 個模型／通道（含 2 個語音模型）；40 項對照原廠標準線上價格，3 個 DeepSeek 舊通道保留待核對。NSFW Seed 通道依專案擁有者指示沿用對應版本牌價。

SIRAYA 公開模型 API 本次回傳 HTTP 500，原廠價格是參考基準，不是 SIRAYA 帳戶已確認的結算價。未替使用者更改供應商折扣、零售扣點或發放點數。

## 修正項目

- GPT Image 2：分開文字輸入、圖片輸入與圖片輸出；輸出由舊表 $30 更新為 $15／百萬 Token。2.5 維持 $30 輸出，圖片輸入 $8 與文字輸入 $5 分列。
- Veo 3.1：720/1080p 含音訊 $0.40／秒；4K $0.60／秒，不再全部以 4K 價格顯示。
- Seedance：依解析度、是否含參考影片及音訊分項。2.5 的 1080p 無影片／有影片為 $11.7／$7 每百萬計費 Token。不能用零售解析度倍率當作供應商成本倍率。
- Seedream 5 Pro：一般圖片、分層、像素門檻及第 2 張起參考圖加價分列。
- Gemini 圖片：圖片輸出與文字／思考輸出分列；不能將思考費用重複加在已包含思考的總輸出上。
- HappyHorse：使用新加坡國際版原廠參考費率，各解析度分列；仍需確認 SIRAYA 的實際計費路由。
- DeepSeek 4.1 Flash 與 Pro 0813：尖峰、離峰及快取分列。舊 v4-flash、v4-flash-0731、v4-pro 不因原廠別名變更而自動換價。
- Gemini 3.8 Flash／TTS：2026 與 2027 生效費率分列。原廠 Gemini 2.5 Flash Image 公告 2026/10/02 停用，SIRAYA 通道是否續供需確認。

完整分項與來源保存在 `lib/sirayaPublicPrices.ts`，後台 `/crm/costs` 逐項展示。

## 費用與營收定義

1. 牌價試算 = 各項實際計費用量 × 對應單价之和。Token 欄填原始 Token 數，系統除以一百萬；解析度／時段等互斥條件不得混算。
2. 供應商折後估算 = 牌價試算 × (1 − 折扣百分比)。填 20 表示減價 20%，支付八折；留空沿用全域預設。
3. 上游回報費用 = 回應中的數字型 USD `cost`。獨立保存，不假設是未折扣牌價，不再乘一次折扣。
4. 呼叫前保存牌價／折扣快照；上游未回傳用量、非標準回應與歷史缺失資料不補成零。後續折扣修改不改寫歷史。
5. 客戶消耗點數面額不是實收。管理員、活動純贈點與特殊贈送仍發生成本；純贈送收入為零。
6. 活動規劃每點有效收入 = 活動後實收 × (1 − 金流费率) ÷（方案點數＋額外贈點）。這是規劃用的平均分攤，並非已實作的會計收入認列或 FIFO 點數批次核銷。

## 新增回執與限制

共用 paidCall 保存數字型費用及白名單用量；文字串流觀察最終 SSE 回執、一般影片輪詢在終態保存回執，圖層結果保留上游數值。回執不儲存提示詞、回覆內容、金鑰或簽名網址。管理員可檢視最近 100 筆，權限仍由伺服器驗證。

歷史 79 筆用量事件沒有新的上游費用欄位資料，沒有回填或重新生成。其他未經 paidCall 的系統呼叫、免費重試／待機片、背景決策及尚未接入的語音流程不保證有回執；因此這個列表不可當成全帳戶對帳總額。完整對帳仍需 SIRAYA 帳單／請求 ID 與所有通道一致的回執。

原廠工具費、快取儲存、Vercel、Neon、Blob、稅費及退款不包含在模型單價差額中。活動碼兌換、限量、資格、批次來源與實收核銷屬後續功能；本次提供試算，不開放實際兌換。

## 驗證

- 成本單位、解析度互斥、0/100% 折扣、贈點稀釋、純贈送、無效輸入、NSFW 別名測試。
- SSE 切片與中文字元不變、只保存費用白名單。
- 管理員 200、未登入 401、一般會員 403；無效折扣 400。
- 1440、390、320px 瀏覽器：資料載入、Veo 8 秒 $3.20 試算、無頁面水平溢位與 JS 錯誤。
- TypeScript、定向 ESLint、Next.js 正式建置。未發送付費生成。

## 主要來源

- [SIRAYA 公開模型](https://siraya.ai/models/)／[費用回應欄位](https://docs.siraya.ai/docs/observability/billing-transparency/)
- [BytePlus ModelArk](https://docs.byteplus.com/en/docs/modelark/1544106?redirect=1)
- [OpenAI](https://developers.openai.com/api/docs/pricing)
- [Google Gemini](https://ai.google.dev/gemini-api/docs/pricing)
- [Alibaba Model Studio](https://www.alibabacloud.com/help/en/model-studio/model-pricing)
- [DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/)
- [Anthropic](https://platform.claude.com/docs/en/about-claude/pricing)
