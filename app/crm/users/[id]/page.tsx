"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, Kpi, Notice, Table, btnCls, dt, fieldCls, num, primaryBtnCls, td, tdNum, usd, useApi } from "@/components/crm/ui";
import { PLANS } from "@/lib/plans";
import { CREDIT_PACKS } from "@/lib/creditPacks";
import { modelLabel } from "@/lib/modelLabel";

interface Detail {
  user: { id: number; uid: string | null; email: string; role: "user" | "admin"; status: "active" | "banned"; emailVerified: boolean; planCode: string; planRenewsAt: string | null; createdAt: string; lastSeenAt: string | null };
  balance: number;
  ledger: { id: number; delta: number; reason: string; ref: string | null; created_at: string }[];
  usage: { id: number; kind: string; model: string; credits: number; units: number; unit: string; resolution: string | null; list_cost_usd: number | null; actual_cost_usd: number | null; status: string; created_at: string }[];
  usageTotals: { calls: number; credits: number; costUsd: number | null };
  generations: { kind: string; n: number; avg_ms: number | null; last: string | null }[];
  activity: { days: number; first: string | null; last: string | null };
  sessions: number;
  characters: number;
  audit: { id: number; action: string; detail: unknown; created_at: string; admin_email: string | null }[];
}

const REASON: Record<string, string> = {
  admin_grant: "管理員加點", plan_grant: "方案發點", credit_pack: "點數包", daily_free: "每日免費", image: "圖片生成", image_layers: "圖層分離", video: "影片生成", text: "文字生成",
  charge_refund: "退點", video_refund: "影片失敗退點", charge_partial_refund: "部分退點", idle_video_free: "免費待機影片", outfit_change: "換裝",
};

