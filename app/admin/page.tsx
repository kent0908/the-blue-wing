"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

const PLAN_CODES = ["free", "starter", "pro", "studio"];

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}&page=${page}`);
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
  }, [q, page, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is the data fetch for this view
    load();
  }, [load]);

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
      await load();
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold tracking-tight">帳號後台</h1>
          <Link href="/account" className="text-[12.5px] text-[#8a8a8a] hover:text-white">回帳號</Link>
        </div>
        <p className="mt-1 text-[13px] text-[#8a8a8a]">共 {total} 位使用者</p>

        <div className="mt-4 flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            placeholder="搜尋 email…"
            className="h-9 w-64 rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-3 text-[13px] text-white focus:border-[#4a4a4a] focus:outline-none"
          />
          {loading && <span className="text-[12px] text-[#6d6d6d]">載入中…</span>}
        </div>

        {error ? (
          <div className="mt-6 rounded-xl border border-[#4a2020] bg-[#1a1010] px-4 py-3 text-[13px] text-[#ffb4b4]">{error}</div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-[#262626]">
            <table className="w-full min-w-[880px] text-[12.5px]">
              <thead className="bg-[#161616] text-[#8a8a8a]">
                <tr>
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
                  <tr key={u.id} className="border-t border-[#1e1e1e] align-top">
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
                        disabled={busyId === u.id}
                        onChange={(e) => act(u.id, { action: "set_plan", plan_code: e.target.value })}
                        className="rounded border border-[#2c2c2c] bg-[#1c1c1c] px-1.5 py-1 text-[12px] text-white focus:outline-none"
                      >
                        {PLAN_CODES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-[#7ff0cd]">{u.balance.toLocaleString()}</td>
                    <td className="px-3 py-2 text-[#9a9a9a]">
                      {new Date(u.created_at).toLocaleDateString("zh-TW")}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        <button onClick={() => grant(u)} disabled={busyId === u.id} className="rounded bg-[#242424] px-2 py-1 text-[11.5px] hover:bg-[#2e2e2e]">加/扣點</button>
                        <button
                          onClick={() => act(u.id, { action: "set_status", status: u.status === "banned" ? "active" : "banned" })}
                          disabled={busyId === u.id}
                          className="rounded bg-[#242424] px-2 py-1 text-[11.5px] hover:bg-[#2e2e2e]"
                        >
                          {u.status === "banned" ? "解除停權" : "停權"}
                        </button>
                        <button
                          onClick={() => act(u.id, { action: "set_role", role: u.role === "admin" ? "user" : "admin" })}
                          disabled={busyId === u.id}
                          className="rounded bg-[#242424] px-2 py-1 text-[11.5px] hover:bg-[#2e2e2e]"
                        >
                          {u.role === "admin" ? "取消 admin" : "設為 admin"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && !loading && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-[#6d6d6d]">沒有符合的使用者</td></tr>
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
