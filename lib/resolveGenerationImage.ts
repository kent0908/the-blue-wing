import { SirayaApiError } from "./siraya";
import { createGeneratedImageReference, validGenerationPath } from "./generatedImageReference";
/** Transfer a bounded, expiring URL instead of embedding a 4K image in JSON. */
export async function resolveGenerationImage(userId: number, value: string, origin: string): Promise<string> {
 const local = value.startsWith(origin + "/api/media/") ? value.slice(origin.length) : value;
 if (!local.startsWith("/api/media/")) return value;
 const path=local.slice('/api/media/'.length);
 if(!validGenerationPath(path)||path.split('/')[1]!==String(userId))throw new SirayaApiError(403,'無權限使用此參考圖','forbidden');
 return createGeneratedImageReference(userId,path,origin);
}
