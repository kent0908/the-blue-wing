import "server-only";
import { BusinessError } from "./businessTypes";
import { businessPreviewResponse } from "./businessAssetPreview";
import { SITE_URL } from "./seo/site";

// Assets belong to the account behind this exact inference key. Only the
// private preview endpoint dereferences a validated, short-lived media URL.
const ASSET_API = "https://console-api.siraya.ai/extapi/v1/assets";
const ASSET_MEDIA_HOST = "ark-media-asset-ap-southeast-1.tos-ap-southeast-1.volces.com";
const ASSET_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;
const TYPES = ["image", "video", "audio"] as const;
const STATUSES = ["processing", "active", "failed"] as const;
const MAX_RESPONSE_BYTES = 262_144;

export type BusinessProviderAssetType = typeof TYPES[number];
export type BusinessProviderAssetStatus = typeof STATUSES[number];
export interface BusinessProviderAsset {
  id: string;
  name: string;
  type: BusinessProviderAssetType;
  status: BusinessProviderAssetStatus;
}
export interface BusinessProviderAssetListOptions {
  page: number;
  pageSize: number;
  assetType?: BusinessProviderAssetType;
  status?: BusinessProviderAssetStatus;
  name?: string;
}
export interface BusinessProviderAssetReference {
  id: string;
  type: BusinessProviderAssetType;
}
export interface ResolvedBusinessProviderAsset {
  type: BusinessProviderAssetType;
  url: `asset://${string}`;
  role: "reference_image" | "reference_video" | "reference_audio";
}
type Credentials = { apiKey: string };
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const unavailable = () => new BusinessError("business_asset_unavailable", 503);

function validId(value: unknown): value is string {
  return typeof value === "string" && ASSET_ID.test(value);
}

function validatedOptions(options: BusinessProviderAssetListOptions): BusinessProviderAssetListOptions {
  if (!Number.isSafeInteger(options.page) || options.page < 1 || options.page > 100_000 ||
    !Number.isSafeInteger(options.pageSize) || options.pageSize < 1 || options.pageSize > 100 ||
    (options.assetType !== undefined && !TYPES.includes(options.assetType)) ||
    (options.status !== undefined && !STATUSES.includes(options.status)) ||
    (options.name !== undefined && (typeof options.name !== "string" || options.name.length > 120 || /[\x00-\x1F\x7F]/.test(options.name)))) {
    throw new BusinessError("invalid_parameters");
  }
  return options;
}

/** Parse the complete bounded query instead of forwarding caller query strings. */
export function parseBusinessProviderAssetQuery(query: URLSearchParams): BusinessProviderAssetListOptions {
  const allowed = ["page", "pageSize", "assetType", "status", "name"];
  for (const key of query.keys()) {
    if (!allowed.includes(key) || query.getAll(key).length !== 1) throw new BusinessError("invalid_parameters");
  }
  const integer = (key: string, fallback: number) => {
    const value = query.get(key);
    if (value === null) return fallback;
    if (!/^[1-9]\d{0,5}$/.test(value)) throw new BusinessError("invalid_parameters");
    return Number(value);
  };
  return validatedOptions({
    page: integer("page", 1), pageSize: integer("pageSize", 50),
    ...(query.has("assetType") ? { assetType: query.get("assetType") as BusinessProviderAssetType } : {}),
    ...(query.get("status") === "all" ? {} : { status: (query.get("status") ?? "active") as BusinessProviderAssetStatus }),
    ...(query.has("name") ? { name: query.get("name")! } : {}),
  });
}

export class BusinessProviderAssetSubmitError extends BusinessError {
  constructor(readonly uncertain: boolean, code?: string) { super(code ?? (uncertain ? "business_asset_upload_uncertain" : "business_asset_upload_rejected"), uncertain ? 502 : 400); }
}

