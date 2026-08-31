"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminTabs from "../AdminTabs";

type Modality = "image" | "video" | "text";
interface Rate {
  modelId: string;
  modality: Modality;
  credits: number;
  active: boolean;
}
interface Model {
  id: string;
  modality: Modality;
}
interface Row {
  modelId: string;
  modality: Modality;
  credits: number | "";
  active: boolean;
  hasRate: boolean;
  dirty: boolean;
}

const UNIT: Record<Modality, string> = { image: "每張", video: "每秒", text: "每則 + tokens" };

export default function AdminRatesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [mod, setMod] = useState<"" | Modality>("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/rates");
      if (res.status === 401) return router.push("/login?next=/admin/rates");
      const json = await res.json();
      if (res.status === 403) {
        setError("需要管理員權限");
        return;
      }
      if (!res.ok) throw new Error(json?.error?.message || "載入失敗");

      const rates: Rate[] = json.rates ?? [];
      const models: Model[] = json.models ?? [];
      const byId = new Map(rates.map((r) => [r.modelId, r]));
      const ids = new Set<string>([...models.map((m) => m.id), ...rates.map((r) => r.modelId)]);
      const modalityOf = new Map(models.map((m) => [m.id, m.modality]));

      const merged: Row[] = [...ids].map((id) => {
        const r = byId.get(id);
        return {
          modelId: id,
          modality: r?.modality ?? modalityOf.get(id) ?? "text",
          credits: r ? r.credits : "",
          active: r ? r.active : true,
          hasRate: !!r,
          dirty: false,
        };
      });
      merged.sort((a, b) => a.modality.localeCompare(b.modality) || a.modelId.localeCompare(b.modelId));
      setRows(merged);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is this view's data fetch
    load();
  }, [load]);

  const patch = (id: string, p: Partial<Row>) =>
    setRows((cur) => cur.map((r) => (r.modelId === id ? { ...r, ...p, dirty: true } : r)));

  const save = async (row: Row) => {
    if (row.credits === "" || Number(row.credits) < 0) return;
    setSavingId(row.modelId);
    try {
      const res = await fetch("/api/admin/rates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: row.modelId,
          modality: row.modality,
          credits: Number(row.credits),
          active: row.active,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message || "儲存失敗");
        return;
      }
      setRows((cur) =>
        cur.map((r) => (r.modelId === row.modelId ? { ...r, hasRate: true, dirty: false } : r))
      );
    } finally {
      setSavingId(null);
    }
  };

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!mod || r.modality === mod) &&
          (!q || r.modelId.toLowerCase().includes(q.toLowerCase()))
      ),
    [rows, q, mod]
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-[22px] font-semibold tracking-tight">模型費率</h1>
          <Link href="/account" className="text-[12.5px] text-[#8a8a8a] hover:text-white">回帳號</Link>
        </div>
        <AdminTabs active="rates" />

        <p className="text-[13px] text-[#8a8a8a]">
          每個模型消耗的積分。圖片＝每張、影片＝每秒、文字＝每則基礎值再加 tokens。改完按該列「存」，前台報價與實際扣點都會即時吃新值；沒有列的模型走內建預設。
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋模型 id…"
            className="h-9 w-64 rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-3 text-[13px] text-white focus:border-[#4a4a4a] focus:outline-none"
          />
          <select
            value={mod}
            onChange={(e) => setMod(e.target.value as "" | Modality)}
            className="h-9 rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-2.5 text-[12.5px] text-white focus:outline-none"
          >
            <option value="">全部類型</option>
            <option value="video">影片</option>
            <option value="image">圖片</option>
            <option value="text">文字</option>
          </select>
          {loading && <span className="text-[12px] text-[#6d6d6d]">載入中…</span>}
        </div>

        {error ? (
          <div className="mt-6 rounded-xl border border-[#4a2020] bg-[#1a1010] px-4 py-3 text-[13px] text-[#ffb4b4]">{error}</div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-[#262626]">
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead className="bg-[#161616] text-[#8a8a8a]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">模型</th>
                  <th className="px-3 py-2 text-left font-medium">類型</th>
                  <th className="px-3 py-2 text-left font-medium">單位</th>
                  <th className="px-3 py-2 text-right font-medium">積分</th>
                  <th className="px-3 py-2 text-center font-medium">啟用</th>
                  <th className="px-3 py-2 text-left font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.modelId} className="border-t border-[#1e1e1e]">
                    <td className="px-3 py-2">
                      <span className="text-white">{r.modelId}</span>
                      {!r.hasRate && <span className="ml-2 text-[10.5px] text-[#6d6d6d]">（用預設）</span>}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={r.modality}
                        onChange={(e) => patch(r.modelId, { modality: e.target.value as Modality })}
                        className="rounded border border-[#2c2c2c] bg-[#1c1c1c] px-1.5 py-1 text-[12px] text-white focus:outline-none"
                      >
                        <option value="video">影片</option>
                        <option value="image">圖片</option>
                        <option value="text">文字</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-[#9a9a9a]">{UNIT[r.modality]}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={r.credits}
                        onChange={(e) => patch(r.modelId, { credits: e.target.value === "" ? "" : Number(e.target.value) })}
                        className="h-8 w-20 rounded border border-[#2c2c2c] bg-[#1c1c1c] px-2 text-right text-[12.5px] text-white focus:border-[#4a4a4a] focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={r.active}
                        onChange={(e) => patch(r.modelId, { active: e.target.checked })}
                        className="h-4 w-4 accent-[#7ff0cd]"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => save(r)}
                        disabled={!r.dirty || r.credits === "" || savingId === r.modelId}
                        className="rounded bg-[#242424] px-2.5 py-1 text-[11.5px] hover:bg-[#2e2e2e] disabled:opacity-40"
                      >
                        {savingId === r.modelId ? "…" : "存"}
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && !loading && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-[#6d6d6d]">沒有符合的模型</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
