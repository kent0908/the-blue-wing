import { sql } from "./db";
import { modelBreakdown, overview } from "./crmReports";
import { reportRange } from "./crmRange";
import { CREDIT_PACKS } from "./creditPacks";
import { PLANS } from "./plans";
import { listModels } from "./siraya";
import { modelLabel } from "./modelLabel";
import { esc, telegramConfigured } from "./telegram";
import { raiseAlert, recentAlerts } from "./alerts";

/**
 * Text builders for the Telegram 小助手: the daily digest, the on-demand
 * /report, the /status health check and the alert scan. Numbers come from
 * the same lib/crmReports queries the CRM dashboard uses, so the bot and
 * the back office never disagree.
 */

const TZ = "Asia/Taipei";
const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : Math.round(v).toLocaleString("en-US"));
const usd = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? "—" : `$${v.toFixed(d)}`);
const twd = (v: number | null | undefined, rate: number) => (v === null || v === undefined ? "" : ` (NT$${Math.round(v * rate).toLocaleString("en-US")})`);
const delta = (cur: number, prev: number) => {
  const d = cur - prev;
  if (d === 0) return "（持平）";
  return `（${d > 0 ? "▲" : "▼"}${Math.abs(d).toLocaleString("en-US")}）`;
};

/** Today's date in Taipei as YYYY-MM-DD, optionally shifted by whole days. */
export function taipeiDate(offsetDays = 0, now = new Date()): string {
  return new Date(now.getTime() + 8 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10);
}

interface Sales {
  packs: number;
  plans: number;
  credits: number;
  faceUsd: number;
}

/** Grants made through the back office on that day, valued at catalogue face price (not a payment receipt). */
async function salesFor(date: string): Promise<Sales> {
  const r = reportRange(1, date, date);
  const { rows } = await sql<{ reason: string; ref: string | null; delta: number }>`
    select reason, ref, delta::int as delta from credit_ledger
    where created_at >= ${r.since} and created_at < ${r.until} and reason in ('credit_pack', 'plan_grant') and delta > 0
  `;
  const out: Sales = { packs: 0, plans: 0, credits: 0, faceUsd: 0 };
  for (const row of rows) {
    const code = (row.ref ?? "").split(/\s+/)[0];
    out.credits += row.delta;
    if (row.reason === "credit_pack") {
      out.packs += 1;
      out.faceUsd += CREDIT_PACKS.find((p) => p.code === code)?.priceUSD ?? 0;
    } else {
      out.plans += 1;
      out.faceUsd += PLANS.find((p) => p.code === code)?.priceUSD ?? 0;
    }
  }
  return out;
}

async function failuresFor(date: string): Promise<{ charges: number; refunds: number }> {
  const r = reportRange(1, date, date);
  const { rows } = await sql<{ charges: number; refunds: number }>`
    select
      count(*) filter (where delta < 0 and reason in ('image', 'video', 'text', 'image_layers'))::int as charges,
      count(*) filter (where reason in ('charge_refund', 'video_refund'))::int as refunds
    from credit_ledger where created_at >= ${r.since} and created_at < ${r.until}
  `;
  return rows[0] ?? { charges: 0, refunds: 0 };
}