async function assetRequest(path: string, credentials: Credentials, registration?: Record<string, string> | FormData, remove = false): Promise<Record<string, unknown>> {
  if (!credentials || typeof credentials.apiKey !== "string" || !/^sk-[A-Za-z0-9_-]{16,200}$/.test(credentials.apiKey)) {
    throw new BusinessError("credential_unavailable", 503);
  }
  let response: Response;
  try {
    response = await fetch(ASSET_API + path, {
      method: remove ? "DELETE" : registration ? "POST" : "GET", headers: { Authorization: `Bearer ${credentials.apiKey}`, Accept: "application/json", ...(registration && !(registration instanceof FormData) ? { "Content-Type": "application/json" } : {}) },
      ...(registration ? { body: registration instanceof FormData ? registration : JSON.stringify(registration) } : {}),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(registration ? 60_000 : 15_000),
    });
  } catch {
    if (remove) throw new BusinessError("business_asset_delete_failed", 502);
    throw registration ? new BusinessProviderAssetSubmitError(true) : unavailable();
  }
  if (remove) {
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 204) return {};
    if (response.status === 404) throw new BusinessError("business_asset_delete_missing", 404);
    if (response.status === 401) throw new BusinessError("credential_unavailable", 503);
    throw new BusinessError("business_asset_delete_failed", 502);
  }
  // Read a bounded envelope; only allowlisted identifiers may leave this boundary.
  let body: unknown;
  const reader = response.body?.getReader();
  if (reader) {
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel(); throw unavailable(); }
        chunks.push(next.value);
      }
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      body = undefined;
    } finally { reader.releaseLock(); }
  }
  if (!response.ok || record(body) && body.isSuccess === false) {
    const upstreamCode = record(body) && record(body.error) && typeof body.error.code === "string" ? body.error.code : "";
    const known: Record<string, string> = {
      UNAUTHORIZED: "business_asset_key_rejected",
      FEATURE_INACTIVE: "business_asset_feature_inactive",
      TIER_FORBIDDEN: "business_asset_permission_denied",
      INVALID_INPUT: "business_asset_provider_invalid",
      UPSTREAM_RATE_LIMIT: "business_asset_rate_limit",
      UPSTREAM_TIMEOUT: "business_asset_upload_uncertain",
      UPSTREAM_UNAUTHORIZED: "business_asset_provider_auth",
      UPSTREAM_UNAVAILABLE: "business_asset_upload_uncertain",
    };
    const code = (Object.hasOwn(known, upstreamCode) ? known[upstreamCode] : undefined) ?? (response.status === 401 ? "business_asset_key_rejected"
      : response.status === 403 ? "business_asset_permission_denied"
      : response.status === 429 ? "business_asset_rate_limit" : undefined);
    if (registration) {
      const uncertain = response.status >= 500 || response.status === 408 || response.status >= 300 && response.status < 400 || response.ok;
      console.warn("business_asset_registration_failed", { status: response.status, code: code ?? "unclassified" });
      throw new BusinessProviderAssetSubmitError(uncertain, code);
    }
    if (response.status === 404) throw new BusinessError("invalid_reference", 400);
    throw code ? new BusinessError(code, response.status >= 400 ? response.status : 502) : unavailable();
  }
  if (!record(body) || body.isSuccess !== true || !record(body.data)) {
    throw registration ? new BusinessProviderAssetSubmitError(true) : unavailable();
  }
  return body;
}

export async function getBusinessProviderAsset(id: string, credentials: Credentials): Promise<BusinessProviderAsset> {
  if (!validId(id)) throw new BusinessError("invalid_reference");
  const body = await assetRequest(`/${encodeURIComponent(id)}`, credentials);
  const asset = publicAsset(body.data);
  if (asset.id !== id) throw unavailable();
  return asset;
}

export async function deleteBusinessProviderAsset(id: string, credentials: Credentials): Promise<void> {
  if (!validId(id)) throw new BusinessError("invalid_reference");
  await assetRequest(`/${encodeURIComponent(id)}`, credentials, undefined, true);
}

export async function businessProviderPreviewResponse(id: string, credentials: Credentials, range: string | undefined, signal: AbortSignal): Promise<Response> {
  if (!validId(id)) throw new BusinessError("invalid_reference");
  const { data } = await assetRequest(`/${encodeURIComponent(id)}`, credentials);
  const asset = publicAsset(data);
  const missing = () => new BusinessError("preview_unavailable", 404);
  if (asset.id !== id || asset.status !== "active" || asset.type === "audio" ||
      !record(data) || typeof data.url !== "string" || data.url.length > 8192) throw missing();
  let url: URL;
  try { url = new URL(data.url); } catch { throw missing(); }
  if (url.origin !== `https://${ASSET_MEDIA_HOST}` || url.username || url.password || url.hash ||
      !url.searchParams.get("X-Tos-Signature")) throw missing();

  const response = await fetch(url, {
    headers: { "Accept-Encoding": "identity", ...(range ? { Range: range } : {}) },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
  }).catch(() => { throw missing(); });
  if (response.status === 416) {
    await response.body?.cancel();
    throw new BusinessError("invalid_range", 416);
  }
  if ((response.status !== 200 && response.status !== 206) || !response.body ||
      (response.status === 206) !== response.headers.has("content-range")) {
    await response.body?.cancel();
    throw missing();
  }
  return businessPreviewResponse({
    stream: response.body, headers: response.headers, range, type: asset.type,
    maxBytes: (asset.type === "image" ? 30 : 100) * 1024 * 1024,
  });
}

