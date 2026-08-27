"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Plan {
  code: string;
  name: string;
  priceUSD: number;
  monthlyCredits: number;
  blurb: string;
}
interface LedgerRow {
  id: number;
  delta: number;
  reason: string;
  ref: string | null;
  created_at: string;
}
interface AccountData {
  user: { email: string; role: string; planCode: string; planRenewsAt: string | null };
  credits: number;
  plan: Plan;
  plans: Plan[];
  ledger: LedgerRow[];
}

const REASON_LABEL: Record<string, string> = {
  admin_grant: "管理員加點",
  plan_grant: "方案發點",
  image: "圖片生成",
  video: "影片生成",
  video_refund: "影片失敗退點",
  text: "文字生成",
};

export default function AccountPage() {
  const router = useRouter();
  const [data, setData] = useState<AccountData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account")
      .then(async (r) => {
        if (r.status === 401) {
          router.push("/login?next=/account");
          return null;
        }
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message || "載入失敗");
        return j as AccountData;
      })
      .then((j) => j && setData(j))
      .catch((e) => setError(e.message));
  }, [router]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  if (error) {
    return <div className="p-8 text-[13px] text-[#ff9b9b]">{error}</div>;
  }
  if (!data) {
    return <div className="p-8 text-[13px] text-[#8a8a8a]">載入中…</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[880px] px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold tracking-tight">帳號</h1>
          <div className="flex items-center gap-3 text-[12.5px]">
            {data.user.role === "admin" && (
              <Link href="/admin" className="text-[#7ff0cd] hover:underline">後台管理</Link>
            )}
            <button onClick={logout} className="text-[#8a8a8a] hover:text-white">登出</button>
          </div>
        </div>
        <p className="mt-1 text-[13px] text-[#8a8a8a]">{data.user.email}</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#262626] bg-[#141414] p-5">
            <div className="text-[12px] text-[#8a8a8a]">目前點數</div>
            <div className="mt-1 text-[30px] font-semibold text-[#7ff0cd]">{data.credits.toLocaleString()}</div>
            <div className="mt-1 text-[11.5px] text-[#6d6d6d]">圖片約 10–14 點／張，影片約 50–70 點／秒</div>
          </div>
          <div className="rounded-2xl border border-[#262626] bg-[#141414] p-5">
            <div className="text-[12px] text-[#8a8a8a]">目前方案</div>
            <div className="mt-1 text-[20px] font-semibold">{data.plan.name}</div>
            {data.user.planRenewsAt && (
              <div className="mt-1 text-[11.5px] text-[#6d6d6d]">
                續期：{new Date(data.user.planRenewsAt).toLocaleDateString("zh-TW")}
              </div>
            )}
          </div>
        </div>

        <h2 className="mt-8 text-[15px] font-semibold">方案</h2>
        <p className="mt-1 text-[12px] text-[#8a8a8a]">
          目前金流尚未開放，選好方案後請聯絡管理員開通（開通後每月自動發點）。
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.plans.map((p) => (
            <div
              key={p.code}
              className={[
                "rounded-xl border p-4",
                p.code === data.plan.code ? "border-[#4fd1c5] bg-[#10201c]" : "border-[#262626] bg-[#141414]",
              ].join(" ")}
            >
              <div className="text-[14px] font-medium">{p.name}</div>
              <div className="mt-1 text-[18px] font-semibold">
                {p.priceUSD === 0 ? "免費" : `$${p.priceUSD}`}
                <span className="text-[11px] text-[#6d6d6d]"> / 月</span>
              </div>
              <div className="mt-1 text-[11.5px] text-[#8a8a8a]">{p.blurb}</div>
              {p.code === data.plan.code && (
                <div className="mt-2 text-[11px] text-[#4fd1c5]">目前方案</div>
              )}
            </div>
          ))}
        </div>

        <h2 className="mt-8 text-[15px] font-semibold">點數紀錄</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-[#262626]">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#161616] text-[#8a8a8a]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">時間</th>
                <th className="px-3 py-2 text-left font-medium">項目</th>
                <th className="px-3 py-2 text-right font-medium">變動</th>
              </tr>
            </thead>
            <tbody>
              {data.ledger.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-6 text-center text-[#6d6d6d]">還沒有任何紀錄</td></tr>
              )}
              {data.ledger.map((row) => (
                <tr key={row.id} className="border-t border-[#1e1e1e]">
                  <td className="px-3 py-2 text-[#9a9a9a]">
                    {new Date(row.created_at).toLocaleString("zh-TW", { hour12: false })}
                  </td>
                  <td className="px-3 py-2">
                    {REASON_LABEL[row.reason] || row.reason}
                    {row.ref && <span className="ml-1 text-[11px] text-[#6d6d6d]">{row.ref}</span>}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium ${row.delta >= 0 ? "text-[#7ff0cd]" : "text-[#ff9b9b]"}`}>
                    {row.delta >= 0 ? `+${row.delta}` : row.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
