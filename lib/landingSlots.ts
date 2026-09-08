/** Shared public/admin slot definitions; original keys remain unchanged. */
export const LANDING_SECTIONS = [
 {key:"video",label:"影片創作"}, {key:"image",label:"圖片創作"},
 {key:"canvas",label:"智慧畫布"}, {key:"companions",label:"AI 陪聊"},
] as const;
export function landingGallerySlots(section: string) { return [section, `${section}-2`, `${section}-3`]; }
export const LANDING_SLOTS = [
 {key:"hero",label:"啟程主視覺",hint:"原有主視覺圖片或影片"},
 ...LANDING_SECTIONS.flatMap(section=>landingGallerySlots(section.key).map((key,i)=>({key,label:`${section.label} · ${i===0?'主展示':`延伸展示 ${i}`}`,hint:i===0?'大型主展示':'主展示右側，可獨立上傳圖片或影片'}))),
];
const keys=new Set(LANDING_SLOTS.map(s=>s.key));
export function isLandingSlot(key:string){return keys.has(key);}
