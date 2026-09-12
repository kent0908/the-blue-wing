"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, Notice, Table, btnCls, dt, fieldCls, num, td, tdNum, useApi } from "@/components/crm/ui";
import { PLANS } from "@/lib/plans";

interface Row {
  id: number;
  uid: string | null;
  email: string;
  role: "user" | "admin";
  status: "active" | "banned";
  email_verified: boolean;
  plan_code: string;
  created_at: string;
  last_seen_at: string | null;
  balance: number;
  generations: number;
}
interface List {
  users: Row[];
  page: number;
  pages: number;
  total: number;
}

export default function CrmUsersPage() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [sort, setSort] = useState("created_desc");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ q: query, page: String(page), sort });
  if (status) params.set("status", status);
  if (plan) params.set("plan", plan);
  const { data, error, loading } = useApi<List>(`/api/admin/users?${params}`);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold text-white">帳號管理</h1>
        <p className="text-[12.5px] text-[#8a8a8a]">用 email 或 UID 搜尋。密碼永遠不會顯示——需要時只能寄重設連結給使用者本人。</p>
      </div>
      {error && <Notice kind="err">{error}</Notice>}

      <Card>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(q.trim());
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="email 或 UID（例：KX40318275）" className={`${fieldCls} w-[280px]`} />
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={fieldCls}>
            <option value="">所有狀態</option>
            <option value="active">正常</option>
            <option value="banned">停權</option>
          </select>
          <select value={plan} onChange={(e) => { setPlan(e.target.value); setPage(1); }} className={fieldCls}>
            <option value="">所有方案</option>
            {PLANS.map((p) => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>
          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className={fieldCls}>
            <option value="created_desc">最新註冊</option>
            <option value="created_asc">最早註冊</option>
            <option value="balance_desc">點數多→少</option>
            <option value="balance_asc">點數少→多</option>
            <option value="email_asc">Email A→Z</option>
          </select>
          <button type="submit" className={btnCls}>搜尋</button>
          <span className="ml-auto text-[12px] text-[#6d6d6d]">{data ? `共 ${num(data.total)} 個帳號` : loading ? "載入中…" : ""}</span>
        </form>
      </Card>

      <Card>
        <Table minWidth={960} head={["UID", "Email", "方案", "狀態", "點數", "生成數", "最後活動", "註冊", ""]}>
          {data?.users.map((u) => (
            <tr key={u.id} className="hover:bg-[#151515]">
              <td className={`${td} font-mono text-[#c9c9c9]`}>{u.uid ?? "—"}</td>
              <td className={td}>
                <div className="text-white">{u.email}</div>
                <div className="text-[10.5px] text-[#6d6d6d]">
                  #{u.id}{u.role === "admin" ? " · 管理員" : ""}{u.email_verified ? "" : " · 未驗證"}
                </div>
              </td>
              <td className={td}>{PLANS.find((p) => p.code === u.plan_code)?.name ?? u.plan_code}</td>
              <td className={td}>{u.status === "banned" ? <span className="text-[#ff9b9b]">停權</span> : <span className="text-[#7ff0cd]">正常</span>}</td>
              <td className={tdNum}>{num(u.balance)}</td>
              <td className={tdNum}>{num(u.generations)}</td>
              <td className={td}>{dt(u.last_seen_at)}</td>
              <td className={td}>{dt(u.created_at)}</td>
              <td className={td}>
                <Link href={`/crm/users/${u.id}`} className="text-[#7ff0cd] hover:underline">詳情</Link>
              </td>
            </tr>
          ))}
          {data && data.users.length === 0 && (
            <tr>
              <td className={td} colSpan={9}>沒有符合的帳號</td>
            </tr>
          )}
        </Table>
        {data && data.pages > 1 && (
          <div className="mt-3 flex items-center justify-end gap-2 text-[12px]">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={btnCls}>上一頁</button>
            <span className="text-[#8a8a8a]">{page} / {data.pages}</span>
            <button type="button" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className={btnCls}>下一頁</button>
          </div>
        )}
      </Card>
    </div>
  );
}
