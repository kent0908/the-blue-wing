import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { get, head } from "@vercel/blob";
import sharp from "sharp";
import { sql } from "./db";
import { isAdultVerified, type AdultGateUser } from "./adultGate";
import { BusinessError } from "./businessTypes";
import { SITE_URL } from "./seo/site";

export const BUSINESS_GENERATED_REFERENCE_TTL_SECONDS = 3600;
export const BUSINESS_GENERATED_REFERENCE_MAX_IMAGES = 16;
const MAX_BYTES = 30 * 1024 * 1024 - 1;
const MIME_EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AAD = Buffer.from("tbw:business:generated-image-source:v1");
interface SourceRow extends AdultGateUser {
  id: string; account_id: string; user_id: number | string; credential_id: string;
  kind: string; status: string; nsfw: boolean; output: unknown;
  account_status: string; credential_active: boolean; credential_revoked_at: string | null;
  user_status: string; email_verified: boolean;
}
interface SourceGrant {
  v: 1; id: string; uid: number; aid: string; cid: string; adult: boolean;
  mime: string; size: number; etag: string; iat: number; exp: number;
}
export interface BusinessGeneratedImageConstraints {
  minSide: number; maxBytes: number; mimeTypes: readonly string[];
  minAspectRatio?: number; maxAspectRatio?: number;
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const positiveInt = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
function invalid(): never { throw new BusinessError("invalid_reference"); }
function missing(): never { throw new BusinessError("not_found", 404); }
function safeUserId(value: unknown): number {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[1-9]\d{0,15}$/.test(value))) invalid();
  const id = Number(value);
  if (!positiveInt(id)) invalid();
  return id;
}
function sourceKey(): Buffer {
  const encoded = process.env.BYOK_ENCRYPTION_KEY ?? "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new BusinessError("encryption_unavailable", 503);
  const root = Buffer.from(encoded, "base64");
  try {
    if (root.length !== 32 || root.toString("base64") !== encoded) throw new BusinessError("encryption_unavailable", 503);
    return createHmac("sha256", root).update("tbw:business:generated-image-source:key:v1").digest();
  } finally { root.fill(0); }
}
function seal(grant: SourceGrant): string {
  const key = sourceKey(), iv = randomBytes(12), bytes = Buffer.from(JSON.stringify(grant));
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
  } finally { key.fill(0); bytes.fill(0); }
}
function unseal(token: string): SourceGrant {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{80,2000}$/.test(token)) missing();
  const envelope = Buffer.from(token, "base64url");
  if (envelope[0] !== 1 || envelope.toString("base64url") !== token) missing();
  const key = sourceKey(); let bytes: Buffer | undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, envelope.subarray(1, 13));
    decipher.setAAD(AAD); decipher.setAuthTag(envelope.subarray(13, 29));
    bytes = Buffer.concat([decipher.update(envelope.subarray(29)), decipher.final()]);
    const grant: unknown = JSON.parse(bytes.toString("utf8")), now = Math.floor(Date.now() / 1000);
    if (!record(grant) || Object.keys(grant).sort().join(",") !== "adult,aid,cid,etag,exp,iat,id,mime,size,uid,v" || grant.v !== 1 ||
      typeof grant.id !== "string" || !UUID.test(grant.id) || typeof grant.aid !== "string" || !UUID.test(grant.aid) ||
      typeof grant.cid !== "string" || !UUID.test(grant.cid) || !positiveInt(grant.uid) || typeof grant.adult !== "boolean" ||
      typeof grant.mime !== "string" || !MIME_EXTENSIONS[grant.mime] || !positiveInt(grant.size) || grant.size > MAX_BYTES ||
      typeof grant.etag !== "string" || !grant.etag || grant.etag.length > 200 || /[\x00-\x1f\x7f]/.test(grant.etag) ||
      !positiveInt(grant.iat) || !positiveInt(grant.exp) || grant.exp - grant.iat !== BUSINESS_GENERATED_REFERENCE_TTL_SECONDS ||
      grant.iat > now || grant.exp <= now || grant.exp > now + BUSINESS_GENERATED_REFERENCE_TTL_SECONDS) missing();
    return grant as unknown as SourceGrant;
  } catch { return missing(); }
  finally { key.fill(0); bytes?.fill(0); }
}