/** One day's digest. `date` defaults to yesterday (Taipei) — the daily cron runs after midnight. */
export async function dailyReportText(date = taipeiDate(-1)): Promise<string> {
  const prevDate = taipeiDate(-1, new Date(Date.parse(date)));
  const [cur, prev, sales, fails, models] = await Promise.all([
    overview(1, reportRange(1, date, date)),
    overview(1, reportRange(1, prevDate, prevDate)),
    salesFor(date),
    failuresFor(date),
    modelBreakdown(1, reportRange(1, date, date)),
  ]);
  const d = cur.series[0];
  const p = prev.series[0];
  const rate = cur.settings.usd_to_twd;
  const top = models.filter((m) => m.calls > 0).sort((a, b) => b.credits - a.credits).slice(0, 3);
  const timing = cur.timing.map((t) => `${t.kind === "image" ? "圖片" : t.kind === "video" ? "影片" : "文字"} ${t.average_ms ? Math.round(t.average_ms / 1000) + "s" : "—"}`).join(" · ");

  const lines = [
    `📊 <b>The Blue Wing 日報 ${esc(date)}</b>`,
    "",
    `👥 <b>人數</b>`,
    `活躍 ${n(d.activeUsers)} ${delta(d.activeUsers, p.activeUsers)} · 新註冊 ${n(d.newUsers)} ${delta(d.newUsers, p.newUsers)}`,
    `累計 ${n(cur.users.total)} 人 · 付費方案 ${n(cur.users.paid)} · WAU ${n(cur.users.wau)} · MAU ${n(cur.users.mau)}`,
    "",
    `💰 <b>金流</b>`,
    `會員消耗 ${n(d.customerCreditsSpent)} 點 ≈ ${usd(d.revenueEstUsd)}${twd(d.revenueEstUsd, rate)}${d.adminCreditsSpent ? `（另管理員消耗 ${n(d.adminCreditsSpent)} 點）` : ""}`,
    `供應商成本 ${d.costUsd === null ? "尚有未知成本" : usd(d.costUsd, 4) + twd(d.costUsd, rate)} · 估算差額 ${usd(d.profitUsd)}`,
    "",
    `🛒 <b>銷售</b>`,
    `點數包 ${n(sales.packs)} 筆 · 方案 ${n(sales.plans)} 筆 · 發放 ${n(sales.credits)} 點 · 面額 ${usd(sales.faceUsd)}${twd(sales.faceUsd, rate)}`,
    "",
    `🎬 <b>生成</b>`,
    `${n(d.generations)} 次 ${delta(d.generations, p.generations)} · 扣款 ${n(fails.charges)} 筆 · 退款 ${n(fails.refunds)} 筆${fails.charges ? `（${Math.round((fails.refunds / fails.charges) * 100)}%）` : ""}`,
    timing ? `平均耗時 ${esc(timing)}` : null,
    top.length ? `熱門：${top.map((m) => `${esc(modelLabel(m.model))} ${n(m.calls)} 次`).join("、")}` : null,
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

/** Today so far — for the /report command. */
export async function todayReportText(): Promise<string> {
  const text = await dailyReportText(taipeiDate(0));
  return text.replace("日報", "即時報表（今日至今）");
}

export async function statusText(): Promise<string> {
  const checks: string[] = [];
  const t0 = Date.now();
  let upstream = "❌ 無法連線";
  try {
    const raw = await listModels();
    const count = Array.isArray(raw?.data) ? raw.data.length : 0;
    upstream = count > 0 ? `✅ 正常（${count} 個模型，${Date.now() - t0}ms）` : "⚠️ 回應中沒有模型";
  } catch (err) {
    upstream = `❌ ${esc(err instanceof Error ? err.message : "連線失敗")}`.slice(0, 200);
  }
  checks.push(`生成服務：${upstream}`);
  checks.push(`儲存空間：${process.env.BLOB_READ_WRITE_TOKEN ? "✅ 已設定" : "❌ 未設定"}`);
  checks.push(`寄信服務：${process.env.RESEND_API_KEY ? "✅ 已設定" : "❌ 未設定"}`);
  checks.push(`Telegram：${telegramConfigured() ? "✅ 已設定" : "⚠️ 未完整設定"}`);
  const { rows } = await sql<{ n: number }>`select count(*)::int as n from provider_assets where status = 'needs_review'`;
  checks.push(`素材待人工確認：${rows[0]?.n ?? 0} 筆`);
  const alerts = await recentAlerts(5);
  const alertLines = alerts.length
    ? alerts.map((a) => `• ${esc(a.title)} ×${a.count}（${esc(new Date(a.last_seen_at).toLocaleString("zh-TW", { timeZone: TZ, hour12: false }))}）`)
    : ["（沒有紀錄）"];
  return [`🩺 <b>系統狀態</b>`, ...checks, "", `<b>最近告警</b>`, ...alertLines].join("\n");
}

/**
 * Threshold checks that don't have a natural real-time hook. Each finding
 * goes through raiseAlert (12h cooldown, so the daily run doesn't repeat
 * itself) and is also returned so the caller can show it.
 */
export async function runAlertScan(): Promise<string[]> {
  const findings: string[] = [];
  const cooldownMinutes = 12 * 60;

  // 1. refund ratio over the last 24h — a spike means the provider is failing after charge
  const { rows: f } = await sql<{ charges: number; refunds: number }>`
    select
      count(*) filter (where delta < 0 and reason in ('image', 'video', 'text', 'image_layers'))::int as charges,
      count(*) filter (where reason in ('charge_refund', 'video_refund'))::int as refunds
    from credit_ledger where created_at >= now() - interval '24 hours'
  `;
  const { charges, refunds } = f[0] ?? { charges: 0, refunds: 0 };
  if (refunds >= 5 && charges > 0 && refunds / charges >= 0.3) {
    const msg = `過去 24 小時 ${charges} 筆扣款有 ${refunds} 筆退款（${Math.round((refunds / charges) * 100)}%）`;
    findings.push(msg);
    void raiseAlert({ key: "scan:refund_ratio", title: "生成失敗率偏高", detail: msg, cooldownMinutes });
  }

  // 2. provider assets stuck in needs_review — needs a human to resolve
  const { rows: pa } = await sql<{ n: number }>`select count(*)::int as n from provider_assets where status = 'needs_review'`;
  if ((pa[0]?.n ?? 0) > 0) {
    const msg = `${pa[0].n} 筆素材登錄結果待人工確認（CRM → 素材）`;
    findings.push(msg);
    void raiseAlert({ key: "scan:assets_needs_review", title: "素材登錄待確認", detail: msg, cooldownMinutes, level: "warn" });
  }

  // 3. any account below zero — the ledger lock should make this impossible
  const { rows: neg } = await sql<{ user_id: number; balance: number }>`
    select user_id, sum(delta)::int as balance from credit_ledger group by user_id having sum(delta) < 0 limit 5
  `;
  if (neg.length) {
    const msg = `${neg.length} 個帳號點數為負：${neg.map((r) => `#${r.user_id} ${r.balance}`).join("、")}`;
    findings.push(msg);
    void raiseAlert({ key: "scan:negative_balance", title: "點數帳本異常", detail: msg, cooldownMinutes });
  }

  // 4. upstream reachable at all
  try {
    const raw = await listModels();
    if (!Array.isArray(raw?.data) || raw.data.length === 0) throw new Error("模型清單為空");
  } catch (err) {
    const msg = `生成服務模型清單無法取得：${err instanceof Error ? err.message : "連線失敗"}`;
    findings.push(msg);
    void raiseAlert({ key: "scan:upstream_down", title: "生成服務連線異常", detail: msg, cooldownMinutes: 60 });
  }

  // 5. registrations with nobody verifying — mail may be broken
  const { rows: v } = await sql<{ signups: number; verified: number }>`
    select count(*)::int as signups, count(*) filter (where email_verified)::int as verified
    from users where created_at >= now() - interval '24 hours'
  `;
  if ((v[0]?.signups ?? 0) >= 5 && (v[0]?.verified ?? 0) === 0) {
    const msg = `過去 24 小時 ${v[0].signups} 個新註冊、0 個完成驗證，請檢查寄信服務`;
    findings.push(msg);
    void raiseAlert({ key: "scan:no_verifications", title: "驗證信可能沒有送達", detail: msg, cooldownMinutes, level: "warn" });
  }

  return findings;
}
