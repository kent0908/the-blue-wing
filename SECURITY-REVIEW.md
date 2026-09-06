# 安全檢查與修補紀錄（2026-09-06）

範圍：本機 Next.js API、登入/驗證/重設、管理員入口、生成/下載、Blob、點數計算。
本次沒有進行正式站攻擊測試、付費生成、資料庫寫入或部署。這不是已完成的全面滲透測試。

## 已修補（本機，待部署）
- 正式環境寄信失敗不再將密碼重設與驗證連結回傳；郵件缺少設定不記錄連結。
- 公開註冊一律建立未驗證的一般使用者，不再根據 ADMIN_EMAILS 自動升權。
  現存管理員角色不變；新管理員必須經受信任的管理流程建立。
- 驗證/重設 token 透過有期限與帳號狀態条件的單次 UPDATE 原子消耗，禁止並行重複使用。
- 影片輪詢先核對目前使用者的影片扣款紀錄，才呼叫上游。
- API 寫入拒絕明確跨站的 Origin / Fetch Metadata。
- 下載必須是本人生成紀錄中的精確 URL，僅 HTTPS，禁止重新導向及網址內憑證，加入超時。
  DNS 驗證與 fetch 尚非同一次解析：DNS rebinding 防禦仍需釘選連線 IP 的 fetch 實作。
- 私有生成檔案路徑拒絕 traversal；所有 Blob 圖片回應加 CSP sandbox 和 nosniff。
- 非預期內部錯誤不直接回傳底層訊息；登入/註冊/重設密碼限制長度。

## 2026-09-06 後續更新（另一個 session 接手）
發現這份文件時是完全未 commit 的本機修改；已先原樣評估後 commit（不 push），
接著依下面「已解決」清單繼續完成第 2、3、5 項的剩餘部分：

- **並行生成與退款（原第 2 項，部分解決）**：`/api/videos` 送出前先查詢使用者
  目前「已扣款但尚未完成（無 generations 紀錄）也未退款」的影片數量，超過
  `MAX_CONCURRENT_VIDEO_JOBS`（4，與前端 `MAX_CONCURRENT_JOBS` 一致）就拒絕
  （429）。這個計數查詢本身在 `paidCall` 的交易鎖之外，理論上仍有極小的
  競態窗口讓並行請求短暫超出上限一兩個——可接受，這是節流而非帳務正確性。
  帳務本身（扣款不超額）仍由 `paidCall`/`creditTransaction` 的交易鎖保證。
- **濫用限制（原第 3 項，補上遺漏的 migration）**：`api_limits` 表與
  `credit_refund_once` 唯一索引已經**實際 migrate 到正式資料庫**（原本的
  `scripts/security-schema.sql` 沒有被 `scripts/migrate.mjs` 讀取，等於程式碼
  引用了一張不存在的表——已把內容併回 `scripts/schema.sql` 這個唯一的
  schema 來源並跑過 `npm run db:migrate`，`security-schema.sql` 已刪除）。
- **外部 URL / 下載代理（原第 5 項 + 已修補清單裡的 DNS rebinding 註記，
  已解決）**：`/api/download` 原本是「先用 dns.lookup 驗證 IP 沒問題，再用
  fetch() 重新解析同一個 hostname」——這兩次解析不是同一次，攻擊者控制的
  DNS（TTL=0）可以在檢查通過之後、實際連線之前把紀錄換成內網位址。現在改
  用 Node 內建 `https.request` 直接連到已驗證過的那個 IP，同時仍送出正確的
  SNI／Host（`servername`/`headers.Host` 設成原始 hostname），所以 TLS 憑證
  驗證與虛擬主機路由都還是對著真正的網域走——已用一支獨立腳本對真實
  HTTPS 站台（google.com favicon）驗證整套「解析→釘住 IP→連線→收資料」
  確實能跑通。

- `scripts/security-regression.mjs` 補上遺漏的 mock（`@/lib/rateLimit`、
  `@/lib/creditTransactions`）——這份文件原本聲稱「已執行驗證：通過」，但
  當時的程式碼其實會直接拋例外（缺 mock），根本沒真的跑完；現在是真的通過。
- `app/api/videos/route.ts` 的 `videoUrl` 欄位（同一個 session 的另一個功能：
  運鏡影片參考）補進 `generationValidation.ts` 的白名單，不然會被這份審查
  加的白名單擋掉。

## 仍未解決：不可宣稱平台安全已完成
1. **點數帳務（高）**：`lib/creditReplay.ts` 的分批扣點/到期邏輯看起來方向
   正確，但沒有針對「補點、部分消費、到期、退款」這個組合情境做過真實測試
   （只有 tsc/build 過），建議部署前對一個測試帳號實際跑一輪。
4. **生成參數/模型計價**：`creditCost()` 現在對缺費率的模型直接拋錯而不是
   用舊的猜測價格——方向正確，但**部署前務必對照目前上線的完整模型清單
   確認沒有任何模型缺 `model_rates`**，不然會變成該模型直接無法生成。
6. **憑證（高，仍未解決，且不是程式問題）**：對話曾出現 API、GitHub、DB
   憑證。需在各供應商撤銷舊值、更新部署環境，並失效可能已外洩的重設/驗證
   token。這件事沒有程式碼可以幫你做，只能你自己到後台操作。
7. **正式環境配置**：尚未驗證郵件設定（`RESEND_API_KEY` 沒設，密碼重設/
   驗證信會直接無聲失敗，正式環境部署前務必確認）、WAF、環境權限、DB
   最小權限、日誌存取與備份。
8. token 現存資料為明文；可另行遷移至雜湊儲存，需兼顧現有 session 的失效安排。

## 已執行驗證
- node scripts/security-regression.mjs：通過（見上方——已修好原本會直接
  拋例外的 mock 缺漏，這次是真的執行到底）。
- 一支獨立腳本對真實 HTTPS 站台驗證 DNS-pinned fetch 機制：通過。
- npx tsc --noEmit：通過。
- npm run build：通過。
- npm run lint：除了兩個跟這次修補無關、原本就存在的 baseline 錯誤
  （`components/Composer.tsx` 的 `react-hooks/set-state-in-effect`）外全過。
- `npm run db:migrate` 已對正式資料庫套用新增的 `api_limits` 表與
  `credit_refund_once` 唯一索引（純新增，沒有改動任何既有資料）。
- 仍未部署（沒有 push）；仍未對正式站做過真實攻擊測試或付費生成驗證，
  不能把上面這些靜態/腳本檢查稱作完整 E2E。
