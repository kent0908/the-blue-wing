export interface RegisteredProviderAsset {
  id: number;
  sourceAssetId: number | null;
  name: string;
  assetType: string;
  status: string;
  src: string | null;
}

const messages: Record<string, string> = {
  asset_unconfigured: "素材登錄服務尚未設定，請聯絡管理員。",
  asset_feature_inactive: "素材登錄服務尚未啟用或沒有使用權限，請聯絡管理員。",
  asset_upstream_error: "素材服務暫時無法完成操作，請稍後更新狀態。",
  asset_unavailable: "素材服務暫時無法使用，請稍後再試。",
  asset_upload_uncertain: "素材登錄結果待確認，請勿重複上傳；請更新狀態或聯絡管理員。",
  asset_needs_review: "素材登錄結果尚未確認，請聯絡管理員處理。",
  asset_not_active: "素材仍在處理中或未通過審核，尚不能用於生成。",
  asset_not_found: "找不到這個素材，請重新整理資產庫。",
  asset_consent_required: "請先確認您擁有素材與人物肖像使用授權。",
};
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function fallback(status: number, action: boolean) {
  if (status === 401) return "登入已失效，請重新登入後再試。";
  if (status === 403) return "您沒有使用這項素材功能的權限，請聯絡管理員。";
  if (status === 404) return "找不到素材或素材服務，請重新整理後再試。";
  if (status === 413) return "素材檔案過大，請縮小檔案後再試。";
  if (status === 429) return "操作過於頻繁，請稍候再試。";
  return action
    ? "素材操作結果暫時無法確認，請先更新狀態，避免重複登錄。"
    : "暫時無法載入素材清單，請稍後重新整理。";
}

/** Never render HTML/proxy response bodies or JSON parser internals to users. */
export async function readProviderAssetResponse(response: Response, action = false): Promise<Record<string, unknown>> {
  if (response.status === 204) return {};
  let payload: unknown;
  try { payload = JSON.parse(await response.text()); }
  catch { throw new Error(fallback(response.status, action)); }
  if (!response.ok) {
    const error = object(payload) && object(payload.error) ? payload.error : null;
    const known = typeof error?.code === "string" ? messages[error.code] : undefined;
    // Input validation messages are authored by our API. Unknown upstream text
    // is deliberately replaced, so provider details never leak into the UI.
    const invalid = error?.code === "asset_invalid" && typeof error.message === "string" && !/[<>]/u.test(error.message) && error.message.length <= 200 ? error.message : undefined;
    throw new Error(known || invalid || fallback(response.status, action));
  }
  if (!object(payload)) throw new Error(fallback(response.status, action));
  return payload;
}

export function providerAssetPage(payload: Record<string, unknown>): { assets: RegisteredProviderAsset[]; totalPages: number } {
  const valid = Array.isArray(payload.assets) && payload.assets.every(item => object(item)
    && Number.isSafeInteger(item.id) && Number(item.id) > 0
    && (item.sourceAssetId === null || Number.isSafeInteger(item.sourceAssetId))
    && typeof item.name === "string" && typeof item.assetType === "string" && typeof item.status === "string"
    && (item.src === null || typeof item.src === "string"));
  if (!valid || !object(payload.pagination) || !Number.isSafeInteger(payload.pagination.totalPages) || Number(payload.pagination.totalPages) < 0) {
    throw new Error("素材清單回應不完整，請稍後重新整理。");
  }
  return { assets: payload.assets as RegisteredProviderAsset[], totalPages: Math.max(1, Number(payload.pagination.totalPages)) };
}
