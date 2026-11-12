import type { Locale } from "@/lib/i18n/locale";
import { simplifyChinese } from "@/lib/i18n/simplifyChinese";

interface GuideStep {
  title: string;
  detail: string;
  check: string;
}

interface GuideCopy {
  title: string;
  description: string;
  templateName: string;
  synopsis: string;
  preview: string;
  canvas: string;
  duration: string;
  demo: string;
  captions: string;
  openVideo: string;
  download: string;
  shotHeading: string;
  shots: { title: string; detail: string }[];
  stepsHeading: string;
  checkpoint: string;
  businessHint: string;
  businessLink: string;
  steps: GuideStep[];
}

const zh = {
  title: "短劇工作流教學",
  description: "跟著一部約 24 秒的短劇，練習定角色與場景、接上節點。逐鏡生成後，再下載素材完成剪輯。",
  templateName: "最後一班渡船",
  synopsis: "雨中，守夜人發現長椅上有隻紅手套。那是有人還在等船的暗號。守夜人提燈示意，讓已離岸的渡船回頭。",
  preview: "預覽與複製範本",
  canvas: "前往智慧畫布",
  duration: "4 鏡 · 23.25 秒 · 16:9",
  demo: "成片示範",
  captions: "繁體中文（音效）",
  openVideo: "開啟《最後一班渡船》MP4",
  download: "下載成片 MP4",
  shotHeading: "四個鏡頭",
  shots: [
    { title: "渡船離岸", detail: "以雨幕和遠處的船交代碼頭位置。" },
    { title: "發現紅手套", detail: "切到長椅，讓觀眾和守夜人一起看見手套。" },
    { title: "提燈示意", detail: "一個清楚的動作，讓遠處的船看見提燈的信號。" },
    { title: "渡船回頭", detail: "回到遠景，留一點時間讓觀眾看見船改變方向。" },
  ],
  stepsHeading: "從劇本到交片",
  checkpoint: "完成這一步",
  businessHint: "商務工作室請在流程畫布直接編輯分鏡節點。重跑影片時，畫布也可能重做相連的圖片。若開場圖已確認，先下載並上傳至商務素材，再接上素材節點。",
  businessLink: "開啟商務工作流",
  steps: [
    {
      title: "複製範本",
      detail: "開啟範本預覽，選取節點查看提示詞和連線。登入後按「複製到我的畫布」，即可在自己的副本修改故事和設定。",
      check: "打開自己的副本，確認有四個影片節點。",
    },
    {
      title: "定下故事和分鏡",
      detail: "先在「分鏡導演台」改故事，再逐鏡填入起始畫面、主要動作與結尾。在「構圖與運鏡」定景別和移動方式，在「音樂、環境聲與對白」安排雨聲和停頓。範本已排好四鏡，每鏡 6 秒。若要擴寫，可用「依段落建立分鏡」增加新鏡頭。",
      check: "關掉聲音也能從四個動作讀出事情的因果。",
    },
    {
      title: "建立角色與場景參考",
      detail: "先做守夜人的造型圖與碼頭全景，再以它們建立各鏡的開場構圖。畫布會把接入的圖片用作構圖參考。若要鎖定第一幀，請在支援首幀模式的模型與介面操作。守住深藍雨衣、暖色提燈和紅手套三個辨識點，並維持碼頭、長椅和船的相對位置。",
      check: "並排看四張開場參考圖，角色造型、道具位置和冷暖光能接上。",
    },
    {
      title: "接好連線，試做一鏡",
      detail: "在「流程畫布」把文字輸出接到該鏡的提示詞輸入，再把對應圖片輸出接到影片的圖片輸入。先在「分鏡導演台」試做提燈的第三鏡，送出前查看本次會執行的節點與預估點數。",
      check: "提燈動作讀得清楚，再用相同的畫幅逐鏡生成其餘片段。導演台會沿用已完成的上游素材。",
    },
    {
      title: "審看並下載鏡頭",
      detail: "在畫布或導演台逐鏡播放，檢查臉部、持燈的手、視線與船的移動方向。若有一鏡需要重做，調整該鏡後單獨生成。從一般創作的生成紀錄逐段下載影片，按 01 至 04 命名。",
      check: "四段影片都能播放，畫幅一致，檔名順序正確。",
    },
    {
      title: "剪輯與交片",
      detail: "匯入四段影片。跟著守夜人的視線切到手套，再趁他走出畫面切到提燈。最後兩鏡短暫疊化，讓觀眾感覺船掉頭需要一點時間。用同一段雨聲跨過切點，再加上把手輕響與逐漸靠近的船聲。檢查畫面、音量和片尾後，匯出 MP4。",
      check: "完整播放匯出的 MP4，確認剪接點、聲音和交付長度。",
    },
  ],
};

