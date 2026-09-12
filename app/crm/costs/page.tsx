"use client";

import { useState } from "react";
import { Card, Notice, Table, btnCls, fieldCls, pct, td, tdNum, usd, useApi } from "@/components/crm/ui";
import { modelLabel } from "@/lib/modelLabel";

interface CostRow {
  modelId: string;
  modality: "image" | "video" | "text";
  active: boolean;
  credits: number;
  sellUsd: number;
  listPriceUsd: number | null;
  priceUnit: string;
  inputPriceUsd: number | null;
  priceNote: string;
  source: string | null;
  checkedAt: string | null;
  discountPct: number | null;
  effectiveDiscountPct: number;
  actualCostUsd: number;
  marginPct: number | null;
  notes: string;
}
interface Costs {
  settings: { credit_value_usd: number; default_discount_pct: number };
  resolutionMultiplier: Record<string, number>;
  rows: CostRow[];
}



/**
 * 成本設定 — one row per model in the rate card: the vendor list price we
 * pay per unit, the discount this account actually gets (blank = global
 * default), and the resulting margin against what a credit sells for.
 */
export default function CrmCostsPage() {
  const { data, error, reload } = useApi<Costs>("/api/crm/costs");
  const [drafts, setDrafts] = useState<Record<string, { listPriceUsd: string; discountPct: string; notes: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [filter, setFilter] = useState<"all" | CostRow["modality"]>("all");

  // re-seed the editable drafts whenever a fresh payload arrives (state adjusted during render, not in an effect)
  const [seeded, setSeeded] = useState<Costs | null>(null);
  if (data && data !== seeded) {
    setSeeded(data);
    setDrafts(Object.fromEntries(data.rows.map((r) => [r.modelId, { listPriceUsd: r.listPriceUsd ? String(r.listPriceUsd) : "", discountPct: r.discountPct === null ? "" : String(r.discountPct), notes: r.notes }])));
  }

  const save = async (r: CostRow) => {
    const d = drafts[r.modelId];
    if (!d) return;
    setSaving(r.modelId);
    setMsg(null);
    try {
      const res = await fetch("/api/crm/costs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelId: r.modelId, discountPct: d.discountPct === "" ? null : Number(d.discountPct), notes: d.notes }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || "儲存失敗");
      setMsg({ kind: "ok", text: `${modelLabel(r.modelId)} 已更新` });
      reload();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "儲存失敗" });
    } finally {
      setSaving(null);
    }
  };

  const preview = (r: CostRow) => {
    const d = drafts[r.modelId];
    const list = Number(d?.listPriceUsd) || 0;
    const disc = d?.discountPct === "" || d?.discountPct === undefined ? (data?.settings.default_discount_pct ?? 0) : Number(d.discountPct) || 0;
    const actual = r.listPriceUsd === null ? null : list * (1 - disc / 100);
    const margin: number | null = null;
    return { actual, margin, disc };
  };

  const rows = (data?.rows ?? []).filter((r) => filter === "all" || r.modality === filter);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold text-white">成本設定</h1>
        <p className="text-[12.5px] text-[#8a8a8a]">
          牌價依 SIRAYA 公開模型目錄設定（USD）；折扣留空沿用預設值 {pct(data?.settings.default_discount_pct)}。
          輸入與輸出 Token 分別計價，不能直接和每次扣點比較毛利。待核對的價格不會視為零成本。
        </p>
      </div>
      {error && <Notice kind="err">{error}</Notice>}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <Card
        title="模型成本表"
        right={
          <div className="flex gap-1 rounded-lg bg-[#1a1a1a] p-0.5">
            {(["all", "image", "video", "text"] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-md px-2.5 py-1 text-[12px] ${filter === f ? "bg-[#2a2a2a] text-white" : "text-[#8a8a8a] hover:text-white"}`}>
                {f === "all" ? "全部" : f === "image" ? "圖片" : f === "video" ? "影片" : "文字"}
              </button>
            ))}
          </div>
        }
      >
        <Table minWidth={1060} head={["模型", "計價單位", "售價（點數 → USD）", "供應商牌價 USD", "折扣 %", "折後牌價／單位", "毛利率", "備註", ""]}>
          {rows.map((r) => {
            const d = drafts[r.modelId] ?? { listPriceUsd: "", discountPct: "", notes: "" };
            const p = preview(r);
            return (
              <tr key={r.modelId} className={`hover:bg-[#151515] ${r.active ? "" : "opacity-50"}`}>
                <td className={td}>
                  <div className="text-white">{modelLabel(r.modelId)}</div>
                  <div className="font-mono text-[10.5px] text-[#6d6d6d]">{r.modelId}{r.active ? "" : "（已停用）"}</div>
                </td>
                <td className={td}>{r.priceUnit}</td>
                <td className={tdNum}>
                  {r.credits} 點 → {usd(r.sellUsd, 4)}
                </td>
                <td className={td}>
                  <div>{usd(r.listPriceUsd, 4)}</div>
                  {r.inputPriceUsd !== null && <div className="text-xs text-[#aaa]">輸入：{usd(r.inputPriceUsd, 4)} / 百萬 Token</div>}
                  {r.source && <a href={r.source} target="_blank" rel="noreferrer" className="text-xs text-[#7ff0cd]">SIRAYA · {r.checkedAt}</a>}
                  <div className="max-w-52 text-xs text-[#f0c27f]">{r.priceNote || (!r.source ? "公開目錄尚未確認此模型" : "")}</div>
                </td>
                <td className={td}>
                  <input type="number" step="0.5" min={0} max={100} value={d.discountPct} placeholder={`預設 ${data?.settings.default_discount_pct ?? 0}`} onChange={(e) => setDrafts((cur) => ({ ...cur, [r.modelId]: { ...d, discountPct: e.target.value } }))} className={`${fieldCls} w-[96px] text-right`} />
                </td>
                <td className={tdNum}>
                  <div>{usd(p.actual, 4)}</div>
                  <div className="text-[10.5px] text-[#6d6d6d]">折 {pct(p.disc)}</div>
                </td>
                <td className={`${tdNum} ${p.margin !== null && p.margin < 0 ? "text-[#ff9b9b]" : p.margin !== null && p.margin < 30 ? "text-[#f0c27f]" : "text-[#7ff0cd]"}`}>{d.listPriceUsd ? pct(p.margin) : "—"}</td>
                <td className={td}>
                  <input value={d.notes} placeholder="例：SIRAYA 企業價" onChange={(e) => setDrafts((cur) => ({ ...cur, [r.modelId]: { ...d, notes: e.target.value } }))} className={`${fieldCls} w-[150px]`} />
                </td>
                <td className={td}>
                  <button type="button" disabled={saving === r.modelId} onClick={() => void save(r)} className={btnCls}>
                    {saving === r.modelId ? "儲存中…" : "儲存"}
                  </button>
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </div>
  );
}
