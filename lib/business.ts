import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { VercelPoolClient } from "@vercel/postgres";
import { requireUser } from "./apiauth";
import { isAdultVerified } from "./adultGate";
import { sql, type UserRow } from "./db";
import { localeFromRequest } from "./i18n/server";
import { decryptBusinessSecret, encryptBusinessSecret } from "./businessSecrets";
import { BusinessError, type BusinessAccount, type BusinessCredentialMetadata, type BusinessStatus } from "./businessTypes";

export { BusinessError } from "./businessTypes";
export type { BusinessAccount } from "./businessTypes";
export { isBusinessEncryptionReady } from "./businessSecrets";

interface AccountRow {
  id: string;
  user_id: number | string;
  company_name: string;
  use_case: string;
  status: BusinessStatus;
  review_note: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface CredentialRow {
  id: string;
  provider: "siraya";
  label: string;
  last_four: string;
  updated_at: string | Date;
}

const MESSAGES: Record<string, readonly [string, string, string]> = {
  invalid_origin: ["操作來源不符，請從藍翼企業工作區操作。", "Invalid origin. Use the Blue Wing business workspace.", "操作元が一致しません。Blue Wing のビジネスワークスペースから操作してください。"],
  invalid_body: ["資料格式不正確，請檢查後重試。", "Invalid request. Check the submitted fields.", "入力形式が正しくありません。内容を確認してください。"],
  invalid_application: ["請填寫公司名稱（最多 120 字）與用途（10–2,000 字）。", "Enter a company name (up to 120 characters) and a use case (10–2,000 characters).", "会社名（120 文字以内）と用途（10〜2,000 文字）を入力してください。"],
  application_locked: ["已核准的工作區無需重新申請；如需變更請聯絡管理員。", "This workspace is already approved. Contact an administrator to change the application.", "このワークスペースは承認済みです。申請内容の変更は管理者にお問い合わせください。"],
  business_not_approved: ["企業工作區須經管理員核准後才能使用。", "An administrator must approve this business workspace before use.", "ビジネスワークスペースを使用するには管理者の承認が必要です。"],
  business_suspended: ["企業工作區已暫停，請聯絡管理員。", "This business workspace is suspended. Contact an administrator.", "ビジネスワークスペースは停止中です。管理者にお問い合わせください。"],
  encryption_unavailable: ["企業金鑰保管尚未設定完成，請聯絡管理員。", "Business key encryption is not configured. Contact an administrator.", "ビジネスキーの暗号化が未設定です。管理者にお問い合わせください。"],
  credential_unavailable: ["這組企業金鑰目前無法使用，請重新儲存金鑰或聯絡管理員。", "This business key is unavailable. Save the key again or contact an administrator.", "このビジネスキーは利用できません。再登録するか管理者にお問い合わせください。"],
  credential_required: ["請先接入你自己的 SIRAYA API Key。", "Connect your own SIRAYA API key first.", "先にご自身の SIRAYA API キーを接続してください。"],
  credential_changed: ["金鑰已更新，這次尚未送出生成。請重新整理並確認使用的新金鑰。", "The key changed before generation was submitted. Refresh and confirm the new key.", "生成の送信前にキーが更新されました。再読み込みし、新しいキーを確認してください。"],
  credential_validation_failed: ["無法使用這組金鑰讀取模型清單，請確認金鑰權限後重試。", "The model list could not be read with this key. Check its permissions and try again.", "このキーでモデル一覧を取得できません。権限を確認して再試行してください。"],
  invalid_parameters: ["生成參數不受支援或格式不正確，請檢查設定。", "The generation parameters are unsupported or invalid. Check the settings.", "生成パラメータが未対応または不正です。設定を確認してください。"],
  invalid_reference: ["參考圖須為自己的 PNG、JPEG 或 WebP，張數依模型上限，每張不超過 10 MB、合計不超過 20 MB。", "Use your own PNG, JPEG or WebP references within the model’s image limit: 10 MB each and 20 MB in total.", "ご自身の PNG、JPEG、WebP をモデルの参照枚数上限内で使用してください。各 10 MB、合計 20 MB までです。"],
  too_many_concurrent: ["最多可同時處理 4 個任務；結果尚未確定的任務會保留待查，請先重新讀取進度。", "Up to 4 jobs may run at once. Jobs with an uncertain outcome remain reserved; refresh their status first.", "同時処理は最大 4 件です。結果が不明なジョブは予約を保持します。先に進行状況を再取得してください。"],
  storage_unavailable: ["成果儲存暫時無法使用，請重新讀取任務，無需重新送出生成。", "Result storage is temporarily unavailable. Refresh the job without submitting another generation.", "成果の保存を一時的に利用できません。生成を再送せず、ジョブを再取得してください。"],
  model_unavailable: ["此模型尚未開放或尚未完成驗證，請選擇其他模型。", "This model is not available or has not been verified. Choose another model.", "このモデルは未公開または未検証です。別のモデルを選択してください。"],
  generation_not_found: ["找不到這個企業任務。", "This business job was not found.", "このビジネスジョブが見つかりません。"],
  invalid_media_path: ["成果路徑格式不正確。", "The result path is invalid.", "成果のパスが正しくありません。"],
  not_found: ["找不到這個成果，或你沒有存取權限。", "This result was not found or is not accessible to you.", "この成果が見つからないか、アクセス権がありません。"],
  invalid_range: ["影片讀取範圍不正確，請重新整理後再試。", "The video byte range is invalid. Refresh and try again.", "動画の読み込み範囲が正しくありません。再読み込みしてお試しください。"],
  unsupported_media: ["這個成果的媒體格式不受支援。", "This result uses an unsupported media format.", "この成果のメディア形式は未対応です。"],
  prompt_blocked: ["這個內容無法生成；涉及未成年性內容或毒品的要求未開放。", "This content cannot be generated. Requests involving sexual content with minors or drugs are not supported.", "この内容は生成できません。未成年者の性的コンテンツや薬物に関するリクエストには対応していません。"],
  invalid_key: ["請輸入有效格式的 SIRAYA 生成用 API Key（sk- 開頭）。", "Enter a SIRAYA generation API key beginning with sk-.", "sk- で始まる SIRAYA 生成用 API キーを入力してください。"],
  invalid_label: ["金鑰名稱須為 1–64 字。", "Key labels must contain 1–64 characters.", "キー名は 1〜64 文字で入力してください。"],
  invalid_review: ["請提供有效的審核狀態與最新版本。", "Provide a valid review status and current version.", "有効な審査ステータスと最新のバージョンを指定してください。"],
  review_conflict: ["申請已由其他操作更新，請重新整理後再審核。", "The application changed. Refresh before reviewing it again.", "申請が更新されました。再読み込みしてから審査してください。"],
  account_not_found: ["找不到這個企業申請。", "This business application was not found.", "このビジネス申請が見つかりません。"],
  age_unverified: ["成人模型僅供年滿 18 歲的使用者使用，請先確認出生日期。", "Adult models are restricted to users aged 18 or older. Confirm your birth date first.", "成人向けモデルは 18 歳以上の方のみ使用できます。先に生年月日を確認してください。"],
  invalid_date: ["請輸入有效的出生日期。", "Enter a valid birth date.", "有効な生年月日を入力してください。"],
  under_age: ["這個區域限 18 歲以上使用。", "This area is restricted to users aged 18 or older.", "このエリアは 18 歳以上の方のみ利用できます。"],
  unavailable: ["企業服務暫時無法使用，請稍後再試。", "The business service is temporarily unavailable. Try again later.", "ビジネスサービスを一時的に利用できません。しばらくしてからお試しください。"],
};

/** Explicit privacy headers also cover authentication failures and mutation errors. */
export function businessNoStore<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Vary", "Cookie");
  return response;
}

