import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { sql } from "./db";
import { blobConfigured } from "./assets";
import { assetsToDataUrls } from "./assetData";
import { BusinessError, getBusinessCredential, type BusinessAccount } from "./business";
import { listRates } from "./rateCard";
import { getImageModelForControls, sizeOptionsFor, supportsRefImages } from "./imageModels";
import { videoConstraintFor, maxRefsForVideoModel } from "./videoModels";
import { getKlingVideoModel } from "./klingVideo";
import { getMiniMaxVideoModel } from "./minimaxVideo";
import { getSeedanceCapability, assertBusinessSeedanceReferences, buildBusinessSeedancePayload, type BusinessSeedanceCapability, type BusinessSeedanceMode } from "./businessSeedance";
import { resolveBusinessProviderAssets, type BusinessProviderAssetReference } from "./businessProviderAssets";
import { createBusinessReferenceUrls } from "./businessReferenceUrls";
import { isGenerationPickerModel } from "./generationPickerModels";
import { replacementGeminiTextModel } from "./geminiTextModels";
import { modelLabel } from "./modelLabel";
import { validateGeneration } from "./generationValidation";
import { assertPromptSafety, PromptSafetyError } from "./promptSafety";
import { isAdultVerified } from "./adultGate";
import type { UserRow } from "./db";
import { sniffImageMimeFromBase64 } from "./imageMime";
import { createImage, createVideo, createChatCompletion, getVideoStatus, listModels, SirayaApiError, type ImageGenerationRequest, type VideoGenerationRequest } from "./siraya";

