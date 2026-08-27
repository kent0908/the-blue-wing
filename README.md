# The Blue Wing

AI 影片／圖片／文字創作平台前端，外殼比照 ByteDance Lumina 的版型，後端直接串接
[SIRAYA Model Router](https://docs.siraya.ai/docs/)。**沒有任何 mock adapter**：模型清單、
生成請求、錯誤訊息全部來自真實 API。

## 啟動

```bash
npm install
cp .env.example .env.local     # 填入你的 SIRAYA API key
npm run dev                     # http://localhost:3000
```

`.env.local`：

```
SIRAYA_API_KEY=sk-...
# SIRAYA_BASE_URL=https://llm.siraya.ai/v1   # 只有在指向其他部署時才需要
```

API key 到 <https://console.siraya.ai/api-keys> 建立。key 只存在於 server 端，
所有請求都經過 `app/api/**` 的 route handler 代理，不會出現在瀏覽器 bundle 裡。

## API 對接

`lib/siraya.ts` 是唯一直接呼叫 SIRAYA 的地方，對應的文件頁：

| 功能 | 本地路由 | 上游端點 | 文件 |
| --- | --- | --- | --- |
| 模型清單 | `GET /api/models` | `GET /v1/models` | [list-all-models](https://docs.siraya.ai/docs/api-reference/models-api/list-all-models/) |
| 文字生成 | `POST /api/chat` | `POST /v1/chat/completions` | [llm-model-api](https://docs.siraya.ai/docs/api-reference/llm-model-api/overview/) |
| 圖片生成 | `POST /api/images` | `POST /v1/images/generations` | [text-to-image](https://docs.siraya.ai/docs/api-reference/generative-model-api/text-to-image/) |
| 影片生成 | `POST /api/videos` | `POST /v1/videos/generations` | [text-to-video](https://docs.siraya.ai/docs/api-reference/generative-model-api/text-to-video/) |
| 影片輪詢 | `GET /api/videos/{id}` | `GET /v1/videos/{id}` | 同上 |

認證一律是 `Authorization: Bearer <key>`，錯誤照
[errors-code](https://docs.siraya.ai/docs/api-reference/errors-code/) 的
`{ error: { message, type, code } }` 格式原樣往下傳，UI 直接顯示 `message`。

影片一律以 `async: true` 送出，拿到 job id 後每 4 秒輪詢一次，避免長時間渲染撞到
serverless 逾時。

## 成本試算

`lib/pricing.ts` 依 modality 計價：文字按 token、圖片按張、影片按秒，對應
[billing-transparency](https://docs.siraya.ai/docs/observability/billing-transparency/)。
**費率表是估算值** — SIRAYA 的實際單價只在 console 的模型頁面公開，公開文件沒有。
拿到你帳號的實際費率後，改 `RATES` 那張表即可。實際扣款以回應中的 `usage` 為準。

Composer 右下角的數字是點數（1 點 ≈ US$0.005），旁邊會顯示美金預估值。

## 結構

```
app/
  layout.tsx          側欄 + 頂欄外殼
  page.tsx            首頁：輪播、模型卡、畫布模板、底部浮動 composer
  studio/page.tsx     創作頁：空狀態／進度／結果 + Composer + 右側面板
  api/                SIRAYA 代理路由
components/
  Sidebar.tsx         可收合側欄
  TopBar.tsx          說明／語言／優惠／定價／登入
  Composer.tsx        模式下拉、模型下拉（讀真實 /v1/models）、設定、成本、送出
  SettingsPopover.tsx 畫面比例／解析度／時長／張數
  GenerationProgress.tsx  生成進度動畫
  InspirationPanel.tsx    靈感廣場／生成紀錄
lib/
  siraya.ts           SIRAYA client（server-only）
  pricing.ts          成本試算
  types.ts            共用型別與預設值
```

## 尚未接上的部分

側欄的 Agent、數位人、AI 應用、智慧畫布、資產庫、聯盟計畫目前是佔位路由；
素材上傳按鈕的 UI 已在，但還沒接
[Asset Management API](https://docs.siraya.ai/docs/api-reference/asset-management-api/)。
