import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { get } from "@vercel/blob";
import sharp from "sharp";
import { sql } from "./db";
import { assetPathPrefix } from "./assets";
import { isAdultVerified, type AdultGateUser } from "./adultGate";
import { BusinessError } from "./businessTypes";
import { SITE_URL } from "./seo/site";

export const BUSINESS_REFERENCE_TTL_SECONDS = 60 * 60;
export const BUSINESS_REFERENCE_MAX_IMAGES = 30;
export const BUSINESS_REFERENCE_MAX_BYTES = 30 * 1024 * 1024;
/** These raster formats are both accepted by Seedance and registered by this site's asset uploader. */
export const BUSINESS_REFERENCE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AAD = Buffer.from("tbw:business:reference-image:v1");
const KEY_PURPOSE = "tbw:business:reference-image:key:v1";
interface ReferenceGrant {
  v: 1; uid: number; aid: string; cid: string; sid: number; adult: boolean; iat: number; exp: number;
}
interface AuthorizationRow extends AdultGateUser {
  account_id: string; user_id: number | string; account_status: string;
  credential_id: string; is_active: boolean; revoked_at: string | null;
  user_status: string; email_verified: boolean;
}
interface ReferenceAsset {
  id: number | string; user_id: number | string; pathname: string; content_type: string; size: number | string;
}
export interface BusinessReferenceImage { type: "image"; url: string; role: "reference_image" }

const positiveInt = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const nowSeconds = () => Math.floor(Date.now() / 1000);
function unavailable(): never { throw new BusinessError("not_found", 404); }

/** Reuse the dedicated BYOK root key, but never the credential-encryption key material or purpose. */
function referenceKey(): Buffer {
  const encoded = process.env.BYOK_ENCRYPTION_KEY ?? "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new BusinessError("encryption_unavailable", 503);
  const root = Buffer.from(encoded, "base64");
  try {
    if (root.length !== 32 || root.toString("base64") !== encoded) throw new BusinessError("encryption_unavailable", 503);
    return createHmac("sha256", root).update(KEY_PURPOSE).digest();
  } finally { root.fill(0); }
}

function seal(grant: ReferenceGrant): string {
  const key = referenceKey();
  const plaintext = Buffer.from(JSON.stringify(grant));
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
  } finally { key.fill(0); plaintext.fill(0); }
}

/** Authenticate and validate the entire grant before any database or storage lookup. */
function unseal(token: string): ReferenceGrant {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{80,1024}$/.test(token)) unavailable();
  const bytes = Buffer.from(token, "base64url");
  if (bytes[0] !== 1 || bytes.toString("base64url") !== token) unavailable();
  const key = referenceKey();
  let plaintext: Buffer | undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(1, 13));
    decipher.setAAD(AAD);
    decipher.setAuthTag(bytes.subarray(13, 29));
    plaintext = Buffer.concat([decipher.update(bytes.subarray(29)), decipher.final()]);
    const value: unknown = JSON.parse(plaintext.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) unavailable();
    const grant = value as ReferenceGrant;
    const now = nowSeconds();
    if (Object.keys(value).sort().join(",") !== "adult,aid,cid,exp,iat,sid,uid,v" || grant.v !== 1 ||
      !positiveInt(grant.uid) || !positiveInt(grant.sid) || typeof grant.aid !== "string" || !UUID.test(grant.aid) ||
      typeof grant.cid !== "string" || !UUID.test(grant.cid) || typeof grant.adult !== "boolean" ||
      !positiveInt(grant.iat) || !positiveInt(grant.exp) || grant.iat > now || grant.exp <= now ||
      grant.exp - grant.iat !== BUSINESS_REFERENCE_TTL_SECONDS || grant.exp > now + BUSINESS_REFERENCE_TTL_SECONDS) unavailable();
    return grant;
  } catch { return unavailable(); }
  finally { key.fill(0); plaintext?.fill(0); }
}

async function authorized(userId: number, accountId: string, credentialId: string, adult: boolean, requireActive = true): Promise<boolean> {
  const { rows } = await sql.query<AuthorizationRow>(`
    select a.id as account_id,a.user_id,a.status as account_status,
      c.id as credential_id,c.is_active,c.revoked_at,u.status as user_status,u.email_verified,u.birth_date,u.adult_confirmed_at
    from business_accounts a
    join business_credentials c on c.account_id=a.id and c.user_id=a.user_id and c.provider='siraya'
    join users u on u.id=a.user_id
    where a.id=$1::uuid and a.user_id=$2 and c.id=$3::uuid limit 1`, [accountId, userId, credentialId]);
  const row = rows[0];
  return !!row && row.account_id === accountId && Number(row.user_id) === userId && row.credential_id === credentialId &&
    row.account_status === "approved" && (!requireActive || row.is_active === true) && row.revoked_at === null &&
    row.user_status === "active" && row.email_verified === true && (!adult || isAdultVerified(row));
}

function validAsset(asset: ReferenceAsset | undefined, userId: number): asset is ReferenceAsset {
  if (!asset || Number(asset.user_id) !== userId || !positiveInt(Number(asset.id)) ||
    !BUSINESS_REFERENCE_IMAGE_TYPES.has(asset.content_type) || !positiveInt(Number(asset.size)) || Number(asset.size) >= BUSINESS_REFERENCE_MAX_BYTES) return false;
  // A database pathname is still untrusted: never let Blob's get() accept an arbitrary URL or another storage namespace.
  return typeof asset.pathname === "string" && asset.pathname.startsWith(assetPathPrefix(userId)) &&
    /^[A-Za-z0-9_./-]+$/.test(asset.pathname) && asset.pathname.split("/").every(part => !!part && part !== "." && part !== "..");
}

