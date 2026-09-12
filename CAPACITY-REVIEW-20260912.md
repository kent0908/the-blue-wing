# Blue Wing 容量與安全評估（2026-09-12）

## 結論與範圍

目前不能宣稱正式站已可承受 10,000 DAU。這一輪完成原始碼盤點、目前設定資料庫的唯讀統計、兩項程式優化、隔離測試及正式建置；沒有對正式站進行壓力測試、沒有生成扣費、沒有調高付費方案。

基準提交 a789d64。Claude 的工作目錄正修改會員、CRM、扣點、生成與 schema，故本次修改留在 blue-wing-sync，不覆寫其他工作目錄，也不繞過同步發布守門。部署後的效能尚未驗證。

## 現有架構

瀏覽器 → Next.js / Vercel Functions → Neon Postgres（登入、限流、帳本、聊天、畫布）與私人 Blob（素材／結果）；生成工作交給 SIRAYA，影片由瀏覽器每 4 秒查詢完成狀態。新素材已有瀏覽器直傳 Blob。私人素材讀取仍經授權 API 串流。

所謂「記憶庫」目前是 character_messages 與 characters.memory_summary，不是獨立向量資料庫。每回合只帶最近 20 則訊息及摘要，有上下文窗口限制；不必先引入向量資料庫才能擴充。

## 實測資料庫快照

使用專案現有環境連線，BEGIN READ ONLY，檢查過程限制單一查詢 5 秒；未修改 schema、資料或正式 timeout。未輸出帳號、憑證、prompt 或對話內容。

- 資料庫 33,546,240 bytes（約 32 MiB），已用 pooler。
- max_connections = 112；這是當下 Postgres 設定，不是可服務用戶數。
- shared_buffers = 128 MiB，work_mem = 4 MiB（每個排序／雜湊操作，不是全機總額）。不能據此推算 Neon 實際 RAM 或 CU。
- 原 statement_timeout = 0；idle_in_transaction_session_timeout = 300 秒。審查交易／查詢類別後應設應用層有限 timeout，不能直接對 AI 等待套統一 SQL timeout。
- 當下 1 個 backend，累計 deadlocks = 0、temp_bytes = 0。這只是低負載快照。
- generations 有 120 筆，表含索引／TOAST 約 21 MiB；8 筆仍為 inline data URL，最大單個 URL 約 2.3 MiB。後续應可恢復地搬至 Blob，驗證後才更新引用，不能直接刪除。
- 小資料表出現 seq_scan 很正常，不把累計掃描次數視為瓶頸證據。
- 快照：使用者目錄 blue-wing-backups/capacity-db-20260912.json。

## 本輪已實作（未部署）

1. lib/mediaStore.ts：遠端生成媒體改為直接將 ReadableStream 交給 Blob multipart upload；不再 arrayBuffer 整檔讀入。來源 fetch 加 120 秒 timeout、失敗 response body 取消。內嵌圖片仍維持原本處理及存檔失敗回退行為。Blob SDK 仍有分段緩衝，並非零記憶體。
2. 聊天記憶摘要移到 Next.js after()，先回傳已完成聊天。摘要失敗保留舊記憶，compare-and-set 避免較晚完成的工作覆蓋已更新摘要。after 仍共享路由 60 秒時限，並非耐久佇列；需可靠重試時仍要 queue + version。

驗證：test-capacity-improvements.cjs 通過串流／內嵌素材／失敗取消／回覆先於摘要／摘要錯誤隔離／舊摘要不覆寫新摘要。Webpack build、TypeScript 與修改的三個 TS 檔案 ESLint 通過（非全站 lint）。

記憶體隔離實驗：8 個同時工作、各 32 MiB，共 256 MiB；舊式完整緩衝峰值 ArrayBuffer 約 320.1 MiB，串流約 28.4 MiB。這是本機合成傳輸實驗，不包含 Blob SDK 網路緩衝，不是正式站壓测或可承載量；elapsed time 不能當作網路吞吐量。

## 萬人量體的規劃假設（不是量測結果）

假設每 DAU 每日使用 20 分鐘，平均同時在線 = DAU × 20 / 1440；尖峰係數先用 10。

| 情境 | 平均同時在線 | 規劃尖峰同時在線 | 以每人每秒 0.2 個 API 估算 |
| --- | ---: | ---: | ---: |
| 10,000 DAU | 139 | 1,400 | 280 RPS |
| 30,000 DAU | 417 | 4,200 | 840 RPS |

另有 200 個生成中任務 × 每 4 秒一次 = 50 polling RPS。多分頁可能增加重複輪詢。每個 requireUser 請求至少 session SELECT + rate-limit UPSERT，330 RPS 就至少 660 次 DB 操作/秒，尚未含業務查詢。

媒體例：10,000 人每日各看 10 支平均 5 MB 影片，即約 500 GB/日；快取、重播、拖曳、縮圖與實際命中率會改變用量。需要同時評估流量成本，不只資料庫連線。

