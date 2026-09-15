import canvas from './canvasPreviews.json';
import catalog from './officialTemplates.json';
import { k } from "./i18n/k";
export interface OfficialTemplate { id:string; revision?:number; category:string; title:string; technique:string; character:string; prompt:string; seconds:number; model:string; resolution:string; aspectRatio:string }
export const OFFICIAL_TEMPLATES: OfficialTemplate[] = catalog;
export const CANVAS_PREVIEWS: OfficialTemplate[] = canvas;
export const TEMPLATE_CATEGORIES = [k("運鏡"),k("光線"),k("構圖"),k("剪輯"),k("敘事"),k("視覺效果"),k("風格")];
export function getOfficialTemplate(id:string|null|undefined) { return [...OFFICIAL_TEMPLATES,...CANVAS_PREVIEWS].find(item=>item.id===id); }
