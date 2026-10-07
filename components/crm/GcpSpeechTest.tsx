"use client";
import { useEffect, useState } from "react";
import { Card, Notice, primaryBtnCls, useApi } from "./ui";
import { useTr } from "@/lib/i18n/client";

export default function GcpSpeechTest() {
  const tr = useTr();
  const {data, error} = useApi<{enabled:boolean;publicEnabled:boolean;model:string}>("/api/crm/speech-test");
  const [busy, setBusy] = useState(false);
  const [audio, setAudio] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  useEffect(() => () => { if (audio) URL.revokeObjectURL(audio); }, [audio]);
  async function test() {
    if (busy) return;
    setBusy(true); setFailure(null); setDetail(null);
    try {
      const response = await fetch("/api/crm/speech-test", {method:"POST"});
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        // The admin-only endpoint redacts credentials before returning diagnostics.
        if (typeof body?.error?.detail === "string") setDetail(body.error.detail);
        throw new Error(body?.error?.message || "語音測試失敗");
      }
      setAudio(URL.createObjectURL(await response.blob()));
    } catch (e) {setFailure(e instanceof Error ? e.message : "語音測試失敗");}
    finally {setBusy(false);}
  }
  return <Card title="語音試聽" sub="管理員專用 · Google Cloud 台灣華語測試">
    <div className="space-y-4 text-[12.5px] leading-relaxed">
      <p className="text-[#aaa]">目前模型：{data?.model === "gemini-3.8-flash-tts" ? "Gemini 3.8 Flash TTS" : "Gemini 2.5 Flash TTS"}。先聽一段日常問候，感受語氣與停頓。僅使用下方固定文字，不會讀取陪聊對話。</p>
      <blockquote className="rounded-xl border border-[#292929] bg-[#151515] p-4 text-[#ddd]">今天辛苦了，先休息一下吧。我在這裡，慢慢說就好。</blockquote>
      {(failure || error) && <Notice kind="err">{failure || error}</Notice>}
      {detail && <details className="rounded-lg border border-[#39302d] p-3 text-[#c7aaa2]"><summary className="cursor-pointer">{tr("Google 回傳原因（管理員診斷）")}</summary><p className="mt-3 whitespace-pre-wrap break-words">{detail}</p></details>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={primaryBtnCls} disabled={busy || !data?.enabled} onClick={() => void test()}>{busy ? "正在製作語音…" : "產生試聽"}</button>
        <span className="text-[#999]">{!data ? "讀取設定中" : data.enabled ? "管理員測試已啟用" : "尚未啟用測試"} · {data?.publicEnabled ? "GCP 用戶語音已開啟" : "GCP 用戶語音未開放"}</span>
      </div>
      {audio && <audio aria-label="台灣華語測試音檔" controls src={audio} className="w-full max-w-lg" />}
      <p className="text-[11.5px] text-[#888]">每個模型全站每天最多 3 次測試，失敗也計入次數。不扣用戶點數；生成由 Google 計費。{data?.model === "gemini-3.8-flash-tts" ? "音訊輸出牌價至 2026 年底約 US$0.0135／分鐘，2027 年起 US$0.027／分鐘；文字輸入另計。" : "台灣華語目前為預覽版，音訊輸出牌價約 US$0.015／分鐘，文字輸入另計。"}</p>
    </div>
  </Card>;
}
