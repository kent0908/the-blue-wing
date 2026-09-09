import 'server-only';
import media from './officialTemplateMedia.json';
export function getOfficialTemplateMedia(id:string) { return (media as Record<string,{pathname:string;assetId:number}>)[id]; }
