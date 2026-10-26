import type { Locale } from "./i18n/locale";

/** Original production briefs. These are prompt recipes, not generated case studies or model guarantees. */
export type IndustryCategory = "advertising" | "commerce" | "games" | "art";
export type IndustryMediaType = "image" | "video";
type LocalizedText = Readonly<Record<Locale, string>>;
const text = (zh: string, en: string, ja: string): LocalizedText => ({ "zh-Hant": zh, en, ja });

export interface IndustryBriefField {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
}
interface BriefFieldDefinition {
  key: string;
  label: LocalizedText;
  placeholder: LocalizedText;
  required: boolean;
}
export interface IndustryWorkflowStep {
  id: string;
  kind: "manual" | "image" | "video";
  title: string;
  description: string;
}
interface WorkflowStepDefinition {
  id: string;
  kind: IndustryWorkflowStep["kind"];
  title: LocalizedText;
  description: LocalizedText;
}
export interface IndustrySkillDefinition {
  id: string;
  category: IndustryCategory;
  mediaType: IndustryMediaType;
  title: LocalizedText;
  summary: LocalizedText;
  deliverable: LocalizedText;
  fieldKeys: readonly BriefFieldKey[];
  promptTemplate: LocalizedText;
  constraints: readonly LocalizedText[];
  workflow: readonly WorkflowStepDefinition[];
}
export interface LocalizedIndustrySkill {
  id: string;
  category: IndustryCategory;
  categoryTitle: string;
  mediaType: IndustryMediaType;
  title: string;
  summary: string;
  deliverable: string;
  /** Both names point to the same field list; use fields in the review form. */
  fields: readonly IndustryBriefField[];
  briefFields: readonly IndustryBriefField[];
  promptTemplate: string;
  constraints: readonly string[];
  workflow: readonly IndustryWorkflowStep[];
  productionNote: string;
}

export const INDUSTRY_CATEGORIES = [
  { id: "advertising", title: text("廣告企劃", "Advertising", "広告制作"), description: text("把一個賣點，拍成值得停下來的畫面。", "Turn one clear message into a reason to stop.", "ひとつの価値を、目を留める画面へ。") },
  { id: "commerce", title: text("電商商品", "Commerce", "商品・EC"), description: text("先讓人看懂商品，再讓人想像擁有它。", "Show the product clearly, then give it a place in life.", "商品を正しく見せ、使う場面まで届ける。") },
  { id: "games", title: text("遊戲世界", "Games", "ゲーム"), description: text("從角色、地景到動作，建立同一個世界。", "Build a consistent world through character, place and action.", "キャラクター、空間、動きで同じ世界を築く。") },
  { id: "art", title: text("品牌藝術", "Brand & art", "ブランド・アート"), description: text("讓材質、形式與觀看方式成為作品。", "Make material, form and perspective part of the work.", "素材、かたち、視点そのものを作品に。") },
] as const satisfies readonly { id: IndustryCategory; title: LocalizedText; description: LocalizedText }[];

const field = (key: string, label: LocalizedText, placeholder: LocalizedText): BriefFieldDefinition => ({ key, label, placeholder, required: true });
const BRIEF_FIELDS = {
  product: field("product", text("商品與識別特徵", "Product and identifying details", "商品と識別する特徴"), text("商品類型、型號、輪廓、材質、顏色；哪些細節不能改變？", "Product type, SKU, silhouette, material and colour. Which details must stay unchanged?", "種類、型番、輪郭、素材、色。変更してはいけない特徴は？")),
  references: field("references", text("參考素材與用途", "References and their roles", "参考素材と用途"), text("列出實際會附上的素材；例如 A 固定商品外形，B 只取場景光線。", "List the files you will actually attach, e.g. A fixes product identity; B supplies lighting only.", "実際に添付する素材を記入。例：Aは商品の形、Bは光の参考のみ。")),
  message: field("message", text("唯一傳達重點", "One communication goal", "伝えたいひとつの価値"), text("這張圖或短片要讓人記得什麼？只寫已確認的特性，不填未證實功效。", "What should the viewer remember? Use verified properties, not unsubstantiated claims.", "何を覚えてほしいですか。確認済みの特徴を記入し、未確認の効能は避けてください。")),
  audience: field("audience", text("受眾與投放情境", "Audience and placement", "対象と掲載場面"), text("誰會看到？出現在哪個版位？例如通勤時觀看的直式社群短片。", "Who watches, and where? For example, a vertical social film viewed during a commute.", "誰が、どこで見ますか。例：移動中に見る縦型SNS動画。")),
  setting: field("setting", text("空間與光線", "Setting and light", "空間と光"), text("指定一個可描述的場景、光源方向與時間；避免同時混入多個地點。", "Name one coherent setting, light direction and time of day.", "ひとつの空間、光源の向き、時間帯を具体的に。複数の場所を混ぜないでください。")),
  format: field("format", text("畫幅與交付用途", "Format and delivery use", "画面比率と納品用途"), text("例如 9:16 直式社群；解析度與秒數仍須在生成介面設定。", "For example, 9:16 social placement. Set actual resolution and duration in the generation controls.", "例：9:16の縦型SNS用。実際の解像度・秒数は生成画面で設定します。")),
  safeArea: field("safeArea", text("後製留白", "Space for post-production", "後編集用の余白"), text("哪裡要保留乾淨區域？例如畫面上方 25%，供後製加標題。", "Where should the composition stay clear? For example, the top 25% for titles added in post.", "どこを空けますか。例：後編集で見出しを置く上部25%。")),
  material: field("material", text("材質與可見細節", "Material and visible detail", "素材と見せたい細部"), text("只描述實際存在的表面、接縫、紋理或光澤，以及希望看清的位置。", "Describe existing surfaces, seams, texture or finish, and the specific area to show.", "実在する表面、継ぎ目、質感、光沢と、見せたい箇所を記入。")),
  palette: field("palette", text("色彩與情緒", "Palette and mood", "色と空気感"), text("主色、輔色、光比與情緒；例如鈷藍、石白、低對比安靜光線。", "Dominant and secondary colours, contrast and mood, e.g. cobalt, chalk and soft quiet light.", "主色・補助色、コントラスト、空気感。例：コバルト、白亜色、柔らかな光。")),
  character: field("character", text("角色身份與連戲", "Character identity and continuity", "キャラクターと連続性"), text("角色外形、服裝、配件所在側；哪些已核准設定必須保留？", "Appearance, costume and accessory sides. Which approved design details must stay fixed?", "外見、衣装、装飾の左右。承認済み設定のどこを固定しますか。")),
  world: field("world", text("世界規則與地理", "World rules and geography", "世界のルールと地理"), text("年代、建築、科技或魔法上限、通道方向；列出不能出現的元素。", "Era, architecture, limits of technology or magic, paths and excluded elements.", "時代、建築、技術・魔法の範囲、通路の方向、出してはいけない要素。")),
  action: field("action", text("一個主要動作", "One principal action", "ひとつの主な動作"), text("誰從哪個位置開始、朝哪個畫面方向做什麼，最後停在哪個狀態？", "Who starts where, moves in which screen direction, and finishes in what visible state?", "誰がどこから、画面のどちらへ何をし、どの状態で終えますか。")),
  focalPoint: field("focalPoint", text("畫面主命題", "Visual proposition", "画面の中心となる発想"), text("用可見的物件與關係描述概念，例如一張薄紙承托一塊粗石。", "Describe an idea through visible objects and relationships, e.g. one sheet of paper holding a rough stone.", "物と関係で発想を記述。例：一枚の薄紙が粗い石を支える。")),
  styles: field("styles", text("三種表現語言", "Three visual languages", "三つの表現方法"), text("列出三種具體媒材與做法，例如木刻排線、厚塗油彩、霧面陶土。", "Name three specific media and methods, e.g. carved hatching, impasto paint and matte clay.", "三つの素材・技法を具体的に。例：木版の線、厚塗り油彩、つや消し陶土。")),
} as const;
type BriefFieldKey = keyof typeof BRIEF_FIELDS;