生成併發應另算：提交率 × 平均完成時間。例如每秒 1 個、平均 120 秒，需要上游同時處理約 120 個工作。需確認 SIRAYA 每模型配額；提高 Vercel 容量不會提高上游配額。

## 上量前優先序

### P0 正確性與安全

- 影片持久化 job table + 耐久 worker／排程。關閉瀏覽器後仍完成存檔、退款與狀態更新；提交 idempotency key、租約、重試、唯一完成標記。現在靠 client polling，不適合作為可靠完成機制。
- 併發名額與扣點在同一原子操作保留：目前 countInFlight 在扣款前分開檢查，且排除 pending，突發請求可能同時通過。此處與 Claude 正修改的計費核心重疊，未冒然修改。
- npm audit 回報 4 個 high 套件條目，並非 4 個已證實可利用的網站漏洞：transformers → onnxruntime-node → adm-zip，以及 transformers 的舊 sharp。根層 sharp 已為 0.35.4，但相依版本仍告警。需查可達路徑並升級／替換相依、完整驗證圖層模型；不使用 force audit fix。掃描檔 capacity-npm-audit-20260912.json。
- 跨帳號素材／記憶／畫布存取、重複退款、重送提交、超額上傳、惡意圖片解碼、SSRF redirect/DNS 必須列入 staging 回歸。保留私人授權，不能為提高 CDN 命中率公開用戶素材。

### P1 高影響效能

- 限流搬至分散式 TTL 原子計數器（例如 Redis），保留故障時 fail-closed；不要改成每台 Function 的記憶體 Map。登入與生成沿用嚴格限流，媒體與 polling 按實際需求分流。此為待實作，不代表已有 Redis。
- 帳本餘額目前讀取並 replay 全部歷史；建立有到期語義的 balance snapshot／credit buckets，與 append-only ledger 在同一交易更新，並保留一致性對帳。不可直接 SUM 取代現行到期規則。
- 素材 API 一次 300 筆且使用原圖；改 cursor 分頁、縮圖、可視範圍載入。大型 project doc 也應與列表摘要分開回傳。保留現有使用者資料完整性。
- 私人影片驗證 byte-range／拖曳與條件請求；当前代理沒有轉送 Range，重播可能浪費傳輸。授權成功後的短效下載設計要保護帳號隔離。
- 輪詢退避、jitter、跨頁去重及完成即停；不靠 client polling 決定是否保存影片。
- 角色回合的訊息寫入應同交易，併發聊天加序號／單角色工作序列；摘要要帶版本與可重試狀態，避免對話錯序。

### P2 容量營運

- 核對正式 Vercel region 與 Neon region、Neon CU min/max、autoscaling／scale-to-zero、Vercel memory/timeout/concurrency、Blob流量、上游配額。目前未取得這些控制面設定，不能指定已足夠的方案。
- 使用 pooled endpoint 不等於 10,000 SQL 同時執行。Neon 文件的 10,000 pooled client connections 是排隊連線容量。
- 私人與共用內容分開快取；禁止快取跨用戶餘額／授權。公開模板可 CDN 快取，管理更新需失效。
- 配置備份/PITR並实际演練還原；定義保存期限、暫存 Blob與失敗上傳清理、工作死信處理。

## 隔離壓測與上線門檻

下一階段需獨立 staging DB／測試帳號、測試 Blob 前綴及 mock 生成服務；不可對正式站跑大量請求或直接引用正式寫入憑證。先用合成資料（10,000 users、100萬 messages、100萬 ledger rows），再以 EXPLAIN (ANALYZE, BUFFERS) 驗證代表性查詢。現有唯讀快照不是這個規模。

逐階 25 → 100 → 300 → 600 RPS，每階至少 10 分鐘，再做尖峰與 60 分鐘 soak。測混合登入後讀取、素材分頁、聊天（mock provider）、工作提交／poll、退款重試，檢查有效吞吐量、失敗率與排隊時間，不能只看 virtual users 數。

建議門檻（待產品確認）：一般 API p95 < 500 ms、p99 < 1.5 s、非預期限流的 5xx < 0.1%；生成提交 p95 < 1秒（上游等待分開計）；DB pool等待 p95 < 50 ms；無跨帳號讀取、重複扣款或退款；60分鐘記憶體不持續上升。連續 30 秒 5xx > 1% 或 DB CPU > 80%／明顯鎖等待立即停止，保留原始分位數與錯誤分類。

監控應記錄 request/job correlation ID、route、耗時、結果與錯誤碼，不記 token、prompt、私人網址。監看 DB CPU/RAM/連線等待、query p95、任務 queue age、成功率、退款一致性、Blob用量、Web Vitals。

## 文件來源

- https://neon.com/docs/manage/endpoints/ （compute／連線池／工作集）
- https://vercel.com/docs/vercel-blob/using-blob-sdk （串流／multipart）
- 本機 Next.js 16.3.3 docs: after 的 response-after 語義與 maxDuration 限制。
- npm audit 的 advisory URL 已保留於安全快照。
