import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from "node:crypto";
import { get, head } from "@vercel/blob";
import sharp from "sharp";
import { sql } from "./db";
import { BusinessError, getBusinessCredential } from "./business";
import { SITE_URL } from "./seo/site";
import { BusinessProviderAssetSubmitError, getBusinessProviderAsset, registerBusinessProviderAsset, type BusinessProviderAsset, type BusinessProviderAssetType } from "./businessProviderAssets";
import { isAdultVerified, type AdultGateUser } from "./adultGate";

const MiB = 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AAD = Buffer.from("tbw:business:asset-upload-source:v1");
const TTL = 3600;
export const BUSINESS_UPLOAD_TYPES: Record<string, { type: BusinessProviderAssetType; maxBytes: number; ext: string }> = {
  "image/png": { type: "image", maxBytes: 30 * MiB - 1, ext: "png" }, "image/jpeg": { type: "image", maxBytes: 30 * MiB - 1, ext: "jpg" },
  "image/webp": { type: "image", maxBytes: 30 * MiB - 1, ext: "webp" }, "image/gif": { type: "image", maxBytes: 30 * MiB - 1, ext: "gif" },
  "video/mp4": { type: "video", maxBytes: 50 * MiB, ext: "mp4" }, "video/quicktime": { type: "video", maxBytes: 50 * MiB, ext: "mov" },
  "audio/wav": { type: "audio", maxBytes: 15 * MiB, ext: "wav" }, "audio/x-wav": { type: "audio", maxBytes: 15 * MiB, ext: "wav" },
  "audio/mpeg": { type: "audio", maxBytes: 15 * MiB, ext: "mp3" },
};
interface UploadRow {
  id: string; account_id: string; user_id: number | string; credential_id: string; client_request_id: string; pathname: string;
  filename: string; content_type: string; media_type: BusinessProviderAssetType; expected_bytes: number | string; blob_etag: string | null;
  status: "created" | "registering" | "processing" | "active" | "failed" | "unknown"; provider_asset_id: string | null;
  error_code: string | null; expires_at: string | Date; created_at: string | Date;
}
interface SourceGrant { v: 1; id: string; uid: number; aid: string; cid: string; adult: boolean; iat: number; exp: number }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function fail(code = "business_asset_upload_invalid", status = 400): never { throw new BusinessError(code, status); }
function sourceMissing(): never { return fail("not_found", 404); }
const filename = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim() || value.length > 120 || /[\x00-\x1f\x7f]/.test(value) || /\b(?:sk|csk)-[A-Za-z0-9_-]{16,}/i.test(value)) fail();
  return value.trim();
};

export function businessDirectUploadReady(): boolean { return !!process.env.BLOB_READ_WRITE_TOKEN; }
export function publicBusinessUpload(row: UploadRow) {
  return { id: row.id, uploadId: row.id, name: row.filename, type: row.media_type, status: row.status, storageReady: !!row.blob_etag,
    ...(row.provider_asset_id ? { asset: { id: row.provider_asset_id, uploadId: row.id, storageReady: !!row.blob_etag, name: row.filename, type: row.media_type, status: row.status } } : {}),
    ...(row.error_code ? { errorCode: row.error_code } : {}), createdAt: new Date(row.created_at).toISOString() };
}
export async function listBusinessUploads(userId: number, accountId: string) {
  const { rows } = await sql.query<UploadRow>("select * from business_asset_uploads where user_id=$1 and account_id=$2 order by created_at desc limit 60", [userId, accountId]);
  return rows.filter(validStoredPath).map(publicBusinessUpload);
}
async function currentCredential(userId: number, accountId: string) {
  const credential = await getBusinessCredential(userId, accountId);
  if (!credential) fail("credential_required", 409);
  return credential;
}
function validStoredPath(row: UploadRow): boolean {
  return row.pathname === `business-assets/${row.account_id}/${row.id}/source.${BUSINESS_UPLOAD_TYPES[row.content_type]?.ext}`;
}
async function ownedUpload(userId: number, accountId: string, id: string): Promise<UploadRow> {
  if (!UUID.test(id)) fail();
  const { rows } = await sql.query<UploadRow>(`select t.* from business_asset_uploads t join business_accounts a on a.id=t.account_id and a.user_id=t.user_id
    where t.id=$1 and t.user_id=$2 and t.account_id=$3 and a.status='approved' limit 1`, [id, userId, accountId]);
  const row = rows[0];
  if (!row || !validStoredPath(row)) fail("not_found", 404);
  return row;
}

