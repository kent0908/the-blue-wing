export const OFFICIAL_CHARACTERS = [
  {id:"yota",name:"小林陽太",src:"/official-characters/yota.jpg"},
  {id:"chinatsu",name:"橘千夏",src:"/official-characters/chinatsu.jpg"},
  {id:"miwa",name:"淺野美羽",src:"/official-characters/miwa.jpg"},
  {id:"mio",name:"白石澪-新裝",src:"/official-characters/mio.jpg"},
  {id:"aoi",name:"神崎葵",src:"/official-characters/aoi.jpg"},
  {id:"ren",name:"藤原蓮",src:"/official-characters/ren.jpg"},
  {id:"toru",name:"鈴木徹",src:"/official-characters/toru.jpg"},
  {id:"takumi",name:"佐藤拓海",src:"/official-characters/takumi.jpg"},
  {id:"sho",name:"高橋翔",src:"/official-characters/sho.jpg"},
  {id:"rina",name:"黑澤玲奈",src:"/official-characters/rina.jpg"},
] as const;
export function officialCharacter(id: unknown) { return OFFICIAL_CHARACTERS.find(c => c.id === id); }
