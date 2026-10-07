"use client";

import { useState } from "react";
import { Card, Notice, Table, btnCls, fieldCls, pct, td, usd, useApi } from "@/components/crm/ui";
import { modelLabel } from "@/lib/modelLabel";
import type { PriceComponent } from "@/lib/sirayaPublicPrices";
import { simulateCost, promotionEconomics } from "@/lib/costEconomics";
import { useTr } from "@/lib/i18n/client";

type CostRow = { modelId: string; modality: "image" | "video" | "text" | "speech"; active: boolean; credits: number; sellUsd: number; source: string | null; checkedAt: string | null; verification: "official" | "pending"; components: PriceComponent[]; priceNote: string; discountPct: number | null; effectiveDiscountPct: number; notes: string };
type Receipt = { model: string; kind: string; created_at: string; status: string; credits: number; list_cost_usd: number | null; estimated_cost_usd: number | null; provider_cost_usd: number | null; provider_usage: Record<string, number> | null; discount_pct: number | null };
type Costs = { settings: { credit_value_usd: number; default_discount_pct: number }; rows: CostRow[]; receipts: Receipt[]; auditDate: string };
const unitLabel = (c: PriceComponent) => c.unit === "million_tokens" ? "百萬 Token" : c.unit === "second" ? "秒" : "張／層";