/** Reserve an idempotent, server-owned private path. Client data never selects the Blob destination. */
export async function initializeBusinessUpload(userId: number, accountId: string, body: Record<string, unknown>) {
  if (Object.keys(body).some(key => !["action", "clientRequestId", "name", "contentType", "size"].includes(key)) ||
    body.action !== "initialize" || typeof body.clientRequestId !== "string" || !UUID.test(body.clientRequestId) ||
    typeof body.contentType !== "string" || !BUSINESS_UPLOAD_TYPES[body.contentType] || typeof body.size !== "number" || !Number.isSafeInteger(body.size)) fail();
  const name = filename(body.name), type = BUSINESS_UPLOAD_TYPES[body.contentType];
  if (body.size <= 0 || body.size > type.maxBytes) fail("business_asset_upload_too_large", 413);
  if (!businessDirectUploadReady()) fail("business_asset_storage_unavailable", 503);
  const credential = await currentCredential(userId, accountId);
  const id = randomUUID(), pathname = `business-assets/${accountId}/${id}/source.${type.ext}`;
  const client = await sql.connect();
  try {
    await client.query("BEGIN");
    const access = await client.query("select a.id from business_accounts a join business_credentials c on c.account_id=a.id and c.user_id=a.user_id where a.id=$1 and a.user_id=$2 and a.status='approved' and c.id=$3 and c.is_active and c.revoked_at is null for update of a", [accountId, userId, credential.id]);
    if (!access.rows.length) fail("credential_changed", 409);
    const existing = await client.query<UploadRow>("select * from business_asset_uploads where account_id=$1 and client_request_id=$2 limit 1", [accountId, body.clientRequestId]);
    let row = existing.rows[0];
    if (row) {
      if (row.filename !== name || row.content_type !== body.contentType || Number(row.expected_bytes) !== body.size || row.credential_id !== credential.id) fail("business_asset_upload_conflict", 409);
    } else {
      const count = await client.query<{ count: string }>("select count(*) from business_asset_uploads where account_id=$1 and expires_at>now() and status in ('created','registering','unknown')", [accountId]);
      if (Number(count.rows[0]?.count ?? 0) >= 12) fail("business_asset_upload_limit", 429);
      row = (await client.query<UploadRow>(`insert into business_asset_uploads(id,account_id,user_id,credential_id,client_request_id,pathname,filename,content_type,media_type,expected_bytes)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`, [id, accountId, userId, credential.id, body.clientRequestId, pathname, name, body.contentType, type.type, body.size])).rows[0];
    }
    if (!row || !validStoredPath(row) || new Date(row.expires_at).getTime() <= Date.now()) fail("business_asset_upload_expired", 409);
    await client.query("COMMIT");
    return { upload: publicBusinessUpload(row), pathname: row.pathname, contentType: row.content_type, size: Number(row.expected_bytes) };
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}

/** Called only by the signed-in Blob token handler. No callback or arbitrary prefix is trusted. */
export async function businessUploadTokenOptions(userId: number, accountId: string, pathname: string, clientPayload: string | null) {
  let body: unknown;
  try { body = JSON.parse(clientPayload ?? ""); } catch { fail(); }
  if (!record(body) || Object.keys(body).join(",") !== "uploadId" || typeof body.uploadId !== "string") fail();
  const row = await ownedUpload(userId, accountId, body.uploadId);
  const credential = await currentCredential(userId, accountId);
  if (row.credential_id !== credential.id || row.pathname !== pathname || row.status !== "created" || new Date(row.expires_at).getTime() <= Date.now()) fail("business_asset_upload_expired", 409);
  return { allowedContentTypes: [row.content_type], maximumSizeInBytes: Number(row.expected_bytes), addRandomSuffix: false, allowOverwrite: false,
    validUntil: Math.min(Date.now() + 15 * 60_000, new Date(row.expires_at).getTime()) };
}

function sourceKey(): Buffer {
  const encoded = process.env.BYOK_ENCRYPTION_KEY ?? "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) fail("encryption_unavailable", 503);
  const key = Buffer.from(encoded, "base64");
  try {
    if (key.length !== 32 || key.toString("base64") !== encoded) fail("encryption_unavailable", 503);
    return createHmac("sha256", key).update("tbw:business:asset-upload-source:key:v1").digest();
  } finally { key.fill(0); }
}
function sourceUrl(row: UploadRow, credentialId = row.credential_id, adult = false): string {
  const iat = Math.floor(Date.now() / 1000);
  const grant: SourceGrant = { v: 1, id: row.id, uid: Number(row.user_id), aid: row.account_id, cid: credentialId, adult, iat, exp: iat + TTL };
  const key = sourceKey(), iv = randomBytes(12), bytes = Buffer.from(JSON.stringify(grant));
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
    const token = Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
    return new URL(`/api/business/provider-assets/source/${token}`, SITE_URL).toString();
  } finally { key.fill(0); bytes.fill(0); }
}
function unsealSource(token: string): SourceGrant {
  if (!/^[A-Za-z0-9_-]{80,1500}$/.test(token)) sourceMissing();
  const buffer = Buffer.from(token, "base64url");
  if (buffer[0] !== 1 || buffer.toString("base64url") !== token) sourceMissing();
  const key = sourceKey(); let plaintext: Buffer | undefined;
  try {
    const cipher = createDecipheriv("aes-256-gcm", key, buffer.subarray(1, 13)); cipher.setAAD(AAD); cipher.setAuthTag(buffer.subarray(13, 29));
    plaintext = Buffer.concat([cipher.update(buffer.subarray(29)), cipher.final()]);
    const body: unknown = JSON.parse(plaintext.toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (!record(body) || Object.keys(body).sort().join(",") !== "adult,aid,cid,exp,iat,id,uid,v" || body.v !== 1 || typeof body.adult !== "boolean" ||
      typeof body.id !== "string" || !UUID.test(body.id) || typeof body.aid !== "string" || !UUID.test(body.aid) || typeof body.cid !== "string" || !UUID.test(body.cid) ||
      typeof body.uid !== "number" || !Number.isSafeInteger(body.uid) || body.uid < 1 || typeof body.iat !== "number" || !Number.isSafeInteger(body.iat) ||
      typeof body.exp !== "number" || !Number.isSafeInteger(body.exp) || body.exp - body.iat !== TTL || body.iat > now || body.exp <= now) sourceMissing();
    return body as unknown as SourceGrant;
  } catch { return sourceMissing(); }
  finally { key.fill(0); plaintext?.fill(0); }
}

function sniffMedia(bytes: Buffer, mime: string): boolean {
  if (bytes.length < 12) return false;
  const text = bytes.toString("ascii", 0, 12);
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/webp") return text.startsWith("RIFF") && text.slice(8) === "WEBP";
  if (mime === "image/gif") return text.startsWith("GIF87a") || text.startsWith("GIF89a");
  if (mime === "audio/wav" || mime === "audio/x-wav") return text.startsWith("RIFF") && text.slice(8) === "WAVE";
  if (mime === "audio/mpeg") return text.startsWith("ID3") || bytes[0] === 255 && (bytes[1] & 224) === 224;
  if (["video/mp4", "video/quicktime"].includes(mime)) return bytes.toString("ascii", 4, 8) === "ftyp" && bytes.readUInt32BE(0) >= 12;
  return false;
}

export interface BusinessImageSourceConstraints { minSide: number; maxBytes: number; mimeTypes: readonly string[] }
async function verifyStoredUpload(row: UploadRow, constraints?: BusinessImageSourceConstraints): Promise<string> {
  if (!validStoredPath(row)) fail();
  if(constraints&&(!constraints.mimeTypes.includes(row.content_type)||Number(row.expected_bytes)>constraints.maxBytes))fail("invalid_reference");
  let metadata: Awaited<ReturnType<typeof head>>;
  try { metadata = await head(row.pathname); } catch { fail("business_asset_upload_missing", 404); }
  if (metadata.pathname !== row.pathname || metadata.contentType.split(";")[0].toLowerCase() !== row.content_type || metadata.size !== Number(row.expected_bytes)) fail();
  const blob = await get(row.pathname, { access: "private", useCache: false, abortSignal: AbortSignal.timeout(60_000) });
  if (!blob || blob.statusCode !== 200 || blob.blob.pathname !== row.pathname || blob.blob.contentType.split(";")[0].toLowerCase() !== row.content_type || blob.blob.size !== Number(row.expected_bytes) || blob.blob.etag !== metadata.etag) {
    if(blob?.statusCode===200)await blob.stream.cancel().catch(()=>{});
    fail();
  }
  const reader = blob.stream.getReader(), chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > Number(row.expected_bytes)) fail();
      chunks.push(next.value);
      // For video/audio, type and Blob size are checked here. The provider
      // processes the full codec/duration before returning an active asset.
      if (row.media_type !== "image" && bytes >= 64) break;
    }
    const prefix = Buffer.concat(chunks);
    if (!sniffMedia(prefix, row.content_type)) fail();
    if (row.media_type === "image") {
      if (bytes !== Number(row.expected_bytes)) fail();
      const info = await sharp(prefix, { animated: false, limitInputPixels: 36_000_000 }).metadata();
      const types: Record<string,string> = { png:"image/png",jpeg:"image/jpeg",webp:"image/webp",gif:"image/gif" };
      const width = info.width ?? 0, height = info.height ?? 0;
      // This is a general B-side library, not a Seedance-only image picker.
      // Per-model dimensions and duration remain the model's contract.
      if (types[info.format ?? ""] !== row.content_type || width < (constraints?.minSide??1) || width > 6000 || height < (constraints?.minSide??1) || height > 6000) fail();
      // Metadata can succeed for a truncated raster. Decode the first frame
      // before registering or granting the private source to a paid model.
      await sharp(prefix, { animated: false, limitInputPixels: 36_000_000 }).stats();
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return metadata.etag;
}