const referenceStep: WorkflowStepDefinition = { id: "references", kind: "manual", title: text("指定參考用途", "Assign reference roles", "参考の用途を指定"), description: text("選擇實際素材，分清身份、構圖與風格來源；文字不會自動附檔。", "Attach the actual files and separate identity, composition and style roles. Text does not attach files.", "実ファイルを選び、同一性・構図・作風の用途を分けます。文章だけでは添付されません。") };
const reviewStep: WorkflowStepDefinition = { id: "review", kind: "manual", title: text("人工確認一致性", "Review continuity", "連続性を確認"), description: text("檢查輪廓、左右方向、空間與留白；未通過先修圖，再決定是否做影片。", "Check silhouette, sides, space and clear areas. Fix the still before deciding to animate it.", "輪郭、左右、空間、余白を確認。不備を直してから動画化を判断します。") };
const postStep: WorkflowStepDefinition = { id: "post", kind: "manual", title: text("後製與交付", "Finish and deliver", "後編集と納品"), description: text("完成文字與正式標誌排版、剪輯與聲音，確認交付尺寸與成片品質。", "Finish typography, approved marks, editing and sound, then check delivery dimensions and picture quality.", "文字と正式ロゴの配置、編集、音を仕上げ、納品サイズと映像品質を確認します。") };
const STILL_WORKFLOW: readonly WorkflowStepDefinition[] = [referenceStep,
  { id: "image", kind: "image", title: text("生成單張主畫面", "Generate the key image", "キービジュアルを生成"), description: text("填完簡報後審閱提示詞，選擇圖片模型與實際參數，再手動提交。", "Review the completed prompt, choose an image model and actual settings, then submit manually.", "入力済みプロンプトを確認し、画像モデルと実パラメータを選んで手動実行します。") }, reviewStep, postStep];
const MOTION_WORKFLOW: readonly WorkflowStepDefinition[] = [referenceStep,
  { id: "image", kind: "image", title: text("先確認首幀", "Approve the first frame", "開始フレームを確認"), description: text("先生成或指定一張單幅首幀；角色卡、分格圖不直接當影片首幀。", "Generate or select one clean first frame. Do not use a sheet or multi-panel board as the opening frame.", "単一画面の開始フレームを生成または指定。設定表や分割画面はそのまま使いません。") }, reviewStep,
  { id: "video", kind: "video", title: text("逐鏡生成動態", "Animate one shot at a time", "カットごとに動画化"), description: text("採用已確認的圖；依模型支援設定秒數、畫幅與音訊，送出前再確認費用。", "Use the approved image. Set duration, ratio and audio only where supported, and review cost before submission.", "確認済み画像を使い、対応する秒数・比率・音声を設定。送信前に費用を確認します。") }, postStep];
const SEQUENCE_WORKFLOW: readonly WorkflowStepDefinition[] = [referenceStep,
  { id: "image", kind: "image", title: text("分別確認三鏡首幀", "Approve three shot frames", "三カットの開始画を確認"), description: text("三張圖沿用同一商品、相機軸線及光線；每鏡單獨確認，避免整段重做。", "Keep product, axis and light consistent across three stills. Approve each shot separately.", "同一商品・軸線・光を三枚で維持し、各カットを個別に確認します。") }, reviewStep,
  { id: "video", kind: "video", title: text("三段獨立生成", "Generate three separate clips", "三本を個別に生成"), description: text("每段只處理一個動作；在生成介面個別填入對應段落與時長，不把整份剪輯筆記當單鏡。", "Use one action per clip. Submit the relevant shot paragraph and duration separately, not the entire edit brief as one shot.", "一本にひとつの動作。該当段落と秒数を個別設定し、編集メモ全体を一カットとして送信しません。") }, postStep];

const noTypesetting = text("不生成標題、價格、UI、字幕、浮水印或新 Logo；正式文字與標誌另行後製。", "Do not generate headlines, prices, UI, captions, watermarks or new logos. Add approved typography and marks in post.", "見出し、価格、UI、字幕、透かし、新しいロゴを生成しない。正式な文字・ロゴは後編集で追加。");
const productContinuity = text("以實際商品參考為身份依據，固定比例、零件數、開孔、接縫和材質；不可為了美術效果新增功能。", "Use the actual product reference for identity. Preserve proportions, part count, openings, seams and material; add no invented function for visual effect.", "実商品の参考を同一性の基準にし、比率、部品数、開口、継ぎ目、素材を固定。演出のために機能を創作しない。");
const printedSurface = text("既有包裝印刷不能可靠重現時，保留可貼標的平整區域，交由後製覆蓋，不編造字樣。", "If existing printed packaging cannot be reproduced reliably, leave a clean label surface for post-production rather than inventing lettering.", "既存パッケージの印刷を正確に再現できない場合、貼り込み用の面を保ち、文字を創作せず後編集に回す。");
const characterContinuity = text("同一角色維持臉、髮型、服裝、配件左右側與武器造型；設定圖的多視角不是多個人。", "Keep the same face, hair, costume, accessory sides and equipment design. Multiple views in a design sheet are one person, not a group.", "顔、髪、衣装、装飾の左右、装備の形を維持。設定画の複数方向は別人ではなく同一人物。");
const visualOnly = text("鏡位與時段是導演意圖，並非逐幀控制保證；解析度、幀率、音訊及模型功能以生成介面的實際設定為準。", "Lens and timing descriptions express direction, not frame-level guarantees. Actual resolution, frame rate, audio and capabilities come from the generation controls.", "画角や時間は演出意図であり、フレーム単位の制御保証ではありません。解像度・フレームレート・音声・機能は生成画面の設定に従います。");