export type BusinessKind = "image" | "video" | "text";
export type BusinessGenerationStatus = "submitting" | "processing" | "completed" | "failed" | "unknown";
export interface BusinessGenerationRow {
  id: string; account_id: string; user_id: number; credential_id: string; client_request_id: string;
  kind: BusinessKind; model: string; prompt: string; nsfw: boolean; status: BusinessGenerationStatus;
  provider_task_id: string | null; provider_output: BusinessOutput | null; output: BusinessOutput | null;
  error_code: string | null; created_at: string; updated_at: string;
}
interface BusinessOutput { images?: { url: string }[]; videoUrl?: string; text?: string }
export interface BusinessModel {
  id: string; displayName: string; modality: BusinessKind; nsfw: boolean; supportsReferences: boolean;
  sizes?: string[]; resolutions?: string[]; minSeconds?: number; maxSeconds?: number;
  aspectRatios?: string[]; supportsAudio?: boolean; defaultSeconds?: number; secondsOptions?: number[];
  nativeAudioOnly?: boolean; nativeAudioResolutions?: string[]; maxReferenceImages?: number; promptMaxChars?: number;
  seedance?: BusinessSeedanceCapability;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pending = ["submitting", "processing", "unknown"];
function fail(code = "invalid_parameters", status = 400): never { throw new BusinessError(code, status); }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const baseModel = (model: string) => model.replace(/^NSFW-/i, "");

/** Only enabled, locally reviewed capabilities. Unreviewed API models cannot be sent by guessing an ID. */
export async function businessModelCatalog(): Promise<BusinessModel[]> {
  const rates = await listRates();
  return rates.flatMap<BusinessModel>(rate => {
    const id = rate.modelId;
    if (!rate.active || !isGenerationPickerModel(id) || replacementGeminiTextModel(id) || /happyhorse[-.]1[.-]0/i.test(id) || /kling.*(?:avatar|face-recognition|lip-sync|tts)/i.test(id) || !/^[a-zA-Z0-9._:-]{1,150}$/.test(id)) return [];
    const common = { id, displayName: modelLabel(id), nsfw: /nsfw/i.test(id) };
    if (rate.modality === "image") {
      const image = getImageModelForControls(id);
      if (!image) return [];
      return [{ ...common, modality: "image" as const, sizes: sizeOptionsFor(id), supportsReferences: supportsRefImages(image) }];
    }
    if (rate.modality === "video") {
      // Dedicated HappyHorse I2V/R2V/edit endpoints are outside this initial contract.
      if (/-(?:i2v|r2v|video-edit)$/i.test(id)) return [];
      const caps = videoConstraintFor(baseModel(id));
      if (!caps.resolutions.length) return [];
      const seedance = getSeedanceCapability(id);
      if (seedance) return [{ ...common, modality: "video" as const,
        resolutions: [...seedance.resolutions], minSeconds: seedance.minSeconds, maxSeconds: seedance.maxSeconds,
        supportsReferences: true, aspectRatios: [...seedance.aspectRatios], supportsAudio: true,
        defaultSeconds: seedance.defaultSeconds, maxReferenceImages: seedance.references.image, seedance }];
      const kling = getKlingVideoModel(id);
      if (kling) return [{ ...common, modality: "video" as const, ...caps, supportsReferences: true,
        aspectRatios: [...kling.aspectRatios], supportsAudio: kling.supportsAudio, nativeAudioOnly: kling.nativeAudioOnly,
        nativeAudioResolutions: [...kling.nativeAudioResolutions], defaultSeconds: 5, secondsOptions: [...kling.secondsOptions], maxReferenceImages: kling.maxReferenceImages, promptMaxChars: 2500 }];
      const minimax = getMiniMaxVideoModel(id);
      if (minimax) return [{ ...common, modality: "video" as const, ...caps, supportsReferences: true,
        aspectRatios: [...minimax.aspectRatios], supportsAudio: true, nativeAudioOnly: true,
        nativeAudioResolutions: [...minimax.nativeAudioResolutions], defaultSeconds: minimax.defaultSeconds, maxReferenceImages: 9 }];
      const veo = /veo-3\.1/.test(id);
      return [{ ...common, modality: "video" as const, ...caps, supportsReferences: maxRefsForVideoModel(baseModel(id)) > 0,
        aspectRatios: veo ? ["16:9", "9:16"] : ["16:9", "9:16", "1:1"],
        supportsAudio: /seedance-2\.[05]|veo-3\.1|^wan3\.0/i.test(id), defaultSeconds: veo ? 8 : 5,
        maxReferenceImages: 4,
        ...(veo ? { secondsOptions: [4, 6, 8] } : {}) }];
    }
    if (rate.modality === "text") return [{ ...common, modality: "text" as const, supportsReferences: false }];
    return [];
  });
}

/** A read-only upstream catalogue lookup uses this account's exact key and never the platform credentials. */
export async function availableBusinessModels(userId: number, accountId: string) {
  const credential = await getBusinessCredential(userId, accountId);
  if (!credential) return { models: [] as BusinessModel[], needsKey: true };
  let raw: unknown;
  try { raw = await listModels({ apiKey: credential.apiKey }); }
  catch { throw new BusinessError("credential_validation_failed", 502); }
  const data = record(raw) && Array.isArray(raw.data) ? raw.data : [];
  const enabled = new Set(data.flatMap(model => record(model) && typeof model.id === "string" ? [model.id.toLowerCase()] : []));
  return { models: (await businessModelCatalog()).filter(model => enabled.has(model.id.toLowerCase())), needsKey: false };
}

export function publicBusinessGeneration(row: BusinessGenerationRow) {
  return { id: row.id, clientRequestId: row.client_request_id, kind: row.kind, model: row.model, prompt: row.prompt,
    nsfw: row.nsfw, status: row.status, createdAt: row.created_at,
    ...(row.output ?? {}), ...(row.error_code ? { errorCode: row.error_code } : {}) };
}
export function assertBusinessGenerationAge(row: { nsfw: boolean }, user: UserRow) {
  if (row.nsfw && !isAdultVerified(user)) fail("age_unverified", 403);
}

function validateSubmission(value: unknown) {
  if (!record(value) || Object.keys(value).some(key => !["clientRequestId", "kind", "parameters"].includes(key)) ||
    typeof value.clientRequestId !== "string" || !UUID.test(value.clientRequestId) ||
    !["image", "video", "text"].includes(String(value.kind)) || !record(value.parameters)) fail();
  const kind = value.kind as BusinessKind;
  const parameters = { ...value.parameters };
  const allowed = kind === "image" ? ["model", "prompt", "size", "n", "quality", "negative_prompt", "seed", "assetIds"] :
    kind === "video" ? ["model", "prompt", "seconds", "resolution", "aspect_ratio", "generate_audio", "negative_prompt", "seed", "assetIds", "mode", "providerAssets", "output_format", "referenceOrder"] :
    ["model", "prompt", "max_tokens", "temperature"];
  if (Object.keys(parameters).some(key => !allowed.includes(key)) || typeof parameters.model !== "string" ||
    !/^[a-zA-Z0-9._:-]{1,150}$/.test(parameters.model) || typeof parameters.prompt !== "string" ||
    !parameters.prompt.trim() || parameters.prompt.length > 12000) fail();
  // Key fields are encrypted separately; pasted credentials must never become a plaintext prompt/history row.
  if ([parameters.prompt, parameters.negative_prompt].some(value => typeof value === "string" && /\b(?:sk|csk)-[A-Za-z0-9_-]{16,}/i.test(value))) fail();
  try { assertPromptSafety(parameters.prompt, parameters.negative_prompt); }
  catch (error) { if (error instanceof PromptSafetyError) fail("prompt_blocked"); throw error; }
  if (parameters.negative_prompt !== undefined && (typeof parameters.negative_prompt !== "string" || parameters.negative_prompt.length > 4000)) fail();
  if (parameters.seed !== undefined && (typeof parameters.seed !== "number" || !Number.isSafeInteger(parameters.seed) || parameters.seed < -1 || parameters.seed > 2147483647)) fail();
  if (parameters.assetIds !== undefined && (!Array.isArray(parameters.assetIds) || parameters.assetIds.length > (kind === "video" ? 50 : 4) || parameters.assetIds.some(id => typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) || new Set(parameters.assetIds).size !== parameters.assetIds.length)) fail();
  if (parameters.providerAssets !== undefined && (!Array.isArray(parameters.providerAssets) || parameters.providerAssets.length > 50 || parameters.providerAssets.some(ref => !record(ref) || Object.keys(ref).some(key => !["id", "type"].includes(key)) || typeof ref.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(ref.id) || !["image", "video", "audio"].includes(String(ref.type))) || new Set(parameters.providerAssets.map(ref => (ref as { id: string }).id)).size !== parameters.providerAssets.length)) fail();
  if (parameters.referenceOrder !== undefined && (!Array.isArray(parameters.referenceOrder) || parameters.referenceOrder.length > 50 || parameters.referenceOrder.some(key => typeof key !== "string" || !/^(?:local:[1-9]\d*|provider:[a-zA-Z0-9][a-zA-Z0-9_-]{0,199})$/.test(key)) || new Set(parameters.referenceOrder).size !== parameters.referenceOrder.length)) fail();
  return { clientRequestId: value.clientRequestId, kind, parameters };
}

async function normalizedParameters(kind: BusinessKind, parameters: Record<string, unknown>, model: BusinessModel, userId: number, accountId: string, credential: { id: string; apiKey: string }) {
  const payload = { ...parameters };
  const assetIds = payload.assetIds as number[] | undefined;
  if (kind === "video" && model.seedance) {
    const providerAssets = (parameters.providerAssets ?? []) as BusinessProviderAssetReference[];
    const mode = (parameters.mode ?? "freestyle") as BusinessSeedanceMode;
    const types = [...(assetIds ?? []).map(() => ({ type: "image" as const })), ...providerAssets];
    const keys = [...(assetIds ?? []).map(id => `local:${id}`), ...providerAssets.map(ref => `provider:${ref.id}`)];
    const referenceOrder = (parameters.referenceOrder ?? keys) as string[];
    if (referenceOrder.length !== keys.length || referenceOrder.some(key => !keys.includes(key))) fail("invalid_reference");
    try {
      assertBusinessSeedanceReferences(model.seedance, mode, types);
      // Validate scalar parameters/counts before private storage/provider reads.
      buildBusinessSeedancePayload(parameters, types.map((ref, index) => ({ type: ref.type, url: `owned-reference-${index}` })));
    } catch { fail(); }
    const local = assetIds?.length ? await createBusinessReferenceUrls(userId, accountId, credential.id, assetIds, model.nsfw) : [];
    const registered = providerAssets.length ? await resolveBusinessProviderAssets(providerAssets, { apiKey: credential.apiKey }) : [];
    if (local.length !== (assetIds?.length ?? 0) || registered.length !== providerAssets.length) fail("invalid_reference");
    const resolved = new Map([...local, ...registered].map((ref, index) => [keys[index], ref]));
    try { return buildBusinessSeedancePayload(parameters, referenceOrder.map(key => resolved.get(key)!)); }
    catch { fail(); }
  }
  // Seedance-only controls must never leak to another adapter or bypass its reviewed contract.
  if (["mode", "providerAssets", "output_format", "referenceOrder"].some(key => parameters[key] !== undefined)) fail();
  if (model.promptMaxChars && String(payload.prompt).length > model.promptMaxChars) fail();
  if (assetIds && assetIds.length > (model.maxReferenceImages ?? 4)) fail("invalid_reference");
  delete payload.assetIds;
  if (kind === "image") {
    payload.n ??= 1;
    if (typeof payload.n !== "number" || !Number.isSafeInteger(payload.n) || payload.n < 1 || payload.n > 4) fail();
    payload.size ??= model.sizes?.[0];
    const controls = getImageModelForControls(model.id)?.controls ?? [];
    for (const key of ["quality", "negative_prompt", "seed"]) {
      if (payload[key] !== undefined && !controls.some(control => control.key === key)) fail();
    }
    if (payload.quality !== undefined && !["low", "medium", "high"].includes(String(payload.quality))) fail();
  } else if (kind === "video") {
    payload.seconds ??= model.defaultSeconds;
    payload.resolution ??= model.resolutions?.includes("720p") ? "720p" : model.resolutions?.[0];
    payload.aspect_ratio ??= model.aspectRatios?.[0] ?? "16:9";
    if (model.secondsOptions && !model.secondsOptions.includes(Number(payload.seconds))) fail();
    if (payload.generate_audio !== undefined && !model.supportsAudio) fail();
    if (payload.aspect_ratio !== undefined && !model.aspectRatios?.includes(String(payload.aspect_ratio))) fail();
  } else {
    if (payload.temperature !== undefined && (typeof payload.temperature !== "number" || !Number.isFinite(payload.temperature) || payload.temperature < 0 || payload.temperature > 2)) fail();
    if (payload.max_tokens !== undefined && (typeof payload.max_tokens !== "number" || !Number.isSafeInteger(payload.max_tokens) || payload.max_tokens < 1 || payload.max_tokens > 4096)) fail();
    payload.messages = [{ role: "user", content: payload.prompt }];
    delete payload.prompt;
    payload.max_tokens ??= 1024;
  }
  try {
    // Shared model limits include the NSFW seedance aliases; canonical base supplies exact-match families (Wan / Veo).
    validateGeneration({ ...payload, model: baseModel(model.id) }, kind);
  } catch (error) {
    if (error instanceof PromptSafetyError) throw error;
    fail();
  }
  if (assetIds?.length) {
    if (!model.supportsReferences) fail();
    const { rows } = await sql.query<{ id: number; content_type: string; size: number }>(
      "select id,content_type,size from assets where user_id=$1 and id=any($2::bigint[])", [userId, assetIds]);
    if (rows.length !== assetIds.length || rows.some(asset => !["image/png", "image/jpeg", "image/webp"].includes(asset.content_type) || Number(asset.size) > 10 * 1024 * 1024) || rows.reduce((sum, asset) => sum + Number(asset.size), 0) > 20 * 1024 * 1024) fail("invalid_reference");
    const refs = await assetsToDataUrls(userId, assetIds, model.maxReferenceImages ?? 4);
    if (refs.length !== assetIds.length) fail("invalid_reference");
    if (kind === "image") payload.image = refs.length === 1 ? refs[0] : refs;
    else if (kind === "video") payload.input_references = refs.map(url => ({ type: "image", url }));
  }
  if (kind === "video") payload.async = true;
  return payload;
}

async function reserveGeneration(user: UserRow, account: BusinessAccount, credentialId: string, submission: ReturnType<typeof validateSubmission>, model: BusinessModel) {
  const client = await sql.connect();
  try {
    await client.query("BEGIN");
    const accountRow = await client.query("select id from business_accounts where id=$1 and user_id=$2 and status='approved' for update", [account.id, user.id]);
    if (!accountRow.rows.length) fail("business_not_approved", 403);
    const duplicate = await client.query<BusinessGenerationRow>("select * from business_generations where account_id=$1 and user_id=$2 and client_request_id=$3", [account.id, user.id, submission.clientRequestId]);
    if (duplicate.rows[0]) { await client.query("COMMIT"); return { row: duplicate.rows[0], duplicate: true }; }
    const active = await client.query("select id from business_credentials where id=$1 and account_id=$2 and user_id=$3 and is_active and revoked_at is null", [credentialId, account.id, user.id]);
    if (!active.rows.length) fail("credential_changed", 409);
    const count = await client.query<{ count: string }>("select count(*) from business_generations where account_id=$1 and status=any($2::text[])", [account.id, pending]);
    if (Number(count.rows[0]?.count ?? 0) >= 4) fail("too_many_concurrent", 429);
    const inserted = await client.query<BusinessGenerationRow>(`insert into business_generations(id,account_id,user_id,credential_id,client_request_id,kind,model,prompt,nsfw,status)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,'submitting') returning *`,
    [randomUUID(), account.id, user.id, credentialId, submission.clientRequestId, submission.kind, model.id, submission.parameters.prompt, model.nsfw]);
    await client.query("COMMIT");
    return { row: inserted.rows[0], duplicate: false };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

function validSource(source: string, kind: "image" | "video") {
  if (kind === "image" && /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=\r\n]+$/.test(source)) return true;
  try {
    const url = new URL(source);
    // Fixed upstream only; never fetch arbitrary client input or private-network URLs.
    // Official MiniMax Query Task examples use cdn.hailuoai.com; feature-highlight
    // references use filecdn.minimax.chat. Kling's official docs serve through
    // *.klingai.com (p4-kling/s15-kling); only this vendor-controlled root is added.
    // https://platform.minimax.io/docs/api-reference/video-generation-v2-query
    // https://platform.minimax.io/docs/guides/video-prompt
    // https://kling.ai/document-api/apiReference/model/textToVideo
    const exact = ["cdn.hailuoai.com", "filecdn.minimax.chat"].includes(url.hostname);
    const vendor = ["volces.com", "amazonaws.com", "googleusercontent.com", "googleapis.com", "siraya.ai", "openaiusercontent.com", "blob.core.windows.net", "aliyuncs.com", "klingai.com"].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
    return url.protocol === "https:" && !url.username && !url.password && !url.port && (exact || vendor);
  } catch { return false; }
}

async function persistBusinessMedia(source: string, row: BusinessGenerationRow, kind: "image" | "video") {
  if (!blobConfigured() || !validSource(source, kind)) fail("storage_unavailable", 503);
  let bytes: Buffer;
  let contentType: string;
  const data = /^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/.exec(source);
  const maxBytes = kind === "image" ? 30 * 1024 * 1024 : 200 * 1024 * 1024;
  if (data) {
    if (data[2].length > maxBytes * 1.4) fail("storage_unavailable", 503);
    bytes = Buffer.from(data[2], "base64"); contentType = data[1];
  } else {
    const response = await fetch(source, { signal: AbortSignal.timeout(120000), redirect: "error" });
    if (!response.ok || !response.body || Number(response.headers.get("content-length") ?? 0) > maxBytes) { await response.body?.cancel(); fail("storage_unavailable", 503); }
    contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (kind === "image" ? !["image/png", "image/jpeg", "image/webp"].includes(contentType) : !["video/mp4", "video/webm", "video/quicktime"].includes(contentType)) { await response.body.cancel(); fail("storage_unavailable", 503); }
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.byteLength; if (length > maxBytes) { await reader.cancel(); fail("storage_unavailable", 503); } chunks.push(chunk.value); } }
    finally { reader.releaseLock(); }
    bytes = Buffer.concat(chunks);
  }
  const ext = contentType === "image/jpeg" ? "jpg" : contentType === "video/quicktime" ? "mov" : contentType.split("/")[1];
  const blob = await put(`business/${row.account_id}/${row.nsfw ? "adult" : "standard"}/${row.id}-${randomUUID()}.${ext}`, bytes, { access: "private", contentType, addRandomSuffix: false });
  return `/api/business/media/${blob.pathname.slice("business/".length)}`;
}