/** A completed Blob upload is verified before any provider registration POST. */
export async function completeBusinessUpload(userId: number, accountId: string, id: string) {
  const row = await ownedUpload(userId, accountId, id);
  const credential = await currentCredential(userId, accountId);
  if (row.credential_id !== credential.id) fail("credential_changed", 409);
  if (row.status !== "created") return { upload: publicBusinessUpload(row) };
  if (new Date(row.expires_at).getTime() <= Date.now()) fail("business_asset_upload_expired", 409);
  let etag: string;
  try { etag = await verifyStoredUpload(row); } catch (error) {
    if (error instanceof BusinessError) throw error;
    fail("business_asset_upload_invalid");
  }
  const grant = sourceUrl(row); // Check encryption before claiming the one provider submission.
  const claimed = await sql.query<UploadRow>(`update business_asset_uploads t set status='registering',blob_etag=$4,updated_at=now()
    where t.id=$1 and t.user_id=$2 and t.account_id=$3 and t.status='created' and t.expires_at>now()
    and exists(select 1 from business_accounts a join business_credentials c on c.account_id=a.id and c.user_id=a.user_id
      where a.id=t.account_id and a.user_id=t.user_id and a.status='approved' and c.id=t.credential_id and c.is_active and c.revoked_at is null) returning t.*`, [id,userId,accountId,etag]);
  if (!claimed.rows[0]) return { upload: publicBusinessUpload(await ownedUpload(userId,accountId,id)) };
  try {
    const asset = await registerBusinessProviderAsset({ url: grant, name: row.filename, type: row.media_type }, { apiKey: credential.apiKey });
    const saved = await sql.query<UploadRow>("update business_asset_uploads set status=$2,provider_asset_id=$3,error_code=null,updated_at=now() where id=$1 returning *", [id,asset.status,asset.id]);
    if (!saved.rows[0]) fail("business_asset_upload_uncertain", 502);
    return { upload: publicBusinessUpload(saved.rows[0]) };
  } catch (error) {
    const uncertain = !(error instanceof BusinessProviderAssetSubmitError) || error.uncertain;
    const code = uncertain ? "business_asset_upload_uncertain" : "business_asset_upload_rejected";
    const saved = await sql.query<UploadRow>("update business_asset_uploads set status=$2,error_code=$3,updated_at=now() where id=$1 returning *", [id,uncertain?"unknown":"failed",code]);
    if (!saved.rows[0]) fail(code, 502);
    return { upload: publicBusinessUpload(saved.rows[0]) };
  }
}