/** Only B-completed image rows are eligible. Consumer media and upstream URLs cannot select a storage path. */
function sourcePath(row: SourceRow): string | null {
  if (!record(row.output) || !Array.isArray(row.output.images) || !record(row.output.images[0]) || typeof row.output.images[0].url !== "string") return null;
  const scope = row.nsfw ? "adult" : "standard";
  const prefix = `/api/business/media/${row.account_id}/${scope}/${row.id}-`;
  const url = row.output.images[0].url;
  if (!url.startsWith(prefix)) return null;
  const tail = url.slice(prefix.length);
  const match = /^([0-9a-f-]+)\.(png|jpg|webp)$/.exec(tail);
  if (!match || !UUID.test(match[1])) return null;
  return `business/${row.account_id}/${scope}/${row.id}-${tail}`;
}
function validRow(row: SourceRow | undefined, userId: number, accountId: string, credentialId: string, nsfw: boolean): row is SourceRow {
  return !!row && row.account_id === accountId && String(row.user_id) === String(userId) && row.credential_id === credentialId &&
    row.account_status === "approved" && row.credential_active === true && row.credential_revoked_at === null &&
    row.user_status === "active" && row.email_verified === true && row.kind === "image" && row.status === "completed" &&
    typeof row.nsfw === "boolean" && (!row.nsfw || nsfw) && (!nsfw || isAdultVerified(row)) && !!sourcePath(row);
}
async function sourceRows(userId: number, accountId: string, credentialId: string, ids: string[]): Promise<SourceRow[]> {
  const { rows } = await sql.query<SourceRow>(`select g.id,g.account_id,g.user_id,g.credential_id,g.kind,g.status,g.nsfw,g.output,
    a.status as account_status,c.is_active as credential_active,c.revoked_at as credential_revoked_at,
    u.status as user_status,u.email_verified,u.birth_date,u.adult_confirmed_at
    from business_generations g join business_accounts a on a.id=g.account_id and a.user_id=g.user_id
    join business_credentials c on c.id=g.credential_id and c.account_id=g.account_id and c.user_id=g.user_id and c.provider='siraya'
    join users u on u.id=g.user_id where g.id=any($1::uuid[]) and g.user_id=$2 and g.account_id=$3 and g.credential_id=$4`,
  [ids, userId, accountId, credentialId]);
  return rows;
}
function constraintsValid(value: BusinessGeneratedImageConstraints): boolean {
  return positiveInt(value.minSide) && value.minSide <= 6000 && positiveInt(value.maxBytes) && value.maxBytes <= MAX_BYTES &&
    Array.isArray(value.mimeTypes) && value.mimeTypes.length > 0 && value.mimeTypes.every(mime => !!MIME_EXTENSIONS[mime]) &&
    (value.minAspectRatio === undefined || typeof value.minAspectRatio === "number" && Number.isFinite(value.minAspectRatio) && value.minAspectRatio > 0) &&
    (value.maxAspectRatio === undefined || typeof value.maxAspectRatio === "number" && Number.isFinite(value.maxAspectRatio) && value.maxAspectRatio > 0) &&
    (value.minAspectRatio === undefined || value.maxAspectRatio === undefined || value.minAspectRatio <= value.maxAspectRatio);
}
const DEFAULT_CONSTRAINTS: BusinessGeneratedImageConstraints = { minSide: 1, maxBytes: MAX_BYTES, mimeTypes: Object.keys(MIME_EXTENSIONS) };

