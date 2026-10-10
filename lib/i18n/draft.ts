import type { Locale } from "./locale";

interface DraftCopy {
  metaTitle: string; metaDescription: string; home: string; feature: string;
  headlineFirst: string; headlineSecond: string; introduction: string; explore: string; create: string; history: string;
  filmTitle: string; filmDescription: string; play: string; pause: string; soundOn: string; soundOff: string;
  download: string; preparing: string; mediaError: string; retry: string; seek: string;
  comparisonTitle: string; comparisonDescription: string; compare: string; draft: string; final: string;
  divider: string; detail: string; fullFrame: string; original: string;
  composition: string; compositionText: string; motion: string; motionText: string; texture: string; textureText: string;
  processTitle: string; processIntro: string; stepOne: string; stepOneText: string; stepTwo: string; stepTwoText: string;
  stepThree: string; stepThreeText: string; rulesTitle: string; ruleResolution: string; ruleExpiry: string;
  ruleCredits: string; ruleAudio: string; finishTitle: string; finishText: string;
  homeTitle: string; homeDescription: string; homeCta: string; comparisonControls: string; filmControls: string;
}

/** A typed, complete three-language collection; no locale falls back to Chinese. */
export const DRAFT_COPY: Record<Locale, DraftCopy> = {
  "zh-Hant": {
    metaTitle: "Seedance 2.5 草稿到成片｜先找到鏡頭，再完成細節",
    metaDescription: "用 480p 草稿審看構圖、動作與節奏，再沿用同一草稿生成 1080p。觀看藍翼的原始畫面同步比較與電影展示。",
    home: "首頁", feature: "Seedance 2.5 · 草稿到成片",
    headlineFirst: "先找到鏡頭，", headlineSecond: "再完成細節。",
    introduction: "先用 480p 草稿審看構圖、動作與節奏，滿意後，再沿用草稿生成 1080p 成片。先找到故事的呼吸，再讓光影與細節完整呈現。",
    explore: "看見兩個版本", create: "開始我的草稿", history: "查看我的草稿",
    filmTitle: "未完成的光", filmDescription: "藍羽掠過版畫桌，紙拱層層展開，穿過劇場，抵達晨光裡的海。讓一次完整的創作，從草稿走向成片。",
    play: "播放影片", pause: "暫停影片", soundOn: "開啟聲音", soundOff: "關閉聲音", download: "下載展示影片",
    preparing: "影像準備中", mediaError: "影片暫時無法載入。你可以重新載入再觀看。", retry: "重新載入影片", seek: "影片播放位置",
    comparisonTitle: "同一個鏡頭，兩種完成度。", comparisonDescription: "拖動分界，或切換完整畫面。先看構圖與動作是否成立，再看光影、材質與遠景的細節。",
    compare: "同步比較", draft: "草稿 · 480p", final: "成片 · 1080p", divider: "草稿與成片的畫面分界", detail: "放大細節", fullFrame: "回到全景",
    original: "兩個版本來自同一草稿，使用相同剪接。保留各自原始畫面，未額外加入模糊或銳化效果。",
    composition: "構圖", compositionText: "在草稿裡，確認主體的位置、景深與鏡頭走向。",
    motion: "動作", motionText: "確認時機、節奏與鏡頭連接，再選擇值得完成的版本。",
    texture: "細節", textureText: "在成片裡，觀察光線邊緣、表面材質與遠處的層次。",
    processTitle: "把創作，留給選擇。", processIntro: "不用一次決定所有事。先審看，再選用，最後完成。",
    stepOne: "讓想法動起來", stepOneText: "用你的提示詞與參考素材，生成 480p 草稿。先審看構圖、角色動作與整段節奏。",
    stepTwo: "留下合適的鏡頭", stepTwoText: "在草稿紀錄中挑選版本。確認畫面與費用後，選擇生成 1080p 成片。",
    stepThree: "讓細節完整呈現", stepThreeText: "沿用原草稿的內容、時長、比例與聲音設定。完成後，可在創作紀錄中觀看與下載。",
    rulesTitle: "開始之前，先知道這些。", ruleResolution: "草稿為 480p；沿用草稿生成的成片為 1080p。",
    ruleExpiry: "草稿自建立起可沿用 7 天；到期後需要重新生成草稿。",
    ruleCredits: "草稿與成片分別扣點。成片不免費、不折抵草稿費用；提交前會顯示這次所需點數。",
    ruleAudio: "成片沿用草稿的提示詞、參考素材、時長、比例、種子與音訊設定；請在草稿階段確認。",
    finishTitle: "你的下一個鏡頭，從這裡開始。", finishText: "帶上一個想法，先讓它動起來。",
    homeTitle: "先找到鏡頭，再完成細節。", homeDescription: "先用 480p 草稿審看構圖、動作與節奏，滿意後再沿用草稿生成 1080p。讓值得留下的鏡頭，走向完整的畫面。", homeCta: "看見草稿與成片的差異",
    comparisonControls: "草稿與成片比較控制", filmControls: "展示影片播放控制",
  },
  en: {
    metaTitle: "Seedance 2.5 Draft to Final | Find the shot. Finish the detail.",
    metaDescription: "Review framing, motion and rhythm in a 480p draft, then create a 1080p final from that same draft. Explore Blue Wing’s synchronized original-footage comparison and cinematic showcase.",
    home: "Home", feature: "Seedance 2.5 · Draft to final",
    headlineFirst: "Find the shot.", headlineSecond: "Finish the detail.",
    introduction: "Review framing, motion and rhythm in a 480p draft. When it feels right, create a 1080p final from that draft. Find the story’s breathing room, then bring its light and detail into focus.",
    explore: "See both versions", create: "Start my draft", history: "My draft collection",
    filmTitle: "The Unfinished Light", filmDescription: "A blue feather leaves a printmaker’s desk, travels through unfolding paper arches and a vast theatre, then reaches the sea at sunrise. One complete creative journey, from draft to final.",
    play: "Play film", pause: "Pause film", soundOn: "Turn sound on", soundOff: "Turn sound off", download: "Download showcase film",
    preparing: "Film in preparation", mediaError: "The film could not load. Reload it to try again.", retry: "Reload film", seek: "Film playback position",
    comparisonTitle: "One shot. Two levels of detail.", comparisonDescription: "Move the divider or switch to a complete frame. Review composition and motion first, then examine light, texture and distant detail.",
    compare: "Synchronized comparison", draft: "Draft · 480p", final: "Final · 1080p", divider: "Divider between draft and final", detail: "Enlarge detail", fullFrame: "Full frame",
    original: "Both versions come from the same draft with the same edit. Their original frames are preserved, without added blur or sharpening.",
    composition: "Composition", compositionText: "Review the subject’s position, depth and camera path in the draft.",
    motion: "Motion", motionText: "Review timing, rhythm and continuity before choosing a version to finish.",
    texture: "Detail", textureText: "Examine light edges, surface textures and layers in the distance in the final.",
    processTitle: "Make room for choice.", processIntro: "You do not have to decide everything at once. Review, select, then finish.",
    stepOne: "Set an idea in motion", stepOneText: "Generate a 480p draft with your prompt and references. Review the framing, character movement and rhythm of the whole shot.",
    stepTwo: "Keep the right shot", stepTwoText: "Choose a version from your draft history. Review the image and cost, then create its 1080p final.",
    stepThree: "Complete the picture", stepThreeText: "The final inherits the draft’s content, duration, aspect ratio and audio settings. Watch and download it from your creation history.",
    rulesTitle: "A few details before you begin.", ruleResolution: "Drafts are 480p. Finals created from drafts are 1080p.",
    ruleExpiry: "Drafts can be reused for 7 days after creation. After expiry, generate a new draft.",
    ruleCredits: "Draft and final are charged separately. The final is neither free nor credited against the draft cost. The required points are shown before submission.",
    ruleAudio: "Finals inherit the draft’s prompt, references, duration, aspect ratio, seed and audio settings. Confirm these during the draft stage.",
    finishTitle: "Your next shot begins here.", finishText: "Bring an idea. See it move.",
    homeTitle: "Find the shot. Finish the detail.", homeDescription: "Review framing, motion and rhythm in a 480p draft, then create a 1080p final from the draft you choose. Give the shot worth keeping a finished frame.", homeCta: "Discover the difference",
    comparisonControls: "Draft and final comparison controls", filmControls: "Showcase film playback controls",
  },
  ja: {
    metaTitle: "Seedance 2.5 草稿から完成映像へ｜構図を見つけ、細部を仕上げる",
    metaDescription: "480p の草稿で構図・動き・リズムを確認し、同じ草稿から 1080p の完成映像を生成。藍翼の同期比較とシネマティックな展示映像をご覧ください。",
    home: "ホーム", feature: "Seedance 2.5 · 草稿から完成映像へ",
    headlineFirst: "構図を見つけ、", headlineSecond: "細部を仕上げる。",
    introduction: "480p の草稿で構図・動き・リズムを確認し、納得できたら、その草稿から 1080p の完成映像を生成。物語の呼吸を見つけてから、光と細部まで仕上げていく。",
    explore: "二つの映像を見る", create: "草稿をつくる", history: "自分の草稿を見る",
    filmTitle: "未完成の光", filmDescription: "版画家の机から舞い上がる青い羽根。紙のアーチが開き、広大な劇場を抜けて、朝日の海へ。一つの創作の旅が、草稿から完成映像へと進みます。",
    play: "映像を再生", pause: "映像を一時停止", soundOn: "音声をオンにする", soundOff: "音声をオフにする", download: "展示映像をダウンロード",
    preparing: "映像を準備中", mediaError: "映像を読み込めませんでした。再読み込みしてお試しください。", retry: "映像を再読み込み", seek: "映像の再生位置",
    comparisonTitle: "同じショット、異なる細部。", comparisonDescription: "境界を動かすか、全画面表示を切り替えて比較。構図と動きを確認した後、光・質感・遠景の細部をご覧ください。",
    compare: "同期して比較", draft: "草稿 · 480p", final: "完成映像 · 1080p", divider: "草稿と完成映像の表示境界", detail: "細部を拡大", fullFrame: "全景に戻る",
    original: "同じ草稿から生成した二つの映像に、同じ編集を適用しています。元の画面を保ち、ぼかしやシャープ処理は加えていません。",
    composition: "構図", compositionText: "草稿で、主役の位置、奥行き、カメラの動きを確認します。",
    motion: "動き", motionText: "タイミング、リズム、ショットのつながりを確かめ、仕上げたい映像を選びます。",
    texture: "細部", textureText: "完成映像で、光の輪郭、表面の質感、遠景の重なりを観察します。",
    processTitle: "創作に、選択の余白を。", processIntro: "一度にすべて決める必要はありません。確かめて、選んで、仕上げる。",
    stepOne: "想像を動かす", stepOneText: "プロンプトと参考素材から 480p の草稿を生成。構図、人物の動き、ショット全体のリズムを確認します。",
    stepTwo: "残したいショットを選ぶ", stepTwoText: "草稿の履歴から一つを選びます。映像と必要ポイントを確認して、1080p の完成映像を生成します。",
    stepThree: "細部まで仕上げる", stepThreeText: "草稿の内容・長さ・縦横比・音声設定を引き継ぎます。完成後は創作履歴から視聴・ダウンロードできます。",
    rulesTitle: "始める前に、知っておくこと。", ruleResolution: "草稿は 480p、草稿から生成する完成映像は 1080p です。",
    ruleExpiry: "草稿は作成から 7 日間利用できます。期限後は新しい草稿を生成してください。",
    ruleCredits: "草稿と完成映像には、それぞれポイントが必要です。完成映像は無料ではなく、草稿の料金も差し引かれません。送信前に必要ポイントを表示します。",
    ruleAudio: "完成映像は草稿のプロンプト・参考素材・長さ・縦横比・シード・音声設定を引き継ぎます。草稿の段階でご確認ください。",
    finishTitle: "次のショットは、ここから。", finishText: "一つの想像を、まず動かしてみる。",
    homeTitle: "構図を見つけ、細部を仕上げる。", homeDescription: "480p の草稿で構図・動き・リズムを確認し、納得できたら、その草稿から 1080p を生成。残したいショットを、細部まで仕上げる。", homeCta: "草稿と完成映像の違いを見る",
    comparisonControls: "草稿と完成映像の比較操作", filmControls: "展示映像の再生操作",
  },
};