export async function refreshBusinessUploadAsset(userId: number, accountId: string, id: string): Promise<BusinessProviderAsset> {
  const credential = await currentCredential(userId,accountId);
  const asset = await getBusinessProviderAsset(id,{apiKey:credential.apiKey});
  await sql.query("update business_asset_uploads set status=$4,error_code=null,updated_at=now() where user_id=$1 and account_id=$2 and provider_asset_id=$3 and credential_id=$5",[userId,accountId,id,asset.status,credential.id]);
  return asset;
}

/** Generic image models receive only server-created HTTPS grants, never asset:// IDs. */
export async function resolveBusinessUploadSources(userId: number, accountId: string, credentialId: string, uploadIds: string[], nsfw: boolean, constraints?: BusinessImageSourceConstraints): Promise<{ type: "image"; url: string }[]> {
  if (!Number.isSafeInteger(userId) || userId < 1 || !UUID.test(accountId) || !UUID.test(credentialId) || typeof nsfw !== "boolean" ||
    !Array.isArray(uploadIds) || uploadIds.length > 16 || uploadIds.some(id => typeof id !== "string" || !UUID.test(id)) || new Set(uploadIds).size !== uploadIds.length) fail("invalid_reference");
  if(constraints&&(!Number.isSafeInteger(constraints.minSide)||constraints.minSide<1||constraints.minSide>6000||!Number.isSafeInteger(constraints.maxBytes)||constraints.maxBytes<1||constraints.maxBytes>=30*MiB||!Array.isArray(constraints.mimeTypes)||!constraints.mimeTypes.length||constraints.mimeTypes.some(type=>!BUSINESS_UPLOAD_TYPES[type]||BUSINESS_UPLOAD_TYPES[type].type!=="image")))fail("invalid_reference");
  if (!uploadIds.length) return [];
  const { rows } = await sql.query<UploadRow & AdultGateUser>(`select t.*,u.birth_date,u.adult_confirmed_at from business_asset_uploads t
    join business_accounts a on a.id=t.account_id and a.user_id=t.user_id
    join business_credentials c on c.account_id=t.account_id and c.user_id=t.user_id
    join users u on u.id=t.user_id where t.user_id=$1 and t.account_id=$2 and t.id=any($3::uuid[])
    and a.status='approved' and c.id=$4 and c.is_active and c.revoked_at is null and u.status='active' and u.email_verified`,[userId,accountId,uploadIds,credentialId]);
  const map=new Map(rows.map(row=>[row.id,row]));
  if(rows.length!==uploadIds.length||uploadIds.some(id=>{const row=map.get(id);return !row||!validStoredPath(row)||row.media_type!=="image"||!row.blob_etag||
    !BUSINESS_UPLOAD_TYPES[row.content_type]||Number(row.expected_bytes)>BUSINESS_UPLOAD_TYPES[row.content_type].maxBytes||nsfw&&!isAdultVerified(row);})){fail("invalid_reference");}
  // Sequential reads keep memory to one image and verify the immutable source
  // bytes/ETag before the caller reserves any billable image generation.
  try{for(const id of uploadIds){const row=map.get(id)!;if(await verifyStoredUpload(row,constraints)!==row.blob_etag)fail("invalid_reference");}}
  catch{fail("invalid_reference");}
  return uploadIds.map(id=>({type:"image",url:sourceUrl(map.get(id)!,credentialId,nsfw)}));
}

