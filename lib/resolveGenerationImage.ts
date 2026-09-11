import { get } from "@vercel/blob";
import { SirayaApiError } from "./siraya";
/** Resolve only the caller's own generation images for an explicitly executed node. */
export async function resolveGenerationImage(userId: number, value: string, origin: string): Promise<string> {
 const local = value.startsWith(origin + "/api/media/") ? value.slice(origin.length) : value;
 if (!local.startsWith("/api/media/")) return value;
 const parts = local.slice("/api/media/".length).split("/");
 if (parts.some(p => !p || p === "." || p === ".." || /[\\%?#]/.test(p)) || parts[0] !== "generations" || parts[1] !== String(userId)) throw new SirayaApiError(403,"無權限使用此參考圖", "forbidden");
 const result = await get(parts.join("/"), {access:"private"});
 if (!result || result.statusCode !== 200) throw new SirayaApiError(404,"參考圖已遺失");
 const type = result.blob.contentType?.split(";")[0];
 if (!type || !["image/png","image/jpeg","image/webp"].includes(type)) throw new SirayaApiError(400,"不支援此參考圖片格式");
 const reader = result.stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
 try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 20 * 1024 * 1024) { await reader.cancel(); throw new SirayaApiError(400,"參考圖片超過 20 MB"); } chunks.push(part.value); } } finally {reader.releaseLock();}
 return `data:${type};base64,${Buffer.concat(chunks).toString("base64")}`;
}