/** The upload service creates this grant. Caller URLs are never forwarded. */
export async function registerBusinessProviderAsset(source: { url: string; type: BusinessProviderAssetType; name: string }, credentials: Credentials): Promise<BusinessProviderAsset> {
  let url: URL;
  try { url = new URL(source.url); } catch { throw new BusinessError("invalid_reference"); }
  if (url.origin !== new URL(SITE_URL).origin || url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
    !/^\/api\/business\/provider-assets\/source\/[A-Za-z0-9_-]{80,1500}$/.test(url.pathname) || !TYPES.includes(source.type) ||
    typeof source.name !== "string" || !source.name.trim() || source.name.length > 120 || /[\x00-\x1F\x7F]/.test(source.name)) throw new BusinessError("invalid_reference");
  const body = await assetRequest("", credentials, { url: url.toString(), assetType: source.type, name: source.name });
  const data = body.data as Record<string, unknown>;
  if (!validId(data.assetId) || !STATUSES.includes(data.status as BusinessProviderAssetStatus)) throw new BusinessProviderAssetSubmitError(true);
  return { id: data.assetId, type: source.type, name: source.name, status: data.status as BusinessProviderAssetStatus };
}

/** Bytes come only from an owned, immutable Blob verified by the upload service. */
export async function registerBusinessProviderFile(source: { file: Blob; type: BusinessProviderAssetType; name: string }, credentials: Credentials): Promise<BusinessProviderAsset> {
  const maxBytes = (source.type === "image" ? 30 : source.type === "video" ? 50 : 15) * 1024 * 1024;
  if (!TYPES.includes(source.type) || !(source.file instanceof Blob) || !source.file.size || source.file.size > maxBytes ||
      typeof source.name !== "string" || !source.name.trim() || source.name.length > 120 || /[\x00-\x1F\x7F]/.test(source.name)) throw new BusinessError("invalid_reference");
  const form = new FormData();
  form.set("assetType", source.type);
  form.set("name", source.name);
  form.set("file", source.file, source.name);
  const body = await assetRequest("", credentials, form);
  const data = body.data as Record<string, unknown>;
  if (!validId(data.assetId) || !STATUSES.includes(data.status as BusinessProviderAssetStatus)) throw new BusinessProviderAssetSubmitError(true);
  return { id: data.assetId, type: source.type, name: source.name, status: data.status as BusinessProviderAssetStatus };
}


function publicAsset(value: unknown): BusinessProviderAsset {
  if (!record(value) || !validId(value.assetId) ||
    !TYPES.includes(value.type as BusinessProviderAssetType) || !STATUSES.includes(value.status as BusinessProviderAssetStatus)) throw unavailable();
  const name = typeof value.name === "string" ? value.name.replace(/[\x00-\x1F\x7F]/g, "").trim().slice(0, 200) : "";
  return { id: value.assetId, name: name || value.assetId, type: value.type as BusinessProviderAssetType, status: value.status as BusinessProviderAssetStatus };
}

/** Read-only account catalogue. Only public metadata survives this boundary. */
export async function listBusinessProviderAssets(options: BusinessProviderAssetListOptions, credentials: Credentials) {
  validatedOptions(options);
  const query = new URLSearchParams({ page: String(options.page), pageSize: String(options.pageSize), sortBy: "createTime", sortOrder: "desc" });
  if (options.assetType) query.set("assetType", options.assetType);
  if (options.status) query.set("status", options.status);
  if (options.name) query.set("name", options.name);
  const body = await assetRequest(`?${query.toString()}`, credentials);
  const data = body.data as Record<string, unknown>;
  if (!Array.isArray(data.items) || data.items.length > options.pageSize || !record(body.pagination) ||
    !Number.isSafeInteger(body.pagination.total) || (body.pagination.total as number) < data.items.length) throw unavailable();
  const assets = data.items.map(publicAsset);
  if (new Set(assets.map(asset => asset.id)).size !== assets.length) throw unavailable();
  const total = body.pagination.total as number;
  return { assets, pagination: { page: options.page, pageSize: options.pageSize, total, totalPages: Math.ceil(total / options.pageSize) } };
}

/** Validate ownership with the current key; the returned asset:// URI never downloads media. */
export async function resolveBusinessProviderAssets(references: BusinessProviderAssetReference[], credentials: Credentials): Promise<ResolvedBusinessProviderAsset[]> {
  if (!Array.isArray(references) || references.length > 50 || references.some(reference => !record(reference) ||
    Object.keys(reference).some(key => key !== "id" && key !== "type") || !validId(reference.id) ||
    !TYPES.includes(reference.type)) || new Set(references.map(reference => reference.id)).size !== references.length) {
    throw new BusinessError("invalid_reference");
  }
  const result: ResolvedBusinessProviderAsset[] = new Array(references.length);
  let index = 0;
  let failed = false;
  async function worker() {
    while (!failed && index < references.length) {
      const current = index++;
      const reference = references[current];
      try {
        const body = await assetRequest(`/${encodeURIComponent(reference.id)}`, credentials);
        const asset = publicAsset(body.data);
        if (asset.id !== reference.id || asset.type !== reference.type || asset.status !== "active") throw new BusinessError("invalid_reference", 400);
        result[current] = { type: reference.type, url: `asset://${reference.id}`, role: `reference_${reference.type}` };
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, references.length) }, worker));
  return result;
}