/** Cookie-free fetch for SIRAYA only. The opaque short-lived grant is never sent to the browser. */
export async function businessUploadSourceResponse(token: string, signal?: AbortSignal): Promise<Response> {
  const grant = unsealSource(token);
  const {rows}=await sql.query<UploadRow & AdultGateUser>(`select t.*,u.birth_date,u.adult_confirmed_at from business_asset_uploads t
    join business_accounts a on a.id=t.account_id and a.user_id=t.user_id
    join business_credentials c on c.id=$4 and c.account_id=t.account_id and c.user_id=t.user_id
    join users u on u.id=t.user_id where t.id=$1 and t.user_id=$2 and t.account_id=$3
    and a.status='approved' and c.revoked_at is null and u.status='active' and u.email_verified
    and t.blob_etag is not null limit 1`,[grant.id,grant.uid,grant.aid,grant.cid]);
  const row=rows[0];
  if(!row||!validStoredPath(row)||!row.blob_etag||!BUSINESS_UPLOAD_TYPES[row.content_type]||Number(row.expected_bytes)>BUSINESS_UPLOAD_TYPES[row.content_type].maxBytes||grant.adult&&!isAdultVerified(row))sourceMissing();
  return storedBusinessAssetResponse(row,signal);
}

export async function businessUploadPreviewResponse(userId:number,accountId:string,id:string,signal?:AbortSignal):Promise<Response>{
  const row=await ownedUpload(userId,accountId,id);
  if(!row.blob_etag||row.media_type!=="image")sourceMissing();
  return storedBusinessAssetResponse(row,signal,true);
}

