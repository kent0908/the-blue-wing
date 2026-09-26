"use client";

import { useRef, useState } from "react";

const steps = [
  { title: "構思與草稿", subtitle: "先看見故事的方向", description: "沿用創作區的提示詞與參考素材，先製作草稿，確認動作、構圖與鏡頭走向。", action: "生成草稿", detail: "草稿規格與點數將在正式開放時公布。" },
  { title: "播放與審看", subtitle: "留下值得繼續的版本", description: "播放草稿，檢查角色、動作與轉場。滿意後選擇轉成正式影片；想調整故事時，可修改設定再製作新草稿。", action: "選用這份草稿", detail: "開放後，這裡會顯示草稿影片與原始創作設定。" },
  { title: "正式成片", subtitle: "讓想像完整呈現", description: "以選定的草稿接續生成正式影片。送出前會再次顯示可用規格與所需點數，完成後可在作品紀錄查看與下載。", action: "生成正式影片", detail: "草稿與正式成片的計費方式待確認，不預設為免費或可折抵。" },
];

export default function SeedanceDraftPreview() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const current = steps[step];
  return (
    <>
      <button type="button" onClick={() => { setStep(0); dialog.current?.showModal(); }} className="mx-3 mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-[#38434b] bg-[#1b2227] px-3 py-2 text-left text-xs text-[#dce6ed] hover:bg-[#232e36]">
        <span>Seedance 2.5 · 草稿到成片</span>
        <span className="whitespace-nowrap text-[#a9becd]">即將開放 · 查看流程 ↗</span>
      </button>
      <dialog ref={dialog} aria-labelledby="draft-preview-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl border border-[#35414b] bg-[#151a1e] p-0 text-[#edf0f2] shadow-2xl backdrop:bg-black/75" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
        <div className="p-5 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs tracking-widest text-[#a9becd]">SEEDANCE 2.5 · 即將開放</p><h2 id="draft-preview-title" className="mt-3 text-2xl font-medium">先探索，再成片。</h2></div>
            <button type="button" aria-label="關閉草稿流程" onClick={() => dialog.current?.close()} className="rounded-lg px-3 py-2 text-xl hover:bg-white/10">×</button>
          </div>
          <p className="mt-4 text-sm leading-7 text-[#b7c1c8]">SIRAYA 正在開發草稿模式參數。以下為流程預覽，目前不會提交生成任務，也不會扣除點數。</p>
          <nav aria-label="草稿流程步驟" className="my-6 grid grid-cols-3 gap-2">
            {steps.map((item, index) => <button key={item.title} type="button" aria-current={step === index ? "step" : undefined} onClick={() => setStep(index)} className={`min-w-0 rounded-xl border px-2 py-3 text-left sm:px-4 ${step === index ? "border-[#94afc1] bg-[#283743]" : "border-[#303a42] hover:bg-white/5"}`}><span className="block text-xs text-[#a9becd]">0{index + 1}</span><span className="mt-2 block text-sm [text-wrap:balance]">{item.title}</span></button>)}
          </nav>
          <section aria-live="polite" className="rounded-xl border border-[#303a42] bg-[#101518] p-5 sm:p-7">
            <p className="text-xs text-[#a9becd]">流程預覽 · {step + 1} / 3</p>
            <h3 className="mt-3 text-xl [text-wrap:balance]">{current.subtitle}</h3>
            <p className="mt-4 text-sm leading-7 text-[#c0cad1]">{current.description}</p>
            <p className="mt-4 text-xs leading-6 text-[#95a4af]">{current.detail}</p>
            <button type="button" disabled className="mt-6 w-full cursor-not-allowed rounded-xl border border-[#37434c] bg-[#252e35] px-4 py-3 text-sm text-[#9cabb6]">{current.action} · 尚未開放</button>
          </section>
          <p className="mt-5 text-xs leading-6 text-[#95a4af]">最終支援的解析度、時長、草稿有效期限與費用，將依 SIRAYA 完成的介接規格更新。現有正式影片生成功能仍可正常使用。</p>
          <div className="mt-5 flex justify-between gap-3">
            <button type="button" disabled={step === 0} onClick={() => setStep(value => value - 1)} className="rounded-lg px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-30">上一步</button>
            {step < 2 ? <button type="button" onClick={() => setStep(value => value + 1)} className="rounded-lg bg-[#dce6ed] px-4 py-2 text-sm text-[#17212a]">下一步 →</button> : <button type="button" onClick={() => dialog.current?.close()} className="rounded-lg bg-[#dce6ed] px-4 py-2 text-sm text-[#17212a]">返回創作</button>}
          </div>
        </div>
      </dialog>
    </>
  );
}
