import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { get } from "@vercel/blob";
import sharp from "sharp";
import { sql } from "./db";
import { assetPathPrefix } from "./assets";
import { isAdultVerified, type AdultGateUser } from "./adultGate";
import { BusinessError } from "./businessTypes";
import { SITE_URL } from "./seo/site";
import { WAN3_MAX_REFERENCE_VIDEOS, WAN3_REFERENCE_VIDEO_MAX_BYTES, wan3ReferenceVideoExtension } from "./businessWan3";
import { inspectWanReferenceVideo } from "./wanReferenceVideo";

export const BUSINESS_REFERENCE_TTL_SECONDS = 60 * 60;
export const BUSINESS_REFERENCE_MAX_IMAGES = 30;
export const BUSINESS_REFERENCE_MAX_BYTES = 30 * 1024 * 1024;
/** These raster formats are both accepted by Seedance and registered by this site's asset uploader. */
export const BUSINESS_REFERENCE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const WAN_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const WAN_MAX_BYTES = 20 * 1024 * 1024;
type ImageReferenceProfile = "wan";
type ReferenceProfile = ImageReferenceProfile | "wan-video";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AAD = Buffer.from("tbw:business:reference-image:v1");
const KEY_PURPOSE = "tbw:business:reference-image:key:v1";
interface ReferenceGrant {
  v: 1; uid: number; aid: string; cid: string; sid: number; adult: boolean; iat: number; exp: number;
  profile?: ReferenceProfile;
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
interface BusinessReferenceVideo { type: "video"; url: string; duration: number }

const positiveInt = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
/** Session users are PostgreSQL bigint strings. Preserve v1 numeric grants without rounding IDs. */
function safeUserId(value: unknown): number {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[1-9]\d{0,15}$/.test(value))) throw new BusinessError("invalid_reference");
  const id = Number(value);
  if (!positiveInt(id)) throw new BusinessError("invalid_reference");
  return id;
}
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
    const expectedKeys = grant.profile === "wan" || grant.profile === "wan-video" ? "adult,aid,cid,exp,iat,profile,sid,uid,v" : "adult,aid,cid,exp,iat,sid,uid,v";
    if (Object.keys(value).sort().join(",") !== expectedKeys || grant.v !== 1 ||
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

function validAsset(asset: ReferenceAsset | undefined, userId: number, profile?: ReferenceProfile): asset is ReferenceAsset {
  const imageTypes = profile === "wan" ? WAN_IMAGE_TYPES : BUSINESS_REFERENCE_IMAGE_TYPES;
  const isVideo = profile === "wan-video";
  const maxBytes = isVideo ? WAN3_REFERENCE_VIDEO_MAX_BYTES : profile === "wan" ? WAN_MAX_BYTES : BUSINESS_REFERENCE_MAX_BYTES - 1;
  if (!asset || Number(asset.user_id) !== userId || !positiveInt(Number(asset.id)) ||
    (isVideo ? !wan3ReferenceVideoExtension(asset.content_type) : !imageTypes.has(asset.content_type)) ||
    !positiveInt(Number(asset.size)) || Number(asset.size) > maxBytes) return false;
  // A database pathname is still untrusted: never let Blob's get() accept an arbitrary URL or another storage namespace.
  return typeof asset.pathname === "string" && asset.pathname.startsWith(assetPathPrefix(userId)) &&
    /^[A-Za-z0-9_./-]+$/.test(asset.pathname) && asset.pathname.split("/").every(part => !!part && part !== "." && part !== "..");
}

/** Server-owned references only. The opaque grant contains no API key, plaintext account ID or asset URL. */
export function createBusinessReferenceUrls(userId: number | string, accountId: string, credentialId: string, assetIds: number[], nsfw: boolean, profile: "wan-video"): Promise<BusinessReferenceVideo[]>;
export function createBusinessReferenceUrls(userId: number | string, accountId: string, credentialId: string, assetIds: number[], nsfw: boolean, profile?: ImageReferenceProfile): Promise<BusinessReferenceImage[]>;
export async function createBusinessReferenceUrls(
  userId: number | string, accountId: string, credentialId: string, assetIds: number[], nsfw: boolean, profile?: ReferenceProfile,
): Promise<(BusinessReferenceImage | BusinessReferenceVideo)[]> {
  const ownerId = safeUserId(userId);
  const isVideo = profile === "wan-video";
  if (!UUID.test(accountId) || !UUID.test(credentialId) || typeof nsfw !== "boolean" || (profile !== undefined && profile !== "wan" && !isVideo) ||
    !Array.isArray(assetIds) || assetIds.length > (isVideo ? WAN3_MAX_REFERENCE_VIDEOS : BUSINESS_REFERENCE_MAX_IMAGES) || assetIds.some(id => !positiveInt(id)) ||
    new Set(assetIds).size !== assetIds.length) throw new BusinessError("invalid_reference");
  if (!assetIds.length) return [];
  if (!await authorized(ownerId, accountId, credentialId, nsfw)) throw new BusinessError("invalid_reference");
  const { rows } = await sql.query<ReferenceAsset>(
    "select id,user_id,pathname,content_type,size from assets where user_id=$1 and id=any($2::bigint[])", [ownerId, assetIds]);
  const byId = new Map(rows.map(asset => [Number(asset.id), asset]));
  if (rows.length !== assetIds.length || assetIds.some(id => !validAsset(byId.get(id), ownerId, profile))) throw new BusinessError("invalid_reference");
  // Fail invalid dimensions/bytes before the caller reserves or submits a billable task. Sequential reads bound memory to one file.
  const durations = new Map<number, number>();
  try {
    for (const id of assetIds) {
      const asset = byId.get(id)!;
      if (isVideo) {
        const bytes = await readReferenceBlob(asset);
        const data = new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
        durations.set(id, await inspectWanReferenceVideo(new Blob([data], { type: asset.content_type })));
      } else {
        await readVerifiedReferenceImage(asset, profile);
      }
    }
  } catch { throw new BusinessError(isVideo ? "wan_video_invalid" : "invalid_reference"); }
  if (!await authorized(ownerId, accountId, credentialId, nsfw)) throw new BusinessError("invalid_reference");
  const iat = nowSeconds();
  return assetIds.map(sid => {
    const token = seal({ v: 1, uid: ownerId, aid: accountId, cid: credentialId, sid, adult: nsfw, iat, exp: iat + BUSINESS_REFERENCE_TTL_SECONDS, ...(profile && { profile }) });
    const suffix = isVideo ? `.${wan3ReferenceVideoExtension(byId.get(sid)!.content_type)}` : "";
    const url = new URL(`/api/business/references/${token}${suffix}`, SITE_URL).toString();
    return isVideo ? { type: "video", url, duration: durations.get(sid)! } : { type: "image", role: "reference_image", url };
  });
}

function sniffRaster(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  const head = Buffer.from(bytes.subarray(0, 12)).toString("ascii");
  if (head.startsWith("GIF87a") || head.startsWith("GIF89a")) return "image/gif";
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return "image/webp";
  return null;
}

async function openReferenceBlob(asset: ReferenceAsset, signal?: AbortSignal) {
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
  return blob;
}

async function readReferenceBlob(asset: ReferenceAsset, signal?: AbortSignal): Promise<Buffer> {
  const blob = await openReferenceBlob(asset, signal);
  const expected = Number(asset.size);
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
      if (received > expected) unavailable();
      chunks.push(next.value);
    }
    bytes = Buffer.concat(chunks);
    chunks.length = 0;
    if (received !== expected) unavailable();
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error instanceof BusinessError ? error : new BusinessError("not_found", 404);
  } finally { reader.releaseLock(); }
  return bytes;
}