async function storedBusinessAssetResponse(row:UploadRow,signal?:AbortSignal,preview=false):Promise<Response>{
  const abortSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(120_000)]):AbortSignal.timeout(120_000);
  const blob=await get(row.pathname,{access:"private",useCache:false,abortSignal});
  if(!blob||blob.statusCode!==200||blob.blob.pathname!==row.pathname||blob.blob.size!==Number(row.expected_bytes)||blob.blob.etag!==row.blob_etag||blob.blob.contentType.split(";")[0].toLowerCase()!==row.content_type){if(blob?.statusCode===200)await blob.stream.cancel().catch(()=>{});sourceMissing();}
  let received=0;
  const stream=blob.stream.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
    transform(chunk,controller){received+=chunk.byteLength;if(received>Number(row.expected_bytes))throw new Error("invalid_asset_length");controller.enqueue(chunk);},
    flush(){if(received!==Number(row.expected_bytes))throw new Error("invalid_asset_length");},
  }));
  return new Response(stream,{headers:{"Content-Type":row.content_type,"Content-Length":String(row.expected_bytes),"Content-Disposition":`${preview?"inline":"attachment"}; filename="source.${BUSINESS_UPLOAD_TYPES[row.content_type].ext}"`,"Cache-Control":"private, no-store, max-age=0","Pragma":"no-cache","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox","Referrer-Policy":"no-referrer"}});
}
