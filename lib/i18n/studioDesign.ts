import type { Locale } from "./locale";
import { simplifyChinese } from "./simplifyChinese";

const zh = {
  inspirationHint: "從首頁的創作方案與範本開始，選好後再回到工作室調整。", browseTemplates: "瀏覽創作範本",
  videoTitle: "從一個鏡頭開始", imageTitle: "把想法變成畫面", textTitle: "寫下你的下一個想法",
  intro: "加入描述與素材，選擇模型，再確認這次生成的設定。",
  create: "創作設定", prompt: "畫面與動作描述", preview: "成果預覽",
  empty: "你的下一個作品，從這裡開始", emptyHint: "生成中的進度與完成的作品會顯示在這裡。你也可以從生成紀錄開啟既有作品。",
  generateVideo: "生成影片", generateImage: "生成圖片", generateText: "生成文字", loadingPrice: "讀取費率…",
  setup: "開通商務工作室", setupHint: "完成帳號驗證與申請，核准後即可連接自己的 SIRAYA Key。",
  account: "驗證帳號", application: "提交申請", review: "等待審核", key: "連接 Key", ready: "開始創作",
  billingTitle: "費用如何計算", billingHint: "商務生成使用你自己的 SIRAYA 額度，不扣藍翼點數。生成前可查看費用預覽，實際金額以 SIRAYA 帳單為準。",
  runSummary: "本次執行清單", newGeneration: "重新生成・可能計費", sourceOnly: "讀取素材或文字", runNotice: "清單中的生成節點會重新執行，包括已有成果的節點。未列出的節點不在本次執行範圍。",
  unknownPrice: "無法預估完整費用", unknownHint: "部分節點的費用取決於上游輸出或實際用量，以下預覽不代表整條流程的總額。",
  acknowledge: "我了解完整費用尚未確定，並同意依 SIRAYA 實際用量計費。", checking: "正在讀取費用…", reviewPrices: "請核對各節點費用；預覽不會送出生成。",
};
type Copy = { [K in keyof typeof zh]: string };
const en: Copy = {
  inspirationHint: "Explore creative briefs and templates on the home page, then bring one into the studio.", browseTemplates: "Browse templates",
  videoTitle: "Start with a shot", imageTitle: "Give your idea a frame", textTitle: "Write your next idea",
  intro: "Add a description and references, choose a model, then review your settings.",
  create: "Creation settings", prompt: "Scene and motion", preview: "Result preview",
  empty: "Your next work starts here", emptyHint: "Generation progress and finished work appear here. Open an earlier result from generation history.",
  generateVideo: "Generate video", generateImage: "Generate image", generateText: "Generate text", loadingPrice: "Loading rates…",
  setup: "Set up your business studio", setupHint: "Verify your account and submit an application. Connect your own SIRAYA key after approval.",
  account: "Verify account", application: "Apply", review: "Review", key: "Connect key", ready: "Create",
  billingTitle: "How billing works", billingHint: "Business generations use your own SIRAYA balance, without Blue Wing credits. Review estimated costs before generating. Your SIRAYA invoice determines the final amount.",
  runSummary: "Nodes in this run", newGeneration: "New generation · charges may apply", sourceOnly: "Read source or text", runNotice: "Every generation node listed will run again, including nodes with existing results. Unlisted nodes are outside this run.",
  unknownPrice: "Full cost unavailable", unknownHint: "Some costs depend on upstream output or actual usage. The previews below are not a total for this workflow.",
  acknowledge: "I understand the full cost is unknown and agree to SIRAYA billing based on actual usage.", checking: "Loading costs…", reviewPrices: "Review each node’s cost. Previews do not submit generations.",
};
const ja: Copy = {
  inspirationHint: "ホームで制作プランやテンプレートを選び、制作室で調整できます。", browseTemplates: "テンプレートを見る",
  videoTitle: "ひとつのカットから", imageTitle: "アイデアを画面に", textTitle: "次のアイデアを書こう",
  intro: "説明と素材を追加し、モデルを選び、生成設定を確認します。",
  create: "制作設定", prompt: "画面と動きの説明", preview: "成果プレビュー",
  empty: "次の作品はここから", emptyHint: "生成の進捗と完成作品がここに表示されます。生成履歴から以前の作品も開けます。",
  generateVideo: "動画を生成", generateImage: "画像を生成", generateText: "文章を生成", loadingPrice: "料金を読み込み中…",
  setup: "ビジネス制作室の開設", setupHint: "アカウント認証と申請を完了し、承認後にご自身の SIRAYA キーを接続します。",
  account: "アカウント認証", application: "申請", review: "審査", key: "キー接続", ready: "制作開始",
  billingTitle: "料金について", billingHint: "ビジネス生成はご自身の SIRAYA 残高を使用し、藍翼ポイントは消費しません。生成前に見積りを確認できます。最終金額は SIRAYA の請求に基づきます。",
  runSummary: "今回の実行対象", newGeneration: "再生成・課金対象", sourceOnly: "素材・文章の読み込み", runNotice: "一覧の生成ノードは、既存の成果がある場合も再実行されます。一覧にないノードは今回の対象外です。",
  unknownPrice: "全体の費用は未確定", unknownHint: "一部の料金は接続元の出力や実際の使用量によって変わります。以下の見積りは全体の合計ではありません。",
  acknowledge: "全体の費用が未確定であることを理解し、実際の使用量に基づく SIRAYA の請求に同意します。", checking: "料金を読み込み中…", reviewPrices: "各ノードの費用を確認してください。見積りで生成は開始されません。",
};
const copy: Record<Locale, Copy> = { "zh-Hant": zh, "zh-Hans": simplifyChinese(zh), en, ja };
export const studioDesignCopy = (locale: Locale) => copy[locale];
