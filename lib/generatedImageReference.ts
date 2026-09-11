import { createHmac, timingSafeEqual } from "node:crypto";
import { trustedOrigin, GENERATION_ASSET_TTL_SECONDS } from "./generationAssetUrls";
function key() { const key = process.env.GENERATION_ASSET_SECRET || process.env.SIRAYA_API_KEY; if (!key) throw new Error("素材分享簽章尚未設定"); return key; }
export function validGenerationPath(path: string) { const parts=path.split("/"); return parts.length>=3 && parts[0]==="generations" && /^[1-9]\d*$/.test(parts[1]) && !parts.some(p=>!p||p==='.'||p==='..'||/[\\%?#]/.test(p)); }
function sign(path:string,expires:number) { return createHmac('sha256',key()).update(`canvas-generation:v1:${expires}:${path}`).digest('hex'); }
export function createGeneratedImageReference(userId:number,path:string,origin:string,now=Math.floor(Date.now()/1000)) {
 if(!validGenerationPath(path)||path.split('/')[1]!==String(userId))throw new Error('無權限使用此參考圖');
 const expires=now+GENERATION_ASSET_TTL_SECONDS;
 return `${trustedOrigin(origin)}/api/canvas/reference?${new URLSearchParams({path,expires:String(expires),token:sign(path,expires)})}`;
}
export function verifyGeneratedImageReference(path:string,expires:number,token:string,now=Math.floor(Date.now()/1000)) {
 if(!validGenerationPath(path)||!Number.isSafeInteger(expires)||expires<=now||expires>now+GENERATION_ASSET_TTL_SECONDS||! /^[a-f0-9]{64}$/.test(token))return false;
 return timingSafeEqual(Buffer.from(token,'hex'),Buffer.from(sign(path,expires),'hex'));
}
