"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, Notice, Table, btnCls, dt, td, useApi } from "@/components/crm/ui";

interface Entry {
  id: number;
  action: string;
  detail: unknown;
  ip: string | null;
  created_at: string;
  admin_email: string | null;
  admin_uid: string | null;
  target_email: string | null;
  target_uid: string | null;
  target_id: number | null;
}

const LABEL: Record<string, string> = {
  "user.grant_credits": "加點", "user.set_role": "變更角色", "user.set_status": "變更狀態", "user.set_plan": "變更方案", "user.grant_pack": "發放點數包",
  "user.send_reset_email": "寄重設密碼信", "user.resend_verify": "重寄驗證信", "user.sign_out_everywhere": "登出所有裝置",
  "cost_card.update": "更新成本表", "settings.update": "更新系統設定", "mail.test": "寄信測試",
};

export default function CrmAuditPage() {
  const [page, setPage] = useState(1);
  const { data, error } = useApi<{ entries: Entry[] }>(`/api/crm/audit?page=${page}`);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold text-white">稽核紀錄</h1>
        <p className="text-[12.5px] text-[#8a8a8a]">後台每一個會改變資料的操作：誰、對誰、做了什麼、從哪個 IP。不包含任何密碼或連結。</p>
      </div>
      {error && <Notice kind="err">{error}</Notice>}
      <Card>
        <Table minWidth={860} head={["時間", "操作", "管理員", "對象", "內容", "IP"]}>
          {data?.entries.map((e) => (
            <tr key={e.id} className="hover:bg-[#151515]">
              <td className={td}>{dt(e.created_at)}</td>
              <td className={td}>{LABEL[e.action] ?? e.action}</td>
              <td className={td}>
                <div>{e.admin_email ?? "—"}</div>
                {e.admin_uid && <div className="font-mono text-[10.5px] text-[#6d6d6d]">{e.admin_uid}</div>}
              </td>
              <td className={td}>
                {e.target_id ? (
                  <Link href={`/crm/users/${e.target_id}`} className="text-[#7ff0cd] hover:underline">{e.target_email ?? `#${e.target_id}`}</Link>
                ) : (
                  "—"
                )}
                {e.target_uid && <div className="font-mono text-[10.5px] text-[#6d6d6d]">{e.target_uid}</div>}
              </td>
              <td className={`${td} max-w-[320px] break-all font-mono text-[11px] text-[#8a8a8a]`}>{JSON.stringify(e.detail)}</td>
              <td className={`${td} font-mono text-[11px] text-[#6d6d6d]`}>{e.ip ?? "—"}</td>
            </tr>
          ))}
          {data && data.entries.length === 0 && (
            <tr>
              <td className={td} colSpan={6}>還沒有紀錄</td>
            </tr>
          )}
        </Table>
        <div className="mt-3 flex items-center justify-end gap-2 text-[12px]">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={btnCls}>上一頁</button>
          <span className="text-[#8a8a8a]">第 {page} 頁</span>
          <button type="button" disabled={!data || data.entries.length < 50} onClick={() => setPage((p) => p + 1)} className={btnCls}>下一頁</button>
        </div>
      </Card>
    </div>
  );
}
