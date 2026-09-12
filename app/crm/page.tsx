"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, Kpi, LineChart, Notice, RangePicker, num, pct, usd, useApi } from "@/components/crm/ui";

interface Overview {
  range: number;
  settings: { credit_value_usd: number; default_discount_pct: number; usd_to_twd: number };
  users: { total: number; verified: number; banned: number; paid: number; today: number; d7: number; d30: number; dau: number; wau: number; mau: number };
  totals: { creditsSpent: number; revenueEstUsd: number; revenueCashUsd: number; costUsd: number | null; listCostUsd: number | null; profitUsd: number | null; marginPct: number | null; generations: number; newUsers: number };
  series: { date: string; activeUsers: number; newUsers: number; generations: number; creditsSpent: number; revenueEstUsd: number; revenueCashUsd: number; costUsd: number | null; listCostUsd: number | null; profitUsd: number }[];
}

export default function CrmOverviewPage() {
  const [days, setDays] = useState(30);
  const { data, error, loading } = useApi<Overview>(`/api/crm/overview?days=${days}`);
  const labels = data?.series.map((p) => p.date) ?? [];
  const twd = (v: number) => `NT$${Math.round(v * (data?.settings.usd_to_twd ?? 32)).toLocaleString()}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-white">總覽</h1>
          <p className="text-[12.5px] text-[#8a8a8a]">活躍度、點數消耗、營收與成本——依所選區間統計（UTC 日）。</p>
        </div>
        <RangePicker value={days} onChange={setDays} />
      </div>
      {error && <Notice kind="err">{error}</Notice>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="今日活躍 DAU" value={num(data?.users.dau)} sub={`WAU ${num(data?.users.wau)} · MAU ${num(data?.users.mau)}`} tone="accent" />
        <Kpi label="註冊總數" value={num(data?.users.total)} sub={`今日 +${num(data?.users.today)} · 7 天 +${num(data?.users.d7)} · 30 天 +${num(data?.users.d30)}`} />
        <Kpi label="付費方案帳號" value={num(data?.users.paid)} sub={`已驗證 ${num(data?.users.verified)} · 停權 ${num(data?.users.banned)}`} />
        <Kpi label={`點數消耗（${days} 天）`} value={num(data?.totals.creditsSpent)} sub={`${num(data?.totals.generations)} 次生成`} />
        <Kpi label="營收（點數價值）" value={usd(data?.totals.revenueEstUsd)} sub={data ? `${twd(data.totals.revenueEstUsd)} · 實收 ${usd(data.totals.revenueCashUsd)}` : undefined} tone="good" />
        <Kpi label="毛利" value={usd(data?.totals.profitUsd)} sub={data ? `成本 ${usd(data.totals.costUsd)} · 毛利率 ${pct(data.totals.marginPct)}` : undefined} tone={data && (data.totals.profitUsd ?? 0) < 0 ? "bad" : "good"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="每日活躍與新註冊" sub="活躍＝當天有登入操作的帳號">
          {data && <LineChart labels={labels} series={[{ name: "活躍", color: "#8ab4ff", values: data.series.map((p) => p.activeUsers) }, { name: "新註冊", color: "#7ff0cd", values: data.series.map((p) => p.newUsers), bars: true }]} />}
        </Card>
        <Card title="每日營收 vs 成本" sub="營收＝消耗點數 × 點數價值；成本＝供應商實際成本（含折扣）">
          {data && data.totals.costUsd === null && <Notice kind="info">成本用量紀錄不完整，暫不繪製成本與毛利圖。</Notice>}
          {data && data.totals.costUsd !== null && <LineChart labels={labels} series={[{ name: "營收 (USD)", color: "#7ff0cd", values: data.series.map((p) => p.revenueEstUsd), format: (v) => usd(v) }, { name: "成本 (USD)", color: "#ff9b9b", values: data.series.map((p) => p.costUsd ?? 0), format: (v) => usd(v, 4) }, { name: "毛利 (USD)", color: "#f0c27f", values: data.series.map((p) => p.profitUsd ?? 0), format: (v) => usd(v) }]} />}
        </Card>
        <Card title="每日生成次數與點數消耗">
          {data && <LineChart labels={labels} independent series={[{ name: "生成次數", color: "#8ab4ff", values: data.series.map((p) => p.generations), bars: true }, { name: "點數消耗", color: "#f0c27f", values: data.series.map((p) => p.creditsSpent) }]} />}
        </Card>
        <Card title="實收現金（點數包／方案）" sub="以後台發放紀錄對應的定價計算；接上金流後改讀實際交易">
          {data && <LineChart labels={labels} series={[{ name: "實收 (USD)", color: "#7ff0cd", values: data.series.map((p) => p.revenueCashUsd), bars: true, format: (v) => usd(v) }]} />}
        </Card>
      </div>

      <Card title="快速前往" className="text-[12.5px]">
        <div className="flex flex-wrap gap-2">
          <Link href="/crm/finance" className="rounded-lg bg-[#1f1f1f] px-3 py-1.5 hover:bg-[#282828]">每模型利潤明細 →</Link>
          <Link href="/crm/costs" className="rounded-lg bg-[#1f1f1f] px-3 py-1.5 hover:bg-[#282828]">設定各模型牌價與折扣 →</Link>
          <Link href="/crm/users" className="rounded-lg bg-[#1f1f1f] px-3 py-1.5 hover:bg-[#282828]">帳號管理 →</Link>
        </div>
        <p className="mt-3 text-[11.5px] text-[#6d6d6d]">
          點數價值目前設定為每點 {usd(data?.settings.credit_value_usd, 4)}、預設折扣 {pct(data?.settings.default_discount_pct)}——在「系統設定」調整。{loading && " 載入中…"}
        </p>
      </Card>
    </div>
  );
}
