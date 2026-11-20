/** Model release copy, shared by visible pages and answer schemas. */
const rows: readonly (readonly [string, string, string])[] = [
  [
    "商務工作室 · 自備 SIRAYA 金鑰",
    "Business studio · Your SIRAYA key",
    "ビジネススタジオ · SIRAYA キー持ち込み"
  ],
  [
    "此頁說明商務工作室目前開放的功能。模型須由你的 SIRAYA 金鑰授權；費用由 SIRAYA 收取，不使用一般創作點數。",
    "This page describes features enabled in the business studio. Your SIRAYA key must grant access; SIRAYA bills usage directly, without standard studio credits.",
    "このページはビジネススタジオで利用できる機能の説明です。SIRAYA キーのモデル権限が必要で、料金は SIRAYA が請求します。通常の制作ポイントは使いません。"
  ],
  [
    "商務模型的費用如何計算？",
    "How are business models billed?",
    "ビジネスモデルの料金は？"
  ],
  [
    "依 SIRAYA 帳號的即時費率與實際用量計費。送出前請查看預估費用；功能與額度依金鑰授權而定。",
    "Billing follows your SIRAYA account rates and actual usage. Review the estimate before submitting; features and balance depend on your key.",
    "SIRAYA アカウントの料金と実際の使用量に基づきます。送信前に見積もりをご確認ください。利用機能と残高はキーによって異なります。"
  ],
  [
    "如何使用這個商務模型？",
    "How do I use this business model?",
    "このビジネスモデルの使い方は？"
  ],
  [
    "進入商務工作室，完成帳號申請並連接自己的 SIRAYA 金鑰。選擇模型、輸入描述、設定規格並確認費用後送出。成人模型另須完成年齡驗證。",
    "Open the business studio, complete account approval and connect your SIRAYA key. Select the model, enter a prompt, set output options and confirm the cost. Adult models also require age verification.",
    "ビジネススタジオでアカウント承認と SIRAYA キーの接続を行い、モデル、説明、出力設定を選んで料金を確認し送信します。成人向けモデルには年齢確認も必要です。"
  ],
  [
    "供應商文件",
    "Provider documentation",
    "プロバイダーの資料"
  ],
  [
    "商務版本與規格",
    "Business version and specifications",
    "ビジネス版と仕様"
  ],
  [
    "原廠能力與站內功能有何不同？",
    "How do provider capabilities differ from site features?",
    "原モデルの能力とサイトの機能の違いは？"
  ],
  [
    "規格表列出本站已接入的功能。原廠或供應商新功能須完成參數、計費與成品驗證後才會開放；文件支援不代表已通過本站實測。",
    "The table lists features integrated into this site. New provider features require parameter, billing and output verification before release; documentation support is not proof of a successful site test.",
    "仕様表には当サイトで実装した機能を掲載しています。新機能はパラメータ、料金、出力の検証後に公開します。資料への記載は当サイトの実測成功を意味しません。"
  ],
  [
    "從參考圖片製作 2K／4K 主視覺。",
    "Create 2K/4K key visuals from image references.",
    "参照画像から 2K／4K のメインビジュアルを制作。"
  ],
  [
    "Seedream 5.5 在商務工作室提供文字生圖與圖片參考，每次一張、最多 10 張參考圖，提示詞上限 4,000 字元。可選 2K／4K 尺寸，適合產品主視覺、封面與場景設計。",
    "Seedream 5.5 offers text-to-image and image references in the business studio: one output, up to 10 references and 4,000 prompt characters. Choose 2K/4K sizes for product visuals, covers and scene design.",
    "Seedream 5.5 はビジネススタジオでテキストと参照画像から画像を生成します。出力は 1 枚、参照は最大 10 枚、説明は 4,000 文字まで。2K／4K を選び、商品ビジュアル、表紙、場面設計に利用できます。"
  ],
  [
    "產品主視覺與封面",
    "Product visuals and covers",
    "商品ビジュアルと表紙"
  ],
  [
    "透明背景與一次多張輸出",
    "Transparent backgrounds and multiple outputs per request",
    "透過背景と一度に複数枚の出力"
  ],
  [
    "以多種參考素材安排最長 30 秒的鏡頭。",
    "Compose shots up to 30 seconds with multiple reference types.",
    "複数の参照素材で最長 30 秒のショットを構成。"
  ],
  [
    "Seedance 2.5 商務版提供 480p、720p、1080p 與 4K 選項，支援文字、首尾幀、圖片、影片與音訊參考。4K 已依服務上線資訊開放；可用性以你的金鑰與實際回應為準。",
    "Seedance 2.5 in the business studio offers 480p, 720p, 1080p and 4K, with text, frame pairs, image, video and audio references. 4K is enabled based on the service rollout; availability depends on your key and the actual response.",
    "ビジネス版 Seedance 2.5 は 480p、720p、1080p、4K と、テキスト、開始・終了フレーム、画像、動画、音声の参照に対応します。4K はサービス公開情報に基づいて有効化しており、利用可否はキーと実際の応答に依存します。"
  ],
  [
    "角色、場景與聲音參考",
    "Character, scene and audio references",
    "キャラクター、場面、音声の参照"
  ],
  [
    "將一般創作的規格或點數套用到商務版",
    "Applying standard studio limits or credits to business usage",
    "通常版の仕様やポイントをビジネス版に適用すること"
  ],
  [
    "以 480p／720p 探索短片構圖。",
    "Explore short-film composition at 480p/720p.",
    "480p／720p で短編の構図を検討。"
  ],
  [
    "Seedance 2.5 Flash 在商務工作室提供 4–30 秒、480p／720p 與多模態參考。只有金鑰實際取得此模型權限才會出現在生成選單；速度與價格依供應商回應及帳號費率而定。",
    "Seedance 2.5 Flash offers 4–30 seconds, 480p/720p and multimodal references in the business studio. It appears in the generation picker only when your key grants access. Speed and price depend on the provider and account rates.",
    "ビジネス版 Seedance 2.5 Flash は 4–30 秒、480p／720p とマルチモーダル参照に対応します。モデル権限があるキーでのみ生成メニューに表示されます。速度と料金はプロバイダーとアカウントに依存します。"
  ],
  [
    "短片構圖與動作試稿",
    "Composition and motion studies",
    "短編の構図と動きの試作"
  ],
  [
    "1080p／4K 輸出",
    "1080p/4K output",
    "1080p／4K 出力"
  ],
  [
    "用文字與圖片參考，創作原生有聲短片。",
    "Create films with native sound from text and image references.",
    "テキストと参照画像から音声付き動画を制作。"
  ],
  [
    "Kling 4.0 在商務工作室支援 3–30 秒、720p／1080p、最多 10 張圖片參考與 21:9 畫幅，固定產生原生聲音。目前未開放影片參考、聲音 ID 與中間關鍵幀操作。",
    "Kling 4.0 in the business studio supports 3–30 seconds, 720p/1080p, up to 10 image references and 21:9 framing, with native audio always on. Video references, voice IDs and middle-keyframe controls are not currently enabled.",
    "ビジネス版 Kling 4.0 は 3–30 秒、720p／1080p、最大 10 枚の参照画像、21:9 に対応し、音声は常に生成します。動画参照、音声 ID、中間キーフレーム操作は現在未公開です。"
  ],
  [
    "有聲產品展示與角色短片",
    "Product and character films with sound",
    "音声付きの商品紹介とキャラクター動画"
  ],
  [
    "4K 或無聲輸出",
    "4K or silent output",
    "4K または無音出力"
  ],
  [
    "以 720p 製作最長 20 秒的有聲片段。",
    "Create 720p clips with sound up to 20 seconds.",
    "720p で最長 20 秒の音声付きクリップを制作。"
  ],
  [
    "Kling 4.0 Flash 在商務工作室支援 3–20 秒、720p、最多 10 張圖片參考與 21:9 畫幅。固定產生原生聲音；不支援 1080p、4K、尾幀或聲音參考。",
    "Kling 4.0 Flash in the business studio supports 3–20 seconds, 720p, up to 10 image references and 21:9 framing. Native audio is always on; 1080p, 4K, last frames and voice references are unsupported.",
    "ビジネス版 Kling 4.0 Flash は 3–20 秒、720p、最大 10 枚の参照画像、21:9 に対応します。音声は常に生成し、1080p、4K、終了フレーム、音声参照には対応しません。"
  ],
  [
    "聲音參考與首尾幀控制",
    "Voice references and frame-pair controls",
    "音声参照と開始・終了フレーム制御"
  ],
  [
    "從文字描述生成一張圖片。",
    "Generate one image from a text prompt.",
    "テキストの説明から画像を 1 枚生成。"
  ],
  [
    "Z-Image Spicy 為商務工作室的成人分類文字生圖模型，每次一張、每邊 256–1536 px；不接受參考圖片。本站預設關閉需額外收費的提示詞潤飾，使用前需完成年齡驗證。",
    "Z-Image Spicy is an adult-category text-to-image model in the business studio: one output, 256–1536 px per side, without image references. Surcharged prompt rewriting is off by default. Age verification is required.",
    "Z-Image Spicy はビジネススタジオの成人分類テキスト画像生成モデルです。出力は 1 枚、各辺 256–1536 px で、画像参照は非対応。追加料金のある説明文の補正は初期設定でオフです。年齢確認が必要です。"
  ],
  [
    "文字描述的插畫與場景",
    "Illustrations and scenes from text",
    "テキストによるイラストと場面"
  ],
  [
    "參考圖編修與透明背景",
    "Reference-image editing and transparent backgrounds",
    "参照画像の編集と透過背景"
  ],
  [
    "以較大的畫布承接文字構想。",
    "Turn a text concept into a larger canvas.",
    "テキストの構想をより大きなキャンバスへ。"
  ],
  [
    "Z-Image Spicy Pro 每次生成一張圖片，每邊可達 2560 px，預設 1024×1024。提供隨機種子與可選提示詞潤飾，不接受參考圖片；同樣屬於需年齡驗證的成人分類模型。",
    "Z-Image Spicy Pro generates one image with up to 2560 px per side, defaulting to 1024×1024. It offers a seed and optional prompt rewriting, without image references. It is also an adult-category model requiring age verification.",
    "Z-Image Spicy Pro は各辺最大 2560 px、初期設定 1024×1024 で画像を 1 枚生成します。シードと任意の説明文補正があり、画像参照は非対応です。成人分類のため年齢確認が必要です。"
  ],
  [
    "HTTP 200 為什麼不代表圖片生成完成？",
    "Why does HTTP 200 not guarantee a finished image?",
    "HTTP 200 でも画像が完成しないのはなぜ？"
  ],
  [
    "HTTP 200 只代表請求收到成功回應。本站仍會檢查成品欄位、下載圖片並保存；若回傳錯誤、缺少圖片或無法保存，工作會顯示失敗原因及請求編號，不會自動重送付費生成。",
    "HTTP 200 means the request received a successful HTTP response. The site still checks the output, downloads and saves the image. Provider errors, missing images or storage failures display a reason and request ID; paid generation is not automatically resubmitted.",
    "HTTP 200 は HTTP 応答の成功を表します。その後に出力の確認、画像の取得と保存が必要です。エラー、画像の欠落、保存失敗は理由とリクエスト ID を表示し、有料生成を自動で再送しません。"
  ],
  [
    "Kling Omni 可以直接上傳自訂聲音嗎？",
    "Can Kling Omni directly upload a custom voice?",
    "Kling Omni にカスタム音声を直接アップロードできますか？"
  ],
  [
    "SIRAYA 尚未提供建立或管理自訂聲音的介面。Kling 4.0 的供應商介面可引用既有 Kling voice_id，Flash 不支援聲音參考；本站尚未開放此操作，不能將音訊上傳等同於已建立聲音。",
    "SIRAYA does not offer custom-voice creation or management. Its Kling 4.0 API can reference an existing Kling voice_id; Flash does not support voice references. This site has not enabled that control. Uploading audio does not create a voice.",
    "SIRAYA はカスタム音声の作成・管理を提供していません。Kling 4.0 API は既存の Kling voice_id を参照できますが、Flash は音声参照に非対応です。当サイトではまだ操作を公開しておらず、音声アップロードだけでは声は作成されません。"
  ],
  [
    "規格與可選功能見各模型內頁。一般創作使用點數；商務工作室由你的 SIRAYA 帳號計費。",
    "See each model page for available features. Standard creation uses credits; the business studio bills your SIRAYA account.",
    "仕様と利用可能な機能は各モデルページをご覧ください。通常版はポイント、ビジネススタジオは SIRAYA アカウントで請求されます。"
  ],
  [
    "{name} {kind}：商務功能、規格與使用說明",
    "{name} {kind}: business features, specifications and guide",
    "{name} {kind}：ビジネス機能・仕様・使い方"
  ]
];
export const MODEL_RELEASE_EN: Record<string,string> = Object.fromEntries(rows.map(([zh,en]) => [zh,en]));
export const MODEL_RELEASE_JA: Record<string,string> = Object.fromEntries(rows.map(([zh,,ja]) => [zh,ja]));

