import type { Locale } from "./locale";

/**
 * UI strings for the three languages. zh-Hant is the source of truth and
 * fixes the shape; `en` and `ja` are typed against it so a missing key is a
 * compile error, never a blank label. Keep entries short and grouped by
 * surface. Model names are never translated (they are product names).
 */
const zh = {
  nav: {
    home: "首頁", image: "圖片生成", video: "影片生成", text: "文字創作", avatar: "數位人",
    canvas: "智慧畫布", director3d: "3D 導演台", editor: "圖層編輯", assets: "資產庫", companions: "陪聊角色", models: "模型一覽",
    landing: "返回啟程", collapse: "收起", expand: "展開導覽", openNav: "開啟導覽", closeNav: "關閉導覽", mainNav: "主要導覽",
    modelsHeading: "模型", loading: "載入中…", modelFunctions: "模型功能",
  },
  top: {
    help: "說明", credits: "點數", admin: "管理後台", account: "個人資訊", openAccount: "開啟個人資訊", logout: "登出", pricing: "定價", login: "登入",
    language: "語言", switchLanguage: "切換語言",
  },
  modes: {
    freestyle: "自由創作", "text-to-video": "文字生影片", "image-to-video": "圖片生影片", "first-last-frame": "首尾幀編輯", "subject-reference": "主體參考",
    "video-edit": "影片編輯", "video-extend": "影片續寫", "universal-reference": "通用參考", "layer-separation": "圖層分離",
  },
  home: {
    hot: "熱門", new: "新", newVersion: "Seedance 2.5 新版本 🔥", tryNow: "立即體驗", canvasHeading: "用畫布創造更多",
    toAssets: "前往素材庫", placeholder: "描述你想生成的內容畫面", start: "開始創作",
    showcase: { seedance20: "電影級影片生成", gptImage: "更清晰的圖像創作", seedream5: "生產級視覺創作", veo31: "原生音軌、電影級畫面" },
    templates: {
      keyframe: ["關鍵影格攝影機", "用關鍵影格控制攝影機移動"] as [string, string], storyboard: ["故事板網格", "將創意轉化為多幀場景"] as [string, string],
      shots: ["鏡頭設計師", "創造電影級攝影機角度"] as [string, string], color: ["電影色彩", "添加豐富的電影風格色調"] as [string, string],
    },
  },
  landing: {
    navVideo: "影片創作", navImage: "圖片創作", navCanvas: "智慧畫布", navCompanions: "AI 陪聊", start: "開始創作", explore: "探索功能",
    h1a: "一句話，", h1b: "一個世界。", subtitle1: "生成，只是開始——讓TA活起來，才是故事的開頭。", subtitle2: "創造你的角色，然後愛上與TA相處的每一天。",
    features: {
      video: { title: "讓想像，開始流動。", text: "從一句描述到一段影像。用文字或參考圖片，開啟你的下一個故事。", action: "開始影片創作" },
      image: { title: "每個靈感，都值得被看見。", text: "探索不同模型與視覺風格，把腦海中的畫面變成作品。", action: "開始圖片創作" },
      canvas: { title: "把創意連起來。", text: "在智慧畫布排列素材與生成節點，建立自己的工作流程；也能進入 3D 導演台，探索構圖與鏡頭。", action: "開啟智慧畫布" },
      companions: { title: "生成，只是開始。", text: "創造你的角色，讓TA活起來——有記憶、有個性，陪你聊每一天的心情與故事。", action: "認識你的 AI 夥伴" },
    },
    gallery: "作品展示", mainShow: "主展示", work: "作品", placeholderMain: "靈感，從這裡展開", placeholderMore: "更多作品，敬請期待",
    featured: "精選展示", extended: "延伸作品", soon: "即將展開",
    closingA: "Blue Wing——人與AI，", closingB: "共同振翅，邁向未來。", closingCta: "開始創作",
    footHome: "回到首頁", footHelp: "使用說明", footLogin: "登入帳號", floatHome: "→ 前往首頁",
  },
  auth: {
    loginTitle: "登入 The Blue Wing", noAccount: "還沒有帳號？", register: "註冊", email: "Email", password: "密碼", forgot: "忘記密碼？", login: "登入",
    loginFailed: "登入失敗", unverified: "這個帳號還沒完成 email 驗證，請先收信點驗證連結。", network: "連線失敗，請稍後再試",
    registerTitle: "註冊 The Blue Wing", haveAccount: "已經有帳號？", pwHint: "至少 8 個字元", create: "建立帳號", registerFailed: "註冊失敗",
    registered: "註冊成功", toLogin: "前往登入", sentVerify: "已寄出驗證信到", sentVerify2: "，點信裡的連結完成驗證後就能登入。", noMail: "目前尚未設定寄信服務，先用這個連結驗證：", created: "帳號已建立，可以直接登入。",
    forgotTitle: "忘記密碼", backLogin: "回登入", forgotSent: "如果這個 email 有註冊，我們已寄出重設連結（1 小時內有效）。請到信箱查看，也記得看垃圾郵件匣。", forgotHint: "輸入註冊時用的 email，我們會寄一封重設密碼的連結給你。", sendReset: "寄出重設連結", sendFailed: "送出失敗", testMode: "（測試模式，未設寄信服務）重設連結：",
    resetTitle: "重設密碼", mismatch: "兩次輸入的新密碼不一致", resetFailed: "重設失敗", reapply: "重新申請", missingToken: "缺少重設碼，請從信裡的連結進來。", resetDone: "密碼已重設，已為你登入，正在前往帳號頁…", newPw: "新密碼", confirmPw: "再次輸入新密碼", setPw: "設定新密碼",
    verifyTitle: "Email 驗證", verifying: "驗證中…", missingVerify: "缺少驗證碼，請從註冊信裡的連結進來。", verifyFailed: "驗證失敗", verified: "驗證完成，已為你登入。", networkDot: "連線失敗，請稍後再試。",
    busy: "處理中…",
  },
  pricing: {
    eyebrow: "BLUE WING · MEMBERSHIP", h1a: "為你的下一個作品，", h1b: "選擇更多可能。", sub1: "從第一個靈感，到完整的創作計畫。", sub2: "選擇適合自己的點數額度，自由安排每一次生成。", monthlyUsd: "月方案 · 美元 USD",
    recommended: "✦ 推薦創作方案", premiumTag: "✦ 更多點數・完整體驗", perMonth: "/ 月", free: "免費", adminActivates: "由管理員協助開通本期方案", dailyNoCarry: "每日點數，不累積至隔日",
    howToActivate: "查看開通方式", startFree: "開始免費創作", dailyCredits: "每日創作點數", monthlyCredits: "每期方案點數", credits: "點", unitPrice: "每點方案單價", howToClaim: "領取方式", claimDaily: "每日使用時領取",
    deductNote: "依生成設定扣點；本期點數到期失效。", previewNote: "生成前可查看所需點數。",
    extra: "EXTRA CREDITS", extraTitle: "靈感多一點，額度也多一點。", extraSub: "一次性增購 · 開通日起 730 天有效", perCredit: "每點 US$",
    foot1: "目前由管理員協助開通，尚未提供線上付款或自動扣款。請提供帳號 UID 與所選方案。", foot2: "每日免費點數不累積；月方案點數依該期效期使用、不結轉。每次生成依模型、解析度與設定扣點，送出前可查看預估點數。",
    plans: {
      free: { eyebrow: "從靈感開始", description: "輕鬆探索你的第一個作品。", features: ["每天領取 10 點", "依點數體驗生成", "建立你的智慧畫布"] },
      basic: { eyebrow: "日常創作", description: "為偶爾湧現的靈感，留一點空間。", features: ["每期 900 點", "圖片、影片與文字創作", "智慧畫布工作流程"] },
      standard: { eyebrow: "穩定產出", description: "讓系列作品，成為你的日常。", features: ["每期 3,200 點", "圖片、影片與文字創作", "智慧畫布工作流程"] },
      premium: { eyebrow: "完整創作體驗", description: "為更大的故事，準備更多可能。", features: ["每期 11,000 點", "圖片、影片與文字創作", "智慧畫布工作流程", "解鎖陪聊角色專屬場景生成"] },
    },
  },
  models: {
    indexTitle: "AI 影片與圖片模型一覽", videoGroup: "影片模型", videoSub: "文生影、圖生影、首尾幀、參考素材與運鏡", imageGroup: "圖片模型", imageSub: "文生圖、圖生圖、透明背景、圖層分離",
    intro: "下面每一頁的規格都是站內實際接受的參數，點數依目前費率表計算。免費方案每天 10 點，先用最便宜的模型試方向，再用高階模型出成品。",
    perSecond: "點/秒", perImage: "點/張", maxSeconds: "最長 {n} 秒", refs: "{n} 個參考", noRefs: "無參考", sizes: "{n} 種尺寸", refImage: "參考圖", textOnly: "純文字", transparent: "透明背景", negative: "負向提示詞",
    crumbModels: "模型", crumbVideo: "影片", crumbImage: "圖片", videoModel: "AI 影片生成模型", imageModel: "AI 圖片生成模型", updated: "更新於",
    startWith: "用 {name} 開始生成 →", seePricing: "看點數方案", specs: "規格", modesLabel: "支援模式", resolution: "輸出解析度", duration: "時長", seconds: "秒", refMaterials: "參考素材",
    upTo: "最多 {n} 個", withVideoRef: "（含影片參考運鏡）", unsupported: "不支援", supported: "支援", outputSize: "輸出尺寸", refImages: "參考圖", refImagesV: "最多 4 張（圖生圖／編修）", transparentBg: "透明背景", negativePrompt: "負向提示詞", quality: "品質檔位", qualityV: "低 / 中 / 高", fixed: "固定",
    credits: "點數", per: "每", creditUnit: "點", byRateCard: "依站內費率表", bestFor: "適合", notFor: "不適合", faq: "常見問題", otherVideo: "其他影片模型", otherImage: "其他圖片模型",
    faqMaxSec: { q: "{name} 最長可以生成幾秒的影片？", a: "{name} 單次最長 {n} 秒，最短 4 秒；時長以整數秒指定，點數依秒數與解析度計算。" },
    faqRes: { q: "{name} 支援哪些解析度？", a: "{list}。解析度越高每秒點數越多（720p 為 480p 的 2.25 倍、1080p 為 5.5 倍、4K 為 11 倍）。" },
    faqRefV: { q: "{name} 可以附參考圖嗎？", yes: "可以，最多 {n} 個參考素材{video}。參考圖最小邊會自動放大到 320 像素、最大邊縮到 2048 像素，所以小圖或超大圖都能用。", video: "，並且接受影片當作運鏡參考（3D 導演台的錄製可直接送入）", noText: "不行，{name} 走純文字生影片流程，不接受額外的參考素材；需要主體參考請改用 Seedance 2.0 或 2.5。", noImage: "不行，{name} 走純圖片生影片流程，不接受額外的參考素材；需要主體參考請改用 Seedance 2.0 或 2.5。" },
    faqSizes: { q: "{name} 可以輸出哪些尺寸？", a: "{list}。" },
    faqRefI: { q: "{name} 支援參考圖（圖生圖）嗎？", yes: "支援，最多 4 張參考圖。參考圖會自動調整到 320–2048 像素範圍，不需要自己先縮圖。", no: "不支援，這個模型只接受文字提示詞。" },
    faqBg: { q: "{name} 可以輸出透明背景嗎？", yes: "可以，把「背景」設為透明，輸出 PNG／WebP 即可去背。", no: "不行，此模型沒有背景選項；需要透明背景請用 GPT image 系列，或先生成再用圖層編輯的 AI 去背。" },
    faqCost: { q: "{name} 一次生成要多少點數？", a: "每{unit} {per} 點。例如：{examples}。送出前介面會先顯示這次的預估點數，失敗會自動退還。" },
    faqHow: { q: "{name} 在 The Blue Wing 上怎麼用？", a: "登入後到「{section}」，在模型選單選 {name}，輸入描述{refs}後送出。免費方案每天有 10 點可以試用。", refs: "、視需要加入參考素材" },
    listSep: "、", exampleSep: "、", sec: "秒", img: "張",
    footNote: "本頁規格由站內實際接受的參數自動產生，與生成介面完全一致；點數依目前費率表計算，送出前會再顯示一次。",
  },
  help: { crumb: "說明", faqSuffix: "常見問題", countSuffix: "個問題，與站內客服助手的答案完全一致。", otherTopics: "其他主題", byTopic: "依主題瀏覽常見問題", q: "題", modelsHint: "想知道每個模型的能力與點數？看", modelsLink: "模型一覽" },
  common: { free10: "免費方案每天有 10 點可以試用。" },
};

