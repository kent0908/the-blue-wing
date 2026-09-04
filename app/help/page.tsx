import Link from "next/link";

/**
 * Static help/documentation content — the "說明" button in TopBar used to be
 * a dead button with nothing behind it. Everything below describes features
 * that actually exist in this app (checked against the real routes/components
 * as of writing), not aspirational copy — keep it that way when features
 * change.
 */

interface Section {
  id: string;
  title: string;
}

const SECTIONS: Section[] = [
  { id: "start", title: "快速開始" },
  { id: "image", title: "圖片生成" },
  { id: "video", title: "影片生成" },
  { id: "refs", title: "參考素材與 @ 提及" },
  { id: "advanced", title: "進階設定：浮水印、審核強度" },
  { id: "history", title: "生成紀錄與下載" },
  { id: "credits", title: "點數與方案" },
  { id: "faq", title: "常見問題" },
];

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-20 text-[17px] font-semibold text-white">
      {children}
    </h2>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-[#262626] bg-[#141414] p-5">{children}</div>;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-[#3a3a3a] bg-[#1f1f1f] px-1.5 py-0.5 text-[11.5px] text-[#c9c9c9]">
      {children}
    </code>
  );
}

export default function HelpPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1080px] gap-10 px-6 py-8">
        {/* in-page nav */}
        <nav className="sticky top-8 hidden w-[180px] shrink-0 self-start md:block">
          <div className="text-[11px] font-medium uppercase tracking-wide text-[#6d6d6d]">目錄</div>
          <ul className="mt-2 space-y-1">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="block rounded-lg px-2 py-1.5 text-[12.5px] text-[#9a9a9a] transition-colors hover:bg-[#161616] hover:text-white"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1 space-y-10 pb-16">
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight">說明</h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#8a8a8a]">
              The Blue Wing 怎麼用：模式、參考素材、進階設定、點數計費都整理在這裡。有更即時的問題可以點右下角的
              客服對話框直接問。
            </p>
          </div>

          {/* 快速開始 */}
          <section className="space-y-3">
            <H2 id="start">快速開始</H2>
            <Card>
              <ol className="list-decimal space-y-2 pl-4 text-[13px] leading-relaxed text-[#c9c9c9]">
                <li>
                  在左側選單選一個模式：
                  <Link href="/studio?mode=image" className="text-[#7ff0cd] hover:underline">圖片生成</Link>、
                  <Link href="/studio?mode=video" className="text-[#7ff0cd] hover:underline">影片生成</Link>、
                  <Link href="/studio?mode=text" className="text-[#7ff0cd] hover:underline">多輪對話</Link>，
                  或輸入框左上角的模式切換也可以直接改。
                </li>
                <li>點模型下拉選單挑一個模型 — 不同模型支援的參數不同，切換模型時參數會自動重置成該模型支援的組合。</li>
                <li>在輸入框打上描述，需要的話用 <Kbd>@</Kbd> 帶入參考素材（見下方「參考素材」）。</li>
                <li>
                  按右下角的送出鍵，或用 <Kbd>Cmd/Ctrl</Kbd> + <Kbd>Enter</Kbd> 快速送出。生成中會顯示進度條；完成後
                  自動開啟右側「生成紀錄」面板。
                </li>
              </ol>
            </Card>
          </section>

          {/* 圖片生成 */}
          <section className="space-y-3">
            <H2 id="image">圖片生成</H2>
            <Card>
              <p className="text-[13px] leading-relaxed text-[#c9c9c9]">
                目前收錄 Seedream（4.0 / 4.5 / Dola 5.0 lite / pro）、Gemini（2.5 / 3.1 Flash / 3.1 Flash Lite / 3
                Pro）、GPT Image 2 三個家族。每個模型只會顯示它實際支援的參數：
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-[#c9c9c9]">
                <li><span className="text-white">尺寸</span>：依模型提供 1:1 / 16:9 / 9:16 等比例；Seedream 4.5 與 Dola 5.0 系列只支援 2K 以上解析度。</li>
                <li><span className="text-white">生成張數</span>：1–10 張，一次請求同時出多張。</li>
                <li><span className="text-white">品質 / 背景 / 壓縮率</span>：GPT Image 2 專屬，可以出透明背景 PNG/WebP。</li>
                <li><span className="text-white">負向提示詞 / 隨機種子</span>：Seedream 專屬，種子留空就是隨機。</li>
              </ul>
              <p className="mt-3 rounded-lg border border-[#3a2e18] bg-[#241d10] px-3 py-2 text-[12px] leading-relaxed text-[#f0c27f]">
                GPT Image 2 和 Gemini 3 Pro Image 生成常超過 60 秒，在 Vercel 免費方案的函式時限內可能會逾時失敗 —
                建議先用 Seedream 系列或 Gemini Flash 出快稿。
              </p>
            </Card>
          </section>

          {/* 影片生成 */}
          <section className="space-y-3">
            <H2 id="video">影片生成</H2>
            <Card>
              <p className="text-[13px] leading-relaxed text-[#c9c9c9]">
                秒數、解析度（480p / 720p / 1080p）、畫面比例可在生成設定裡調整。生成是非同步進行的：送出後系統會每
                4 秒輪詢一次進度，跑完自動顯示在主畫面。
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-[#c9c9c9]">
                鏡頭運動、配樂、音效、對白這些沒有獨立的 API 參數 — Seedance 是直接讀 prompt 裡的自然語言描述，正確
                寫法請看輸入框的「進階」面板（見下方）。
              </p>
            </Card>
          </section>

          {/* 參考素材 */}
          <section className="space-y-3">
            <H2 id="refs">參考素材與 @ 提及</H2>
            <Card>
              <p className="text-[13px] leading-relaxed text-[#c9c9c9]">
                圖片模式（Seedream / Gemini）和影片模式（Seedance 系列）都可以附上參考素材，讓生成結果貼合你上傳的
                圖片：
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-[#c9c9c9]">
                <li>點輸入框左邊的「素材」按鈕，上傳新圖或從資產庫裡選，可以一次選多張。</li>
                <li>
                  加入之後，在 prompt 裡打 <Kbd>@</Kbd> 可以從已加入的素材裡標記「這句話說的是哪一張」——但這只是方便你
                  自己書寫辨識，送出時系統會把 <Kbd>@名稱</Kbd> 標籤拿掉，模型實際收到的是一組沒有標籤的圖，@ 本身不會
                  被模型理解。
                </li>
                <li>
                  <span className="text-white">真的想讓模型分辨每張圖的用途，實測有效的寫法是「先逐張描述內容，再下指令」</span>
                  ，例如：「圖1是一隻紅色蘋果，圖2是藍色。請畫出圖1的形狀，整個塗成圖2的藍色」。實測過直接說「用第一張的
                  形狀」很容易失敗——模型會把兩張圖整個疊在一起，而不是照指令合成；但先描述每張圖內容再指示，Seedream、
                  Gemini 都能正確理解。
                </li>
                <li>
                  每次生成能附的張數依模型而定：圖片最多 4 張；影片只有 Seedance 家族支援，Seedance 2.5 最多 50
                  張，其他 Seedance 版本先保守開放 6 張，非 Seedance 模型（Veo、Sora 等）目前不支援。
                </li>
                <li>參考圖至少要 300×300px，太小會被伺服器拒絕並顯示錯誤訊息。</li>
              </ul>
            </Card>
          </section>

          {/* 進階設定 */}
          <section className="space-y-3">
            <H2 id="advanced">進階設定：浮水印、審核強度</H2>
            <Card>
              <p className="text-[13px] leading-relaxed text-[#c9c9c9]">
                輸入框工具列的齒輪圖示（進階）打開後有：
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-[#c9c9c9]">
                <li>
                  <span className="text-white">保留浮水印開關</span>：預設關閉，生成結果不會帶「AI generated」標記；
                  打開後畫面右下角會出現這個標記。圖片、影片都支援。
                </li>
                <li>
                  <span className="text-white">內容審核強度</span>（僅圖片模式）：自動（預設）或寬鬆。
                </li>
                <li>
                  <span className="text-white">Prompt 小技巧</span>（僅影片模式）：Seedance 官方鏡頭語彙，以及配樂
                  <Kbd>(...)</Kbd>、音效 <Kbd>&lt;...&gt;</Kbd>、對白 <Kbd>{"{...}"}</Kbd>、章節/字幕 <Kbd>【...】</Kbd>
                  的括號語法。
                </li>
              </ul>
              <p className="mt-3 text-[12px] leading-relaxed text-[#6d6d6d]">
                這裡只放實際會生效的參數 — 「引導強度」「推理步數」這類擴散模型內部參數，Seedream / Seedance
                並沒有對外開放，所以刻意沒有放假的滑桿。
              </p>
            </Card>
          </section>

          {/* 生成紀錄與下載 */}
          <section className="space-y-3">
            <H2 id="history">生成紀錄與下載</H2>
            <Card>
              <ul className="list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-[#c9c9c9]">
                <li>右上角「生成紀錄」會列出這個帳號過去的生成結果，可用關鍵字、類型、時間篩選。</li>
                <li>點任一張縮圖會把它換到左邊主畫面顯示；目前顯示中的項目會有綠色外框標示。</li>
                <li>
                  主畫面結果右上角、以及生成紀錄縮圖右上角（滑鼠移上去會出現）都有下載按鈕，點一下就會存成檔案
                  到本機，不需要另外截圖或右鍵另存。
                </li>
              </ul>
            </Card>
          </section>

          {/* 點數 */}
          <section className="space-y-3">
            <H2 id="credits">點數與方案</H2>
            <Card>
              <p className="text-[13px] leading-relaxed text-[#c9c9c9]">
                每次生成會先檢查點數是否足夠，成功產出才會實際扣點；圖片生成失敗不扣點，影片提交後失敗會自動退點。
                粗估費率：圖片約 10–14 點／張，影片約 50–70 點／秒。詳細方案與點數紀錄在
                <Link href="/account" className="text-[#7ff0cd] hover:underline">帳號</Link> 頁。
              </p>
            </Card>
          </section>

          {/* FAQ */}
          <section className="space-y-3">
            <H2 id="faq">常見問題</H2>
            <Card>
              <dl className="space-y-4 text-[13px] leading-relaxed">
                <div>
                  <dt className="font-medium text-white">為什麼生成一直失敗顯示逾時？</dt>
                  <dd className="mt-1 text-[#8a8a8a]">
                    少數較慢的模型（GPT Image 2、Gemini 3 Pro Image）常需要超過 60 秒，Vercel 免費方案的函式上限就是
                    60 秒。換成 Seedream 系列或 Gemini Flash 通常幾秒內就會完成。
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-white">登入後功能還是用不了？</dt>
                  <dd className="mt-1 text-[#8a8a8a]">
                    需要先完成 email 驗證信裡的連結，才能使用生成功能，不然 API 會回傳「請先完成 email 驗證」。
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-white">上傳素材顯示「尚未設定素材儲存空間」？</dt>
                  <dd className="mt-1 text-[#8a8a8a]">
                    這代表目前這個部署還沒接上 Vercel Blob（素材庫用的檔案儲存），請聯絡管理員設定。
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-white">送出的參考圖為什麼被拒絕？</dt>
                  <dd className="mt-1 text-[#8a8a8a]">
                    影片參考素材的圖片邊長至少要 300px；圖片模式最多附 4 張、影片模式依模型上限（Seedance 2.5 最多
                    50 張），超過會被自動截斷。
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-white">還有其他問題？</dt>
                  <dd className="mt-1 text-[#8a8a8a]">
                    點畫面右下角的客服對話框，直接問方案、點數、模型或操作問題。
                  </dd>
                </div>
              </dl>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