async function updateGeneration(row: BusinessGenerationRow, status: BusinessGenerationStatus, output: BusinessOutput | null, errorCode: string | null, providerOutput?: BusinessOutput | null, taskId?: string | null) {
  const result = await sql.query<BusinessGenerationRow>(`update business_generations set status=$1,output=$2::jsonb,error_code=$3,
    provider_output=coalesce($4::jsonb,provider_output),provider_task_id=coalesce($5,provider_task_id),updated_at=now()
    where id=$6 and account_id=$7 and user_id=$8 returning *`, [status, output ? JSON.stringify(output) : null, errorCode,
    providerOutput ? JSON.stringify(providerOutput) : null, taskId ?? null, row.id, row.account_id, row.user_id]);
  return result.rows[0];
}

async function finishMedia(row: BusinessGenerationRow, source: BusinessOutput) {
  // Persist recovery sources before touching Blob. Retrying this download never invokes a paid model call.
  row = await updateGeneration(row, "processing", null, null, source);
  try {
    const output: BusinessOutput = {};
    if (source.images) output.images = await Promise.all(source.images.map(async image => ({ url: await persistBusinessMedia(image.url, row, "image") })));
    if (source.videoUrl) output.videoUrl = await persistBusinessMedia(source.videoUrl, row, "video");
    return await updateGeneration(row, "completed", output, null);
  } catch { return updateGeneration(row, "processing", null, "storage_unavailable"); }
}