export type Dict = typeof zh;

const en: Dict = {
  nav: {
    home: "Home", image: "Image", video: "Video", text: "Writing", avatar: "Digital Human",
    canvas: "Canvas", director3d: "3D Director", editor: "Layer Editor", assets: "Assets", companions: "Companions", models: "Models",
    landing: "Back to Start", collapse: "Collapse", expand: "Expand navigation", openNav: "Open navigation", closeNav: "Close navigation", mainNav: "Main navigation",
    modelsHeading: "Models", loading: "Loading…", modelFunctions: "Model functions",
  },
  top: {
    help: "Help", credits: "Credits", admin: "Admin", account: "Account", openAccount: "Open account", logout: "Sign out", pricing: "Pricing", login: "Sign in",
    language: "Language", switchLanguage: "Switch language",
  },
  modes: {
    freestyle: "Freestyle", "text-to-video": "Text to video", "image-to-video": "Image to video", "first-last-frame": "First & last frame", "subject-reference": "Subject reference",
    "video-edit": "Video edit", "video-extend": "Video extend", "universal-reference": "Reference", "layer-separation": "Layer separation",
  },
  home: {
    hot: "Hot", new: "New", newVersion: "Seedance 2.5 is here 🔥", tryNow: "Try it now", canvasHeading: "Create more on the canvas",
    toAssets: "Go to assets", placeholder: "Describe what you want to create", start: "Create",
    showcase: { seedance20: "Cinematic video generation", gptImage: "Sharper image creation", seedream5: "Production-grade visuals", veo31: "Native audio, cinematic frames" },
    templates: {
      keyframe: ["Keyframe Camera", "Drive camera moves with keyframes"], storyboard: ["Storyboard Grid", "Turn an idea into multi-frame scenes"],
      shots: ["Shot Designer", "Craft cinematic camera angles"], color: ["Cinematic Color", "Add rich film-style grading"],
    },
  },
  landing: {
    navVideo: "Video", navImage: "Image", navCanvas: "Canvas", navCompanions: "Companions", start: "Start creating", explore: "Explore",
    h1a: "One sentence,", h1b: "one world.", subtitle1: "Generating is only the beginning — bringing them to life is where the story starts.", subtitle2: "Create your character, then fall for every day you spend together.",
    features: {
      video: { title: "Let imagination move.", text: "From one line to a moving picture. Start your next story with text or a reference image.", action: "Start a video" },
      image: { title: "Every idea deserves to be seen.", text: "Explore models and visual styles, and turn the picture in your head into work.", action: "Start an image" },
      canvas: { title: "Connect your ideas.", text: "Arrange assets and generation nodes on the canvas to build your own workflow, or step into the 3D Director to explore framing and camera moves.", action: "Open the canvas" },
      companions: { title: "Generating is only the beginning.", text: "Create a character and bring them to life — with memory and personality, here for every mood and story of your day.", action: "Meet your AI companion" },
    },
    gallery: "showcase", mainShow: "main showcase", work: "work", placeholderMain: "Inspiration starts here", placeholderMore: "More work coming soon",
    featured: "Featured", extended: "More", soon: "Coming soon",
    closingA: "Blue Wing — people and AI,", closingB: "taking wing together.", closingCta: "Start creating",
    footHome: "Home", footHelp: "Help", footLogin: "Sign in", floatHome: "→ Go to home",
  },
  auth: {
    loginTitle: "Sign in to The Blue Wing", noAccount: "No account yet?", register: "Sign up", email: "Email", password: "Password", forgot: "Forgot password?", login: "Sign in",
    loginFailed: "Sign-in failed", unverified: "This account hasn't verified its email yet. Please open the link in the verification mail first.", network: "Connection failed, please try again later",
    registerTitle: "Sign up for The Blue Wing", haveAccount: "Already have an account?", pwHint: "At least 8 characters", create: "Create account", registerFailed: "Sign-up failed",
    registered: "Account created", toLogin: "Go to sign in", sentVerify: "We sent a verification mail to", sentVerify2: ". Open the link inside to verify, then sign in.", noMail: "Mail delivery isn't configured yet — use this link to verify:", created: "Your account is ready. You can sign in now.",
    forgotTitle: "Forgot password", backLogin: "Back to sign in", forgotSent: "If this email is registered, we've sent a reset link (valid for 1 hour). Check your inbox and the spam folder.", forgotHint: "Enter the email you registered with and we'll send you a password reset link.", sendReset: "Send reset link", sendFailed: "Couldn't send", testMode: "(Test mode, no mail service) reset link:",
    resetTitle: "Reset password", mismatch: "The two passwords don't match", resetFailed: "Reset failed", reapply: "Request again", missingToken: "Missing reset code — please open the link from the email.", resetDone: "Password reset. You're signed in; taking you to your account…", newPw: "New password", confirmPw: "Confirm new password", setPw: "Set new password",
    verifyTitle: "Email verification", verifying: "Verifying…", missingVerify: "Missing verification code — please open the link from the sign-up email.", verifyFailed: "Verification failed", verified: "Verified. You're signed in.", networkDot: "Connection failed, please try again later.",
    busy: "Working…",
  },
  pricing: {
    eyebrow: "BLUE WING · MEMBERSHIP", h1a: "For your next piece,", h1b: "choose more room.", sub1: "From the first idea to a full creative plan.", sub2: "Pick the credit allowance that fits you and pace every generation freely.", monthlyUsd: "Monthly plans · USD",
    recommended: "✦ Recommended", premiumTag: "✦ Most credits · full experience", perMonth: "/ month", free: "Free", adminActivates: "Activated by an admin for the period", dailyNoCarry: "Daily credits, no carry-over",
    howToActivate: "How to activate", startFree: "Start for free", dailyCredits: "Daily credits", monthlyCredits: "Credits per period", credits: "credits", unitPrice: "Price per credit", howToClaim: "How to claim", claimDaily: "Claimed on first use each day",
    deductNote: "Deducted per generation settings; period credits expire at term end.", previewNote: "See the required credits before generating.",
    extra: "EXTRA CREDITS", extraTitle: "More ideas, more credits.", extraSub: "One-time top-up · valid 730 days from activation", perCredit: "US$ per credit",
    foot1: "Plans are currently activated by an admin; online payment and auto-billing aren't available yet. Send your account UID and the plan you want.", foot2: "Daily free credits don't accumulate; monthly credits follow their period and don't roll over. Each generation is charged by model, resolution and settings — the estimate is shown before you submit.",
    plans: {
      free: { eyebrow: "Start with an idea", description: "Explore your first piece at no cost.", features: ["10 credits every day", "Generate as credits allow", "Build your own canvas"] },
      basic: { eyebrow: "Everyday creating", description: "Room for the ideas that show up now and then.", features: ["900 credits per period", "Image, video and writing", "Canvas workflows"] },
      standard: { eyebrow: "Steady output", description: "Make a series part of your routine.", features: ["3,200 credits per period", "Image, video and writing", "Canvas workflows"] },
      premium: { eyebrow: "The full experience", description: "More possibilities for bigger stories.", features: ["11,000 credits per period", "Image, video and writing", "Canvas workflows", "Unlock companion scene generation"] },
    },
  },
  models: {
    indexTitle: "AI video and image models", videoGroup: "Video models", videoSub: "Text-to-video, image-to-video, first/last frame, references and camera moves", imageGroup: "Image models", imageSub: "Text-to-image, image-to-image, transparent backgrounds, layer separation",
    intro: "Every spec below is the exact set of parameters the studio accepts, and credits follow the current rate card. The free plan gives 10 credits a day — test direction with the cheapest model, then finish with a higher tier.",
    perSecond: "credits/s", perImage: "credits/image", maxSeconds: "up to {n}s", refs: "{n} references", noRefs: "no references", sizes: "{n} sizes", refImage: "reference images", textOnly: "text only", transparent: "transparent bg", negative: "negative prompt",
    crumbModels: "Models", crumbVideo: "Video", crumbImage: "Image", videoModel: "AI video generation model", imageModel: "AI image generation model", updated: "Updated",
    startWith: "Generate with {name} →", seePricing: "See pricing", specs: "Specifications", modesLabel: "Modes", resolution: "Resolutions", duration: "Duration", seconds: "s", refMaterials: "Reference material",
    upTo: "up to {n}", withVideoRef: " (incl. video reference for camera moves)", unsupported: "Not supported", supported: "Supported", outputSize: "Output sizes", refImages: "Reference images", refImagesV: "Up to 4 (image-to-image / edit)", transparentBg: "Transparent background", negativePrompt: "Negative prompt", quality: "Quality tiers", qualityV: "Low / Medium / High", fixed: "Fixed",
    credits: "Credits", per: "per ", creditUnit: " credits", byRateCard: "Per the site rate card", bestFor: "Best for", notFor: "Not for", faq: "FAQ", otherVideo: "Other video models", otherImage: "Other image models",
    faqMaxSec: { q: "How long can a {name} video be?", a: "{name} generates 4 to {n} seconds per run; length is given in whole seconds, and credits depend on seconds and resolution." },
    faqRes: { q: "Which resolutions does {name} support?", a: "{list}. Higher resolutions cost more per second (720p is 2.25× 480p, 1080p 5.5×, 4K 11×)." },
    faqRefV: { q: "Can I attach reference images to {name}?", yes: "Yes — up to {n} reference items{video}. The shortest side is upscaled to 320 px and the longest side capped at 2048 px automatically, so tiny or huge images both work.", video: ", including a video clip as a camera-move reference (3D Director recordings go straight in)", noText: "No. {name} runs a plain text-to-video flow and takes no extra references; for subject references use Seedance 2.0 or 2.5.", noImage: "No. {name} runs a plain image-to-video flow and takes no extra references; for subject references use Seedance 2.0 or 2.5." },
    faqSizes: { q: "Which sizes can {name} output?", a: "{list}." },
    faqRefI: { q: "Does {name} support reference images (image-to-image)?", yes: "Yes, up to 4 reference images. They're resized into the 320–2048 px range automatically, so there's no need to scale them yourself.", no: "No — this model only takes a text prompt." },
    faqBg: { q: "Can {name} output a transparent background?", yes: "Yes. Set Background to transparent and export PNG/WebP for a cut-out.", no: "No, this model has no background option. For transparency use the GPT image family, or generate first and remove the background in the layer editor." },
    faqCost: { q: "How many credits does one {name} generation cost?", a: "{per} credits per {unit}. For example: {examples}. The estimate is shown before you submit, and a failed generation is refunded automatically." },
    faqHow: { q: "How do I use {name} on The Blue Wing?", a: "Sign in, open “{section}”, pick {name} in the model menu, type a description{refs} and submit. The free plan gives you 10 credits a day to try it.", refs: ", add reference material if you like," },
    listSep: ", ", exampleSep: ", ", sec: "s", img: "image",
    footNote: "Specs on this page are generated from the parameters the site actually accepts, identical to the generation UI; credits follow the current rate card and are shown again before you submit.",
  },
  help: { crumb: "Help", faqSuffix: " FAQ", countSuffix: " questions, identical to the in-app support assistant's answers.", otherTopics: "Other topics", byTopic: "Browse FAQ by topic", q: " Q", modelsHint: "Want each model's capabilities and credits? See", modelsLink: "the model catalogue" },
  common: { free10: "The free plan gives you 10 credits a day to try it." },
};

