"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminCharts from "./Charts";
import AdminTabs from "./AdminTabs";

interface AdminUser {
  id: number;
  email: string;
  role: "user" | "admin";
  status: "active" | "banned";
  email_verified: boolean;
  plan_code: string;
  plan_renews_at: string | null;
  created_at: string;
  balance: number;
}

interface LedgerRow {
  id: number;
  delta: number;
  reason: string;
  ref: string | null;
  created_at: string;
}

interface Stats {
  users: { total: number; active: number; banned: number; verified: number; paid: number; today: number; week: number };
  credits: { granted: number; spent: number; outstanding: number };
}

const PLAN_CODES = ["free", "starter", "pro", "studio"];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "created_desc", label: "最新註冊" },
  { value: "created_asc", label: "最早註冊" },
  { value: "balance_desc", label: "點數多→少" },
  { value: "balance_asc", label: "點數少→多" },
  { value: "email_asc", label: "Email A→Z" },
];

const REASON_LABEL: Record<string, string> = {
  admin_grant: "管理員加點",
  plan_grant: "方案發點",
  image: "圖片生成",
  video: "影片生成",
  video_refund: "影片失敗退點",
  text: "文字生成",
};

const selectCls =
  "h-9 rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-2.5 text-[12.5px] text-white focus:border-[#4a4a4a] focus:outline-none";

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-[#262626] bg-[#161616] px-4 py-3">
      <div className="text-[11.5px] text-[#8a8a8a]">{label}</div>
      <div className="mt-1 text-[19px] font-semibold tracking-tight text-white">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-[#6d6d6d]">{hint}</div>}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [plan, setPlan] = useState("");
  const [sort, setSort] = useState("created_desc");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [ledgers, setLedgers] = useState<Record<number, LedgerRow[]>>({});
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, page: String(page), sort });
      if (status) params.set("status", status);
      if (role) params.set("role", role);
      if (plan) params.set("plan", plan);
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (res.status === 401) return router.push("/login?next=/admin");
      const json = await res.json();
      if (res.status === 403) {
        setError("需要管理員權限");
        return;
      }
      if (!res.ok) throw new Error(json?.error?.message || "載入失敗");
      setUsers(json.users);
      setPages(json.pages);
      setTotal(json.total);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [q, page, sort, status, role, plan, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is the data fetch for this view
    load();
  }, [load]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) return;
      setStats(await res.json());
    } catch {
      /* stats are non-critical */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadStats() only sets state after an await
    loadStats();
  }, [loadStats]);

  const fetchLedger = useCallback(async (id: number) => {
    setLedgerLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${id}/ledger`);
      const json = await res.json().catch(() => ({}));
      if (res.ok) setLedgers((m) => ({ ...m, [id]: json.ledger }));
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  const toggleExpand = (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!ledgers[id]) fetchLedger(id);
  };

  const act = async (id: number, body: Record<string, unknown>) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json?.error?.message || "操作失敗");
        return;
      }
      setLedgers((m) => {
        const next = { ...m };
        delete next[id];
        return next;
      });
      if (expandedId === id) fetchLedger(id);
      await Promise.all([load(), loadStats()]);
    } finally {
      setBusyId(null);
    }
  };

  const grant = (u: AdminUser) => {
    const raw = prompt(`要給 ${u.email} 加多少點？（可負數扣點）`, "1000");
    if (raw == null) return;
    const amount = parseInt(raw, 10);
    if (!Number.isFinite(amount) || amount === 0) return;
    const note = prompt("備註（可留空）", "") ?? "";
    act(u.id, { action: "grant_credits", amount, note });
  };

  const resetFilters = () => {
    setPage(1);
    setQ("");
    setStatus("");
    setRole("");
    setPlan("");
    setSort("created_desc");
  };

  const hasFilters = q !== "" || status !== "" || role !== "" || plan !== "" || sort !== "created_desc";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-[22px] font-semibold tracking-tight">帳號後台</h1>
          <Link href="/account" className="text-[12.5px] text-[#8a8a8a] hover:text-white">回帳號</Link>
        </div>
        <AdminTabs active="users" />
        <p className="mt-1 text-[13px] text-[#8a8a8a]">共 {total} 位使用者</p>

        {stats && (
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard label="使用者總數" value={stats.users.total.toLocaleString()} hint={`正常 ${stats.users.active}・停權 ${stats.users.banned}`} />
            <StatCard label="已驗證 email" value={stats.users.verified.toLocaleString()} hint={`未驗證 ${stats.users.total - stats.users.verified}`} />
            <StatCard label="付費方案" value={stats.users.paid.toLocaleString()} hint="非 free 方案" />
            <StatCard label="近期註冊" value={stats.users.week.toLocaleString()} hint={`今日 ${stats.users.today}・7 天內`} />
            <StatCard label="已發放點數" value={stats.credits.granted.toLocaleString()} />
            <StatCard label="已消耗點數" value={stats.credits.spent.toLocaleString()} />
            <StatCard label="流通中點數" value={stats.credits.outstanding.toLocaleString()} hint="所有帳戶餘額總和" />
          </div>
        )}

        <AdminCharts />

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            placeholder="搜尋 email…"
            className="h-9 w-56 rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-3 text-[13px] text-white focus:border-[#4a4a4a] focus:outline-none"
          />
          <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className={selectCls}>
            <option value="">全部狀態</option>
            <option value="active">正常</option>
            <option value="banned">已停權</option>
          </select>
          <select value={role} onChange={(e) => { setPage(1); setRole(e.target.value); }} className={selectCls}>
            <option value="">全部角色</option>
            <option value="user">一般</option>
            <option value="admin">管理員</option>
          </select>
          <select value={plan} onChange={(e) => { setPage(1); setPlan(e.target.value); }} className={selectCls}>
            <option value="">全部方案</option>
            {PLAN_CODES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={sort} onChange={(e) => { setPage(1); setSort(e.target.value); }} className={selectCls}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {hasFilters && (
            <button onClick={resetFilters} className="h-9 rounded-lg bg-[#242424] px-3 text-[12px] text-[#c9c9c9] hover:bg-[#2e2e2e]">
              清除
            </button>
          )}
          {loading && <span className="text-[12px] text-[#6d6d6d]">載入中…</span>}
        </div>

        {error ? (
          <div className="mt-6 rounded-xl border border-[#4a2020] bg-[#1a1010] px-4 py-3 text-[13px] text-[#ffb4b4]">{error}</div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-[#262626]">
            <table className="w-full min-w-[880px] text-[12.5px]">
              <thead className="bg-[#161616] text-[#8a8a8a]">
                <tr>
                  <th className="w-8 px-3 py-2" />
                  <th className="px-3 py-2 text-left font-medium">Email</th>
                  <th className="px-3 py-2 text-left font-medium">狀態</th>
                  <th className="px-3 py-2 text-left font-medium">方案</th>
                  <th className="px-3 py-2 text-right font-medium">點數</th>
                  <th className="px-3 py-2 text-left font-medium">建立</th>
                  <th className="px-3 py-2 text-left font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <FragmentRow
                    key={u.id}
                    u={u}
                    busy={busyId === u.id}
                    expanded={expandedId === u.id}
                    ledger={ledgers[u.id]}
                    ledgerLoading={ledgerLoading && expandedId === u.id}
                    onToggle={() => toggleExpand(u.id)}
                    onGrant={() => grant(u)}
                    onAct={(body) => act(u.id, body)}
                  />
                ))}
                {users.length === 0 && !loading && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-[#6d6d6d]">沒有符合的使用者</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3 text-[12.5px]">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded bg-[#242424] px-3 py-1.5 disabled:opacity-40"
            >
              上一頁
            </button>
            <span className="text-[#8a8a8a]">{page} / {pages}</span>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className="rounded bg-[#242424] px-3 py-1.5 disabled:opacity-40"
            >
              下一頁
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FragmentRow({
  u,
  busy,
  expanded,
  ledger,
  ledgerLoading,
  onToggle,
  onGrant,
  onAct,
}: {
  u: AdminUser;
  busy: boolean;
  expanded: boolean;
  ledger: LedgerRow[] | undefined;
  ledgerLoading: boolean;
  onToggle: () => void;
  onGrant: () => void;
  onAct: (body: Record<string, unknown>) => void;
}) {
  return (
    <>
      <tr className="border-t border-[#1e1e1e] align-top">
        <td className="px-3 py-2">
          <button
            onClick={onToggle}
            aria-label={expanded ? "收合明細" : "展開明細"}
            className={`grid h-5 w-5 place-items-center rounded text-[#8a8a8a] hover:bg-[#242424] hover:text-white ${expanded ? "rotate-90" : ""} transition-transform`}
          >
            ▶
          </button>
        </td>
        <td className="px-3 py-2">
          <div className="text-white">{u.email}</div>
          <div className="mt-0.5 flex gap-1.5 text-[10.5px]">
            {u.role === "admin" && <span className="rounded bg-[#1e3a5f] px-1.5 py-0.5 text-[#9fd0ff]">admin</span>}
            {!u.email_verified && <span className="rounded bg-[#3a2e18] px-1.5 py-0.5 text-[#f0c27f]">未驗證</span>}
          </div>
        </td>
        <td className="px-3 py-2">
          <span className={u.status === "banned" ? "text-[#ff9b9b]" : "text-[#7ff0cd]"}>
            {u.status === "banned" ? "已停權" : "正常"}
          </span>
        </td>
        <td className="px-3 py-2">
          <select
            value={u.plan_code}
            disabled={busy}
            onChange={(e) => onAct({ action: "set_plan", plan_code: e.target.value })}
            className="rounded border border-[#2c2c2c] bg-[#1c1c1c] px-1.5 py-1 text-[12px] text-white focus:outline-none"
          >
            {PLAN_CODES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </td>
        <td className="px-3 py-2 text-right font-medium text-[#7ff0cd]">{u.balance.toLocaleString()}</td>
        <td className="px-3 py-2 text-[#9a9a9a]">{new Date(u.created_at).toLocaleDateString("zh-TW")}</td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-1.5">
            <button onClick={onGrant} disabled={busy} className="rounded bg-[#242424] px-2 py-1 text-[11.5px] hover:bg-[#2e2e2e]">加/扣點</button>
            <button
              onClick={() => onAct({ action: "set_status", status: u.status === "banned" ? "active" : "banned" })}
              disabled={busy}
              className="rounded bg-[#242424] px-2 py-1 text-[11.5px] hover:bg-[#2e2e2e]"
            >
              {u.status === "banned" ? "解除停權" : "停權"}
            </button>
            <button
              onClick={() => onAct({ action: "set_role", role: u.role === "admin" ? "user" : "admin" })}
              disabled={busy}
              className="rounded bg-[#242424] px-2 py-1 text-[11.5px] hover:bg-[#2e2e2e]"
            >
              {u.role === "admin" ? "取消 admin" : "設為 admin"}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-[#1e1e1e] bg-[#141414]">
          <td />
          <td colSpan={6} className="px-3 py-3">
            {ledgerLoading && !ledger ? (
              <div className="text-[12px] text-[#6d6d6d]">載入明細中…</div>
            ) : !ledger || ledger.length === 0 ? (
              <div className="text-[12px] text-[#6d6d6d]">沒有點數紀錄</div>
            ) : (
              <table className="w-full text-[11.5px]">
                <thead className="text-[#7a7a7a]">
                  <tr>
                    <th className="py-1 pr-3 text-left font-medium">時間</th>
                    <th className="py-1 pr-3 text-left font-medium">項目</th>
                    <th className="py-1 pr-3 text-right font-medium">異動</th>
                    <th className="py-1 text-left font-medium">備註</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((row) => (
                    <tr key={row.id} className="border-t border-[#1e1e1e]">
                      <td className="py-1 pr-3 text-[#9a9a9a]">{new Date(row.created_at).toLocaleString("zh-TW")}</td>
                      <td className="py-1 pr-3 text-[#c9c9c9]">{REASON_LABEL[row.reason] || row.reason}</td>
                      <td className={`py-1 pr-3 text-right font-medium ${row.delta < 0 ? "text-[#ff9b9b]" : "text-[#7ff0cd]"}`}>
                        {row.delta > 0 ? "+" : ""}{row.delta.toLocaleString()}
                      </td>
                      <td className="py-1 text-[#7a7a7a] break-all">{row.ref || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