async function readVerifiedReferenceImage(asset: ReferenceAsset, profile?: ImageReferenceProfile, signal?: AbortSignal): Promise<Buffer> {
  const bytes = await readReferenceBlob(asset, signal);
  try {
    if (sniffRaster(bytes) !== asset.content_type) unavailable();
    const metadata = await sharp(bytes, { animated: false, limitInputPixels: 36_000_000 }).metadata();
    const formats: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const minSide = profile === "wan" ? 240 : 300;
    const maxRatio = profile === "wan" ? 8 : 2.5;
    const ratio = width / height;
    if (formats[metadata.format ?? ""] !== asset.content_type || width < minSide || width > 6000 || height < minSide || height > 6000 ||
      ratio < 1 / maxRatio || ratio > maxRatio || (profile === "wan" && asset.content_type === "image/png" && metadata.hasAlpha)) unavailable();
    if (profile === "wan") await sharp(bytes, { animated: false, limitInputPixels: 36_000_000 }).stats();
  } catch (error) {
    throw error instanceof BusinessError ? error : new BusinessError("not_found", 404);
  }
  return bytes;
}

/** Cookie-free vendor fetch: re-authorize the time-limited grant against live rows. */
export async function businessReferenceResponse(path: string, signal?: AbortSignal, metadataOnly = false): Promise<Response> {
  const suffix = /\.(mp4|mov)$/.exec(path);
  const grant = unseal(suffix ? path.slice(0, -suffix[0].length) : path);
  if ((grant.profile === "wan-video") !== !!suffix) unavailable();
  // A normal key rotation retires the pinned version but must not break an already submitted job's source fetch.
  // Only active versions can mint grants; existing grants remain bounded by expiry and explicit revocation.
  if (!await authorized(grant.uid, grant.aid, grant.cid, grant.adult, false)) unavailable();
  const { rows } = await sql.query<ReferenceAsset>(
    "select id,user_id,pathname,content_type,size from assets where user_id=$1 and id=$2 limit 1", [grant.uid, grant.sid]);
  const asset = rows[0];
  if (!validAsset(asset, grant.uid, grant.profile) || Number(asset.id) !== grant.sid) unavailable();
  if (suffix && wan3ReferenceVideoExtension(asset.content_type) !== suffix[1]) unavailable();
  const expected = Number(asset.size);
  let stream: ReadableStream<Uint8Array> | null = null;
  if (grant.profile === "wan-video") {
    const blob = await openReferenceBlob(asset, signal);
    if (metadataOnly) await blob.stream.cancel().catch(() => {});
    else {
      let received = 0;
      stream = blob.stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          received += chunk.byteLength;
          if (received > expected) throw new Error("invalid_asset_length");
          controller.enqueue(chunk);
        },
        flush() { if (received !== expected) throw new Error("invalid_asset_length"); },
      }));
    }
  } else {
    const bytes = await readVerifiedReferenceImage(asset, grant.profile, signal);
    let offset = 0;
    if (!metadataOnly) stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) { controller.close(); return; }
        const end = Math.min(offset + 64 * 1024, bytes.length);
        controller.enqueue(new Uint8Array(bytes.buffer, bytes.byteOffset + offset, end - offset));
        offset = end;
      },
    });
  }
  return new Response(stream, { headers: {
    "Content-Type": asset.content_type,
    "Content-Length": String(expected),
    "Cache-Control": "private, no-store, max-age=0",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Content-Disposition": "inline",
  } });
}