export const INDUSTRY_SKILLS: readonly IndustrySkillDefinition[] = [
  {
    id: "ad-product-reveal", category: "advertising", mediaType: "video",
    title: text("光影揭幕廣告", "Product reveal", "光で魅せる商品広告"),
    summary: text("用一道移動的光交代商品輪廓，收在可用的廣告定鏡。", "Reveal the silhouette with moving light, then hold a usable closing frame.", "動く光で輪郭を示し、広告に使える静かな終点へ。"),
    deliverable: text("1 張確認首幀＋1 段約 6–8 秒產品短鏡", "One approved first frame and one product shot of about 6–8 seconds", "確認済み開始画1枚＋約6〜8秒の商品カット1本"),
    fieldKeys: ["product", "references", "message", "setting", "format", "safeArea"], workflow: MOTION_WORKFLOW,
    promptTemplate: text(
      "用途：{{format}}。唯一重點：{{message}}。商品：{{product}}。參考用途：{{references}}。空間與光線：{{setting}}。\n開場是商品三分之四正面的單幅構圖，60mm感近景，完整保留輪廓，商品站穩於實體平面。影片意圖約6–8秒：前1秒看見低調輪廓，中段一條柔和側光慢慢掠過既有表面，同時相機只向右移約商品寬度的四分之一，末段光停住，留約1.5秒穩定畫面。商品不旋轉、不拆解，鏡頭不變焦、不切鏡。{{safeArea}} 保持乾淨；光的路徑引導視線，不組成字母或符號。",
      "Use: {{format}}. Single message: {{message}}. Product: {{product}}. Reference roles: {{references}}. Setting and light: {{setting}}.\nBegin in one three-quarter-front composition, a 60mm-like close view with the whole silhouette grounded on a physical surface. Motion intent, about 6–8 seconds: a quiet silhouette for the first second; a soft side light travels over the existing finish while the camera trucks right by roughly one quarter of the product width; the light stops and the final frame holds for about 1.5 seconds. No product rotation, disassembly, zoom or cut. Keep {{safeArea}} clear. The light directs attention without forming letters or symbols.",
      "用途：{{format}}。伝える価値：{{message}}。商品：{{product}}。参考の用途：{{references}}。空間と光：{{setting}}。\n開始時は斜め正面、60mm相当の近景で、輪郭全体と接地を見せる。約6〜8秒の演出：最初の1秒は静かな輪郭。中盤に柔らかな側光が既存の表面を渡り、カメラは商品幅の約4分の1だけ右へ移動。最後は光を止め、約1.5秒保持する。商品は回転・分解せず、ズームもカットも入れない。{{safeArea}} を空け、光を文字や記号の形にしない。"),
    constraints: [productContinuity, printedSurface, noTypesetting, visualOnly],
  },
  {
    id: "ad-concept-poster", category: "advertising", mediaType: "image",
    title: text("概念主視覺", "Concept campaign poster", "コンセプトビジュアル"),
    summary: text("用明確的物件關係呈現概念，保留真正可排版的空間。", "Express an idea through a clear relationship between objects, with usable type space.", "物同士の関係で発想を伝え、組版できる余白を残す。"),
    deliverable: text("1 張無字廣告主視覺", "One advertising key visual without typography", "文字なし広告キービジュアル1枚"),
    fieldKeys: ["product", "references", "focalPoint", "palette", "format", "safeArea"], workflow: STILL_WORKFLOW,
    promptTemplate: text(
      "為 {{format}} 創作單張廣告主視覺。商品是 {{product}}，參考分工 {{references}}。核心可見關係：{{focalPoint}}。色彩與情緒：{{palette}}。\n先讓觀眾一眼分清主體與支撐物，僅用一個視覺矛盾傳達概念，不堆放象徵物。50mm感靜物攝影構圖，單一主光，接觸陰影與材質反射符合場景；即使概念超現實，商品本身的結構也保持真實。主體不被裁掉關鍵部位，{{safeArea}} 保留低細節、對比穩定的留白。交付乾淨單幅畫面，不做海報樣機、拼貼排版或帶字廣告。",
      "Create one advertising key visual for {{format}}. Product: {{product}}. Reference roles: {{references}}. Visible conceptual relationship: {{focalPoint}}. Palette and mood: {{palette}}.\nSeparate the main subject from its support at a glance. Use one visual contradiction instead of a collection of symbols. A 50mm-like still-life composition with one key light, credible contact shadows and material reflections. A surreal relationship must not distort the product's own construction. Keep identifying parts inside the frame. Reserve {{safeArea}} as low-detail space with stable contrast. Deliver one clean image, not a poster mock-up, collage layout or typeset advertisement.",
      "{{format}} 用の広告キービジュアルを一枚制作。商品：{{product}}。参考の役割：{{references}}。目に見える中心の関係：{{focalPoint}}。色と空気感：{{palette}}。\n主役と支える物を一目で区別できる構図にし、記号を並べず、ひとつの視覚的な矛盾で伝える。50mm相当の静物構図、主光は一つ。接触影と素材の反射は空間に沿わせる。関係が非現実でも商品自体の構造は変えない。識別部分を切らず、{{safeArea}} を低密度で明暗の安定した余白にする。文字入り広告、モックアップ、コラージュではなく単一画面を納品。"),
    constraints: [productContinuity, noTypesetting],
  },
  {
    id: "ad-three-beat-story", category: "advertising", mediaType: "video",
    title: text("三拍敘事廣告", "Three-beat story ad", "3ビートのストーリー広告"),
    summary: text("察覺、使用、結果三鏡相扣，用同一場景說清楚一件事。", "Connect a need, an action and a visible result in one consistent setting.", "気づき、使用、結果を、同じ空間でつなぐ。"),
    deliverable: text("本次先做約 3 秒的第一鏡；後兩鏡需分別編寫、生成及剪輯", "Start with one opening shot of about 3 seconds; write, generate and edit the next two separately", "今回は約3秒の第一カット。後の二カットは個別に記述・生成・編集"),
    fieldKeys: ["product", "references", "message", "audience", "setting", "action"], workflow: SEQUENCE_WORKFLOW,
    promptTemplate: text(
      "受眾與版位：{{audience}}。商品：{{product}}。參考分工：{{references}}。唯一確認重點：{{message}}。空間：{{setting}}。預計下一鏡的使用動作：{{action}}；本次只拍使用前的第一鏡。\n約3秒單鏡，35mm感平視中景，相機固定。商品在前中景，保留完整輪廓、支撐面與可辨識的情境。前半段以一個真實可見的狀況建立使用需要；後半段一隻手從畫面側邊伸向商品，在接觸前停住，末尾保留約0.5秒，供下一鏡接動作。本鏡不完成使用、不展示效果、不切成三段，不用誇張症狀或變身。手部接近方向清楚，光線與空間全程穩定，便於之後在同一軸側另拍使用與結果。",
      "Audience and placement: {{audience}}. Product: {{product}}. Reference roles: {{references}}. One verified message: {{message}}. Setting: {{setting}}. Planned action for the following shot: {{action}}; this request makes only the opening shot before use.\nOne shot of about 3 seconds, a locked 35mm-like eye-level medium view. Keep the product in the near-to-middle ground with its silhouette, support and context readable. The first half establishes one real, visible need; in the second half one hand reaches from the side toward the product, stops before contact and holds about half a second for an action match. Do not complete the use, show a result, cut into three scenes, dramatise symptoms or transform the scene. Give the reach a clear direction and keep light and space stable so use and result can later be shot separately on the same side of the axis.",
      "対象と掲載場面：{{audience}}。商品：{{product}}。参考の役割：{{references}}。確認済み訴求：{{message}}。空間：{{setting}}。次のカットで予定する使用動作：{{action}}。今回は使用前の第一カットだけを生成。\n約3秒のワンカット、35mm相当、目線の高さの固定中景。商品を前〜中景に置き、輪郭、支持面、使用場面を読み取れるようにする。前半に実在する目に見える必要性を示し、後半に片手が画面横から商品へ伸び、接触前に止まる。動作つなぎ用に約0.5秒保持。使用完了、効果の提示、三場面への分割、症状の誇張、変身は行わない。手の方向を明確にし、光と空間を固定。後の使用・結果カットを同じ軸側で個別制作できる状態にする。"),
    constraints: [productContinuity, noTypesetting, text("不生成比較數據、保證效果、推薦證言或未提供的認證；聲音和文案在後製確認。", "Invent no comparison figures, guarantees, testimonials or certifications. Review sound and copy in post.", "比較数値、効果保証、推薦の証言、未提示の認証を創作しない。音とコピーは後工程で確認。"), visualOnly],
  },
  {
    id: "ad-social-gesture", category: "advertising", mediaType: "video",
    title: text("社群動作短片", "Social motion short", "SNSアクション動画"),
    summary: text("用前景遮擋與明確揭示做社群開場，不依賴生成字幕。", "Use foreground occlusion and a clear reveal for a social opening, without generated captions.", "前景の遮りと明確な見せ場で、字幕に頼らない導入を。"),
    deliverable: text("1 張首幀＋1 段約 6–8 秒社群開場", "One first frame and one social opening of about 6–8 seconds", "開始画1枚＋約6〜8秒のSNS導入カット"),
    fieldKeys: ["product", "references", "audience", "action", "format", "safeArea"], workflow: MOTION_WORKFLOW,
    promptTemplate: text(
      "版位：{{format}}，受眾情境：{{audience}}。主體：{{product}}，參考用途：{{references}}。唯一動作：{{action}}。\n開始畫面能讀清主體。約6–8秒單鏡：第一秒動作已經開始，前景一件合理存在的物件短暫掠過鏡頭，再移開揭示完整商品；遮擋物只能是一件，不能讓商品憑空替換。相機35mm感，沿一個方向短距離跟移，揭示後停住，後2秒保持穩定。商品始終在同一地面和光線中。{{safeArea}} 不放高對比細節或手部，供後製加訊息。影片依靠可見動作抓住注意，不加字幕、倒數、介面或廣告式爆閃。",
      "Placement: {{format}}. Viewing context: {{audience}}. Subject: {{product}}. Reference roles: {{references}}. Single action: {{action}}.\nBegin with the subject clearly readable. One shot of about 6–8 seconds: action is already under way in the first second; one plausible foreground object briefly crosses the lens, then clears to reveal the complete product. Use only one occluder and never replace the product magically. A 35mm-like camera tracks a short distance in one direction, stops at the reveal and holds the last two seconds. Keep the same ground and light. Leave {{safeArea}} free of busy contrast and hands for text in post. Attention comes from visible action, not captions, countdowns, UI or flashing ad effects.",
      "掲載先：{{format}}。視聴場面：{{audience}}。主役：{{product}}。参考用途：{{references}}。ひとつの動作：{{action}}。\n主役を読み取れる画面から、約6〜8秒のワンカットで、最初の1秒から動作が始まっている。実際に存在できる前景の物を一つだけレンズ前に通し、取り除いて商品の全体を見せる。遮蔽物を増やさず、商品を瞬間的に別物へ置換しない。35mm相当で一方向に短く追従し、見えた時点で止め、最後2秒保持。同じ床と光を維持し、{{safeArea}} に手や強いコントラストを置かない。字幕、カウントダウン、UI、激しい点滅ではなく動作で引きつける。"),
    constraints: [productContinuity, printedSurface, noTypesetting, visualOnly],
  },
  {
    id: "commerce-clean-packshot", category: "commerce", mediaType: "image",
    title: text("商品主圖", "Product hero image", "商品メイン画像"),
    summary: text("乾淨背景、可信陰影、完整輪廓，為商品頁建立主圖。", "A clean product-page image with credible shadow and an intact silhouette.", "背景、影、輪郭を整えて、商品ページの主画像に。"),
    deliverable: text("1 張商品頁主圖；透明背景僅在所選模型支援時另設", "One product-page hero; request transparency separately only where supported", "商品ページ主画像1枚。透過は対応モデルで別途設定"),
    fieldKeys: ["product", "references", "material", "format", "safeArea"], workflow: STILL_WORKFLOW,
    promptTemplate: text(
      "商品主圖，用途 {{format}}。商品身份 {{product}}；參考用途 {{references}}；真實材質 {{material}}。\n拍攝同一SKU的單一商品，70mm感三分之四正面，鏡頭高度接近商品中心，垂直線不傾斜，完整頭尾與外輪廓都留在畫面內。背景為均勻中性淺灰，柔和左上方棚光，地面只留可信的接觸陰影；不做漂浮、爆炸拆解、鏡面地板或過度景深。材質細節清楚但不銳化出不存在的紋路。{{safeArea}} 保持乾淨，不自行加入道具、包裝盒、尺寸線或價格。透明檔案格式由實際生成設定決定，畫面不以棋盤格假裝透明。",
      "Product hero for {{format}}. Product identity: {{product}}. Reference roles: {{references}}. Actual material: {{material}}.\nShow one item of the same SKU in a 70mm-like three-quarter-front view, camera close to product-centre height, verticals straight and the complete silhouette inside the frame. Use an even neutral light-grey background, a soft upper-left studio light and a credible contact shadow. No floating product, exploded parts, mirror floor or extreme depth of field. Show genuine texture without sharpening imaginary detail. Keep {{safeArea}} clean. Add no props, box, dimension lines or price. Transparency must come from supported output settings; do not draw a checkerboard to imitate it.",
      "{{format}} 用の商品主画像。商品の同一性：{{product}}。参考用途：{{references}}。実際の素材：{{material}}。\n同じSKUを一つだけ、70mm相当の斜め正面で撮る。カメラは商品の中央高、垂直線をまっすぐに保ち、全輪郭を画面内に収める。均一な中性の薄灰背景、左上から柔らかな棚光、自然な接触影。浮遊、分解、鏡面床、極端な被写界深度は不要。実在の質感を見せ、架空の細線を強調しない。{{safeArea}} は空け、小物、箱、寸法線、価格を追加しない。透過は対応する出力設定で指定し、市松模様を描いて代用しない。"),
    constraints: [productContinuity, printedSurface, noTypesetting],
  },
  {
    id: "commerce-material-detail", category: "commerce", mediaType: "image",
    title: text("材質微距", "Material close-up", "質感のクローズアップ"),
    summary: text("用可辨識的局部交代材質，避免微距變成無關抽象紋理。", "Show material in an identifiable detail, not an unrelated abstract macro.", "抽象的な質感ではなく、商品と分かる細部を見せる。"),
    deliverable: text("1 張商品材質細節圖", "One identifiable product-detail image", "商品と分かる素材ディテール画像1枚"),
    fieldKeys: ["product", "references", "material", "message", "format"], workflow: STILL_WORKFLOW,
    promptTemplate: text(
      "用途 {{format}}，希望說明 {{message}}。商品 {{product}}；參考用途 {{references}}。指定材質與區域 {{material}}。\n只拍真實存在的那一處細節，100mm微距感，沿表面斜看而非完全平貼。畫面保留至少一個原商品的邊緣、接縫或結構轉角，讓局部仍能被辨認。柔和掠射光交代厚度、紋理和光澤，焦點覆蓋主要細節，遠處自然轉柔。顏色與主圖一致，不把磨砂變金屬、不加水珠暗示防水、不增加不存在的縫線或鍍層。只交付單張局部，不製作對比拼圖、標籤或放大鏡介面。",
      "Use: {{format}}. Point to communicate: {{message}}. Product: {{product}}. Reference roles: {{references}}. Material and area: {{material}}.\nPhotograph only that existing detail with a 100mm macro feel and a slightly oblique view along the surface. Retain at least one real edge, seam or structural corner so the crop is still recognisable as this product. Soft raking light reveals thickness, texture and finish; the main detail is in focus and the distance falls away naturally. Match the hero image colour. Do not turn matte material into metal, add droplets to imply waterproofing, or invent stitching or coatings. Deliver one detail image, not a comparison collage, label system or magnifying-glass UI.",
      "用途：{{format}}。伝えたい点：{{message}}。商品：{{product}}。参考用途：{{references}}。見せる素材・箇所：{{material}}。\n実在するその箇所だけを、100mmマクロ相当で表面に沿って斜めに見る。商品の縁、継ぎ目、構造の角のいずれかを残し、何の商品か分かる局部にする。柔らかな掠射光で厚み、質感、光沢を示し、主要部分に焦点を合わせて奥を自然にぼかす。主画像と同じ色を維持。マット素材を金属に変えず、防水を暗示する水滴や架空の縫い目・コーティングを加えない。一枚の局部画像とし、比較コラージュ、ラベル、虫眼鏡UIをつくらない。"),
    constraints: [productContinuity, noTypesetting],
  },
  {
    id: "commerce-life-context", category: "commerce", mediaType: "image",
    title: text("生活情境圖", "Lifestyle product still", "暮らしの商品カット"),
    summary: text("以尺度和接觸關係說服觀眾，讓情境服務商品。", "Make scale and physical contact credible so the setting serves the product.", "スケールと接触を整え、商品を引き立てる生活場面へ。"),
    deliverable: text("1 張商品使用情境圖", "One product-in-context image", "商品使用シーン画像1枚"),
    fieldKeys: ["product", "references", "setting", "action", "format", "safeArea"], workflow: STILL_WORKFLOW,
    promptTemplate: text(
      "用途 {{format}}。商品 {{product}}，參考用途 {{references}}。生活空間 {{setting}}。指定使用狀態 {{action}}。\n以35mm感平視中景建立一個可真實使用的場景。商品位於前中景，比例對應桌面、手掌或其他已知尺度，支撐面完整，接觸陰影方向一致。若需要手部，只讓一雙手完成指定動作，手指與把手、按鈕或布面真實接觸；沒有提供人物參考就不讓臉成為主角。環境道具只保留必要兩三件，色彩退後，不擋產品輪廓。{{safeArea}} 留給後製。不要展示商品未具備的用途，也不把效果文字畫進場景。",
      "Use: {{format}}. Product: {{product}}. Reference roles: {{references}}. Everyday setting: {{setting}}. Use state: {{action}}.\nBuild one usable real-world scene in a 35mm-like eye-level medium view. Place the product in the near-to-middle ground at a credible scale against a table, hand or known object. Show the support surface and consistent contact shadows. If hands are needed, one pair performs only the specified action with believable contact at handles, buttons or fabric. Without a person reference, do not make a face the subject. Limit surroundings to two or three necessary props, quieter in colour and clear of the silhouette. Reserve {{safeArea}} for post. Do not demonstrate unsupported uses or place benefit text inside the scene.",
      "用途：{{format}}。商品：{{product}}。参考用途：{{references}}。生活空間：{{setting}}。使用状態：{{action}}。\n35mm相当、目線の高さの中景で、実際に使える一場面をつくる。商品は前〜中景に置き、机、手、既知の物との尺度を合わせる。支持面を見せ、接触影の方向を統一。手が必要なら一組だけで指定の操作を行い、把手、ボタン、布に自然に触れる。人物参考がない場合、顔を主役にしない。周囲の小物は必要な二、三点に絞り、色を抑えて輪郭を隠さない。{{safeArea}} を後編集用に確保。未対応の用途を見せたり、効果の文字を場面に描いたりしない。"),
    constraints: [productContinuity, printedSurface, noTypesetting],
  },
  {
    id: "commerce-product-orbit", category: "commerce", mediaType: "video",
    title: text("商品環繞鏡頭", "Product orbit film", "商品を巡るカメラ"),
    summary: text("相機移動、商品不變形，只展示參考能支撐的角度。", "Move the camera without reshaping the product or inventing unseen surfaces.", "商品を変形させず、参考で確認できる角度だけを見せる。"),
    deliverable: text("1 張首幀＋1 段約 5–6 秒商品環繞", "One first frame and one product orbit of about 5–6 seconds", "開始画1枚＋約5〜6秒の商品回り込みカット"),
    fieldKeys: ["product", "references", "material", "setting", "format"], workflow: MOTION_WORKFLOW,
    promptTemplate: text(
      "商品 {{product}}。已附參考及可見角度 {{references}}。材質 {{material}}。場景 {{setting}}。用途 {{format}}。\n商品靜置於平面，相機70mm感，保持相同高度與距離。約5–6秒內只向商品右側繞行約40度，讓側面結構逐步可見；商品本身不旋轉、不縮放、不拆解。前後各停約0.5秒，單一連續鏡頭，焦點維持商品，背景透視隨相機合理變化。只展示參考已交代的表面；未提供背面時不得繞到背後，改為更小角度的側移。反射隨相機變化，但形狀、孔位、配件、標籤面及顏色不漂移。",
      "Product: {{product}}. Attached references and supported views: {{references}}. Material: {{material}}. Set: {{setting}}. Use: {{format}}.\nKeep the product still on a surface. A 70mm-like camera holds height and distance while moving about 40 degrees toward the product's right side over roughly 5–6 seconds. The object does not rotate, resize or disassemble. Hold about half a second at both ends; one continuous shot with focus on the product and physically consistent background parallax. Show only surfaces established by the references. Without a back view, do not travel behind the object; reduce the camera move instead. Reflections may change with angle, but shape, apertures, accessories, label surface and colour stay fixed.",
      "商品：{{product}}。添付参考と確認できる角度：{{references}}。素材：{{material}}。場面：{{setting}}。用途：{{format}}。\n商品は台の上に静止。70mm相当のカメラが高さと距離を保ち、約5〜6秒で商品の右側へ約40度だけ回り込む。商品自体は回転、拡縮、分解しない。始めと終わりに約0.5秒ずつ保持し、ワンカットで商品に合焦。背景の視差はカメラ移動に沿わせる。参考で分かる面だけを見せ、背面参考がなければ裏へ回らず移動角を縮める。反射は変わっても、形、開口、装飾、ラベル面、色は固定する。"),
    constraints: [productContinuity, printedSurface, noTypesetting, visualOnly],
  },
  {
    id: "game-character-continuity", category: "games", mediaType: "image",
    title: text("角色三視角", "Character turnarounds", "キャラクター3方向図"),
    summary: text("正面、三分之四與背面放在同一張設定表，先鎖定身份。", "Lock identity with front, three-quarter and back views on one reference sheet.", "正面、斜め、背面を一枚にまとめ、同一性の基準をつくる。"),
    deliverable: text("1 張三視角角色設定表；不直接作影片首幀", "One three-view character sheet, not an opening frame for video", "三方向のキャラクター設定表1枚。動画の開始画には直接使わない"),
    fieldKeys: ["character", "references", "world", "palette", "format"], workflow: STILL_WORKFLOW,
    promptTemplate: text(
      "角色設定 {{character}}。參考用途 {{references}}。世界規則 {{world}}。色彩與畫風 {{palette}}。交付畫幅 {{format}}。\n一張整齊的三區角色設定表：左側正面全身、中間三分之四全身、右側背面全身，三個視角是同一人的同一套服裝，頭頂與腳底對齊，腳掌完整不出框。接近正交的70mm感，避免廣角誇張；中性背景、均勻柔光、放鬆站姿，武器若原本存在則放於原側，不添加新裝備。三區保留相同身高、臉部比例、髮束、衣領、扣件與配色。沒有姓名欄、尺寸數字或介面框；這是身份參考表，不是三人同框的劇情畫面。",
      "Character design: {{character}}. Reference roles: {{references}}. World rules: {{world}}. Palette and treatment: {{palette}}. Delivery format: {{format}}.\nMake one orderly three-panel design sheet: front full body on the left, three-quarter full body in the centre, back full body on the right. All views show one person in the same costume, with tops of heads and soles aligned and complete feet inside the frame. Use near-orthographic 70mm-like perspective, a neutral background, even soft light and relaxed stance. Existing equipment stays on its original side; invent no new gear. Keep height, face proportions, hair groups, collar, fastenings and colours consistent. No name box, dimension numbers or UI frame. This is an identity reference sheet, not a scene with three people.",
      "キャラクター設定：{{character}}。参考用途：{{references}}。世界のルール：{{world}}。色と表現：{{palette}}。納品比率：{{format}}。\n一枚を三領域に整える。左に正面全身、中央に斜め全身、右に背面全身。同一人物・同一衣装で、頭頂と足裏の高さを揃え、足先まで収める。正投影に近い70mm相当、広角誇張を避け、中性背景、均一な柔光、自然な立ち姿。元からある装備は元の側に保ち、新装備を足さない。身長、顔比率、髪束、襟、留め具、配色を統一。名前欄、寸法数字、UI枠は不要。三人の劇情場面ではなく、同一性確認用の設定表。"),
    constraints: [characterContinuity, noTypesetting],
  },
  {
    id: "game-environment-keyframe", category: "games", mediaType: "image",
    title: text("關卡概念圖", "Level concept art", "ステージコンセプト"),
    summary: text("用主通道、地標與深度建立可讀的關卡概念畫面。", "Make a level readable through a main route, landmark and depth.", "主動線、ランドマーク、奥行きで読めるステージへ。"),
    deliverable: text("1 張無 UI 遊戲環境關鍵畫面", "One game-environment keyframe without UI", "UIなしのゲーム環境キーフレーム1枚"),
    fieldKeys: ["world", "references", "setting", "focalPoint", "format"], workflow: STILL_WORKFLOW,
    promptTemplate: text(
      "世界規則 {{world}}。參考分工 {{references}}。場景與光 {{setting}}。核心地標 {{focalPoint}}。畫幅 {{format}}。\n24mm感環境全景，相機在行進者視高，前景交代入口材質，中景保留一條明確可走的主路，遠景以唯一主要地標吸引目光。路線寬窄與地面落差有合理尺度；建築門窗沿同一結構邏輯，不以密集裝飾蓋住路徑。前、中、後景明暗分層，主路的閱讀性高於特效。沒有HUD、任務標記、地圖、字幕或假遊戲截圖邊框；不憑空加入角色或跨出指定科技／魔法規則。",
      "World rules: {{world}}. Reference roles: {{references}}. Scene and light: {{setting}}. Main landmark: {{focalPoint}}. Format: {{format}}.\nA 24mm-like environmental wide shot at a traveller's eye height. Establish entry materials in the foreground, one clearly walkable route in the middle ground and a single principal landmark in the distance. Route width and level changes follow credible scale. Doors and windows follow one structural logic; decoration must not obscure navigation. Separate foreground, middle ground and distance through light values, keeping the route more legible than any effect. No HUD, quest marker, map, caption or fake game-screenshot frame. Add no unrequested character or technology or magic outside the given rules.",
      "世界のルール：{{world}}。参考の役割：{{references}}。場面と光：{{setting}}。中心のランドマーク：{{focalPoint}}。比率：{{format}}。\n24mm相当、進む人の目の高さからの環境全景。手前に入口の素材、中景に一つの明確に歩ける主道、遠景に目を引く主要ランドマークを一つ置く。道幅と高低差は自然な尺度にし、扉や窓は同じ構造のルールで設計。装飾で道を隠さない。前・中・後景の明暗を分け、効果より主道の読みやすさを優先。HUD、クエスト印、地図、字幕、偽スクリーンショット枠は不要。未指定の人物や、ルール外の技術・魔法を足さない。"),
    constraints: [noTypesetting, text("這是視覺前製圖，不把看似可走的畫面當成可玩的關卡、碰撞模型或引擎資產。", "This is visual pre-production, not a playable level, collision model or engine-ready asset.", "これはビジュアル前工程用。プレイ可能なステージ、コリジョン、エンジン用資産を生成したとは扱わない。")],
  },
  {
    id: "game-action-beat", category: "games", mediaType: "video",
    title: text("戰鬥動作鏡頭", "Combat action beat", "バトルアクション"),
    summary: text("把技能演出拆成可讀的動作節點，不用特效掩蓋身體。", "Make a skill readable through motion beats, with effects that never hide the body.", "身体を隠す効果に頼らず、動作の節で技を伝える。"),
    deliverable: text("1 張首幀＋1 段約 6–8 秒動作概念短鏡", "One first frame and one action concept shot of about 6–8 seconds", "開始画1枚＋約6〜8秒のアクション概念カット"),
    fieldKeys: ["character", "references", "world", "action", "setting", "format"], workflow: MOTION_WORKFLOW,
    promptTemplate: text(
      "角色 {{character}}，身份參考用途 {{references}}；世界規則 {{world}}。場景 {{setting}}。主要動作 {{action}}。用途 {{format}}。\n35mm感全身三分之四側面，相機固定在動作軸線同一側，頭腳都在畫面中，角色不看鏡頭。從動作開始前的姿勢起始。約6–8秒演出：前1–2秒重心下沉、目標方向明確；中段只做一次指定主要動作，肢體先行，特效稍後跟隨；末段保留重心轉移與衣物回落，再穩住約1秒。攻擊若需要對象，使用無生命的訓練柱或抽象目標，不新增敵人。特效避開臉、手、關節與接觸點，不突然切換服裝、武器或地面。",
      "Character: {{character}}. Identity reference roles: {{references}}. World rules: {{world}}. Setting: {{setting}}. Principal action: {{action}}. Use: {{format}}.\nA 35mm-like full-body three-quarter side view; keep the camera on one side of the action axis and retain head and feet. The character looks at the target, not the lens. Begin in the pose before the action starts. Over about 6–8 seconds: 1–2 seconds of lowered weight and clear intention; one principal action in the middle, with limbs leading and effects following; then visible weight recovery, settling fabric and about one second of stable finish. If a target is required, use an inanimate training post or abstract target, not an invented opponent. Keep effects away from face, hands, joints and contact point. No costume, equipment or ground change.",
      "キャラクター：{{character}}。同一性参考の用途：{{references}}。世界のルール：{{world}}。場面：{{setting}}。主動作：{{action}}。用途：{{format}}。\n35mm相当、全身を入れた斜め側面。カメラは動作軸の同じ側に固定し、頭と足を収める。視線は目標へ向け、レンズを見ない。動作前の姿勢から開始。約6〜8秒で、最初1〜2秒は重心を下げて方向を示し、中盤に指定の主動作を一度だけ行う。身体が先、効果は後から追う。終盤は体重移動と衣服の戻りを見せ、約1秒安定させる。対象が必要なら無生物の訓練柱または抽象目標とし、敵を創作しない。顔、手、関節、接触点を効果で隠さず、衣装、装備、地面を変えない。"),
    constraints: [characterContinuity, noTypesetting, visualOnly],
  },
  {
    id: "game-ambient-loop", category: "games", mediaType: "video",
    title: text("場景循環動畫", "Ambient world loop", "背景ループ動画"),
    summary: text("讓微小環境動態留住氣氛，為選單背景或展示頁準備短循環。", "Use small environmental motion for a menu background or showcase loop.", "小さな環境の動きで、メニューや展示背景の空気を保つ。"),
    deliverable: text("1 張首幀＋約 6 秒環境短鏡；循環接點另行檢查", "One first frame and about 6 seconds of ambience; verify the loop seam separately", "開始画1枚＋約6秒の環境カット。ループ継ぎ目は別途確認"),
    fieldKeys: ["world", "references", "setting", "palette", "format", "safeArea"], workflow: MOTION_WORKFLOW,
    promptTemplate: text(
      "世界 {{world}}。場景參考用途 {{references}}。空間與光 {{setting}}。色彩 {{palette}}。用途 {{format}}。\n24mm感固定全景，畫面沒有角色，建築、地形、地平線與光源位置完全穩定。約6秒只安排兩個低幅度動態：一小片布料或枝葉隨風擺動、遠處淡霧緩慢流過；依場景挑合理元素，不憑空加瀑布或粒子風暴。風的強度與方向前後一致，沒有物件進出鏡頭。開頭和結尾盡量回到相近的布料／枝葉位置與亮度，方便後製選接點；不宣稱必然無縫。{{safeArea}} 維持平靜低細節，不生成UI。",
      "World: {{world}}. Scene-reference roles: {{references}}. Place and light: {{setting}}. Palette: {{palette}}. Use: {{format}}.\nA locked 24mm-like wide shot with no character. Architecture, terrain, horizon and light-source positions stay fixed. Over about 6 seconds, use only two low-amplitude motions: a small piece of fabric or foliage moving in wind, and faint distant mist passing slowly. Choose elements that belong to the setting, not a new waterfall or particle storm. Keep wind direction and intensity steady, with nothing entering or leaving frame. Aim for similar fabric or foliage position and brightness at both ends so an editor can select a seam; do not assume a seamless loop. Keep {{safeArea}} quiet and low-detail. No UI.",
      "世界：{{world}}。場面参考の用途：{{references}}。空間と光：{{setting}}。色：{{palette}}。用途：{{format}}。\n24mm相当の固定全景で人物は出さない。建築、地形、地平線、光源位置を完全に維持。約6秒の動きは小さく二つだけ。布または枝葉の揺れと、遠くを流れる薄い霧。場面に存在できる要素を選び、滝や粒子の嵐を新設しない。風向きと強さを保ち、物を出入りさせない。始点と終点で布・枝葉の位置と明るさを近づけ、編集で接続点を選べるようにする。完全なシームレスは保証しない。{{safeArea}} を低密度で静かに保ち、UIを描かない。"),
    constraints: [noTypesetting, visualOnly],
  },
  {
    id: "art-material-motion", category: "art", mediaType: "video",
    title: text("材質實驗短片", "Material in motion", "素材の映像実験"),
    summary: text("用材質變化與光的關係表達品牌性格，避免制式粒子片頭。", "Express character through material and light rather than a stock particle intro.", "定型の粒子イントロではなく、素材と光で個性を伝える。"),
    deliverable: text("1 張材質首幀＋1 段約 8 秒藝術短鏡", "One material first frame and one art shot of about 8 seconds", "素材の開始画1枚＋約8秒のアートカット"),
    fieldKeys: ["material", "focalPoint", "references", "palette", "format", "safeArea"], workflow: MOTION_WORKFLOW,
    promptTemplate: text(
      "藝術短鏡，交付 {{format}}。材質 {{material}}。可見主命題 {{focalPoint}}。參考只用於 {{references}}。色彩情緒 {{palette}}。\n從材質邊緣的85mm感近景開始，讓厚度、透光或表面顆粒先被看見。約8秒中只讓一個物件完成一次彎折、展開或位移，選擇符合該材質的動作，不要求同時熔化、爆散又復原。相機緩慢後移，末段才看見完整形體與它在空間中的影子，保留最後1.5秒。材料受到力、重力與光的影響有因果關係，不變成品牌標誌、文字或無由來的發光能量。{{safeArea}} 留空，形體本身就是敘事。",
      "Art shot for {{format}}. Material: {{material}}. Visible proposition: {{focalPoint}}. References are used only for {{references}}. Palette and mood: {{palette}}.\nBegin with an 85mm-like close view of a material edge so thickness, translucency or grain is readable first. In about 8 seconds, one object completes one bend, unfolding or displacement appropriate to that material; do not ask it to melt, explode and re-form at once. The camera slowly retreats, revealing the full form and its shadow only toward the end, then holds for 1.5 seconds. Force, gravity and light produce understandable consequences. The form never becomes a logo, lettering or unexplained glowing energy. Keep {{safeArea}} clear. The material itself carries the story.",
      "{{format}} 用のアートカット。素材：{{material}}。目に見える発想：{{focalPoint}}。参考は {{references}} の用途だけに使う。色と空気感：{{palette}}。\n85mm相当の素材の縁の近景から、厚み、透光、粒子感を先に見せる。約8秒で一つの物が一度だけ曲がる、開く、または移動する。素材に合う動きを選び、溶解、爆散、復元を同時に求めない。カメラをゆっくり後退させ、終盤で全形と空間の影を見せ、最後1.5秒保持。力、重力、光に因果関係を持たせる。ロゴ、文字、理由のない発光エネルギーに変形しない。{{safeArea}} を空け、素材自体に語らせる。"),
    constraints: [noTypesetting, visualOnly],
  },
  {
    id: "art-editorial-cover", category: "art", mediaType: "image",
    title: text("品牌編輯視覺", "Editorial brand image", "ブランドの編集ビジュアル"),
    summary: text("以物件、空間和色彩建立刊物般的品牌畫面，文字留給設計。", "Build an editorial image through object, space and colour; leave typography to design.", "物、空間、色で編集的な一枚をつくり、文字はデザイン工程へ。"),
    deliverable: text("1 張可供後製排字的封面主視覺", "One cover key visual with space for typography in post", "後工程で組版できるカバービジュアル1枚"),
    fieldKeys: ["focalPoint", "references", "material", "palette", "format", "safeArea"], workflow: STILL_WORKFLOW,
    promptTemplate: text(
      "封面主視覺，畫幅用途 {{format}}。主命題 {{focalPoint}}。參考分工 {{references}}。材質 {{material}}。色彩 {{palette}}。\n創作單幅、有清晰重心的靜物或空間作品。50mm感，讓一個主要形體偏離正中央，與它的影子形成可閱讀的關係；只保留必要的次要物件，不用對稱裝飾填滿空白。材料近處可見，遠處有空氣感，邊緣與接觸點精準。{{safeArea}} 保持乾淨、明暗穩定，主體與陰影都不侵入，便於之後排標題。畫面本身沒有任何文字、雜誌刊頭、條碼、假出版資訊或框線，不交付拿在手上的雜誌樣機。",
      "Cover key visual for {{format}}. Proposition: {{focalPoint}}. Reference roles: {{references}}. Material: {{material}}. Palette: {{palette}}.\nCreate one still-life or spatial artwork with a clear centre of attention. Use a 50mm-like perspective and place one principal form off-centre, in a legible relationship with its shadow. Keep only necessary secondary objects; do not fill the space with symmetrical decoration. Make nearby material readable, the distance atmospheric, and edges and contact points precise. Keep {{safeArea}} clean and tonally stable, with neither subject nor shadow entering it, for typesetting later. Generate no lettering, masthead, barcode, invented publication information or border. This is the image itself, not a magazine mock-up held in a hand.",
      "{{format}} 用のカバービジュアル。発想：{{focalPoint}}。参考用途：{{references}}。素材：{{material}}。色：{{palette}}。\n重心の明確な静物または空間作品を一枚制作。50mm相当で主な形を中心から外し、その影との関係を読み取れるようにする。副次的な物は必要最小限とし、対称的装飾で余白を埋めない。手前の素材を見せ、奥には空気感を置き、縁と接触点を精密にする。{{safeArea}} は明暗を安定させ、物も影も入れず後の組版に備える。文字、刊行物名、バーコード、架空の出版情報、枠線は描かない。手に持った雑誌モックアップではなく画像そのものを納品。"),
    constraints: [noTypesetting],
  },
  {
    id: "art-three-materials", category: "art", mediaType: "image",
    title: text("跨媒材畫面", "Mixed-media study", "異素材のビジュアル"),
    summary: text("固定構圖與身份，只讓媒材的語言改變，建立真正可比較的風格研究。", "Keep composition and identity fixed so material, not content, changes the reading.", "構図と同一性を固定し、素材表現だけを比較する。"),
    deliverable: text("1 張等寬三聯風格研究圖；另拆單幅時需獨立生成", "One equal-width triptych study; separate standalone images require separate generation", "等幅の三連表現研究画像1枚。単独画像化は別途生成"),
    fieldKeys: ["focalPoint", "references", "styles", "palette", "format"], workflow: STILL_WORKFLOW,
    promptTemplate: text(
      "風格研究，畫幅 {{format}}。固定場景命題 {{focalPoint}}。構圖與身份參考 {{references}}。三種媒材依序 {{styles}}。共用色彩基礎 {{palette}}。\n一張橫向三聯畫，三區等寬，各區重現同一機位、主體大小、站位與光源方向。只改媒材：第一區執行第一種技法，第二區第二種，第三區第三種，筆觸、邊緣和表面質感要能區別。不要以換角色、換場景或換姿態假裝換風格。三區內輪廓都完整，區與區之間僅留窄中性間距，沒有裝飾框、風格名稱或標籤。整體可直接比較同一畫面的三種解讀，不把參考資料上的文字排版帶進來。",
      "Style study in {{format}}. Fixed scene proposition: {{focalPoint}}. Composition and identity references: {{references}}. Three media in order: {{styles}}. Shared colour foundation: {{palette}}.\nOne horizontal triptych with three equal-width panels. Repeat the same viewpoint, subject size, placement and light direction in every panel. Change only the medium: execute the first technique on the left, second in the centre and third on the right, with clearly distinct mark-making, edges and surface treatment. Do not substitute a different character, location or pose for a style change. Keep the complete silhouette in each panel, separated only by narrow neutral spacing. No decorative frames, style names or labels. Make three readings of the same scene directly comparable and exclude typesetting from reference sheets.",
      "{{format}} の表現研究。固定する場面の発想：{{focalPoint}}。構図・同一性の参考：{{references}}。左から使う三つの素材：{{styles}}。共通の色の基準：{{palette}}。\n横長の一枚を等幅の三領域にし、同じ視点、主役の大きさ、配置、光向きを再現する。変えるのは素材だけ。左で第一の技法、中央で第二、右で第三を使い、筆致、縁、表面の違いを明確にする。人物、場所、ポーズの変更を作風変更の代わりにしない。各区で輪郭を収め、区切りは細い中性の余白のみ。装飾枠、作風名、ラベルは不要。同じ場面の三つの読みを比較できる画面にし、参考表の文字を持ち込まない。"),
    constraints: [noTypesetting, text("跨媒材的一致性是驗收目標，不是保證；逐區檢查身份、比例與構圖，偏離時先修正。", "Cross-medium consistency is an acceptance goal, not a guarantee. Check identity, proportions and composition panel by panel.", "媒体間の一致は検収目標で、保証ではありません。各区の同一性、比率、構図を確認し、ずれを修正。")],
  },
  {
    id: "art-installation-film", category: "art", mediaType: "video",
    title: text("裝置藝術鏡頭", "Installation study", "インスタレーションの映像"),
    summary: text("讓前景遮擋、尺度揭示與光的改變，形成一段展覽般的觀看。", "Use occlusion, scale and a change of light to create an exhibition-like encounter.", "遮り、スケール、光の変化で、展示を見るような体験を。"),
    deliverable: text("1 張首幀＋1 段約 8–10 秒裝置藝術短鏡", "One first frame and one installation shot of about 8–10 seconds", "開始画1枚＋約8〜10秒のインスタレーションカット"),
    fieldKeys: ["focalPoint", "references", "material", "setting", "palette", "format"], workflow: MOTION_WORKFLOW,
    promptTemplate: text(
      "原創裝置藝術短鏡，用途 {{format}}。作品命題 {{focalPoint}}。參考用途 {{references}}。材料 {{material}}。展場 {{setting}}。色彩 {{palette}}。\n相機35mm感，先以一個真實屬於作品的前景邊緣局部遮擋視野；約8–10秒沿地面平穩側移，逐步露出作品完整尺度，不穿過實體、不突然飛越空間。相機停下後，一道展場光只改變照射角度，讓原來隱約的表面關係清楚，作品幾何本身不變。最後保留2秒觀察；牆、地面、接觸陰影固定，沒有擅自加入觀眾、銘牌或品牌標誌。轉折由觀看位置與光產生，不用粒子爆散、憑空變形或巨型文字。",
      "Original installation shot for {{format}}. Proposition: {{focalPoint}}. Reference roles: {{references}}. Material: {{material}}. Gallery space: {{setting}}. Palette: {{palette}}.\nA 35mm-like camera begins partially occluded by a foreground edge that truly belongs to the work. Over about 8–10 seconds, track smoothly along the floor to reveal the installation's full scale; never pass through solid matter or suddenly fly across the room. Once the camera stops, one gallery light changes its angle to clarify an existing surface relationship. The sculpture's geometry never changes. Hold the final two seconds for looking. Keep walls, floor and contact shadows consistent; add no audience, plaque or brand mark. The turn comes from viewpoint and light, not particle explosions, arbitrary morphing or giant type.",
      "{{format}} 用のオリジナル・インスタレーション映像。発想：{{focalPoint}}。参考用途：{{references}}。素材：{{material}}。展示空間：{{setting}}。色：{{palette}}。\n35mm相当で、作品の実際の縁を前景にして一部を遮った状態から始める。約8〜10秒、床に沿って安定して横移動し、全体のスケールを少しずつ明かす。実体を通過せず、急に空間を飛び越えない。カメラ停止後、展示照明を一つだけ角度変更し、既存の表面関係を明瞭にする。作品の形自体は変えない。最後2秒は観察の時間。壁、床、接触影を維持し、観客、銘板、ブランド印を勝手に加えない。転換は視点と光から生み、粒子爆発、理由のない変形、巨大文字を使わない。"),
    constraints: [noTypesetting, visualOnly],
  },
];