const ja: Dict = {
  nav: {
    home: "ホーム", image: "画像生成", video: "動画生成", text: "テキスト創作", avatar: "デジタルヒューマン",
    canvas: "スマートキャンバス", director3d: "3D ディレクター", editor: "レイヤー編集", assets: "アセット", companions: "AI キャラクター", models: "モデル一覧",
    landing: "スタートへ戻る", collapse: "折りたたむ", expand: "ナビを展開", openNav: "ナビを開く", closeNav: "ナビを閉じる", mainNav: "メインナビゲーション",
    modelsHeading: "モデル", loading: "読み込み中…", modelFunctions: "モデル機能",
  },
  top: {
    help: "ヘルプ", credits: "ポイント", admin: "管理画面", account: "アカウント", openAccount: "アカウントを開く", logout: "ログアウト", pricing: "料金", login: "ログイン",
    language: "言語", switchLanguage: "言語を切り替え",
  },
  modes: {
    freestyle: "フリー生成", "text-to-video": "テキストから動画", "image-to-video": "画像から動画", "first-last-frame": "始点・終点フレーム", "subject-reference": "被写体リファレンス",
    "video-edit": "動画編集", "video-extend": "動画延長", "universal-reference": "汎用リファレンス", "layer-separation": "レイヤー分離",
  },
  home: {
    hot: "人気", new: "NEW", newVersion: "Seedance 2.5 登場 🔥", tryNow: "今すぐ試す", canvasHeading: "キャンバスでもっと作る",
    toAssets: "アセットへ", placeholder: "生成したい画面を説明してください", start: "作成する",
    showcase: { seedance20: "映画品質の動画生成", gptImage: "より鮮明な画像生成", seedream5: "プロダクション品質のビジュアル", veo31: "ネイティブ音声・映画品質の映像" },
    templates: {
      keyframe: ["キーフレームカメラ", "キーフレームでカメラの動きを制御"], storyboard: ["ストーリーボード", "アイデアを複数フレームのシーンに"],
      shots: ["ショットデザイナー", "映画的なカメラアングルを作る"], color: ["シネマカラー", "映画風の豊かな色調を加える"],
    },
  },
  landing: {
    navVideo: "動画制作", navImage: "画像制作", navCanvas: "キャンバス", navCompanions: "AI キャラ", start: "作成を始める", explore: "機能を見る",
    h1a: "ひとことで、", h1b: "ひとつの世界を。", subtitle1: "生成は始まりにすぎない——キャラクターが動き出したとき、物語が始まる。", subtitle2: "自分のキャラクターを作って、一緒に過ごす毎日を好きになる。",
    features: {
      video: { title: "想像を、動かそう。", text: "ひとつの説明文から一本の映像へ。テキストや参考画像から、次の物語を始めよう。", action: "動画制作を始める" },
      image: { title: "どんなひらめきも、見える形に。", text: "さまざまなモデルとビジュアルスタイルを試して、頭の中の画面を作品にする。", action: "画像制作を始める" },
      canvas: { title: "アイデアをつなげる。", text: "スマートキャンバスに素材と生成ノードを並べて自分のワークフローを作る。3D ディレクターで構図とカメラも探れる。", action: "キャンバスを開く" },
      companions: { title: "生成は、始まりにすぎない。", text: "キャラクターを作り、命を吹き込む——記憶と個性を持って、毎日の気分と物語に寄り添う。", action: "AI パートナーに会う" },
    },
    gallery: "作品展示", mainShow: "メイン展示", work: "作品", placeholderMain: "ひらめきは、ここから", placeholderMore: "作品は順次公開",
    featured: "注目作品", extended: "関連作品", soon: "近日公開",
    closingA: "Blue Wing——人と AI が、", closingB: "ともに羽ばたき、未来へ。", closingCta: "作成を始める",
    footHome: "ホームへ", footHelp: "使い方", footLogin: "ログイン", floatHome: "→ ホームへ",
  },
  auth: {
    loginTitle: "The Blue Wing にログイン", noAccount: "アカウントをお持ちでない方は", register: "登録", email: "メールアドレス", password: "パスワード", forgot: "パスワードをお忘れですか？", login: "ログイン",
    loginFailed: "ログインに失敗しました", unverified: "このアカウントはメール認証が完了していません。認証メールのリンクを開いてください。", network: "接続に失敗しました。しばらくしてからお試しください",
    registerTitle: "The Blue Wing に登録", haveAccount: "すでにアカウントをお持ちの方は", pwHint: "8 文字以上", create: "アカウントを作成", registerFailed: "登録に失敗しました",
    registered: "登録完了", toLogin: "ログインへ", sentVerify: "認証メールを送信しました：", sentVerify2: "。メール内のリンクで認証するとログインできます。", noMail: "メール送信が未設定のため、このリンクで認証してください：", created: "アカウントを作成しました。そのままログインできます。",
    forgotTitle: "パスワードをお忘れの方", backLogin: "ログインへ戻る", forgotSent: "このメールアドレスが登録されていれば、再設定リンクを送信しました（有効期限 1 時間）。迷惑メールフォルダもご確認ください。", forgotHint: "登録時のメールアドレスを入力してください。パスワード再設定のリンクをお送りします。", sendReset: "再設定リンクを送る", sendFailed: "送信に失敗しました", testMode: "（テストモード・メール未設定）再設定リンク：",
    resetTitle: "パスワード再設定", mismatch: "新しいパスワードが一致しません", resetFailed: "再設定に失敗しました", reapply: "再申請", missingToken: "再設定コードがありません。メールのリンクから開いてください。", resetDone: "パスワードを再設定し、ログインしました。アカウントページへ移動します…", newPw: "新しいパスワード", confirmPw: "新しいパスワード（確認）", setPw: "パスワードを設定",
    verifyTitle: "メール認証", verifying: "認証中…", missingVerify: "認証コードがありません。登録メールのリンクから開いてください。", verifyFailed: "認証に失敗しました", verified: "認証が完了し、ログインしました。", networkDot: "接続に失敗しました。しばらくしてからお試しください。",
    busy: "処理中…",
  },
  pricing: {
    eyebrow: "BLUE WING · MEMBERSHIP", h1a: "次の作品のために、", h1b: "もっと可能性を。", sub1: "最初のひらめきから、創作計画の完成まで。", sub2: "自分に合ったポイント枠を選び、生成を自由に組み立てよう。", monthlyUsd: "月額プラン · 米ドル USD",
    recommended: "✦ おすすめプラン", premiumTag: "✦ 最多ポイント・フル体験", perMonth: "/ 月", free: "無料", adminActivates: "管理者が当期プランを有効化", dailyNoCarry: "毎日のポイント、翌日への繰り越しなし",
    howToActivate: "有効化の方法", startFree: "無料で始める", dailyCredits: "1 日のポイント", monthlyCredits: "当期プランのポイント", credits: "pt", unitPrice: "1 pt あたりの単価", howToClaim: "受け取り方", claimDaily: "毎日の初回利用時に付与",
    deductNote: "生成設定に応じて消費。当期のポイントは期限で失効します。", previewNote: "生成前に必要ポイントを確認できます。",
    extra: "EXTRA CREDITS", extraTitle: "ひらめきが増えるほど、ポイントも。", extraSub: "1 回限りの追加購入 · 有効化から 730 日間有効", perCredit: "1 pt あたり US$",
    foot1: "現在は管理者が有効化を代行しており、オンライン決済・自動課金はまだ提供していません。アカウント UID と希望プランをお知らせください。", foot2: "無料の 1 日ポイントは繰り越しません。月額プランのポイントは当期内のみ有効で繰り越しません。生成ごとにモデル・解像度・設定に応じて消費し、送信前に見積もりを確認できます。",
    plans: {
      free: { eyebrow: "ひらめきから始める", description: "最初の作品を気軽に。", features: ["毎日 10 pt", "ポイントの範囲で生成", "自分のキャンバスを作る"] },
      basic: { eyebrow: "日常の創作", description: "ときどき湧くひらめきに、少し余裕を。", features: ["各期 900 pt", "画像・動画・テキスト創作", "キャンバスのワークフロー"] },
      standard: { eyebrow: "安定した制作", description: "シリーズ作品を日常に。", features: ["各期 3,200 pt", "画像・動画・テキスト創作", "キャンバスのワークフロー"] },
      premium: { eyebrow: "フルの創作体験", description: "より大きな物語に、より多くの可能性を。", features: ["各期 11,000 pt", "画像・動画・テキスト創作", "キャンバスのワークフロー", "AI キャラクターのシーン生成を解放"] },
    },
  },
  models: {
    indexTitle: "AI 動画・画像モデル一覧", videoGroup: "動画モデル", videoSub: "テキストから動画、画像から動画、始点・終点フレーム、リファレンス、カメラワーク", imageGroup: "画像モデル", imageSub: "テキストから画像、画像から画像、透過背景、レイヤー分離",
    intro: "以下の仕様はすべてスタジオが実際に受け付けるパラメータで、ポイントは現在の料金表に基づきます。無料プランは毎日 10 pt。まず安価なモデルで方向を確認し、上位モデルで仕上げましょう。",
    perSecond: "pt/秒", perImage: "pt/枚", maxSeconds: "最長 {n} 秒", refs: "リファレンス {n} 点", noRefs: "リファレンスなし", sizes: "{n} サイズ", refImage: "参考画像", textOnly: "テキストのみ", transparent: "透過背景", negative: "ネガティブプロンプト",
    crumbModels: "モデル", crumbVideo: "動画", crumbImage: "画像", videoModel: "AI 動画生成モデル", imageModel: "AI 画像生成モデル", updated: "更新",
    startWith: "{name} で生成を始める →", seePricing: "料金を見る", specs: "仕様", modesLabel: "対応モード", resolution: "出力解像度", duration: "長さ", seconds: "秒", refMaterials: "リファレンス素材",
    upTo: "最大 {n} 点", withVideoRef: "（動画リファレンスによるカメラワーク含む）", unsupported: "非対応", supported: "対応", outputSize: "出力サイズ", refImages: "参考画像", refImagesV: "最大 4 枚（画像から画像／編集）", transparentBg: "透過背景", negativePrompt: "ネガティブプロンプト", quality: "品質", qualityV: "低 / 中 / 高", fixed: "固定",
    credits: "ポイント", per: "1 ", creditUnit: " pt", byRateCard: "サイトの料金表に準拠", bestFor: "向いている用途", notFor: "向いていない用途", faq: "よくある質問", otherVideo: "その他の動画モデル", otherImage: "その他の画像モデル",
    faqMaxSec: { q: "{name} で生成できる動画は最長何秒ですか？", a: "{name} は 1 回あたり 4〜{n} 秒。長さは整数秒で指定し、ポイントは秒数と解像度で決まります。" },
    faqRes: { q: "{name} が対応する解像度は？", a: "{list}。解像度が高いほど 1 秒あたりのポイントが増えます（720p は 480p の 2.25 倍、1080p は 5.5 倍、4K は 11 倍）。" },
    faqRefV: { q: "{name} に参考画像を添付できますか？", yes: "できます。リファレンス素材は最大 {n} 点{video}。短辺は自動で 320 px に拡大、長辺は 2048 px に縮小されるので、小さい画像も大きい画像も使えます。", video: "。カメラワークの参考として動画クリップも受け付けます（3D ディレクターの録画をそのまま送れます）", noText: "できません。{name} はテキストから動画の通常フローで、追加リファレンスは受け付けません。被写体リファレンスが必要なら Seedance 2.0 または 2.5 をご利用ください。", noImage: "できません。{name} は画像から動画の通常フローで、追加リファレンスは受け付けません。被写体リファレンスが必要なら Seedance 2.0 または 2.5 をご利用ください。" },
    faqSizes: { q: "{name} で出力できるサイズは？", a: "{list}。" },
    faqRefI: { q: "{name} は参考画像（画像から画像）に対応していますか？", yes: "対応しています。参考画像は最大 4 枚。自動で 320〜2048 px の範囲に調整されるので、事前の縮小は不要です。", no: "非対応です。このモデルはテキストプロンプトのみ受け付けます。" },
    faqBg: { q: "{name} で透過背景を出力できますか？", yes: "できます。「背景」を透過に設定し、PNG／WebP で出力すると切り抜きになります。", no: "できません。このモデルには背景オプションがありません。透過が必要なら GPT image シリーズを使うか、生成後にレイヤー編集の AI 背景除去をご利用ください。" },
    faqCost: { q: "{name} の生成 1 回に必要なポイントは？", a: "{unit}あたり {per} pt。例：{examples}。送信前に見積もりが表示され、失敗時は自動で返還されます。" },
    faqHow: { q: "The Blue Wing で {name} を使うには？", a: "ログイン後「{section}」を開き、モデルメニューで {name} を選んで説明文を入力{refs}して送信します。無料プランでは毎日 10 pt をお試しいただけます。", refs: "（必要ならリファレンス素材を追加）" },
    listSep: "、", exampleSep: "、", sec: "秒", img: "枚",
    footNote: "このページの仕様はサイトが実際に受け付けるパラメータから自動生成され、生成画面と完全に一致します。ポイントは現在の料金表に基づき、送信前にもう一度表示されます。",
  },
  help: { crumb: "ヘルプ", faqSuffix: "のよくある質問", countSuffix: " 件の質問。サイト内サポートアシスタントの回答と同一です。", otherTopics: "その他のトピック", byTopic: "トピック別によくある質問を見る", q: " 件", modelsHint: "各モデルの機能とポイントは", modelsLink: "モデル一覧" },
  common: { free10: "無料プランでは毎日 10 pt をお試しいただけます。" },
};

export const DICTS: Record<Locale, Dict> = { "zh-Hant": zh, en, ja };

/** `{name}` / `{n}` substitution for the few strings that carry a value. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

/** Generation-mode label in the active locale; falls back to the zh label the helper returns. */
export function modeLabel(t: Dict, id: string, fallback: string): string {
  return (t.modes as Record<string, string>)[id] ?? fallback;
}
