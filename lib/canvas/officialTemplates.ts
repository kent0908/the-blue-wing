import type { CanvasGraph, CanvasNode } from "./types";
import { officialCharacter } from "./officialCharacters";
const identity = "使用參考三視圖作為唯一角色身份依據。三個視角代表同一個人，不要生成三個不同人物。精確保留臉部、瞳色、髮型、髮色、服裝、配件及身體比例；維持精緻動漫插畫風格，不轉換為真人。配件數量和解剖位置一致，不複製、不鏡像換邊。";
const clean = "畫面乾淨，手部解剖自然，不增加手指或肢體，人物與物件不穿模。不含任何字樣、標籤、數字、簽名、浮水印或商標。";
export interface OfficialCanvasTemplate { id:number; name:string; description:string; category:string; character:string; graph:CanvasGraph; stages:string[]; }
function workflow(id:number,name:string,description:string,category:string,character:string,branches:{title:string;prompt:string;size?:string;video?:string;seconds?:number}[]):OfficialCanvasTemplate {
 const nodes:CanvasNode[]=[{id:"reference",type:"loadImage",x:40,y:140,width:320,data:{title:"01 · 角色三視圖（可更換角色）",items:[],officialCharacter:character}}];
 const edges:CanvasGraph["edges"]=[];
 const wire=(from:string,to:string,port:string)=>edges.push({id:from+"-"+to+"-"+port,fromNode:from,fromPort:"out",toNode:to,toPort:port});
 branches.forEach((branch,i)=>{
  const y=40+i*600,p="prompt-"+i,img="image-"+i;
  nodes.push({id:p,type:"text",x:440,y,width:340,textHeight:260,data:{title:branch.title+" · 提示詞",text:identity+branch.prompt+clean}},
   {id:img,type:"image",x:880,y,width:320,data:{title:branch.title+" · 圖片",model:"gpt-image-2",prompt:"",size:branch.size||"3840x2160",quality:"high"}});
  wire("reference",img,"image");wire(p,img,"prompt");
  if(branch.video){const vp="motion-"+i,v="video-"+i;nodes.push({id:vp,type:"text",x:1280,y,width:340,textHeight:250,data:{title:branch.title+" · 動態提示詞",text:branch.video+clean}}, {id:v,type:"video",x:1720,y,width:320,data:{title:branch.title+" · 影片",model:"SIRAYA-Seedance-2.0-mini",prompt:"",seconds:branch.seconds||6,resolution:"720p",aspect_ratio:"16:9"}});wire(img,v,"image");wire(vp,v,"prompt");}
 });
 return {id,name,description,category,character,graph:{nodes,edges},stages:["角色參考","預填 Prompt","4K 圖片",...(branches.some(b=>b.video)?["720p 影片"]:[])]};
}
export const OFFICIAL_CANVAS_TEMPLATES:OfficialCanvasTemplate[]=[
 workflow(-101,"角色三視圖與四視圖","同一參考分成兩條支線：正／側／背三視圖，以及正／左／右／背四視圖。可單獨執行其中一條。","角色設定","mio",[
  {title:"02 · 三視圖",prompt:"創建專業角色三視圖設定圖。橫向由左至右排列正面、面向畫面左側的90度側面、背面，恰好三個完整全身視角。自然站立，雙臂垂於兩側；頭頂與腳底對齊、相同身高、光線和比例，視角之間留白不重疊。純白攝影棚背景，頭髮至鞋底完整入鏡。背面不可出現位於胸前或前腰的配件。"},
  {title:"03 · 四視圖",prompt:"創建專業角色四視圖設定圖。橫向由左至右排列正面、左側90度、右側90度、背面，恰好四個完整全身視角。兩個側面必須朝相反方向。自然站立，雙臂垂於兩側。保持四個視角相同身高、比例與光線，頭頂、腳底對齊，等距排列不重疊。純白背景，頭髮至鞋底完整入鏡。左右配件按角色自身位置固定，不鏡像複製。"}]),
 workflow(-102,"角色六格表情設定","固定造型與鏡位，建立平靜、喜悅、驚訝、思考、憂傷、堅定六種表情。","角色設定","chinatsu",[
  {title:"02 · 六格表情",prompt:"生成同一角色的六格表情設定圖，兩列三欄等距排列，每格是相同尺寸、相同鏡位的頭肩肖像。依序表現平靜微笑、自然喜悅、輕微驚訝、專注思考、含蓄憂傷、堅定自信。只有表情改變，髮型服裝完全一致，眼神方向自然。白底，柔和均勻光線，格子間以留白分隔，不畫線條，不寫表情名稱。"}]),
 workflow(-103,"電影角色主視覺","三視圖轉單人電影海報構圖，保留負空間供後製，自帶無文字提示詞。","主視覺","rina",[
  {title:"02 · 角色主視覺",size:"2160x3840",prompt:"生成直式電影主視覺，畫面中只出現一位角色。角色以自然站姿位於下方三分之二，面向鏡頭，背景為雨後安靜的城市天台與遠處模糊燈光。青藍環境光與柔和暖色輪廓光，前後景層次清楚，服裝與五官清晰。上方三分之一保留安靜天空作為後製留白，但本次不寫任何海報文字。人物周圍空曠，不讓欄杆遮擋身體。"}]),
 workflow(-104,"短劇三鏡分鏡","同一場景拆成遠景、中景、特寫三張獨立畫面，適合後續剪輯與鏡頭比對。","分鏡設計","ren",[
  {title:"02 · 建立遠景",prompt:"單張16:9電影分鏡。清晨安靜的車站外廣場，單一角色站在空曠步道上等待，雙手自然垂下。廣角遠景，角色全身位於右側三分線，遠處車站建築只作背景。低飽和藍灰色與暖晨光，鏡頭水平。不是多格拼圖。"},
  {title:"03 · 敘事中景",prompt:"單張16:9電影分鏡。清晨安靜的車站外廣場，保持藍灰色背景與暖晨光。同一角色腰部以上中景，稍微抬頭看向畫面左方，流露等待與期待。平視鏡頭，背景輕微虛化，服裝與髮型保持參考一致。不是多格拼圖。"},
  {title:"04 · 情緒特寫",prompt:"單張16:9電影分鏡。清晨車站外廣場，同一角色臉部與肩膀特寫，視線朝畫面左方，嘴角出現克制微笑。背景保留藍灰色與暖晨光散景，柔和側光，眼睛銳利。沒有手部特寫，沒有其他人物，不是多格拼圖。"}]),
 workflow(-105,"平行跟拍工作流","先建立沒有障礙物的單人起始畫面，再生成 6 秒平行跟拍，避免柱子與人物穿模。","影片運鏡","aoi",[
  {title:"02 · 平行跟拍",prompt:"16:9單一角色全身站在開闊海濱步道上，身體朝畫面右方，準備沿直線向右步行。鏡頭位於人物側面且距離穩定，海面與遠山在遠處背景。路面平整，人物前後兩公尺內沒有柱子、樹木、欄杆或任何遮擋，双手放鬆，沒有手持物。下午柔和日光。",video:"以輸入圖片為第一個畫面。6秒單一連續鏡頭：0至1秒角色自然起步；1至5秒角色沿寬闊步道向畫面右方平穩走三至四步，相機以相同速度平行向右跟拍；5至6秒保持平穩步伐。人物在畫面中的尺寸與高度穩定，背景自然視差。只有一個角色，身體完整，不旋轉相機，不切鏡，不讓任何物體從身體穿過；維持輸入圖片的服裝、臉部與畫風。"}]),
 workflow(-106,"三種電影光影比較","同一角色與頭肩構圖，分別設計黃金時刻、柔和窗光、冷暖夜景，便於選擇影片調色方向。","光線與色彩","miwa",[
  {title:"02 · 黃金時刻",prompt:"單一角色頭肩肖像，平視相機，淡淡微笑。黃昏暖金色側逆光描出髮絲，臉部有柔和反光補光，遠方背景是模糊公園。溫暖自然膚色，不過曝，乾淨電影色彩。"},
  {title:"03 · 柔和窗光",prompt:"單一角色頭肩肖像，平視相機，淡淡微笑。室內大窗戶柔和散射光從畫面左側照射，右側保留自然陰影，背景是沒有物件的淺灰牆。中性低飽和色彩、細緻眼神，窗框不能穿過臉部或身體。"},
  {title:"04 · 冷暖夜景",prompt:"單一角色頭肩肖像，平視相機，淡淡微笑。夜晚空曠街道，遠處青藍與暖琥珀色燈光形成柔和散景，臉部以柔和中性補光保持可辨識。沒有可閱讀招牌，沒有強烈閃爍。"}]),
 workflow(-107,"角色登場與緩慢推鏡","角色三視圖先轉為單人場景，再用 8 秒緩推鏡呈現眼神與情緒變化。","影片敘事","yota",[
  {title:"02 · 角色登場",prompt:"16:9電影畫面，單一角色站在空曠的清晨海岸觀景平台中央，以正面全身中遠景呈現。双手自然垂下，角色注視稍偏鏡頭的位置。遠方只有海面、天空和淡淡雲層，柔和晨光，人物周圍不安排任何柱子或近景遮擋物。",seconds:8,video:"以輸入圖作為起始畫面，8秒單一連續鏡頭。0至2秒角色保持自然站姿與呼吸；2至6秒相機沿直線非常緩慢向前推近，從全身中遠景移至胸口以上中景，角色慢慢把目光轉向鏡頭；6至8秒停穩，表情從平靜轉為輕微自信。角色保持原地，雙手自然垂下；相機不穿越人物或任何物體。不切鏡、不突然變焦、不新增人物，不改变脸部服裝與動漫畫風。"}]),
];
export function builtinCanvasTemplate(id:number){return OFFICIAL_CANVAS_TEMPLATES.find(t=>t.id===id);}
export function builtinCanvasSummary(t:OfficialCanvasTemplate){return {id:t.id,name:t.name,description:t.description,nodeCount:t.graph.nodes.length,createdAt:"2026-09-11T00:00:00Z",category:t.category,stages:t.stages,cover:officialCharacter(t.character)?.src};}
