"use client";

import { useState } from "react";
import { formatDuration } from "@/lib/formatTime";
import Link from "next/link";
import { Card, Kpi, LineChart, Notice, DateRangePicker, num, pct, usd, useApi } from "@/components/crm/ui";

interface Overview {
  range: number;
  timing: {kind:string;total:number;measured:number;average_ms:number|null;p95_ms:number|null}[];
  settings: { credit_value_usd: number; default_discount_pct: number; usd_to_twd: number };
  users: { total: number; verified: number; banned: number; paid: number; today: number; d7: number; d30: number; dau: number; wau: number; mau: number };
  totals: { creditsSpent: number; adminCreditsSpent: number; customerCreditsSpent: number; revenueEstUsd: number; revenueCashUsd: number; costUsd: number | null; listCostUsd: number | null; profitUsd: number | null; marginPct: number | null; generations: number; newUsers: number };
  series: { date: string; activeUsers: number; newUsers: number; generations: number; creditsSpent: number; adminCreditsSpent: number; customerCreditsSpent: number; revenueEstUsd: number; revenueCashUsd: number; costUsd: number | null; listCostUsd: number | null; profitUsd: number }[];
}

export default function CrmOverviewPage() {
  const [days, setDays] = useState(30);
  const [custom,setCustom] = useState("");
  const query = custom || `days=${days}`;
  const { data, error, loading } = useApi<Overview>(`/api/crm/overview?${query}`);
  const labels = data?.series.map((p) => p.date) ?? [];
  const twd = (v: number) => `NT$${Math.round(v * (data?.settings.usd_to_twd ?? 32)).toLocaleString()}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-white">總覽</h1>
          <p className="text-[12.5px] text-[#8a8a8a]">活躍度、點數消耗、營收與成本——財務依台灣日統計，歷史活躍沿用既有日紀錄。</p>
        </div>
        <DateRangePicker days={custom ? 0 : days} onDays={n=>{setDays(n);setCustom("");}} onRange={(from,to)=>setCustom(`from=${from}&to=${to}`)} />
      </div>
      {data && <Notice kind="info">管理員消耗 {num(data.totals.adminCreditsSpent)} 點僅列成本。會員消耗面額與發放面額皆非實收；贈點與購點來源未完整對帳前，不視為會計營收。</Notice>}
      {error && <Notice kind="err">{error}</Notice>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="今日活躍 DAU" value={num(data?.users.dau)} sub={`WAU ${num(data?.users.wau)} · MAU ${num(data?.users.mau)}`} tone="accent" />
        <Kpi label="註冊總數" value={num(data?.users.total)} sub={`今日 +${num(data?.users.today)} · 7 天 +${num(data?.users.d7)} · 30 天 +${num(data?.users.d30)}`} />
        <Kpi label="付費方案帳號" value={num(data?.users.paid)} sub={`已驗證 ${num(data?.users.verified)} · 停權 ${num(data?.users.banned)}`} />
        <Kpi label={`點數消耗（${data?.range ?? days} 天）`} value={num(data?.totals.creditsSpent)} sub={`${num(data?.totals.generations)} 次生成`} />
        <Kpi label="會員消耗面額（非實收）" value={usd(data?.totals.revenueEstUsd)} sub={data ? `${twd(data.totals.revenueEstUsd)} · 發放面額 ${usd(data.totals.revenueCashUsd)}` : undefined} tone="good" />
        <Kpi label="估算差額（非會計毛利）" value={usd(data?.totals.profitUsd)} sub={data ? `成本 ${usd(data.totals.costUsd)} · 估算比率 ${pct(data.totals.marginPct)}` : undefined} tone={data && (data.totals.profitUsd ?? 0) < 0 ? "bad" : "good"} />
      </div>

      <Card title="生成耗時" sub="提交至取得結果，含排隊／輪詢等待。只統計已記錄耗時的成功結果；舊資料不以零補值。">
        <div className="grid gap-4 md:grid-cols-3">{data?.timing?.map(t=><div key={t.kind} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5"><h3 className="text-sm text-neutral-300">{t.kind==="image"?"圖片":t.kind==="video"?"影片":"文字"}</h3><p className="mt-3 text-2xl text-[#7ff0cd]">{formatDuration(t.average_ms)||"未記錄"}</p><p className="mt-2 text-xs leading-6 text-neutral-500">平均耗時 · P95 {formatDuration(t.p95_ms)||"未記錄"}<br/>已量測 {t.measured} / {t.total} 筆</p></div>)}</div>
        {data?.timing?.length===0&&<p className="text-sm text-neutral-500">本區間沒有生成結果。</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="每日活躍與新註冊" sub="活躍＝當天有登入操作的帳號">
          {data && <LineChart labels={labels} series={[{ name: "活躍", color: "#8ab4ff", values: data.series.map((p) => p.activeUsers) }, { name: "新註冊", color: "#7ff0cd", values: data.series.map((p) => p.newUsers), bars: true }]} />}
        </Card>
        <Card title="每日會員消耗面額與成本" sub="會員消耗面額＝非管理員消耗點數 × 點數價值；成本＝供應商折後估算成本">
          {data && data.totals.costUsd === null && <Notice kind="info">成本用量紀錄不完整，暫不繪製成本與毛利圖。</Notice>}
          {data && data.totals.costUsd !== null && <LineChart labels={labels} series={[{ name: "會員消耗面額 (USD)", color: "#7ff0cd", values: data.series.map((p) => p.revenueEstUsd), format: (v) => usd(v) }, { name: "成本 (USD)", color: "#ff9b9b", values: data.series.map((p) => p.costUsd ?? 0), format: (v) => usd(v, 4) }, { name: "估算差額 (USD)", color: "#f0c27f", values: data.series.map((p) => p.profitUsd ?? 0), format: (v) => usd(v) }]} />}
        </Card>
        <Card title="每日生成次數與點數消耗">
          {data && <LineChart labels={labels} independent series={[{ name: "生成次數", color: "#8ab4ff", values: data.series.map((p) => p.generations), bars: true }, { name: "點數消耗", color: "#f0c27f", values: data.series.map((p) => p.creditsSpent) }]} />}
        </Card>
        <Card title="發放面額（非實收現金）" sub="以後台發放紀錄對應的定價計算；接上金流後改讀實際交易">
          {data && <LineChart labels={labels} series={[{ name: "發放面額 (USD)", color: "#7ff0cd", values: data.series.map((p) => p.revenueCashUsd), bars: true, format: (v) => usd(v) }]} />}
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