async function verifiedImage(row: SourceRow, constraints: BusinessGeneratedImageConstraints, signal?: AbortSignal, expected?: SourceGrant) {
  const pathname = sourcePath(row); if (!pathname) missing();
  const metadata = await head(pathname);
  const mime = metadata.contentType.split(";")[0].trim().toLowerCase();
  if (metadata.pathname !== pathname || !constraints.mimeTypes.includes(mime) || !MIME_EXTENSIONS[mime] ||
    !positiveInt(metadata.size) || metadata.size > constraints.maxBytes || typeof metadata.etag !== "string" || !metadata.etag || metadata.etag.length > 200 ||
    /[\x00-\x1f\x7f]/.test(metadata.etag) || !pathname.endsWith(`.${MIME_EXTENSIONS[mime]}`) ||
    expected && (expected.mime !== mime || expected.size !== metadata.size || expected.etag !== metadata.etag)) missing();
  const deadline = AbortSignal.timeout(60_000), abortSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const result = await get(pathname, { access: "private", useCache: false, abortSignal });
  if (!result || result.statusCode !== 200 || result.blob.pathname !== pathname || result.blob.size !== metadata.size ||
    result.blob.etag !== metadata.etag || result.blob.contentType.split(";")[0].trim().toLowerCase() !== mime) {
    if (result?.statusCode === 200) await result.stream.cancel().catch(() => {});
    missing();
  }
  const contentLength = result.headers.get("content-length");
  if (contentLength !== null && (!/^[1-9]\d*$/.test(contentLength) || Number(contentLength) !== metadata.size)) {
    await result.stream.cancel().catch(() => {}); missing();
  }
  const reader = result.stream.getReader(), chunks: Uint8Array[] = []; let received = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      received += next.value.byteLength;
      if (received > metadata.size || received > constraints.maxBytes) missing();
      chunks.push(next.value);
    }
    if (received !== metadata.size) missing();
    const bytes = Buffer.concat(chunks);
    const image = sharp(bytes, { animated: false, limitInputPixels: 36_000_000 });
    const info = await image.metadata(), formats: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };
    const width = info.width ?? 0, height = info.height ?? 0, ratio = width / height;
    if (formats[info.format ?? ""] !== mime || width < constraints.minSide || width > 6000 || height < constraints.minSide || height > 6000 ||
      constraints.minAspectRatio !== undefined && ratio < constraints.minAspectRatio || constraints.maxAspectRatio !== undefined && ratio > constraints.maxAspectRatio) missing();
    // Metadata alone accepts truncated rasters; fully decode before charging or emitting HTTP 200.
    await image.stats();
    return { bytes, mime, size: metadata.size, etag: metadata.etag };
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** Each completed image job supplies its FIRST output only, in caller order. Never accept a client URL or output index. */
export async function resolveBusinessGeneratedImageSources(
  userId: number | string, accountId: string, credentialId: string, generationIds: string[], nsfw: boolean,
  constraints: BusinessGeneratedImageConstraints = DEFAULT_CONSTRAINTS,
): Promise<{ type: "image"; url: string }[]> {
  const ownerId = safeUserId(userId);
  if (!UUID.test(accountId) || !UUID.test(credentialId) || typeof nsfw !== "boolean" || !constraintsValid(constraints) ||
    !Array.isArray(generationIds) || generationIds.length > BUSINESS_GENERATED_REFERENCE_MAX_IMAGES || generationIds.some(id => typeof id !== "string" || !UUID.test(id)) ||
    new Set(generationIds.map(id => id.toLowerCase())).size !== generationIds.length) invalid();
  if (!generationIds.length) return [];
  const ids = generationIds.map(id => id.toLowerCase());
  const rows = await sourceRows(ownerId, accountId, credentialId, ids), byId = new Map(rows.map(row => [row.id, row]));
  if (rows.length !== ids.length || ids.some(id => !validRow(byId.get(id), ownerId, accountId, credentialId, nsfw))) invalid();
  const verified = new Map<string, { mime: string; size: number; etag: string }>();
  try { for (const id of ids) {
    const { mime, size, etag } = await verifiedImage(byId.get(id)!, constraints);
    verified.set(id, { mime, size, etag });
  } } catch { invalid(); }
  // Approval, ownership and the pinned ACTIVE key are checked again after potentially slow private I/O.
  const fresh = await sourceRows(ownerId, accountId, credentialId, ids), freshById = new Map(fresh.map(row => [row.id, row]));
  if (fresh.length !== ids.length || ids.some(id => !validRow(freshById.get(id), ownerId, accountId, credentialId, nsfw) || sourcePath(freshById.get(id)!) !== sourcePath(byId.get(id)!))) invalid();
  const iat = Math.floor(Date.now() / 1000);
  return ids.map(id => ({ type: "image", url: new URL(`/api/business/generated-references/${seal({ v: 1, id, uid: ownerId, aid: accountId, cid: credentialId, adult: nsfw,
    ...verified.get(id)!, iat, exp: iat + BUSINESS_GENERATED_REFERENCE_TTL_SECONDS })}`, SITE_URL).toString() }));
}

/** Cookie-free provider fetch; no private storage read is possible before live account/key/source authorization. */
export async function businessGeneratedImageSourceResponse(token: string, signal?: AbortSignal): Promise<Response> {
  const grant = unseal(token);
  const rows = await sourceRows(grant.uid, grant.aid, grant.cid, [grant.id]), row = rows[0];
  if (rows.length !== 1 || row?.id !== grant.id || !validRow(row, grant.uid, grant.aid, grant.cid, grant.adult)) missing();
  const { bytes, mime } = await verifiedImage(row, DEFAULT_CONSTRAINTS, signal, grant);
  const latest = await sourceRows(grant.uid, grant.aid, grant.cid, [grant.id]);
  if (latest.length !== 1 || latest[0]?.id !== grant.id || !validRow(latest[0], grant.uid, grant.aid, grant.cid, grant.adult) || sourcePath(latest[0]) !== sourcePath(row)) missing();
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) {
    if (offset >= bytes.length) { controller.close(); return; }
    const end = Math.min(offset + 64 * 1024, bytes.length);
    controller.enqueue(new Uint8Array(bytes.buffer, bytes.byteOffset + offset, end - offset)); offset = end;
  } });
  return new Response(stream, { headers: { "Content-Type": mime, "Content-Length": String(bytes.length),
    "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive", "Content-Disposition": "inline" } });
}