const PRODUCTION_NOTE = text(
  "這是可編輯的原創製作簡報，尚未替你的商品或角色生成驗證。參考檔案須自行選擇；圖片、影片、剪輯與文字後製是不同步驟。時間與鏡位描述不等於模型參數。預覽、填表與複製提示詞不會自動生成或花費點數。",
  "This is an editable original production brief, not a generation verified against your product or character. Attach references explicitly. Image generation, video generation, editing and typography are separate steps. Timing and lens prose are not API settings. Previewing, completing the form and copying a prompt do not automatically generate or spend credits.",
  "編集可能なオリジナル制作メモです。あなたの商品・人物での生成検証済み作例ではありません。参考ファイルは明示的に選択し、画像、動画、編集、文字入れを別工程で扱います。秒数・画角の文章はAPI設定ではありません。閲覧、入力、コピーだけで生成・ポイント消費は始まりません。",
);
const constraintHeading = text("製作約束", "Production constraints", "制作上の条件");
const localized = (value: LocalizedText, locale: Locale) => value[locale] ?? value["zh-Hant"];

/** Localized catalog content only. No credentials, fetches, billing or generation side effects. */
export function getLocalizedSkill(id: string, locale: Locale = "zh-Hant"): LocalizedIndustrySkill | undefined {
  const skill = INDUSTRY_SKILLS.find(item => item.id === id);
  if (!skill) return undefined;
  const category = INDUSTRY_CATEGORIES.find(item => item.id === skill.category)!;
  const fields = skill.fieldKeys.map(key => {
    const definition = BRIEF_FIELDS[key];
    return { key: definition.key, label: localized(definition.label, locale), placeholder: localized(definition.placeholder, locale), required: definition.required };
  });
  const constraints = skill.constraints.map(value => localized(value, locale));
  return {
    id: skill.id, category: skill.category, categoryTitle: localized(category.title, locale), mediaType: skill.mediaType,
    title: localized(skill.title, locale), summary: localized(skill.summary, locale), deliverable: localized(skill.deliverable, locale),
    fields, briefFields: fields, constraints,
    promptTemplate: `${localized(skill.promptTemplate, locale)}\n\n${localized(constraintHeading, locale)}\n${constraints.map(value => `• ${value}`).join("\n")}`,
    workflow: skill.workflow.map(step => ({ id: step.id, kind: step.kind, title: localized(step.title, locale), description: localized(step.description, locale) })),
    productionNote: localized(PRODUCTION_NOTE, locale),
  };
}

export interface BuiltIndustryPrompt { prompt: string; missingFields: string[]; isComplete: boolean }
/** Missing fields remain explicit {{key}} tokens. Values are plain prose, never executable templates. */
export function buildIndustryPrompt(id: string, values: Readonly<Record<string, string | undefined>>, locale: Locale = "zh-Hant"): BuiltIndustryPrompt {
  const skill = getLocalizedSkill(id, locale);
  if (!skill) throw new RangeError(localized(text("找不到這份創作簡報。", "This production brief was not found.", "この制作メモが見つかりません。"), locale));
  const validValues = new Map(skill.fields.map(field => [field.key, Object.prototype.hasOwnProperty.call(values, field.key) && typeof values[field.key] === "string" ? values[field.key]!.trim() : ""]));
  const missingFields = skill.fields.filter(field => field.required && !validValues.get(field.key)).map(field => field.key);
  const prompt = skill.promptTemplate.replace(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g, (token, key: string) => validValues.get(key) || token);
  return { prompt, missingFields, isComplete: missingFields.length === 0 };
}
