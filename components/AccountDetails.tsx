"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/formatTime";
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
  user: { nickname: string | null; email: string; role: string; planCode: string; planRenewsAt: string | null; uid?: string | null };
  credits: number;
  plan: Plan;
  plans: Plan[];
  ledger: LedgerRow[];
  generations: {id:number;model:string;kind:string;created_at:string;duration_ms:number|null}[];
}

const REASON_LABEL: Record<string, string> = {
  admin_grant: "管理員加點",
  plan_grant: "方案發點",
  credit_pack: "加購點數包",
  daily_free: "免費方案每日發點",
  image: "圖片生成",
  video: "影片生成",
  video_refund: "影片失敗退點",
  text: "文字生成",
};

function ChangePassword() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) {
      setMsg({ ok: false, text: "兩次輸入的新密碼不一致" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: cur, newPassword: next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: j?.error?.message || "更改失敗" });
        return;
      }
      setMsg({ ok: true, text: "密碼已更新，其他裝置已登出" });
      setCur("");
      setNext("");
      setConfirm("");
    } finally {
      setBusy(false);
    }
  };

  const field =
    "h-9 w-full rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-3 text-[13px] text-white focus:border-[#4a4a4a] focus:outline-none";

  return (
    <form onSubmit={submit} className="mt-3 max-w-[420px] space-y-2.5">
      <input
        type="password"
        autoComplete="current-password"
        placeholder="目前密碼"
        value={cur}
        onChange={(e) => setCur(e.target.value)}
        className={field}
        required
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder="新密碼（至少 8 個字元）"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        className={field}
        required
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder="再次輸入新密碼"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className={field}
        required
      />
      {msg && (
        <div className={`text-[12px] ${msg.ok ? "text-[#7ff0cd]" : "text-[#ff9b9b]"}`}>{msg.text}</div>
      )}
      <button
        type="submit"
        disabled={busy || !cur || !next || !confirm}
        className="h-9 rounded-lg bg-[#2e2e2e] px-4 text-[12.5px] font-medium text-white hover:bg-[#383838] disabled:opacity-40"
      >
        {busy ? "更新中…" : "更新密碼"}
      </button>
    </form>
  );
}

