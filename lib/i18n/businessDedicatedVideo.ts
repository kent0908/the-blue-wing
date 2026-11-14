import type { Locale } from "./locale";
import { simplifyChinese } from "./simplifyChinese";

const zh = {
  personalLibrary: "我的素材庫", personalSource: "個人素材", businessSource: "商務素材", searchPersonal: "搜尋圖片名稱",
  libraryFilter: "素材類型", libraryAll: "全部", libraryImages: "圖片", libraryVideos: "影片", searchMedia: "搜尋圖片或影片名稱",
  noVideos: "目前沒有可用的 MP4／MOV。可以從下方上傳影片或動態 GIF。", noMedia: "找不到符合的素材。", libraryPartial: "部分素材暫時無法讀取，請重新讀取。",
  personalMixedSwitch: "選取素材後會切換至圖片／影片參照。", videoCapacity: "已達影片參照上限。",
  personalLoading: "正在讀取我的素材庫…", personalUnavailable: "目前無法讀取我的素材庫。", refreshPersonal: "重新讀取素材",
  personalEmpty: "我的素材庫目前沒有可用的圖片。", personalNoResults: "找不到符合的圖片。", managePersonal: "管理我的素材庫",
  personalSwitchMode: "選擇圖片後會切換至圖片參照。", referenceCapacity: "已達此模式的圖片上限。", personalTooLarge: "檔案超過大小上限",
  imageOrder: "圖片順序", openingFrame: "首幀", closingFrame: "尾幀", referenceNumber: "圖片 {index}",
  moveEarlier: "將 {name} 向前移", moveLater: "將 {name} 向後移", removeImage: "移除 {name}",
  durationAuto: "自動", durationSeconds: "{value} 秒", automaticAspect: "依素材",
  wanMixedMode: "圖片／影片參照", wanVideoCount: "影片 {count}／{max} 段", wanVideoRules: "最多 5 段 MP4／MOV，參照合計 15 秒。參照和輸出合計最多 30 秒。GIF 上傳時會轉成 MP4。",
  wan3ImageRules: "請使用 JPEG、無透明區域的 PNG 或 WebP。每邊 240–6,000 px，長短邊比不超過 8:1，每張最多 20 MB。", wan3ReferenceInfo: "在提示詞輸入 @，或直接用 Image 1、Video 1 指定素材。圖片與影片分開編號。", wan3Seed: "可填 0 至 2,147,483,647 的整數，0 代表隨機。", wan3PromptLimit: "Wan 3.0 的提示詞上限為 2,000 字元。",
  title: "鏡頭設定", mode: "創作方式", textToVideo: "文字成片", imageToVideo: "首幀成片", firstLastFrame: "首尾幀", subjectReference: "圖片參照",
  textInfo: "以文字描述場景、動作與鏡頭，不帶入參考圖片。", imageInfo: "選擇一張圖片作為首幀，再描述接下來的動作。", framesInfo: "依序選擇兩張圖片：第一張是首幀，第二張是尾幀。", referenceInfo: "圖片會依選擇順序帶入作品，請在描述中清楚交代每張素材的用途。",
  happyReferenceInfo: "可用 [Image 1]、[Image 2] 等標記，對應依序選擇的圖片。", sourceAspect: "依首幀比例", sourceRatio: "輸出畫幅由首幀決定，請先將圖片裁成想要的比例。", selected: "已選 {count}／{max} 張", referenceLimit: "目前選擇的圖片超過這個創作方式的上限，請調整後再送出。", openAssets: "選擇／上傳商務素材", assetsNote: "使用商務平台上傳的原始圖片，直接在這裡選擇，不需要離開工作室。", happyRules: "圖片使用 JPEG、PNG 或 WebP，短邊至少 400 px，每張最多 20 MB。",
  advanced: "更多設定", watermark: "保留生成內容浮水印", watermarkInfo: "關閉時，請求會明確設定不加上模型的浮水印。", seed: "隨機種子（選填）", seedPlaceholder: "留空由模型決定", seedWan: "可填 -1 至 2,147,483,647 的整數；相同種子不保證產出完全相同。", seedHappy: "可填 0 至 2,147,483,647 的整數；相同種子不保證產出完全相同。", promptExtend: "讓模型潤飾提示詞", promptExtendInfo: "開啟後，模型會先改寫描述再生成；關閉則保留你原本的敘述。", negative: "避免出現的內容（選填）", negativePlaceholder: "例如：模糊畫面、畫面抖動、不自然的手部", negativeCount: "{count}／4,000 字", providerDocs: "查看模型參數文件",
};
export type BusinessDedicatedVideoCopy = { [K in keyof typeof zh]: string };
const en: BusinessDedicatedVideoCopy = {
  personalLibrary: "My assets", personalSource: "Personal asset", businessSource: "Business asset", searchPersonal: "Search image names",
  libraryFilter: "Asset type", libraryAll: "All", libraryImages: "Images", libraryVideos: "Videos", searchMedia: "Search image or video names",
  noVideos: "No MP4 or MOV files yet. Upload a video or animated GIF below.", noMedia: "No matching assets.", libraryPartial: "Some assets could not be loaded. Reload to try again.",
  personalMixedSwitch: "Choosing an asset switches to Image / video references.", videoCapacity: "The video reference limit has been reached.",
  personalLoading: "Loading your assets…", personalUnavailable: "Your assets could not be loaded.", refreshPersonal: "Reload assets",
  personalEmpty: "Your library has no eligible images.", personalNoResults: "No images match your search.", managePersonal: "Manage my assets",
  personalSwitchMode: "Choosing an image switches to Image references.", referenceCapacity: "This mode's image limit has been reached.", personalTooLarge: "File exceeds the size limit",
  imageOrder: "Image order", openingFrame: "First frame", closingFrame: "Last frame", referenceNumber: "Image {index}",
  moveEarlier: "Move {name} earlier", moveLater: "Move {name} later", removeImage: "Remove {name}",
  durationAuto: "Auto", durationSeconds: "{value} s", automaticAspect: "Auto",
  wanMixedMode: "Image / video references", wanVideoCount: "{count} / {max} videos", wanVideoRules: "Up to 5 MP4/MOV clips and 15 seconds of video references. References plus output may total up to 30 seconds. GIFs convert to MP4 on upload.",
  wan3ImageRules: "Use JPEG, non-transparent PNG or WebP. Each side must be 240–6,000 px, the aspect ratio at most 8:1, and each file at most 20 MB.", wan3ReferenceInfo: "Type @ to pick a reference, or use Image 1 and Video 1 in the prompt. Images and videos are numbered separately.", wan3Seed: "Enter an integer from 0 to 2,147,483,647. Zero means random.", wan3PromptLimit: "Wan 3.0 prompts are limited to 2,000 characters.",
  title: "Shot settings", mode: "Creation mode", textToVideo: "Text to video", imageToVideo: "First frame", firstLastFrame: "First & last frames", subjectReference: "Image references",
  textInfo: "Describe the scene, action and camera in words, without reference images.", imageInfo: "Choose one opening frame, then describe what happens next.", framesInfo: "Choose two images in order: the first is the opening frame and the second is the closing frame.", referenceInfo: "Images follow your selection order. Describe the purpose of each reference clearly.",
  happyReferenceInfo: "Use [Image 1], [Image 2] and similar labels to address images in selection order.", sourceAspect: "From opening frame", sourceRatio: "The opening frame determines the output shape. Crop it to your preferred ratio first.", selected: "{count} / {max} images selected", referenceLimit: "Too many images are selected for this mode. Adjust the selection before submitting.", openAssets: "Choose / upload business assets", assetsNote: "Choose original images uploaded to the business platform without leaving your studio.", happyRules: "Use JPEG, PNG or WebP images, at least 400 px on the shorter side and no larger than 20 MB each.",
  advanced: "More settings", watermark: "Keep the generated-content watermark", watermarkInfo: "When off, the request explicitly asks the model to omit its watermark.", seed: "Random seed (optional)", seedPlaceholder: "Leave blank for a random seed", seedWan: "Use an integer from -1 to 2,147,483,647. A matching seed does not guarantee identical results.", seedHappy: "Use an integer from 0 to 2,147,483,647. A matching seed does not guarantee identical results.", promptExtend: "Let the model refine the prompt", promptExtendInfo: "When on, the model rewrites your description before generation. Leave off to keep your own wording.", negative: "Content to avoid (optional)", negativePlaceholder: "For example: blurry frames, camera shake, unnatural hands", negativeCount: "{count} / 4,000 characters", providerDocs: "View model parameter documentation",
};
const ja: BusinessDedicatedVideoCopy = {
  personalLibrary: "マイ素材庫", personalSource: "個人素材", businessSource: "ビジネス素材", searchPersonal: "画像名で検索",
  libraryFilter: "素材の種類", libraryAll: "すべて", libraryImages: "画像", libraryVideos: "動画", searchMedia: "画像・動画の名前で検索",
  noVideos: "使用できるMP4・MOVがありません。下から動画またはアニメーションGIFをアップロードできます。", noMedia: "一致する素材がありません。", libraryPartial: "一部の素材を読み込めませんでした。再読み込みしてください。",
  personalMixedSwitch: "素材を選ぶと画像／動画参照に切り替わります。", videoCapacity: "参照動画の上限に達しました。",
  personalLoading: "マイ素材庫を読み込み中…", personalUnavailable: "マイ素材庫を読み込めませんでした。", refreshPersonal: "素材を再読み込み",
  personalEmpty: "マイ素材庫に利用できる画像がありません。", personalNoResults: "一致する画像がありません。", managePersonal: "マイ素材庫を管理",
  personalSwitchMode: "画像を選ぶと参考画像モードに切り替わります。", referenceCapacity: "このモードの画像数の上限に達しました。", personalTooLarge: "ファイルサイズの上限を超えています",
  imageOrder: "画像の順序", openingFrame: "開始フレーム", closingFrame: "終了フレーム", referenceNumber: "画像 {index}",
  moveEarlier: "{name} を前へ", moveLater: "{name} を後ろへ", removeImage: "{name} を外す",
  durationAuto: "自動", durationSeconds: "{value} 秒", automaticAspect: "自動",
  wanMixedMode: "画像／動画参照", wanVideoCount: "動画 {count}／{max} 本", wanVideoRules: "MP4／MOV は最大5本、参照動画は合計15秒まで。参照と出力の合計は30秒までです。GIF はアップロード時に MP4 に変換します。",
  wan3ImageRules: "JPEG・透過なしのPNG・WebPを使用してください。各辺240〜6,000 px、縦横比は長辺と短辺で最大8:1、1枚20 MB以下です。", wan3ReferenceInfo: "@ から素材を選ぶか、Image 1・Video 1 で指定します。画像と動画は別々に番号が付きます。", wan3Seed: "0〜2,147,483,647 の整数を入力できます。0 はランダムです。", wan3PromptLimit: "Wan 3.0 のプロンプトは2,000文字までです。",
  title: "ショット設定", mode: "制作方法", textToVideo: "テキストから映像", imageToVideo: "開始フレーム", firstLastFrame: "開始・終了フレーム", subjectReference: "参考画像",
  textInfo: "参考画像を使わず、場面・動作・カメラを文章で指定します。", imageInfo: "開始フレームとなる画像を1枚選び、その後の動きを記述します。", framesInfo: "画像を2枚、順番に選択します。1枚目が開始、2枚目が終了フレームです。", referenceInfo: "画像は選択順に読み込まれます。それぞれの素材の役割を文章で明確に指定してください。",
  happyReferenceInfo: "[Image 1]、[Image 2] などの表記で、選択順の画像を指定できます。", sourceAspect: "開始フレームに合わせる", sourceRatio: "出力の画角は開始フレームで決まります。先に希望の比率に切り抜いてください。", selected: "画像 {count}／{max} 枚を選択中", referenceLimit: "この制作方法で使用できる画像数を超えています。選択を調整してから送信してください。", openAssets: "商務素材を選択・アップロード", assetsNote: "商務プラットフォームにアップロードした元画像を、このスタジオ内で選択できます。", happyRules: "JPEG・PNG・WebP、短辺400 px以上、1枚20 MB以下の画像を使用してください。",
  advanced: "詳細設定", watermark: "生成コンテンツの透かしを残す", watermarkInfo: "オフにすると、モデルの透かしを付けないよう明示的に指定します。", seed: "ランダムシード（任意）", seedPlaceholder: "空欄の場合はモデルが決定", seedWan: "-1〜2,147,483,647 の整数を指定できます。同じシードでも出力が同一になる保証はありません。", seedHappy: "0〜2,147,483,647 の整数を指定できます。同じシードでも出力が同一になる保証はありません。", promptExtend: "モデルによるプロンプトの調整", promptExtendInfo: "オンにすると生成前に説明文が書き換えられます。自分の文章をそのまま使用する場合はオフにしてください。", negative: "避けたい内容（任意）", negativePlaceholder: "例：ぼやけた映像、手ぶれ、不自然な手", negativeCount: "{count}／4,000文字", providerDocs: "モデルのパラメータ資料を見る",
};
const COPY: Record<Locale, BusinessDedicatedVideoCopy> = { "zh-Hant": zh, "zh-Hans": simplifyChinese(zh), en, ja };
export function businessDedicatedVideoCopy(locale: Locale): BusinessDedicatedVideoCopy { return COPY[locale]; }
