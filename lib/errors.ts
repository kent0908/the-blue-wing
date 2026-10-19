import { ProviderAssetError } from "./providerAssets";
import { PromptSafetyError } from "./promptSafety";
import { NextResponse } from "next/server";
import { SirayaApiError, SirayaConfigError } from "./siraya";
import { KlingVideoParameterError } from "./klingVideo";
import { MiniMaxVideoParameterError } from "./minimaxVideo";

/** Turn any thrown error into the documented SIRAYA error envelope. */
export function errorResponse(err: unknown) {
  if (err instanceof MiniMaxVideoParameterError) {
    return NextResponse.json({ error: { message: "MiniMax 參數不相容，請檢查時長、解析度與參考素材。", code: err.code } }, { status: 400 });
  }
  if (err instanceof KlingVideoParameterError) {
    return NextResponse.json({ error: { message: "Kling 參數不相容，請檢查時長、解析度與聲音設定。", code: err.code } }, { status: 400 });
  }
  if (err instanceof ProviderAssetError) {
    return NextResponse.json({error:{message:err.message,code:err.code}}, {status:err.status});
  }
  if (err instanceof PromptSafetyError) {
    return NextResponse.json({ error: { message: err.message, type: err.type, code: err.code } }, { status: err.status });
  }
  if (err instanceof SirayaConfigError) {
    return NextResponse.json(
      { error: { message: "生成服務尚未完成設定，請聯絡管理員。", type: "configuration_error", code: "missing_api_key" } },
      { status: 500 }
    );
  }
  if (err instanceof SirayaApiError) {
    return NextResponse.json(
      { error: { message: err.message.replace(/siraya[\s._:/-]*/gi, ""), type: err.type, code: err.code } },
      { status: err.status }
    );
  }
  const message = "系統暫時無法處理，請稍後再試";
  return NextResponse.json(
    { error: { message, type: "internal_server_error", code: 500 } },
    { status: 500 }
  );
}
