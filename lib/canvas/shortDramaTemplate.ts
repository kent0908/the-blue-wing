import type { Locale } from "../i18n/locale";
import { simplifyChinese } from "../i18n/simplifyChinese";
import type { OfficialCanvasTemplate } from "./officialTemplates";
import type { CanvasGraph, CanvasNode } from "./types";

export const SHORT_DRAMA_TEMPLATE_ID = -114;

type DramaCopy = {
  name: string;
  description: string;
  category: string;
  stages: string[];
  guide: string;
  story: string;
  edit: string;
  guideTitle: string;
  storyTitle: string;
  editTitle: string;
  wardrobeTitle: string;
  wardrobePrompt: string;
  pierTitle: string;
  pierPrompt: string;
  promptLabel: string;
  stillLabel: string;
  motionLabel: string;
  clipLabel: string;
  stillRules: string;
  motionRules: string;
  shots: { title: string; still: string; motion: string }[];
};

const copy: Record<Exclude<Locale, "zh-Hans">, DramaCopy> = {
  "zh-Hant": {
    name: "短劇全流程 · 最後一班渡船",
    description: "24 秒無台詞短劇。從劇本、角色與場景定稿，到四張開場參考圖、四段影片及剪輯交付。",
    category: "短劇全流程",
    stages: ["故事", "角色與場景", "四鏡生成", "剪輯交付"],
    guideTitle: "先讀 · 製作順序",
    guide: "① 讀故事，再改角色、地點或結局。要改造型或道具，請同步調整下游提示詞。\n② 在畫布執行「碼頭與道具」圖片節點，這次會依序做出守夜人服裝圖與碼頭基準圖。先確認臉、雨衣、燈和長椅位置。\n③ 依序用分鏡導演台的「生成這一鏡」製作四段影片。每個鏡頭會用相連的開場圖，已完成的上游素材可沿用。想先檢查個別開場圖，可以在畫布執行相應的圖片節點，並在確認視窗查看會重跑哪些素材與費用。\n④ 每鏡檢查視線、走位、服裝和道具，下載選定的片段，再依交付筆記剪輯。複製只建立草稿。",
    storyTitle: "故事原稿 · 四個節拍",
    story: "00–06 秒　藍灰色的傍晚，雨落在老碼頭。守夜人站在棚下，看著最後一班渡船向右離開。\n\n06–12 秒　守夜人注意到長椅上的紅手套。那是還有人等船的約定記號。\n\n12–18 秒　守夜人走到碼頭邊，將原本掛在入口的琥珀燈提到肩高，朝船的方向示意。\n\n18–24 秒　渡船看見燈，朝碼頭回轉。守夜人放鬆肩膀，讓燈留在畫面裡。",
    editTitle: "剪輯 · 聲音與交付",
    edit: "依 01→02→03→04 排入剪輯器。目標 24 秒，先看實際素材，再保留動作起落。\n00:06 以守夜人視線向下接紅手套。00:12 在守夜人收手時接提燈。00:18 在琥珀光進入畫面右側時，接遠處船燈開始回轉。\n用連續雨聲黏合四鏡。入片時保留遠處馬達，第二鏡壓低馬達，提燈時加一聲金屬扣輕響，尾鏡讓水聲回來。全片無台詞。\n剪輯器內統一 16:9、解析度與影格率。檢查人物、手套、燈色、船向及音量，再匯出 H.264 MP4。畫布產出的是各鏡片段，成片在剪輯器完成。",
    wardrobeTitle: "定稿 A · 守夜人",
    wardrobePrompt: "一張角色服裝定稿。單一成年男性碼頭守夜人，約三十歲，深棕短髮，左眉尾有一道淡疤，深海軍藍油布雨衣與消光黃銅扣，深灰長褲、黑色短靴。正面三分之四全身，雙手自然下垂，淺暖灰無縫背景，陰天柔光。16:9 精緻手繪動畫電影質感，霧面布料、清楚輪廓，無文字與商標。此定稿固定臉、衣服和鞋。",
    pierTitle: "定稿 B · 碼頭與道具",
    pierPrompt: "以服裝定稿固定守夜人的臉與雨衣。在雨中的老木碼頭建立一張連戲基準圖，16:9 平視廣角。視線由岸往海，棚下長椅在畫面左側，紅色針織手套平放在長椅上；琥珀油燈掛在中央偏右的入口柱上。守夜人站在長椅與柱子之間，朝畫面右側望向水面。右半留出海與船道，遠岸只露淡灰輪廓。藍灰暮光、微濕木板和一盞暖燈。只有一人、一副手套中的一隻與一盞油燈。單張手繪動畫電影畫面，無文字與標誌。",
    promptLabel: "構圖提示",
    stillLabel: "開場參考圖",
    motionLabel: "動態提示",
    clipLabel: "影片",
    stillRules: "用碼頭基準圖固定人物、道具與空間關係。單張 16:9，鏡位依本鏡調整。維持藍灰雨夜與琥珀光、手繪動畫質感，畫面只保留敘事需要的元素，無文字或標誌。",
    motionRules: "以相連的開場圖作為構圖與造型參考。6 秒連續單鏡，保持角色、物件及光向一致。全片無對白，聲音在剪輯時接續。",
    shots: [
      { title: "渡船離岸", still: "24mm 感固定遠景。木棚長椅在畫面左側，守夜人在左側中景，門柱暖燈在中線偏右。遠處渡船的輪廓朝畫面右方，尚未接近邊緣。雨線和水面留出深度。", motion: "鏡頭固定。渡船緩慢向畫面右方離開，尾波在後方展開。守夜人停在原位，尾段視線向左下落到長椅。只讓小雨與海面自然動。" },
      { title: "發現手套", still: "50mm 感中近景，鏡頭仍從同一側朝長椅。紅色針織手套在左下三分點，守夜人的右手停在它上方，尚未碰到。袖口保留同一顆黃銅扣，背景保留暖色光斑。", motion: "鎖定鏡頭。右手下移，用指尖碰一下濕掉的紅手套，停一拍後向上收手，手套留在長椅上。最後讓手臂朝右上離開畫面，承接下一鏡的提燈。" },
      { title: "提燈示意", still: "35mm 感平視側中景。守夜人面向畫面右方，右手剛握住從入口柱取下的琥珀燈提把，燈在腰高。柱子留在後景，水面在右側，身體輪廓清楚。", motion: "守夜人將琥珀燈從腰高抬到肩高，朝右側水面停住。相機微推，維持側面，讓燈的輪廓在右上三分線穩定約一秒。雨水順著同一件雨衣落下。" },
      { title: "船掉頭回來", still: "35mm 感越肩遠景。守夜人的肩和肩高琥珀燈在左側近景，水面延伸至右側。渡船仍在右方，船首斜向右外，船燈細小但辨識得出。", motion: "相機固定。遠處渡船沿連續的弧線轉向畫面左側的碼頭，尾波跟著轉彎。守夜人放鬆肩膀，提燈保持可見。末段停留在溫暖燈光和仍在下雨的海面。" },
    ],
  },
  en: {
    name: "Short film workflow · The Last Ferry",
    description: "A 24-second, dialogue-free film from story and continuity to four opening references, four clips, and an editing handoff.",
    category: "Short film workflow",
    stages: ["Story", "Character and location", "Four shots", "Edit and export"],
    guideTitle: "Start here · Production order",
    guide: "1. Read the story, then adapt the character, setting, or ending. Update the downstream prompts when you change a costume or prop.\n2. Run the Pier and props image node from the canvas. That run creates the keeper's wardrobe still and then the pier reference. Check the face, coat, lantern, and bench positions.\n3. Use Generate this shot in the Director Board for each clip. Each clip uses its linked opening reference, and finished upstream assets can be reused. To inspect an opening image first, run its image node from the canvas and review which assets will run again and what they cost before confirming.\n4. Check eyelines, movement, clothing, and props. Download the selected clips and follow the editing notes. Copying creates a draft.",
    storyTitle: "Script · Four beats",
    story: "00–06 s. At blue hour, rain hits an old pier. A keeper watches the last ferry pull away to screen right.\n\n06–12 s. He spots a red mitten on the bench. It is the agreed signal that someone is still waiting for the ferry.\n\n12–18 s. He steps to the water and raises the amber lantern from the entrance post to signal the boat.\n\n18–24 s. The ferry sees the light and turns back toward the pier. The keeper relaxes his shoulders and keeps the lantern in view.",
    editTitle: "Edit · Sound and delivery",
    edit: "Arrange clips 01→02→03→04 in your editor. Aim for 24 seconds, and trim after reviewing where each movement begins and settles.\n00:06 cut from the keeper's downward glance to the red mitten. 00:12 cut on his hand withdrawing and pick up the lantern lift. 00:18 cut from the amber light to the ferry's turning light.\nBridge all four shots with steady rain. Start with a distant engine, dip it for the mitten, add a quiet buckle sound as the lantern lifts, then let the water return. Keep the film dialogue-free.\nMatch aspect ratio, resolution, and frame rate on a 16:9 timeline. Review the keeper, mitten, lamp color, ferry direction, and levels. Export an H.264 MP4 from the editor. The canvas generates the individual clips.",
    wardrobeTitle: "Reference A · Keeper wardrobe",
    wardrobePrompt: "Single wardrobe reference of an adult male ferry keeper in his thirties. He has short dark brown hair, a faint scar at the end of his left eyebrow, a navy oilskin coat with matte brass buttons, charcoal trousers and short black boots. Show one relaxed full-body three-quarter front view with arms down. Warm gray seamless background with soft overcast light. 16:9 hand-painted animated film still, matte cloth and a clear silhouette. Keep the image free of text and logos.",
    pierTitle: "Reference B · Pier and props",
    pierPrompt: "Use the wardrobe reference for the keeper's face and coat. Make a single 16:9 eye-level wide continuity image of the old wooden pier in rain. Looking from shore to sea, the shelter and bench are on the left, with one red knitted mitten on the bench. A warm amber oil lantern hangs on the entrance post just right of center. The keeper stands between bench and post, looking out toward screen right. Leave the right half open for water and the ferry lane, with a faint far shore. Slate-blue dusk, damp timber and one warm light. One keeper, one mitten and one lantern, with no signage or text.",
    promptLabel: "Framing prompt",
    stillLabel: "Opening reference",
    motionLabel: "Motion prompt",
    clipLabel: "Clip",
    stillRules: "Use the pier reference for the keeper, props, and geography. Render one 16:9 frame at the stated angle with slate-blue rain, amber light, and a hand-painted animation finish. Keep the frame free of text and logos.",
    motionRules: "Use the linked opening image as a reference for composition and design. Make a continuous six-second shot with consistent wardrobe, props, and light direction. Keep it dialogue-free and bridge the sound in the edit.",
    shots: [
      { title: "Ferry pulls away", still: "Locked 24mm-style wide shot. Shelter bench on the left, keeper midground on the left, warm lantern on its post just right of center. The distant ferry points screen right with room before the edge. Separate foreground and distance with rain and water.", motion: "Lock the camera. The ferry drifts to screen right and leaves a visible wake. The keeper stays in place, looking down to the bench near the end. Let the rain and water move naturally." },
      { title: "The red mitten", still: "50mm-style medium close shot from the same side of the bench. Place the red mitten at the lower-left third. The keeper's right hand hovers above it, with the familiar brass cuff button visible and warm bokeh behind.", motion: "Hold the camera still. His fingertips touch the damp mitten and pause. He withdraws his hand up and right, leaving the mitten on the bench. Match the withdrawal to the next shot's lantern lift." },
      { title: "Raise the lantern", still: "35mm-style eye-level profile medium shot. The keeper faces screen right. His right hand holds the lantern handle at waist level, just off its entrance post. Keep the post behind him, open water to the right and his silhouette clear.", motion: "He raises the amber lantern from waist to shoulder height and holds it toward the water on screen right. Push in gently from the same side and hold the light on the upper right third for about a second. Rain tracks down the same coat." },
      { title: "The ferry turns", still: "35mm-style over-the-shoulder wide shot. Keeper's shoulder and raised amber lantern are in the left foreground. Water opens to the right. The ferry is distant on the right with its bow angled out and a small clear lamp.", motion: "Hold the camera still. The ferry turns in one continuous arc toward the pier on the left, with its wake following the turn. The keeper relaxes his shoulders while the lantern stays visible. End on warm light and rain over the water." },
    ],
  },
  ja: {
    name: "短編映画の制作フロー · 最後の渡し船",
    description: "セリフのない24秒の短編。脚本と連続性の確認から、4枚の開始参考画像、4本のクリップ、編集と納品まで。",
    category: "短編映画の制作フロー",
    stages: ["物語", "人物と舞台", "4カットの生成", "編集と書き出し"],
    guideTitle: "はじめに · 制作の順序",
    guide: "① 物語を読んで、人物や舞台、結末を調整します。衣装や小道具を変えたら、その先のプロンプトにも反映します。\n② キャンバスで「桟橋と小道具」の画像ノードを実行すると、衣装の画像と桟橋の基準画像が順に作られます。顔とコート、ランタンとベンチの位置を確認します。\n③ 絵コンテの「このカットを生成」で順にクリップを作ります。各クリップに接続された開始画像を使用し、完成済みの上流素材は再利用できます。先に開始画像を確認したい場合は、キャンバスで該当の画像ノードを実行します。確定する前に再生成される素材と費用を確認します。\n④ 視線、動き、衣装と小道具を確認し、採用したクリップをダウンロードして編集メモに沿って仕上げます。複製すると下書きが作成されます。",
    storyTitle: "脚本 · 4つの場面",
    story: "00–06 秒。雨の古い桟橋。見張り役の男性は、最後の渡し船が画面右へ離れていくのを見ている。\n\n06–12 秒。ベンチに赤いミトンがある。まだ船を待つ人がいるという約束の目印だ。\n\n12–18 秒。番人は入り口の支柱から琥珀色のランタンを外し、船に向けて肩まで掲げる。\n\n18–24 秒。灯りに気づいた渡し船が桟橋へ引き返す。番人は肩の力を抜き、灯りを掲げたまま見送る。",
    editTitle: "編集 · 音と書き出し",
    edit: "編集ソフトでクリップを 01→02→03→04 の順に並べます。24秒を目安に、動きの始まりと収まりを見てトリミングします。\n00:06 で番人が下を向く動きからミトンへ。00:12 で手を引く動きからランタンを持ち上げる動きへ。00:18 で琥珀色の灯りから船の回頭へ。\n雨音を全カットに敷きます。最初は遠くのエンジン音を残し、ミトンのカットで下げ、ランタンを掲げるときに小さな金具の音を重ねます。最後は水音を戻します。セリフは入れません。\n編集ソフトの16:9タイムラインで解像度とフレームレートを統一し、人物、ミトン、灯りの色、船の進行方向、音量を確認して H.264 MP4 に書き出します。キャンバスで生成するのはカットごとのクリップです。",
    wardrobeTitle: "基準 A · 見張り役の衣装",
    wardrobePrompt: "桟橋の見張り役を務める30代の男性。濃い茶色の短髪、左の眉尻に薄い傷跡、マットな真鍮ボタンの紺色オイルスキンコート、濃いグレーのズボンと黒いショートブーツ。力を抜いて立つ全身を斜め正面から一人だけ描く。背景は暖灰色、光は曇天のように柔らかい。16:9、手描きのアニメーション映画の質感、布はマットで輪郭は明瞭。文字とロゴのない衣装基準画像。",
    pierTitle: "基準 B · 桟橋と小道具",
    pierPrompt: "衣装画像を顔とコートの基準にして、雨の古い木製桟橋を16:9の目線の高さの広角で描く。岸から海を見る。左に屋根とベンチがあり、ベンチに赤いニットのミトンが片方だけ置かれている。中央やや右の支柱に琥珀色のオイルランタンが掛かる。見張り役はベンチと支柱の間で、画面右の水面を見る。右半分に海と船の航路を残し、向こう岸は灰色にかすむ。青灰色の夕暮れ、濡れた木材と暖かい灯り。人物、ミトン、ランタンはそれぞれひとつ。看板や文字のない一枚絵。",
    promptLabel: "構図プロンプト",
    stillLabel: "開始参考画像",
    motionLabel: "動きのプロンプト",
    clipLabel: "クリップ",
    stillRules: "桟橋の基準画像から人物、小道具、空間の配置を引き継ぐ。指定の角度で16:9の一枚絵を作る。青灰色の雨と琥珀色の光、手描きアニメーションの質感を揃える。文字とロゴのない画面。",
    motionRules: "つないだ開始画像を構図と造形の参考にする。6秒のワンカット。衣装と小道具、光の向きを揃える。セリフを入れず、音のつながりは編集で整える。",
    shots: [
      { title: "渡し船が離れる", still: "24mm相当の固定ロング。左に屋根とベンチ、左中景に見張り役、中央やや右の支柱に暖かいランタン。遠くの渡し船は画面右を向き、画面端まで余白がある。雨と水面で奥行きを作る。", motion: "カメラは固定。渡し船が右へゆっくり進み、後ろに航跡が伸びる。見張り役はその場で立ち、最後に左下のベンチへ視線を落とす。雨と水面は自然に動く。" },
      { title: "赤いミトン", still: "50mm相当のミディアムクローズ。ベンチを同じ側から撮る。赤いミトンは左下の三分割線付近。右手がミトンの上に止まり、袖口に真鍮ボタンが見える。背景に暖色のぼけを残す。", motion: "カメラは固定。濡れたミトンに右手の指先で触れて一拍止め、右上へ手を引く。ミトンはベンチに残す。手の動きを次のランタンを掲げる動きにつなぐ。" },
      { title: "ランタンを掲げる", still: "35mm相当の目線の高さの横向きミディアム。番人は画面右向き。右手で支柱から外したランタンの取っ手を持ち、灯りは腰の高さにある。背後に支柱、右側に海。人物の輪郭は明瞭。", motion: "ランタンを腰から肩の高さまで上げ、画面右の海に向けて止める。同じ側からわずかに寄り、右上の三分割線付近に灯りを約1秒留める。雨粒が同じコートを流れ落ちる。" },
      { title: "渡し船が引き返す", still: "35mm相当の肩越しのロング。左手前に番人の肩と掲げたランタン、右に水面が広がる。右奥の船首は斜め外を向き、小さな船灯が見える。", motion: "カメラは固定。渡し船が一続きの弧を描いて画面左の桟橋へ向き直り、航跡もカーブする。番人は肩の力を抜き、ランタンを掲げたまま。暖かい灯りと雨の水面を最後に残す。" },
    ],
  },
};

