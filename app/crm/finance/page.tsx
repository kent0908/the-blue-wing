"use client";

import { useState } from "react";
import { Card, Notice, RangePicker, Table, num, pct, td, tdNum, usd, useApi } from "@/components/crm/ui";
import { modelLabel } from "@/lib/modelLabel";

interface Overview {
  settings: { credit_value_usd: number; usd_to_twd: number };
  totals: { creditsSpent: number; revenueEstUsd: number; revenueCashUsd: number; costUsd: number | null; listCostUsd: number | null; profitUsd: number | null; marginPct: number | null; generations: number };
  series: { date: string; activeUsers: number; generations: number; creditsSpent: number; revenueEstUsd: number; revenueCashUsd: number; costUsd: number | null; listCostUsd: number | null; profitUsd: number }[];
}
interface Models {
  models: { model: string; kind: string; calls: number; units: number; unit: string; credits: number; revenueEstUsd: number; listCostUsd: number | null; costUsd: number | null; profitUsd: number | null; marginPct: number | null; listPriceUsd: number; discountPct: number | null; rateCredits: number | null }[];
}

const UNIT_LABEL: Record<string, string> = { image: "張", second: "秒", ktoken: "千 tokens", call: "次" };

export default function CrmFinancePage() {
  const [days, setDays] = useState(30);
  const ov = useApi<Overview>(`/api/crm/overview?days=${days}`);
  const md = useApi<Models>(`/api/crm/models?days=${days}`);
  const rows = ov.data ? [...ov.data.series].reverse() : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-white">收入與利潤</h1>
          <p className="text-[12.5px] text-[#8a8a8a]">
            營收＝消耗點數 × 點數價值（每點 {usd(ov.data?.settings.credit_value_usd, 4)}）；成本＝供應商牌價 × 實際計費用量 × (1 − 折扣)，每次呼叫當下快照。
          </p>
        </div>
        <RangePicker value={days} onChange={setDays} />
      </div>
      {(ov.error || md.error) && <Notice kind="err">{ov.error || md.error}</Notice>}

      {ov.data?.totals.costUsd === null && <Notice kind="info">本區間有缺少用量或牌價的紀錄，成本與毛利顯示「—」，不代表零成本。舊紀錄不以新牌價回填。</Notice>}
      {ov.data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="營收（點數價值）" value={usd(ov.data.totals.revenueEstUsd)} />
          <Stat label="供應商牌價成本" value={usd(ov.data.totals.listCostUsd)} sub="未折扣" />
          <Stat label="折後估算成本" value={usd(ov.data.totals.costUsd)} sub={ov.data.totals.costUsd === null ? "缺少完整用量／成本快照" : "依牌價與折扣估算"} />
          <Stat label="毛利 / 毛利率" value={`${usd(ov.data.totals.profitUsd)} · ${pct(ov.data.totals.marginPct)}`} tone={(ov.data.totals.profitUsd ?? 0) < 0 ? "bad" : "good"} />
        </div>
      )}

      <Card title="每個模型的利潤" sub="依點數消耗排序；牌價與折扣在「成本設定」調整">
        {md.data && (
          <Table minWidth={980} head={["模型", "類型", "呼叫", "用量", "點數", "營收", "牌價成本", "實際成本", "毛利", "毛利率", "牌價/單位", "折扣"]}>
            {md.data.models.map((m) => (
              <tr key={m.model + m.kind} className="hover:bg-[#151515]">
                <td className={td}>
                  <div className="text-white">{modelLabel(m.model)}</div>
                  <div className="font-mono text-[10.5px] text-[#6d6d6d]">{m.model}</div>
                </td>
                <td className={td}>{m.kind}</td>
                <td className={tdNum}>{num(m.calls)}</td>
                <td className={tdNum}>{num(m.units)} {UNIT_LABEL[m.unit] ?? m.unit}</td>
                <td className={tdNum}>{num(m.credits)}</td>
                <td className={tdNum}>{usd(m.revenueEstUsd)}</td>
                <td className={tdNum}>{usd(m.listCostUsd, 4)}</td>
                <td className={tdNum}>{usd(m.costUsd, 4)}</td>
                <td className={`${tdNum} ${(m.profitUsd ?? 0) < 0 ? "text-[#ff9b9b]" : "text-[#7ff0cd]"}`}>{usd(m.profitUsd)}</td>
                <td className={tdNum}>{pct(m.marginPct)}</td>
                <td className={tdNum}>{m.listPriceUsd ? usd(m.listPriceUsd, 4) : <span className="text-[#f0c27f]">未設定</span>}</td>
                <td className={tdNum}>{m.discountPct === null ? "預設" : pct(m.discountPct)}</td>
              </tr>
            ))}
            {md.data.models.length === 0 && (
              <tr>
                <td className={td} colSpan={12}>
                  這段期間沒有付費呼叫紀錄。用量事件從本版本上線起開始記錄。
                </td>
              </tr>
            )}
          </Table>
        )}
      </Card>

      <Card title="每日明細" sub="由新到舊">
        <Table minWidth={900} head={["日期", "活躍", "生成", "點數消耗", "營收", "實收", "牌價成本", "實際成本", "毛利"]}>
          {rows.map((p) => (
            <tr key={p.date} className="hover:bg-[#151515]">
              <td className={`${td} font-mono`}>{p.date}</td>
              <td className={tdNum}>{num(p.activeUsers)}</td>
              <td className={tdNum}>{num(p.generations)}</td>
              <td className={tdNum}>{num(p.creditsSpent)}</td>
              <td className={tdNum}>{usd(p.revenueEstUsd)}</td>
              <td className={tdNum}>{usd(p.revenueCashUsd)}</td>
              <td className={tdNum}>{usd(p.listCostUsd, 4)}</td>
              <td className={tdNum}>{usd(p.costUsd, 4)}</td>
              <td className={`${tdNum} ${(p.profitUsd ?? 0) < 0 ? "text-[#ff9b9b]" : "text-[#7ff0cd]"}`}>{usd(p.profitUsd)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl border border-[#232323] bg-[#121212] px-5 py-4">
      <div className="text-[11.5px] text-[#8a8a8a]">{label}</div>
      <div className={`mt-1 text-[20px] font-semibold tabular-nums ${tone === "bad" ? "text-[#ff9b9b]" : tone === "good" ? "text-[#7ff0cd]" : "text-white"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[#6d6d6d]">{sub}</div>}
    </div>
  );
}
