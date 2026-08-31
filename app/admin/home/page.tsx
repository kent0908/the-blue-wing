"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminTabs from "../AdminTabs";

type Section = "hero" | "showcase" | "template";

interface Block {
  id: number;
  section: Section;
  sort: number;
  title: string;
  subtitle: string;
  badge: string | null;
  asset_id: number | null;
  target_mode: string | null;
  model_id: string | null;
  prompt: string | null;
  params: Record<string, unknown>;
  active: boolean;
  _dirty?: boolean;
  _paramsText?: string;
}

const SECTION_LABEL: Record<Section, string> = {
  hero: "Hero 輪播",
  showcase: "模型展示卡",
  template: "模板（用畫布創造更多）",
};
const MODES = ["", "image", "video", "audio", "text"];

const field =
  "h-9 w-full rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-3 text-[13px] text-white focus:border-[#4a4a4a] focus:outline-none";

export default function AdminHomeContentPage() {
  const router = useRouter();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/home-blocks");
      if (res.status === 401) return router.push("/login?next=/admin/home");
      const json = await res.json();
      if (res.status === 403) {
        setError("需要管理員權限");
        return;
      }
      if (!res.ok) throw new Error(json?.error?.message || "載入失敗");
      setBlocks(
        (json.blocks as Block[]).map((b) => ({ ...b, _paramsText: JSON.stringify(b.params ?? {}, null, 0) }))
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch for this view
    load();
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : { models: [] }))
      .then((j) => setModels((j.models ?? []).map((m: { id: string }) => m.id)))
      .catch(() => {});
  }, [load]);

  const patch = (id: number, p: Partial<Block>) =>
    setBlocks((cur) => cur.map((b) => (b.id === id ? { ...b, ...p, _dirty: true } : b)));

  const addBlock = async (section: Section) => {
    const res = await fetch("/api/admin/home-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section }),
    });
    if (res.ok) {
      const j = await res.json();
      setBlocks((cur) => [...cur, { ...j.block, _paramsText: "{}" }]);
    }
  };

  const uploadImage = async (id: number, file: File) => {
    setUploadingId(id);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/assets", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j?.error?.message || "上傳失敗");
        return;
      }
      patch(id, { asset_id: j.asset.id });
    } finally {
      setUploadingId(null);
    }
  };

  const save = async (b: Block) => {
    let params: Record<string, unknown> = {};
    try {
      params = b._paramsText ? JSON.parse(b._paramsText) : {};
    } catch {
      alert("參數 JSON 格式錯誤");
      return;
    }
    setSavingId(b.id);
    try {
      const res = await fetch("/api/admin/home-blocks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: b.id,
          sort: b.sort,
          title: b.title,
          subtitle: b.subtitle,
          badge: b.badge || null,
          asset_id: b.asset_id,
          target_mode: b.target_mode || null,
          model_id: b.model_id || null,
          prompt: b.prompt || null,
          params,
          active: b.active,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message || "儲存失敗");
        return;
      }
      setBlocks((cur) => cur.map((x) => (x.id === b.id ? { ...x, _dirty: false, params } : x)));
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("刪除這張卡片？")) return;
    const res = await fetch(`/api/admin/home-blocks?id=${id}`, { method: "DELETE" });
    if (res.ok) setBlocks((cur) => cur.filter((b) => b.id !== id));
  };

  const sections: Section[] = ["hero", "showcase", "template"];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-[22px] font-semibold tracking-tight">首頁 / 模板</h1>
          <Link href="/account" className="text-[12.5px] text-[#8a8a8a] hover:text-white">回帳號</Link>
        </div>
        <AdminTabs active="home" />

        <p className="text-[13px] text-[#8a8a8a]">
          首頁三個區塊的卡片。設定圖片、標題、要帶去哪個模式／模型／prompt／參數；使用者點卡片就會進生成頁並帶好一切。沒有卡片時前台顯示內建預設。
        </p>

        {error ? (
          <div className="mt-6 rounded-xl border border-[#4a2020] bg-[#1a1010] px-4 py-3 text-[13px] text-[#ffb4b4]">{error}</div>
        ) : loading ? (
          <div className="mt-6 text-[13px] text-[#6d6d6d]">載入中…</div>
        ) : (
          sections.map((sec) => (
            <section key={sec} className="mt-7">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">{SECTION_LABEL[sec]}</h2>
                <button
                  onClick={() => addBlock(sec)}
                  className="rounded-lg bg-[#242424] px-2.5 py-1.5 text-[12px] hover:bg-[#2e2e2e]"
                >
                  ＋ 新增
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {blocks
                  .filter((b) => b.section === sec)
                  .map((b) => (
                    <div key={b.id} className="rounded-xl border border-[#262626] bg-[#141414] p-4">
                      <div className="grid gap-3 md:grid-cols-[120px_1fr]">
                        <div>
                          {b.asset_id ? (
                            // eslint-disable-next-line @next/next/no-img-element -- admin proxy
                            <img
                              src={`/api/content/${b.id}/image`}
                              alt=""
                              className="h-[90px] w-full rounded-lg object-cover"
                            />
                          ) : (
                            <div className="grid h-[90px] w-full place-items-center rounded-lg bg-[#1c1c1c] text-[11px] text-[#6d6d6d]">
                              無圖
                            </div>
                          )}
                          <label className="mt-1.5 block cursor-pointer text-center text-[11px] text-[#7ff0cd] hover:underline">
                            {uploadingId === b.id ? "上傳中…" : b.asset_id ? "換圖" : "上傳圖片"}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => e.target.files?.[0] && uploadImage(b.id, e.target.files[0])}
                            />
                          </label>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                          <input className={field} placeholder="標題" value={b.title} onChange={(e) => patch(b.id, { title: e.target.value })} />
                          <input className={field} placeholder="副標" value={b.subtitle} onChange={(e) => patch(b.id, { subtitle: e.target.value })} />
                          <input className={field} placeholder="badge（熱門 / 新，可空）" value={b.badge ?? ""} onChange={(e) => patch(b.id, { badge: e.target.value })} />
                          <div className="flex gap-2">
                            <select
                              className={field}
                              value={b.target_mode ?? ""}
                              onChange={(e) => patch(b.id, { target_mode: e.target.value })}
                            >
                              {MODES.map((m) => (
                                <option key={m} value={m}>{m || "（不指定模式）"}</option>
                              ))}
                            </select>
                            <input
                              className={`${field} w-16 text-center`}
                              type="number"
                              value={b.sort}
                              onChange={(e) => patch(b.id, { sort: Number(e.target.value) })}
                              title="排序"
                            />
                          </div>
                          <input
                            className={`${field} sm:col-span-2`}
                            list={`models-${b.id}`}
                            placeholder="模型 id（可空）"
                            value={b.model_id ?? ""}
                            onChange={(e) => patch(b.id, { model_id: e.target.value })}
                          />
                          <datalist id={`models-${b.id}`}>
                            {models.map((m) => <option key={m} value={m} />)}
                          </datalist>
                          <textarea
                            className="min-h-[52px] w-full rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-3 py-2 text-[13px] text-white focus:border-[#4a4a4a] focus:outline-none sm:col-span-2"
                            placeholder="預設 prompt（可空）"
                            value={b.prompt ?? ""}
                            onChange={(e) => patch(b.id, { prompt: e.target.value })}
                          />
                          <input
                            className={`${field} sm:col-span-2 font-mono text-[12px]`}
                            placeholder='參數 JSON，例如 {"size":"2048x2048","n":2}'
                            value={b._paramsText ?? ""}
                            onChange={(e) => patch(b.id, { _paramsText: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-[12px] text-[#c9c9c9]">
                          <input
                            type="checkbox"
                            checked={b.active}
                            onChange={(e) => patch(b.id, { active: e.target.checked })}
                            className="h-4 w-4 accent-[#7ff0cd]"
                          />
                          啟用
                        </label>
                        <button
                          onClick={() => save(b)}
                          disabled={!b._dirty || savingId === b.id}
                          className="rounded bg-[#2e2e2e] px-3 py-1 text-[12px] font-medium hover:bg-[#383838] disabled:opacity-40"
                        >
                          {savingId === b.id ? "…" : "存"}
                        </button>
                        <button
                          onClick={() => remove(b.id)}
                          className="rounded bg-[#242424] px-3 py-1 text-[12px] text-[#ff9b9b] hover:bg-[#2e2e2e]"
                        >
                          刪
                        </button>
                      </div>
                    </div>
                  ))}
                {blocks.filter((b) => b.section === sec).length === 0 && (
                  <p className="text-[12.5px] text-[#6d6d6d]">尚無卡片，前台顯示內建預設。</p>
                )}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