export function shortDramaTemplate(locale: Locale): OfficialCanvasTemplate {
  const t = locale === "zh-Hans" ? simplifyChinese(copy["zh-Hant"]) : copy[locale];
  const nodes: CanvasNode[] = [];
  const edges: CanvasGraph["edges"] = [];
  const note = (id: string, title: string, content: string, x: number, y: number, story = false) => {
    nodes.push({ id, type: "text", x, y, width: 330, textHeight: 220, data: { title, text: content, ...(story ? { directorStory: true } : {}) } });
  };
  const still = (id: string, title: string, x: number, y: number) => {
    nodes.push({ id, type: "image", x, y, width: 310, data: { title, model: "gpt-image-2.5-sunburst", prompt: "", size: "2048x1152", quality: "medium" } });
  };
  const wire = (fromNode: string, toNode: string, toPort: "prompt" | "image") => {
    edges.push({ id: `${fromNode}-${toNode}-${toPort}`, fromNode, fromPort: "out", toNode, toPort });
  };

  note("guide", t.guideTitle, t.guide, 40, 40);
  note("story", t.storyTitle, t.story, 40, 410, true);
  note("edit", t.editTitle, t.edit, 40, 780);
  note("wardrobe-prompt", `${t.wardrobeTitle} · ${t.promptLabel}`, t.wardrobePrompt, 430, 40);
  still("wardrobe", t.wardrobeTitle, 430, 410);
  note("pier-prompt", `${t.pierTitle} · ${t.promptLabel}`, t.pierPrompt, 820, 40);
  still("pier", t.pierTitle, 820, 410);
  wire("wardrobe-prompt", "wardrobe", "prompt");
  wire("pier-prompt", "pier", "prompt");
  wire("wardrobe", "pier", "image");

  for (const [index, shot] of t.shots.entries()) {
    const id = `shot-${index + 1}`;
    const title = `${String(index + 1).padStart(2, "0")} · ${shot.title}`;
    const y = 40 + 490 * index;
    note(`${id}-framing`, `${title} · ${t.promptLabel}`, `${shot.still}\n\n${t.stillRules}`, 1230, y);
    still(`${id}-still`, `${title} · ${t.stillLabel}`, 1610, y);
    note(`${id}-motion`, `${title} · ${t.motionLabel}`, `${shot.motion}\n\n${t.motionRules}`, 1990, y);
    nodes.push({
      id, type: "video", x: 2370, y, width: 310,
      data: { title: `${title} · ${t.clipLabel}`, shotTitle: shot.title, shotOrder: index, model: "SIRAYA-Seedance-2.0-mini", prompt: "", seconds: 6, resolution: "720p", aspect_ratio: "16:9", generate_audio: false },
    });
    wire(`${id}-framing`, `${id}-still`, "prompt");
    wire("pier", `${id}-still`, "image");
    wire(`${id}-motion`, id, "prompt");
    wire(`${id}-still`, id, "image");
  }

  return {
    id: SHORT_DRAMA_TEMPLATE_ID, name: t.name, description: t.description, category: t.category,
    graph: { nodes, edges }, stages: t.stages, cover: "/official-canvas-previews/114.svg",
    createdAt: "2026-11-10T00:00:00Z",
  };
}