function providerErrorCode(error: unknown) {
  if (error instanceof SirayaApiError) {
    if ([401, 403].includes(error.status)) return "provider_unauthorized";
    if ([402, 429].includes(error.status)) return "provider_quota";
    if (error.status >= 400 && error.status < 500) return "provider_rejected";
  }
  return "outcome_unknown";
}

export async function createBusinessGeneration(user: UserRow, account: BusinessAccount, body: unknown) {
  const submission = validateSubmission(body);
  // Durable replay before credential lookup/model catalog changes; never call a model twice for the same UUID.
  const existing = await sql.query<BusinessGenerationRow>("select * from business_generations where account_id=$1 and user_id=$2 and client_request_id=$3", [account.id, user.id, submission.clientRequestId]);
  if (existing.rows[0]) { assertBusinessGenerationAge(existing.rows[0], user); return { row: existing.rows[0], duplicate: true }; }
  const model = (await businessModelCatalog()).find(item => item.id === submission.parameters.model && item.modality === submission.kind);
  if (!model) fail("model_unavailable", 400);
  assertBusinessGenerationAge(model, user);
  const credential = await getBusinessCredential(user.id, account.id);
  if (!credential) fail("credential_required", 409);
  const payload = await normalizedParameters(submission.kind, submission.parameters, model, user.id, account.id, credential);
  const reservation = await reserveGeneration(user, account, credential.id, submission, model);
  if (reservation.duplicate) { assertBusinessGenerationAge(reservation.row, user); return reservation; }
  let row = reservation.row;
  // Recheck approval/revocation immediately before paid I/O, while pinning this job's original key version.
  const pinned = await getBusinessCredential(user.id, account.id, row.credential_id);
  if (!pinned) return { row: await updateGeneration(row, "failed", null, "credential_missing"), duplicate: false };
  let result: unknown;
  try {
    const options = { apiKey: pinned.apiKey };
    if (row.kind === "image") result = await createImage(payload as unknown as ImageGenerationRequest, options);
    else if (row.kind === "video") result = await createVideo(payload as unknown as VideoGenerationRequest, options);
    else result = await createChatCompletion(payload as unknown as Parameters<typeof createChatCompletion>[0], options);
  } catch (error) {
    const code = providerErrorCode(error);
    return { row: await updateGeneration(row, code === "outcome_unknown" ? "unknown" : "failed", null, code), duplicate: false };
  }
  if (!record(result)) return { row: await updateGeneration(row, "unknown", null, "outcome_unknown"), duplicate: false };
  if (row.kind === "text") {
    const choice = Array.isArray(result.choices) ? result.choices[0] : null;
    const text = record(choice) && record(choice.message) && typeof choice.message.content === "string" ? choice.message.content.trim() : "";
    row = await updateGeneration(row, text ? "completed" : "failed", text ? { text } : null, text ? null : "result_missing");
  } else if (row.kind === "image") {
    const images = (Array.isArray(result.data) ? result.data : []).flatMap(image => {
      if (!record(image)) return [];
      const url = typeof image.url === "string" ? image.url : typeof image.b64_json === "string" ? `data:${sniffImageMimeFromBase64(image.b64_json)};base64,${image.b64_json}` : "";
      return url && validSource(url, "image") ? [{ url }] : [];
    }).slice(0, Number(payload.n));
    row = images.length ? await finishMedia(row, { images }) : await updateGeneration(row, "failed", null, "result_missing");
  } else {
    const url = videoUrl(result);
    const id = typeof result.id === "string" && /^[a-zA-Z0-9_-]{1,2000}$/.test(result.id) ? result.id : null;
    if (url) row = await finishMedia(row, { videoUrl: url });
    else if (id) row = await updateGeneration(row, "processing", null, null, null, id);
    else row = await updateGeneration(row, "unknown", null, "outcome_unknown");
  }
  return { row, duplicate: false };
}