export function businessJson(body: unknown, status = 200): NextResponse {
  return businessNoStore(NextResponse.json(body, { status }));
}

export function businessErrorResponse(req: NextRequest, error: unknown): NextResponse {
  const known = error instanceof BusinessError;
  const code = known && /^[a-z][a-z0-9_]{0,63}$/.test(error.code) ? error.code : "unavailable";
  const locale = localeFromRequest(req);
  const text = MESSAGES[code] ?? MESSAGES.unavailable;
  return businessJson({ error: { code, message: text[locale === "en" ? 1 : locale === "ja" ? 2 : 0] } }, known ? error.status : 503);
}

/** Cookie-authenticated writes are deliberately unavailable to cross-origin callers. */
export function assertBusinessOrigin(req: NextRequest): void {
  if (req.headers.get("origin") !== req.nextUrl.origin || req.headers.get("sec-fetch-site") === "cross-site") {
    throw new BusinessError("invalid_origin", 403);
  }
}

/** Bound the stream before parsing: Content-Length can be absent or deliberately inaccurate. */
export async function readBusinessJson(req: NextRequest, maxBytes = 16_384): Promise<Record<string, unknown>> {
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new BusinessError("invalid_body");
  const reader = req.body?.getReader();
  if (!reader) throw new BusinessError("invalid_body");
  const chunks: Uint8Array[] = [];
  const byteLimit = Number.isSafeInteger(maxBytes) && maxBytes > 0 ? Math.min(maxBytes, 65_536) : 16_384;
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > byteLimit) {
        await reader.cancel();
        throw new BusinessError("invalid_body", 413);
      }
      chunks.push(value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BusinessError("invalid_body");
    return body as Record<string, unknown>;
  } catch (error) {
    throw error instanceof BusinessError ? error : new BusinessError("invalid_body");
  } finally {
    reader.releaseLock();
  }
}