export const guideCopy: Record<Locale, GuideCopy> = {
  "zh-Hant": zh,
  "zh-Hans": { ...simplifyChinese(zh), captions: "简体中文（音效）" },
  en: {
    title: "Short film workflow guide",
    description: "Follow a film of roughly 24 seconds from story and reference art to connected nodes, shot generation, and a finished edit.",
    templateName: "The Last Ferry",
    synopsis: "In the rain, a harbor keeper spots a red mitten on a bench. It signals that someone is still waiting. The keeper raises a lantern, and the departing ferry turns back.",
    preview: "Preview and copy template",
    canvas: "Open Smart Canvas",
    duration: "4 shots · 23.25 seconds · 16:9",
    demo: "Finished film",
    captions: "English (sound effects)",
    openVideo: "Open The Last Ferry MP4",
    download: "Download the film (MP4)",
    shotHeading: "Four shots",
    shots: [
      { title: "The ferry departs", detail: "Rain and a distant ferry establish the harbor." },
      { title: "A red mitten", detail: "Cut to the bench so we discover the mitten with the keeper." },
      { title: "Signal with the lantern", detail: "One clear gesture carries the message across the water." },
      { title: "The ferry turns back", detail: "Return to the wide shot and hold as the ferry changes course." },
    ],
    stepsHeading: "From script to export",
    checkpoint: "Before you move on",
    businessHint: "In the Business workspace, edit shot nodes on the workflow canvas. Running a video again can also rerun its connected image nodes. To keep an approved still, download it, upload it to Business assets, and connect an asset node.",
    businessLink: "Open Business workflows",
    steps: [
      {
        title: "Copy the template",
        detail: "Open the template preview and select a node to inspect its prompt and connections. Sign in and choose “Copy to my canvases” to edit the story and settings in your own copy.",
        check: "Open your copy and find all four video nodes.",
      },
      {
        title: "Plan the story and shots",
        detail: "Edit the story in the Shot director. Give each shot an opening, a main action, and an ending. Set framing and movement in “Composition and camera.” Place rain and pauses in “Music, atmosphere and dialogue.” The template has four six-second shots. To expand it, choose “Create shots from paragraphs” to add new shots.",
        check: "The four actions tell the story even with the sound muted.",
      },
      {
        title: "Build your visual references",
        detail: "Start with the keeper’s wardrobe and a wide view of the pier. Use them to compose each opening reference. The canvas uses the connected image to guide composition. To lock the first frame, choose a model and a creation mode with first-frame support. Keep the navy raincoat, warm lantern, and red mitten consistent. Keep the bench, ferry, and pier in the same positions relative to each other.",
        check: "Compare the four opening references for wardrobe, props, and lighting continuity.",
      },
      {
        title: "Connect and test one shot",
        detail: "In the workflow canvas, connect each text output to its prompt input and each still image output to the video’s image input. Test the third shot in the Shot director. Review the nodes that will run and the estimated credits before you submit.",
        check: "The lantern signal reads clearly. Use the same aspect ratio for the remaining shots. The Shot director reuses completed upstream assets.",
      },
      {
        title: "Review and download the shots",
        detail: "Play each shot in the canvas or Shot Director. Check the face, the hand holding the lantern, eyelines, and the ferry’s direction. Adjust and rerun any shot that needs work on its own. Download each clip from your regular generation history and name the files 01 to 04.",
        check: "All four files play, share an aspect ratio, and are named in sequence.",
      },
      {
        title: "Edit and export the film",
        detail: "Import the four clips. Follow the keeper’s eyeline to the mitten, then cut to the lantern as he leaves the frame. Briefly dissolve between the last two shots to let time pass as the ferry turns. Carry one bed of rain across the cuts, then add the lantern’s clink and the approaching engine. Check the picture, sound levels, and ending before exporting an MP4.",
        check: "Play the exported MP4 all the way through to check the cuts, sound, and runtime.",
      },
    ],
  },
  ja: {
    title: "短編映画の制作ガイド",
    description: "約24秒の短編を題材に、脚本、参照素材、ノードの接続、ショットの生成から編集と書き出しまでをたどります。",
    templateName: "最後の渡し船",
    synopsis: "雨の中、船着場の番人はベンチに赤い手袋を見つけます。まだ船を待つ人がいるという合図です。番人がランタンを掲げると、岸を離れた渡し船が引き返します。",
    preview: "テンプレートを確認して複製",
    canvas: "スマートキャンバスを開く",
    duration: "4カット · 23.25秒 · 16:9",
    demo: "完成した短編",
    captions: "日本語（効果音）",
    openVideo: "『最後の渡し船』のMP4を開く",
    download: "完成動画をダウンロード（MP4）",
    shotHeading: "4つのカット",
    shots: [
      { title: "渡し船が岸を離れる", detail: "雨と遠ざかる渡し船で、舞台となる船着場を見せます。" },
      { title: "赤い手袋を見つける", detail: "ベンチに切り替え、番人と一緒に手袋に気づく構成です。" },
      { title: "ランタンで合図する", detail: "ランタンを掲げる動作で、船に合図を送ります。" },
      { title: "渡し船が引き返す", detail: "引きの画に戻り、渡し船が向きを変えるところを見せます。" },
    ],
    stepsHeading: "脚本から書き出しまで",
    checkpoint: "ここまでの確認",
    businessHint: "ビジネスでは、ワークフロー上でカットのノードを編集します。動画ノードを再実行すると、接続元の画像も再生成される場合があります。確定した画像はダウンロードしてビジネス素材にアップロードし、素材ノードを接続します。",
    businessLink: "ビジネスのワークフローを開く",
    steps: [
      {
        title: "テンプレートを複製する",
        detail: "テンプレートを開き、ノードを選んでプロンプトや接続を確認します。ログイン後、「マイキャンバスにコピー」を選べば、脚本や設定を編集できます。",
        check: "複製したキャンバスに動画ノードが4つあることを確認します。",
      },
      {
        title: "物語と絵コンテを決める",
        detail: "「絵コンテ・演出」で物語を編集し、カットごとに冒頭の画、主な動き、終わりの状態を決めます。「構図とカメラワーク」で画角や動きを、「音楽・環境音・台詞」で雨音や間を設定します。テンプレートは6秒のカットが4つ。カットを増やすときは、段落からカットを作成できます。",
        check: "音を消しても、4つの動きで出来事のつながりが伝わります。",
      },
      {
        title: "人物と舞台の参照素材を作る",
        detail: "まず番人の衣装と船着場の全景を作り、それをもとに各カットの冒頭の構図を作ります。キャンバスにつないだ画像は構図の参照に使われます。開始フレームを固定するには、対応するモデルと生成モードを選びます。紺色の雨具、暖かい色のランタン、赤い手袋をそろえ、ベンチと船と桟橋の位置関係を保ちます。",
        check: "4枚の参照画像を並べ、衣装、小道具、光のつながりを確認します。",
      },
      {
        title: "ノードをつなぎ、1カット試す",
        detail: "「ワークフロー」で、テキストの出力をプロンプト入力へ、対応する静止画の出力を動画の画像入力へつなぎます。「絵コンテ・演出」で3カット目を試し、実行するノードと見積もりポイントを確認してから送信します。",
        check: "ランタンの合図が伝わったら、同じ画面比率で残りのカットを作ります。「絵コンテ・演出」は生成済みの接続元の素材を再利用します。",
      },
      {
        title: "カットを確認して保存する",
        detail: "キャンバスや「絵コンテ・演出」で各カットを再生します。顔、ランタンを持つ手、視線、船の進行方向を確認し、修正が必要なカットだけ作り直します。通常の生成履歴から動画を1本ずつダウンロードして、01〜04の名前を付けます。",
        check: "4本すべてが再生でき、画面比率とファイルの順番がそろっています。",
      },
      {
        title: "編集して書き出す",
        detail: "4本の素材を読み込みます。番人の視線を追って手袋を映し、番人が画面から出るところでランタンのカットへ。最後の2カットは短く重ね、船が方向を変えるまでの時間を表します。同じ雨音をカットの間も流し、持ち手の金属音と近づくエンジン音を重ねます。画、音量、ラストを確認してMP4を書き出します。",
        check: "書き出したMP4を最後まで再生し、カットのつながり、音、尺を確認します。",
      },
    ],
  },
};