function videoUrl(result: Record<string, unknown>) {
  const first = Array.isArray(result.data) ? result.data[0] : null;
  const value = result.output_url ?? (record(first) ? first.url : null);
  return typeof value === "string" && validSource(value, "video") ? value : null;
}

export async function listBusinessGenerations(user: UserRow, account: BusinessAccount) {
  const { rows } = await sql.query<BusinessGenerationRow>("select * from business_generations where account_id=$1 and user_id=$2 and ($3::boolean or nsfw=false) order by created_at desc limit 100", [account.id, user.id, isAdultVerified(user)]);
  return rows.map(publicBusinessGeneration);
}

export async function getBusinessGeneration(user: UserRow, account: BusinessAccount, id: string) {
  if (!UUID.test(id)) fail("generation_not_found", 404);
  const owned = await sql.query<BusinessGenerationRow>("select * from business_generations where id=$1 and account_id=$2 and user_id=$3", [id, account.id, user.id]);
  let row = owned.rows[0];
  if (!row) fail("generation_not_found", 404);
  assertBusinessGenerationAge(row, user);
  if (row.status !== "processing") return row;
  // One read-only reconciliation per job. Concurrent tabs cannot duplicate Blob uploads.
  const claimed = await sql.query<BusinessGenerationRow>(`update business_generations set reconcile_after=now()+interval '5 minutes'
    where id=$1 and account_id=$2 and user_id=$3 and status='processing'
    and (reconcile_after is null or reconcile_after<now()) returning *`, [id, account.id, user.id]);
  if (!claimed.rows[0]) return row;
  row = claimed.rows[0];
  try {
    if (row.provider_output) return await finishMedia(row, row.provider_output);
    if (row.kind !== "video" || !row.provider_task_id) return row;
    const credential = await getBusinessCredential(user.id, account.id, row.credential_id);
    if (!credential) return await updateGeneration(row, "processing", null, "credential_missing");
    let result: unknown;
    try { result = await getVideoStatus(row.provider_task_id, { apiKey: credential.apiKey }); }
    catch { return row; } // Read-only lookup may be retried, never resubmit the paid POST.
    if (!record(result)) return row;
    const status = String(result.status ?? "processing").toLowerCase();
    const url = videoUrl(result);
    if (["failed", "cancelled", "canceled", "error"].includes(status)) row = await updateGeneration(row, "failed", null, "provider_failed");
    else if (url) row = await finishMedia(row, { videoUrl: url });
    else if (["completed", "succeeded", "success"].includes(status)) row = await updateGeneration(row, "failed", null, "result_missing");
    return row;
  } finally { await sql.query("update business_generations set reconcile_after=null where id=$1 and account_id=$2 and user_id=$3", [id, account.id, user.id]); }
}