function iso(value: string | Date): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function publicAccount(row: AccountRow): BusinessAccount {
  return { id: row.id, userId: Number(row.user_id), companyName: row.company_name, useCase: row.use_case, status: row.status, reviewNote: row.review_note, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}

function publicCredential(row: CredentialRow): BusinessCredentialMetadata {
  return { id: row.id, provider: row.provider, label: row.label, last4: row.last_four, updatedAt: iso(row.updated_at) };
}

export async function getBusinessAccount(userId: number): Promise<BusinessAccount | null> {
  const { rows } = await sql<AccountRow>`select id,user_id,company_name,use_case,status,review_note,created_at,updated_at from business_accounts where user_id=${userId} limit 1`;
  return rows[0] ? publicAccount(rows[0]) : null;
}

/** Admin users are subject to the same business approval and age checks as every other user. */
export async function requireBusiness(req: NextRequest, options: { adult?: boolean } = {}): Promise<{ user: UserRow; account: BusinessAccount } | { error: NextResponse }> {
  const auth = await requireUser(req);
  if ("error" in auth) return { error: businessNoStore(auth.error) };
  try {
    const account = await getBusinessAccount(auth.user.id);
    if (account?.status === "suspended") throw new BusinessError("business_suspended", 403);
    if (!account || account.status !== "approved") throw new BusinessError("business_not_approved", 403);
    if (options.adult && !isAdultVerified(auth.user)) throw new BusinessError("age_unverified", 403);
    return { user: auth.user, account };
  } catch (error) {
    return { error: businessErrorResponse(req, error) };
  }
}

export async function getBusinessCredentialMetadata(userId: number, accountId: string): Promise<BusinessCredentialMetadata | null> {
  const { rows } = await sql<CredentialRow>`select id,provider,label,last_four,updated_at from business_credentials where user_id=${userId} and account_id=${accountId} and is_active and revoked_at is null limit 1`;
  return rows[0] ? publicCredential(rows[0]) : null;
}

/** Server-only. Explicit historical ID is only for an already owned job, never caller input. */
export async function getBusinessCredential(userId: number, accountId: string, credentialId?: string): Promise<{ id: string; apiKey: string } | null> {
  const { rows } = await sql.query<{ id: string; secret_envelope: unknown }>(`
    select c.id,c.secret_envelope from business_credentials c
    join business_accounts a on a.id=c.account_id and a.user_id=c.user_id
    where c.user_id=$1 and c.account_id=$2 and a.status='approved' and c.revoked_at is null
      and (($3::uuid is null and c.is_active) or c.id=$3::uuid)
    limit 1`, [userId, accountId, credentialId ?? null]);
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, apiKey: decryptBusinessSecret(row.secret_envelope, userId, accountId, row.id) };
}