export default function CrmUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useApi<Detail>(`/api/crm/users/${id}`);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [grant, setGrant] = useState({ amount: "", note: "" });
  const [plan, setPlan] = useState("");
  const [pack, setPack] = useState("");

  const act = async (action: string, extra: Record<string, unknown> = {}, confirmText?: string) => {
    if (!data) return;
    if (confirmText && !confirm(confirmText)) return;
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${data.user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || "操作失敗");
      setMsg({ kind: "ok", text: `已完成：${ACTION_LABEL[action] ?? action}` });
      reload();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "操作失敗" });
    } finally {
      setBusy(null);
    }
  };

  if (error) return <Notice kind="err">{error}</Notice>;
  if (!data) return <div className="bw-shimmer h-8 w-8 rounded-full" />;
  const u = data.user;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/crm/users" className="text-[12px] text-[#8a8a8a] hover:text-white">← 帳號管理</Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-[20px] font-semibold text-white">
            {u.email}
            {u.uid && <span className="rounded-md bg-[#1c1c1c] px-2 py-0.5 font-mono text-[12px] text-[#c9c9c9]">UID {u.uid}</span>}
            {u.role === "admin" && <span className="rounded-full bg-[#1e2a3d] px-2 py-0.5 text-[11px] text-[#8ab4ff]">管理員</span>}
            {u.status === "banned" && <span className="rounded-full bg-[#3a1a1a] px-2 py-0.5 text-[11px] text-[#ff9b9b]">已停權</span>}
            {!u.emailVerified && <span className="rounded-full bg-[#3a2e18] px-2 py-0.5 text-[11px] text-[#f0c27f]">未驗證</span>}
          </h1>
          <p className="text-[12px] text-[#6d6d6d]">
            內部 #{u.id} · 註冊 {dt(u.createdAt)} · 最後活動 {dt(u.lastSeenAt)} · 活躍 {num(data.activity.days)} 天 · 有效登入 {data.sessions} 個 · 陪聊角色 {data.characters} 個
          </p>
        </div>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="目前點數" value={num(data.balance)} tone="good" />
        <Kpi label="方案" value={PLANS.find((p) => p.code === u.planCode)?.name ?? u.planCode} sub={u.planRenewsAt ? `續約 ${dt(u.planRenewsAt)}` : undefined} />
        <Kpi label="付費呼叫（記錄以來）" value={num(data.usageTotals.calls)} sub={`${num(data.usageTotals.credits)} 點`} />
        <Kpi label="這位用戶的供應商成本" value={usd(data.usageTotals.costUsd, 4)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="帳號操作" sub="每個動作都會寫入稽核紀錄。密碼只能由使用者透過信件連結重設。" className="lg:col-span-1">
          <div className="space-y-3 text-[12.5px]">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={!!busy || u.status === "banned"} onClick={() => void act("send_reset_email", {}, `寄送密碼重設連結到 ${u.email}？`)} className={primaryBtnCls}>寄重設密碼信</button>
              <button type="button" disabled={!!busy || u.emailVerified} onClick={() => void act("resend_verify")} className={btnCls}>重寄驗證信</button>
              <button type="button" disabled={!!busy} onClick={() => void act("sign_out_everywhere", {}, "登出這個帳號的所有裝置？")} className={btnCls}>登出所有裝置</button>
              {u.status === "banned" ? (
                <button type="button" disabled={!!busy} onClick={() => void act("set_status", { status: "active" })} className={btnCls}>解除停權</button>
              ) : (
                <button type="button" disabled={!!busy} onClick={() => void act("set_status", { status: "banned" }, `停權 ${u.email}？所有登入會被登出。`)} className={`${btnCls} text-[#ff9b9b]`}>停權</button>
              )}
              {u.role === "admin" ? (
                <button type="button" disabled={!!busy} onClick={() => void act("set_role", { role: "user" }, "移除管理員權限？")} className={btnCls}>移除管理員</button>
              ) : (
                <button type="button" disabled={!!busy} onClick={() => void act("set_role", { role: "admin" }, `把 ${u.email} 設為管理員？管理員可以進入這個後台。`)} className={btnCls}>設為管理員</button>
              )}
            </div>
            <div className="border-t border-[#1e1e1e] pt-3">
              <div className="mb-1 text-[11px] text-[#8a8a8a]">加點（可負數扣回）</div>
              <div className="flex gap-2">
                <input type="number" value={grant.amount} onChange={(e) => setGrant({ ...grant, amount: e.target.value })} placeholder="點數" className={`${fieldCls} w-[90px]`} />
                <input value={grant.note} onChange={(e) => setGrant({ ...grant, note: e.target.value })} placeholder="原因（會記錄）" className={`${fieldCls} min-w-0 flex-1`} />
                <button type="button" disabled={!!busy || !grant.amount} onClick={() => void act("grant_credits", { amount: Number(grant.amount), note: grant.note })} className={btnCls}>送出</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-[#1e1e1e] pt-3">
              <div>
                <div className="mb-1 text-[11px] text-[#8a8a8a]">變更方案</div>
                <div className="flex gap-1">
                  <select value={plan} onChange={(e) => setPlan(e.target.value)} className={`${fieldCls} min-w-0 flex-1`}>
                    <option value="">選擇…</option>
                    {PLANS.map((p) => (
                      <option key={p.code} value={p.code}>{p.name}</option>
                    ))}
                  </select>
                  <button type="button" disabled={!!busy || !plan} onClick={() => void act("set_plan", { plan_code: plan })} className={btnCls}>套用</button>
                </div>
              </div>
              <div>
                <div className="mb-1 text-[11px] text-[#8a8a8a]">發放點數包</div>
                <div className="flex gap-1">
                  <select value={pack} onChange={(e) => setPack(e.target.value)} className={`${fieldCls} min-w-0 flex-1`}>
                    <option value="">選擇…</option>
                    {CREDIT_PACKS.map((p) => (
                      <option key={p.code} value={p.code}>{p.credits.toLocaleString()} 點 · ${p.priceUSD}</option>
                    ))}
                  </select>
                  <button type="button" disabled={!!busy || !pack} onClick={() => void act("grant_pack", { pack_code: pack })} className={btnCls}>發放</button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card title="生成統計" className="lg:col-span-2">
          <Table head={["類型", "次數", "平均耗時", "最近一次"]}>
            {data.generations.map((g) => (
              <tr key={g.kind}>
                <td className={td}>{g.kind === "image" ? "圖片" : g.kind === "video" ? "影片" : "文字"}</td>
                <td className={tdNum}>{num(g.n)}</td>
                <td className={tdNum}>{g.avg_ms ? `${Math.round(g.avg_ms / 1000)} 秒` : "—"}</td>
                <td className={td}>{dt(g.last)}</td>
              </tr>
            ))}
            {data.generations.length === 0 && (
              <tr>
                <td className={td} colSpan={4}>還沒有生成紀錄</td>
              </tr>
            )}
          </Table>
          <h3 className="mb-2 mt-5 text-[12.5px] font-medium text-white">付費呼叫與成本（最近 100 筆）</h3>
          <Table minWidth={720} head={["時間", "類型", "模型", "用量", "點數", "牌價成本", "實際成本", "狀態"]}>
            {data.usage.map((e) => (
              <tr key={e.id} className={e.status === "refunded" ? "opacity-50" : ""}>
                <td className={td}>{dt(e.created_at)}</td>
                <td className={td}>{e.kind}</td>
                <td className={td}>{modelLabel(e.model)}</td>
                <td className={tdNum}>{num(e.units)} {e.unit}{e.resolution ? ` · ${e.resolution}` : ""}</td>
                <td className={tdNum}>{num(e.credits)}</td>
                <td className={tdNum}>{usd(e.list_cost_usd, 4)}</td>
                <td className={tdNum}>{usd(e.actual_cost_usd, 4)}</td>
                <td className={td}>{e.status === "refunded" ? "已退點" : "已扣點"}</td>
              </tr>
            ))}
            {data.usage.length === 0 && (
              <tr>
                <td className={td} colSpan={8}>沒有付費呼叫紀錄（從本版本上線後開始記錄）</td>
              </tr>
            )}
          </Table>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="點數帳本（最近 100 筆）">
          <Table head={["時間", "變動", "原因", "備註"]}>
            {data.ledger.map((l) => (
              <tr key={l.id}>
                <td className={td}>{dt(l.created_at)}</td>
                <td className={`${tdNum} ${l.delta < 0 ? "text-[#ff9b9b]" : "text-[#7ff0cd]"}`}>{l.delta > 0 ? `+${l.delta}` : l.delta}</td>
                <td className={td}>{REASON[l.reason] ?? l.reason}</td>
                <td className={`${td} max-w-[220px] truncate font-mono text-[11px] text-[#6d6d6d]`} title={l.ref ?? ""}>{l.ref ?? ""}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="針對此帳號的後台操作">
          <Table head={["時間", "操作", "管理員", "內容"]}>
            {data.audit.map((a) => (
              <tr key={a.id}>
                <td className={td}>{dt(a.created_at)}</td>
                <td className={td}>{ACTION_LABEL[a.action.replace(/^user\./, "")] ?? a.action}</td>
                <td className={td}>{a.admin_email ?? "—"}</td>
                <td className={`${td} font-mono text-[11px] text-[#6d6d6d]`}>{JSON.stringify(a.detail)}</td>
              </tr>
            ))}
            {data.audit.length === 0 && (
              <tr>
                <td className={td} colSpan={4}>沒有紀錄</td>
              </tr>
            )}
          </Table>
        </Card>
      </div>
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  grant_credits: "加點", set_role: "變更角色", set_status: "變更狀態", set_plan: "變更方案", grant_pack: "發放點數包",
  send_reset_email: "寄重設密碼信", resend_verify: "重寄驗證信", sign_out_everywhere: "登出所有裝置",
};
