import canvas from './canvasPreviews.json';
import catalog from './officialTemplates.json';
export interface OfficialTemplate { id:string; revision?:number; category:string; title:string; technique:string; character:string; prompt:string; seconds:number; model:string; resolution:string; aspectRatio:string }
export const OFFICIAL_TEMPLATES: OfficialTemplate[] = catalog;
export const CANVAS_PREVIEWS: OfficialTemplate[] = canvas;
export const TEMPLATE_CATEGORIES = ['運鏡','光線','構圖','剪輯','敘事','視覺效果','風格'];
export function getOfficialTemplate(id:string|null|undefined) { return [...OFFICIAL_TEMPLATES,...CANVAS_PREVIEWS].find(item=>item.id===id); }