/** Server-owned references only. The opaque grant contains no API key, plaintext account ID or asset URL. */
export async function createBusinessReferenceUrls(
  userId: number, accountId: string, credentialId: string, assetIds: number[], nsfw: boolean,
): Promise<BusinessReferenceImage[]> {
  if (!positiveInt(userId) || !UUID.test(accountId) || !UUID.test(credentialId) || typeof nsfw !== "boolean" ||
    !Array.isArray(assetIds) || assetIds.length > BUSINESS_REFERENCE_MAX_IMAGES || assetIds.some(id => !positiveInt(id)) ||
    new Set(assetIds).size !== assetIds.length) throw new BusinessError("invalid_reference");
  if (!assetIds.length) return [];
  if (!await authorized(userId, accountId, credentialId, nsfw)) throw new BusinessError("invalid_reference");
  const { rows } = await sql.query<ReferenceAsset>(
    "select id,user_id,pathname,content_type,size from assets where user_id=$1 and id=any($2::bigint[])", [userId, assetIds]);
  const byId = new Map(rows.map(asset => [Number(asset.id), asset]));
  if (rows.length !== assetIds.length || assetIds.some(id => !validAsset(byId.get(id), userId))) throw new BusinessError("invalid_reference");
  // Fail invalid dimensions/bytes before the caller reserves or submits a billable task. Sequential reads bound memory to one file.
  try {
    for (const id of assetIds) await readVerifiedReferenceImage(byId.get(id)!);
  } catch { throw new BusinessError("invalid_reference"); }
  if (!await authorized(userId, accountId, credentialId, nsfw)) throw new BusinessError("invalid_reference");
  const iat = nowSeconds();
  return assetIds.map(sid => ({ type: "image", role: "reference_image", url: new URL(
    `/api/business/references/${seal({ v: 1, uid: userId, aid: accountId, cid: credentialId, sid, adult: nsfw, iat, exp: iat + BUSINESS_REFERENCE_TTL_SECONDS })}`,
    SITE_URL,
  ).toString() }));
}

function sniffRaster(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  const head = Buffer.from(bytes.subarray(0, 12)).toString("ascii");
  if (head.startsWith("GIF87a") || head.startsWith("GIF89a")) return "image/gif";
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return "image/webp";
  return null;
}

async function readVerifiedReferenceImage(asset: ReferenceAsset, signal?: AbortSignal): Promise<Buffer> {
  const deadline = AbortSignal.timeout(30_000);
  const abortSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const blob = await get(asset.pathname, { access: "private", useCache: false, abortSignal });
  if (!blob || blob.statusCode !== 200) unavailable();
  const expected = Number(asset.size);
  const length = blob.headers.get("content-length");
  if (blob.blob.contentType.split(";")[0].trim().toLowerCase() !== asset.content_type || blob.blob.size !== expected ||
    (length !== null && (!/^[1-9]\d*$/.test(length) || Number(length) !== expected))) {
    await blob.stream.cancel().catch(() => {});
    unavailable();
  }
  const reader = blob.stream.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let bytes: Buffer;
  try {
    // Fully validate one bounded file before committing HTTP 200. No Base64 expansion or batch-wide buffering.
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      received += next.value.byteLength;
      if (received > expected || received >= BUSINESS_REFERENCE_MAX_BYTES) unavailable();
      chunks.push(next.value);
    }
    bytes = Buffer.concat(chunks);
    chunks.length = 0;
    if (received !== expected || sniffRaster(bytes) !== asset.content_type) unavailable();
    const metadata = await sharp(bytes, { animated: false, limitInputPixels: 36_000_000 }).metadata();
    const formats: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (formats[metadata.format ?? ""] !== asset.content_type || width < 300 || width > 6000 || height < 300 || height > 6000 ||
      width / height < 0.4 || width / height > 2.5) unavailable();
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error instanceof BusinessError ? error : new BusinessError("not_found", 404);
  } finally { reader.releaseLock(); }
  return bytes;
}

/** Cookie-free vendor fetch: the time-limited bearer grant is re-authorized against live rows on every GET. */
export async function businessReferenceImageResponse(token: string, signal?: AbortSignal): Promise<Response> {
  const grant = unseal(token);
  // A normal key rotation retires the pinned version but must not break an already submitted job's source fetch.
  // Only active versions can mint grants; existing grants remain bounded by expiry and explicit revocation.
  if (!await authorized(grant.uid, grant.aid, grant.cid, grant.adult, false)) unavailable();
  const { rows } = await sql.query<ReferenceAsset>(
    "select id,user_id,pathname,content_type,size from assets where user_id=$1 and id=$2 limit 1", [grant.uid, grant.sid]);
  const asset = rows[0];
  if (!validAsset(asset, grant.uid) || Number(asset.id) !== grant.sid) unavailable();
  const bytes = await readVerifiedReferenceImage(asset, signal);
  let offset = 0;
  // Streaming the validated bytes avoids a single large serverless response body or provider data URL.
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) { controller.close(); return; }
      const end = Math.min(offset + 64 * 1024, bytes.length);
      controller.enqueue(new Uint8Array(bytes.buffer, bytes.byteOffset + offset, end - offset));
      offset = end;
    },
  });
  return new Response(stream, { headers: {
    "Content-Type": asset.content_type,
    "Content-Length": String(bytes.length),
    "Cache-Control": "private, no-store, max-age=0",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Content-Disposition": "inline",
  } });
}
