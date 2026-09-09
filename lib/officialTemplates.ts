import catalog from './officialTemplates.json';
export interface OfficialTemplate { id:string; category:string; title:string; technique:string; character:string; prompt:string; seconds:number; model:string; resolution:string; aspectRatio:string }
export const OFFICIAL_TEMPLATES: OfficialTemplate[] = catalog;
export const TEMPLATE_CATEGORIES = ['運鏡','光線','構圖','剪輯','敘事','視覺效果','風格'];
export function getOfficialTemplate(id:string|null|undefined) { return OFFICIAL_TEMPLATES.find(item=>item.id===id); }