async function audit(client: VercelPoolClient, accountId: string, actorId: number, action: string, details: Record<string, unknown>): Promise<void> {
  await client.query("insert into business_audit_events(account_id,actor_user_id,action,details) values($1,$2,$3,$4::jsonb)", [accountId, actorId, action, JSON.stringify(details)]);
}

async function lockApprovedAccount(client: VercelPoolClient, userId: number, accountId: string): Promise<void> {
  const { rows } = await client.query<{ status: BusinessStatus }>("select status from business_accounts where id=$1 and user_id=$2 for update", [accountId, userId]);
  if (rows[0]?.status === "suspended") throw new BusinessError("business_suspended", 403);
  if (rows[0]?.status !== "approved") throw new BusinessError("business_not_approved", 403);
}

function onlyKeys(body: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(body).every(key => keys.includes(key));
}

export async function applyForBusiness(userId: number, body: Record<string, unknown>): Promise<BusinessAccount> {
  const company = typeof body.companyName === "string" ? body.companyName.trim() : "";
  const useCase = typeof body.useCase === "string" ? body.useCase.trim() : "";
  if (!onlyKeys(body, ["companyName", "useCase"]) || company.length < 1 || company.length > 120 || useCase.length < 10 || useCase.length > 2000 || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(company + useCase)) throw new BusinessError("invalid_application");
  const client = await sql.connect();
  try {
    await client.query("BEGIN");
    // This also serializes the initial application, before an account row exists.
    await client.query("select id from users where id=$1 for update", [userId]);
    const current = (await client.query<AccountRow>("select * from business_accounts where user_id=$1 for update", [userId])).rows[0];
    if (current?.status === "approved") throw new BusinessError("application_locked", 409);
    if (current?.status === "suspended") throw new BusinessError("business_suspended", 403);
    if (current?.status === "pending" && current.company_name === company && current.use_case === useCase) {
      await client.query("COMMIT");
      return publicAccount(current);
    }
    const result = current
      ? await client.query<AccountRow>(`update business_accounts set company_name=$2,use_case=$3,status='pending',review_note=null,reviewed_at=null,reviewed_by=null,
          updated_at=greatest(date_trunc('milliseconds',clock_timestamp()),updated_at+interval '1 millisecond') where id=$1 returning *`, [current.id, company, useCase])
      : await client.query<AccountRow>("insert into business_accounts(id,user_id,company_name,use_case) values($1,$2,$3,$4) returning *", [randomUUID(), userId, company, useCase]);
    const row = result.rows[0];
    await audit(client, row.id, userId, current ? "application_resubmitted" : "application_created", { previousStatus: current?.status ?? null });
    await client.query("COMMIT");
    return publicAccount(row);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function saveBusinessCredential(userId: number, accountId: string, body: Record<string, unknown>): Promise<BusinessCredentialMetadata> {
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const label = body.label === undefined ? "SIRAYA" : typeof body.label === "string" ? body.label.trim() : "";
  if (!onlyKeys(body, ["apiKey", "label"]) || !/^sk-[A-Za-z0-9_-]{16,200}$/.test(apiKey)) throw new BusinessError("invalid_key");
  if (!label || label.length > 64 || /[\x00-\x1F]/.test(label)) throw new BusinessError("invalid_label");
  const id = randomUUID();
  const envelope = encryptBusinessSecret(apiKey, userId, accountId, id);
  const client = await sql.connect();
  try {
    await client.query("BEGIN");
    await lockApprovedAccount(client, userId, accountId);
    await client.query("update business_credentials set is_active=false,updated_at=clock_timestamp() where account_id=$1 and user_id=$2 and is_active", [accountId, userId]);
    const { rows } = await client.query<CredentialRow>(`insert into business_credentials(id,account_id,user_id,label,last_four,secret_envelope)
      values($1,$2,$3,$4,$5,$6::jsonb) returning id,provider,label,last_four,updated_at`, [id, accountId, userId, label, apiKey.slice(-4), JSON.stringify(envelope)]);
    await audit(client, accountId, userId, "credential_saved", { credentialId: id, provider: "siraya" });
    await client.query("COMMIT");
    return publicCredential(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteBusinessCredentials(userId: number, accountId: string): Promise<void> {
  const client = await sql.connect();
  try {
    await client.query("BEGIN");
    await lockApprovedAccount(client, userId, accountId);
    // Explicit deletion is stronger than rotation: old jobs cannot continue polling with a removed key.
    const result = await client.query(`update business_credentials set is_active=false,revoked_at=clock_timestamp(),secret_envelope=null,updated_at=clock_timestamp()
      where account_id=$1 and user_id=$2 and revoked_at is null returning id`, [accountId, userId]);
    if (result.rows.length) await audit(client, accountId, userId, "credentials_revoked", { count: result.rows.length });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function listBusinessAccounts(): Promise<(BusinessAccount & { email: string })[]> {
  const { rows } = await sql.query<AccountRow & { email: string }>(`select a.id,a.user_id,a.company_name,a.use_case,a.status,a.review_note,a.created_at,a.updated_at,u.email
    from business_accounts a join users u on u.id=a.user_id order by case when a.status='pending' then 0 else 1 end,a.updated_at desc limit 500`);
  return rows.map(row => ({ ...publicAccount(row), email: row.email }));
}

export async function reviewBusinessAccount(actorId: number, body: Record<string, unknown>): Promise<BusinessAccount> {
  const userId = body.userId;
  const status = body.status;
  const note = body.reviewNote === undefined || body.reviewNote === null ? null : typeof body.reviewNote === "string" ? body.reviewNote.trim() : undefined;
  const expected = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : "";
  if (!onlyKeys(body, ["userId", "status", "reviewNote", "expectedUpdatedAt"]) || typeof userId !== "number" || !Number.isSafeInteger(userId) || userId < 1 || !["approved", "rejected", "suspended"].includes(String(status)) || note === undefined || (note?.length ?? 0) > 2000 || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(expected) || !Number.isFinite(Date.parse(expected))) throw new BusinessError("invalid_review");
  const client = await sql.connect();
  try {
    await client.query("BEGIN");
    const row = (await client.query<AccountRow>("select * from business_accounts where user_id=$1 for update", [userId])).rows[0];
    if (!row) throw new BusinessError("account_not_found", 404);
    if (iso(row.updated_at) !== expected) throw new BusinessError("review_conflict", 409);
    if (row.status === status && row.review_note === note) {
      await client.query("COMMIT");
      return publicAccount(row);
    }
    const { rows } = await client.query<AccountRow>(`update business_accounts set status=$2,review_note=$3,reviewed_by=$4,reviewed_at=clock_timestamp(),
      updated_at=greatest(date_trunc('milliseconds',clock_timestamp()),updated_at+interval '1 millisecond') where id=$1 returning *`, [row.id, status, note, actorId]);
    await audit(client, row.id, actorId, "access_reviewed", { previousStatus: row.status, status });
    await client.query("COMMIT");
    return publicAccount(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