export default function AccountDetails() {
  const router = useRouter();
  const [data, setData] = useState<AccountData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

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
    window.dispatchEvent(new Event("profile-updated"));
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
      <div className="mx-auto max-w-[1040px] px-6 py-8">
        <div className="flex items-center justify-between">
          <h2 className="text-[22px] font-semibold tracking-tight">個人資訊</h2>
          <div className="flex items-center gap-3 text-[12.5px]">
            {data.user.role === "admin" && (
              <>
                <Link href="/crm" className="text-[#7ff0cd] hover:underline">管理後台</Link>
              </>
            )}
            <button onClick={logout} className="text-[#8a8a8a] hover:text-white">登出</button>
          </div>
        </div>
        <p className="mt-1 text-[13px] text-[#8a8a8a]">
          {data.user.email}
          {data.user.uid && (
            <span className="ml-2 rounded-md bg-[#1c1c1c] px-1.5 py-0.5 font-mono text-[11px] text-[#c9c9c9]" title="你的使用者編號，聯絡客服時提供這組即可">UID {data.user.uid}</span>
          )}
        </p>

        <form className="mt-6 rounded-2xl border border-[#303030] bg-[#151515] p-5" onSubmit={async e=>{
          e.preventDefault();setSaving(true);setNotice("");
          const nickname = new FormData(e.currentTarget).get("nickname");
          try { const res=await fetch("/api/account",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({nickname})});const j=await res.json();if(!res.ok)throw new Error(j.error?.message||"儲存失敗");setData({...data,user:{...data.user,nickname:j.nickname}});setNotice("暱稱已更新");window.dispatchEvent(new Event("profile-updated"));} catch(err){setNotice(err instanceof Error?err.message:"儲存失敗");} finally{setSaving(false);}
        }}>
          <label htmlFor="nickname" className="text-sm font-medium">公開暱稱</label>
          <p className="mt-1 text-xs leading-6 text-neutral-400">用於右上角及藍翼廣場模板署名，2–24 個字。Email 不會作為公開署名。</p>
          <div className="mt-3 flex flex-wrap gap-2"><input id="nickname" name="nickname" defaultValue={data.user.nickname||""} required minLength={2} maxLength={48} placeholder="你的創作者暱稱" autoComplete="nickname" className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-black px-3 py-2 text-sm"/><button disabled={saving} className="rounded-lg bg-[#7ff0cd] px-4 py-2 text-sm text-black disabled:opacity-40">{saving?"儲存中…":"儲存暱稱"}</button></div>
          <p role="status" className="mt-2 text-xs text-[#7ff0cd]">{notice}</p>
        </form>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#262626] bg-[#141414] p-5">
            <div className="text-[12px] text-[#8a8a8a]">目前點數</div>
            <div className="mt-1 text-[30px] font-semibold text-[#7ff0cd]">{data.credits.toLocaleString()}</div>
            <div className="mt-1 text-[12px] leading-6 text-[#8a8a8a]">
              實際扣點依模型與生成設定計算，送出前會顯示預估點數。
            </div>
          </div>
          <div className="rounded-2xl border border-[#262626] bg-[#141414] p-5">
            <div className="text-[12px] text-[#8a8a8a]">目前方案</div>
            <div className="mt-1 text-[20px] font-semibold">{data.plan.name}</div>
            {data.user.planRenewsAt && (
              <div className="mt-1 text-[12px] leading-6 text-[#8a8a8a]">
                續期：{new Date(data.user.planRenewsAt).toLocaleDateString("zh-TW")}
              </div>
            )}
          </div>
        </div>

        <Link href="/pricing" className="mt-6 block rounded-xl border border-[#37594f] bg-[#10251f] px-5 py-4 text-[#7ff0cd]">比較方案與加購點數 →</Link>
        <p className="mt-3 text-xs leading-6 text-neutral-400">付費方案目前由管理員協助開通，請提供你的 UID 與所選方案；尚未提供線上付款或自動扣款。</p>

        <h2 className="mt-8 text-lg font-semibold">最近生成・耗時</h2>
        <p className="mt-2 text-xs leading-6 text-neutral-400">從提交至取得結果的時間，包含排隊與輪詢等待；不是影片本身的長度。舊紀錄未量測時顯示「未記錄」。</p>
        <div className="mt-4 divide-y divide-neutral-800 rounded-2xl border border-neutral-800 px-4">{data.generations?.length?data.generations.map(g=><div key={g.id} className="flex items-start justify-between gap-4 py-4"><div className="min-w-0"><p className="break-words text-sm">{g.model}</p><p className="mt-1 text-xs text-neutral-500">{new Date(g.created_at).toLocaleString("zh-TW",{hour12:false})}</p></div><span className="shrink-0 text-sm text-[#7ff0cd]">{g.duration_ms == null?"未記錄":formatDuration(g.duration_ms)}</span></div>):<p className="py-5 text-sm text-neutral-500">還沒有生成紀錄</p>}</div>

        <h2 className="mt-8 text-[15px] font-semibold">點數紀錄</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-[#262626]">
          <table className="w-full table-fixed text-[12.5px]">
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
                    {row.ref && <details className="mt-1 text-[11px] leading-5 text-[#888]"><summary className="cursor-pointer">參考紀錄</summary><span className="block break-all">{row.ref}</span></details>}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium ${row.delta >= 0 ? "text-[#7ff0cd]" : "text-[#ff9b9b]"}`}>
                    {row.delta >= 0 ? `+${row.delta}` : row.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-8 text-[15px] font-semibold">帳號安全</h2>
        <p className="mt-1 text-[12px] text-[#8a8a8a]">更改密碼後，這台裝置維持登入，其他裝置會被登出。</p>
        <ChangePassword />
      </div>
    </div>
  );
}