export default function CrmCostsPage() {
  const tr = useTr();
  const { data, error, reload } = useApi<Costs>("/api/crm/costs");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const rows = (data?.rows ?? []).filter(r => (filter === "all" || r.modality === filter) && `${r.modelId} ${modelLabel(r.modelId)}`.toLowerCase().includes(search.toLowerCase()));
  const chosen = data?.rows.find(r => r.modelId === selected);
  return <div className="space-y-6">
    <header className="max-w-4xl space-y-3">
      <p className="text-xs tracking-[.2em] text-[#7ff0cd]">COST & PRICING</p>
      <h1 className="text-2xl font-semibold text-white">模型成本與活動試算</h1>
      <p className="text-sm leading-7 text-[#aaa]">分開查看原廠牌價、供應商折扣估算與上游回報費用。點數是零售單位，不能直接視為 Token，也不能把贈點當成營收。</p>
    </header>
    {error && <Notice kind="err">{error}</Notice>}
    <Notice kind="info">{tr("各模型分別標示價格來源與核對日期。Wan 3.0 已於 2026/10/07 核對 SIRAYA 公開目錄；其他模型沿用各自的核對紀錄。折後成本為估算，實際扣款仍以供應商帳單為準。")}</Notice>
    <div className="grid gap-3 sm:grid-cols-3">{[["成本表模型／通道", data?.rows.length ?? "—"], [tr("已核對牌價"), data?.rows.filter(r => r.verification === "official").length ?? "—"], ["待重新核對", data?.rows.filter(r => r.verification !== "official").length ?? "—"]].map(([label,value]) => <div key={label} className="rounded-2xl border border-[#292929] bg-[#121212] p-5"><p className="text-xs text-[#999]">{label}</p><p className="mt-2 text-2xl text-white">{value}</p></div>)}</div>
    <div className="flex flex-wrap gap-3">
      <input aria-label="搜尋模型" placeholder="搜尋模型名稱" value={search} onChange={e => setSearch(e.target.value)} className={`${fieldCls} min-w-0 flex-1`} />
      <select aria-label="模型類型" value={filter} onChange={e => setFilter(e.target.value)} className={fieldCls}><option value="all">全部模型</option><option value="image">圖片</option><option value="video">影片</option><option value="text">文字</option><option value="speech">語音</option></select>
    </div>
    <div className="grid items-start gap-4 xl:grid-cols-2">{rows.map(r => <ModelCard key={`${r.modelId}:${r.discountPct}:${r.notes}`} row={r} globalDiscount={data!.settings.default_discount_pct} onSaved={reload} onCalculate={() => { setSelected(r.modelId); document.getElementById("cost-calculator")?.scrollIntoView({behavior:"smooth"}); }} />)}</div>
    {data && rows.length === 0 && <p className="text-sm text-[#aaa]">沒有符合的模型。</p>}
    <div id="cost-calculator" className="scroll-mt-6"><Card title="單次呼叫與活動成本試算" sub="手動輸入已知用量；不會發送生成請求、扣點或建立活動碼。">
      <div className="space-y-5 p-5">
        <label className="block text-sm text-[#aaa]">選擇模型<select className={`${fieldCls} mt-2 w-full`} value={selected} onChange={e => setSelected(e.target.value)}><option value="">請選擇模型</option>{data?.rows.map(r => <option key={r.modelId} value={r.modelId}>{modelLabel(r.modelId)} · {r.modelId}</option>)}</select></label>
        {chosen && <Calculator key={`${chosen.modelId}:${chosen.effectiveDiscountPct}`} row={chosen} />}
      </div>
    </Card>
    </div>
    <Card title="最近 100 筆呼叫的成本紀錄" sub="新版本開始保存上游費用與用量；舊資料不以今天的牌價回填。上游未回傳、串流缺少回執或其他未接入通道均顯示未知。">
      <Table minWidth={920} head={["時間／模型", "扣點／狀態", "牌價估算", "折後估算", "上游回報 USD", "用量回執"]}>
        {data?.receipts.map((r, i) => <tr key={i}><td className={td}><div>{new Date(r.created_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</div><div className="max-w-64 break-words text-xs text-[#999]">{r.model}</div></td><td className={td}>{r.credits} 點<br />{r.status === "refunded" ? "已退點（不代表供應商退款）" : "已扣點"}</td><td className={td}>{usd(r.list_cost_usd, 6)}</td><td className={td}>{usd(r.estimated_cost_usd, 6)}<br /><span className="text-xs text-[#999]">快照折扣 {pct(r.discount_pct)}</span></td><td className={td}>{usd(r.provider_cost_usd, 8)}<div className="text-xs text-[#999]">獨立顯示，不再乘折扣</div></td><td className={td}><details><summary className="cursor-pointer text-[#7ff0cd]">{Object.keys(r.provider_usage ?? {}).length ? "查看數值" : "尚無回執"}</summary>{Object.entries(r.provider_usage ?? {}).map(([k,v]) => <div key={k} className="mt-1 max-w-72 break-all font-mono text-xs">{k}: {v}</div>)}</details></td></tr>)}
        {data?.receipts.length === 0 && <tr><td className={td} colSpan={6}>目前沒有用量紀錄。</td></tr>}
      </Table>
    </Card>
  </div>;
}

function ModelCard({row: r, globalDiscount, onSaved, onCalculate}: {row: CostRow; globalDiscount: number; onSaved: () => void; onCalculate: () => void}) {
  const tr = useTr();
  const [discount, setDiscount] = useState(r.discountPct === null ? "" : String(r.discountPct));
  const [notes, setNotes] = useState(r.notes);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const value = discount === "" ? globalDiscount : Number(discount);
  const valid = Number.isFinite(value) && value >= 0 && value <= 100;
  async function save() {
    if (!valid) return;
    setSaving(true); setMessage("");
    try {
      const res = await fetch("/api/crm/costs", {method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify({modelId:r.modelId, discountPct:discount === "" ? null : value, notes})});
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || "儲存失敗");
      setMessage("已儲存；僅影響後續估算。"); onSaved();
    } catch(e) {setMessage(e instanceof Error ? e.message : "儲存失敗");} finally {setSaving(false);}
  }
  return <article className="min-w-0 space-y-4 rounded-2xl border border-[#292929] bg-[#121212] p-5">
    <div><div className="flex flex-wrap items-start justify-between gap-2"><h2 className="text-base font-medium text-white">{modelLabel(r.modelId)}</h2><span className={`text-xs ${r.verification === "official" ? "text-[#7ff0cd]" : "text-amber-300"}`}>{r.verification === "official" ? (/^https:\/\/llm-ext-api\.siraya\.ai\//.test(r.source ?? "") ? tr("SIRAYA 公開牌價") : "原廠參考價") : "舊牌價待核對"}{r.active ? "" : " · 已停用"}</span></div><p className="mt-1 break-all font-mono text-xs text-[#888]">{r.modelId}</p></div>
    <p className="text-xs leading-6 text-[#aaa]">零售基準 {r.credits} 點（{r.modality === "video" ? "480p 每秒；解析度另乘倍率" : r.modality === "image" ? "每張；特殊模式依生成報價" : r.modality === "text" ? "每輪基礎費；另有 Token 預算費" : "每 40 個朗讀字元；重播不再扣點"}）。此數值不等於實收。</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-[#888]"><tr><th className="pb-2 font-normal">計費條件／單位</th><th className="pb-2 text-right font-normal">牌價 USD</th><th className="pb-2 text-right font-normal">折後估算</th></tr></thead><tbody>{r.components.map(c => <tr key={c.id} className="border-t border-[#252525]"><td className="py-2 pr-3 leading-5">{c.label}<span className="block text-[#777]">／{unitLabel(c)}</span></td><td className="whitespace-nowrap py-2 pl-2 text-right tabular-nums">{usd(c.price, 4)}</td><td className="whitespace-nowrap py-2 pl-2 text-right tabular-nums text-[#7ff0cd]">{usd(valid ? c.price * (1-value/100) : null, 6)}</td></tr>)}</tbody></table></div>
    <p className="text-xs leading-6 text-[#aaa]">{r.priceNote}</p>
    {r.source && <a className="block text-xs text-[#7ff0cd] underline underline-offset-4" href={r.source} target="_blank" rel="noreferrer">價格來源 · 核對日期 {r.checkedAt}</a>}
    <div className="grid gap-3 sm:grid-cols-[140px_1fr]"><label className="text-xs text-[#aaa]">供應商折扣 %<input aria-label={`${r.modelId} 供應商折扣`} type="number" min="0" max="100" step="0.1" value={discount} placeholder={`預設 ${globalDiscount}%`} onChange={e => setDiscount(e.target.value)} className={`${fieldCls} mt-2 w-full`} /></label><label className="text-xs text-[#aaa]">內部備註<input maxLength={400} value={notes} onChange={e => setNotes(e.target.value)} className={`${fieldCls} mt-2 w-full`} /></label></div>
    <p className="text-xs text-[#888]">20% 代表減價 20%（支付八折）；留空沿用預設。此處不是客戶活動折扣。</p>
    <div className="flex flex-wrap gap-2"><button disabled={saving || !valid} onClick={() => void save()} className={btnCls}>{saving ? "儲存中…" : "儲存折扣"}</button><button onClick={onCalculate} className={btnCls}>帶入下方試算</button></div>
    {!valid && <Notice kind="err">折扣須為 0–100%。</Notice>}{message && <p role="status" className="text-xs text-[#aaa]">{message}</p>}
  </article>;
}

function Calculator({row}: {row: CostRow}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [discount, setDiscount] = useState(String(row.effectiveDiscountPct));
  const [values, setValues] = useState({paidUsd:"9", baseCredits:"900", bonusCredits:"0", callCredits:"", feePct:"0"});
  const result = discount.trim() === "" ? null : simulateCost(row.components, quantities, Number(discount));
  const inputs = Object.fromEntries(Object.entries(values).map(([k,v]) => [k, v.trim() === "" ? NaN : Number(v)])) as Record<keyof typeof values, number>;
  const economics = result ? promotionEconomics({...inputs, costUsd:result.discounted}) : null;
  return <div className="space-y-5">
    <Notice kind="info">同一次呼叫請只填適用規格：解析度、含／無影片、尖峰／離峰擇一。Token 請填實際數量（例如 1000000），不是「百萬」倍數；快取與未快取輸入分開填。這是所填項目的試算，不是帳單認列。</Notice>
    {row.verification !== "official" && <Notice kind="err">此模型仍是未重新確認的舊牌價，結果不可作為定價依據。</Notice>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{row.components.map(c => <label key={c.id} className="text-xs leading-6 text-[#aaa]">{c.label} · {c.unit === "million_tokens" ? "Token 數" : unitLabel(c)}<input type="number" min="0" max="1000000000000" placeholder="未使用留空" value={quantities[c.id] ?? ""} onChange={e => setQuantities(q => ({...q,[c.id]:e.target.value === "" ? 0 : Number(e.target.value)}))} className={`${fieldCls} mt-1 w-full`} /></label>)}</div>
    {!result && Object.values(quantities).some(n => n > 0) && <Notice kind="err">請檢查數量與折扣，且同一呼叫不可混用不同解析度、時段或輸入模式。</Notice>}
    <label className="block max-w-xs text-xs text-[#aaa]">本次試算供應商折扣 %<input type="number" min="0" max="100" value={discount} onChange={e => setDiscount(e.target.value)} className={`${fieldCls} mt-2 w-full`} /></label>
    <div className="rounded-xl bg-[#19231f] p-4 text-sm leading-7 text-white">所填用量牌價：{usd(result?.list, 6)}<br />供應商折扣後：{usd(result?.discounted, 6)}</div>
    <h3 className="text-base text-white">活動碼／贈點的經濟效益</h3>
    <p className="text-xs leading-6 text-[#aaa]">實收 ÷（付費點數＋贈送點數）＝每點有效收入。此處僅做活動規劃，不會發放點數；純贈送填實收 0，成本仍保留。稅費、退款、儲存、運算與人工費用需另評估。</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{([['paidUsd','套用活動碼後實收 USD'],['baseCredits','原方案／付費點數'],['bonusCredits','額外贈點'],['callCredits','這次生成實際扣點'],['feePct','金流費率 %']] as const).map(([key,label]) => <label key={key} className="text-xs text-[#aaa]">{label}<input type="number" min="0" step="any" value={values[key]} onChange={e => setValues(v => ({...v,[key]:e.target.value}))} className={`${fieldCls} mt-2 w-full`} /></label>)}</div>
    <div className="rounded-xl border border-[#333] p-4 text-sm leading-8 text-[#ccc]">每點有效收入：{usd(economics?.cashPerCredit, 6)}<br />此次分攤收入：{usd(economics?.allocatedCash, 6)}<br />扣除模型成本的差額：{usd(economics?.contribution, 6)}（{pct(economics?.marginPct)}）<br />模型成本損益兩平扣點：{economics?.breakEvenCredits ?? "—"}</div>
    {economics && economics.contribution < 0 && <Notice kind="err">此情境不足以支付模型成本；請調整贈點、售價、扣點或供應商折扣。</Notice>}
  </div>;
}
