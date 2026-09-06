"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminTabs from "../AdminTabs";

type Modality = "image" | "video" | "text";
interface ApiModel {
  id: string;
  modality: Modality;
  defaultName: string;
  displayName: string;
  sortOrder: number | null;
  hasOverride: boolean;
}
interface Row extends ApiModel {
  nameInput: string;
  orderInput: string;
  dirty: boolean;
}

const MODALITY_LABEL: Record<Modality, string> = { image: "圖片", video: "影片", text: "文字" };

function toRow(m: ApiModel): Row {
  return { ...m, nameInput: m.displayName, orderInput: m.sortOrder === null ? "" : String(m.sortOrder), dirty: false };
}

export default function AdminModelsPage() {
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
      const res = await fetch("/api/admin/models");
      if (res.status === 401) return router.push("/login?next=/admin/models");
      const json = await res.json();
      if (res.status === 403) {
        setError("需要管理員權限");
        return;
      }
      if (!res.ok) throw new Error(json?.error?.message || "載入失敗");
      setRows((json.models as ApiModel[]).map(toRow));
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
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...p, dirty: true } : r)));

  const save = async (row: Row) => {
    setSavingId(row.id);
    try {
      const trimmedName = row.nameInput.trim();
      const sortOrder = row.orderInput.trim() === "" ? null : Number(row.orderInput);
      if (row.orderInput.trim() !== "" && !Number.isFinite(sortOrder)) {
        alert("排序必須是數字");
        return;
      }
      const res = await fetch("/api/admin/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: row.id,
          displayName: trimmedName === row.defaultName || trimmedName === "" ? null : trimmedName,
          sortOrder,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message || "儲存失敗");
        return;
      }
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const reset = async (row: Row) => {
    setSavingId(row.id);
    try {
      await fetch("/api/admin/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: row.id, displayName: null, sortOrder: null }),
      });
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!mod || r.modality === mod) &&
          (!q || r.id.toLowerCase().includes(q.toLowerCase()) || r.displayName.toLowerCase().includes(q.toLowerCase()))
      ),
    [rows, q, mod]
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-[22px] font-semibold tracking-tight">模型名稱 / 排序</h1>
          <Link href="/account" className="text-[12.5px] text-[#8a8a8a] hover:text-white">回帳號</Link>
        </div>
        <AdminTabs active="models" />

        <p className="text-[13px] leading-relaxed text-[#8a8a8a]">
          每個模型前台顯示的名字跟排序。沒特別設定的話，名字會自動去掉 SIRAYA / ByteDance / Dola 這類廠商字首，排序會把
          同系列模型（Seedance、Seedream、Gemini…）自動排在一起——這兩欄留白就是用這個自動結果。改完按「存」，整站的模型
          選單（生成頁、智慧畫布）都會馬上套用；按「重設」清空這一列的自訂設定，回到自動結果。排序數字越小越前面，同樣是
          留白的模型彼此之間還是照自動分組排列，只有你有填數字的才會被排到指定位置。
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋模型 id 或名稱…"
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
            <table className="w-full min-w-[820px] text-[12.5px]">
              <thead className="bg-[#161616] text-[#8a8a8a]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">模型 id</th>
                  <th className="px-3 py-2 text-left font-medium">類型</th>
                  <th className="px-3 py-2 text-left font-medium">顯示名稱</th>
                  <th className="px-3 py-2 text-right font-medium">排序</th>
                  <th className="px-3 py-2 text-left font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-[#1e1e1e]">
                    <td className="px-3 py-2">
                      <span className="text-[#c9c9c9]">{r.id}</span>
                      {r.hasOverride && <span className="ml-2 text-[10.5px] text-[#7ff0cd]">（已自訂）</span>}
                    </td>
                    <td className="px-3 py-2 text-[#9a9a9a]">{MODALITY_LABEL[r.modality]}</td>
                    <td className="px-3 py-2">
                      <input
                        value={r.nameInput}
                        placeholder={r.defaultName}
                        onChange={(e) => patch(r.id, { nameInput: e.target.value })}
                        className="h-8 w-56 rounded border border-[#2c2c2c] bg-[#1c1c1c] px-2 text-[12.5px] text-white focus:border-[#4a4a4a] focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        value={r.orderInput}
                        placeholder="自動"
                        onChange={(e) => patch(r.id, { orderInput: e.target.value })}
                        className="h-8 w-20 rounded border border-[#2c2c2c] bg-[#1c1c1c] px-2 text-right text-[12.5px] text-white focus:border-[#4a4a4a] focus:outline-none"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <button
                        onClick={() => save(r)}
                        disabled={!r.dirty || savingId === r.id}
                        className="rounded bg-[#242424] px-2.5 py-1 text-[11.5px] hover:bg-[#2e2e2e] disabled:opacity-40"
                      >
                        {savingId === r.id ? "…" : "存"}
                      </button>
                      {r.hasOverride && (
                        <button
                          onClick={() => reset(r)}
                          disabled={savingId === r.id}
                          className="ml-1.5 rounded bg-[#242424] px-2.5 py-1 text-[11.5px] text-[#ff9b9b] hover:bg-[#2e2e2e] disabled:opacity-40"
                        >
                          重設
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && !loading && (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-[#6d6d6d]">沒有符合的模型</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
