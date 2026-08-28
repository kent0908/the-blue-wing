"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Asset {
  id: number;
  src: string;
  contentType: string;
  size: number;
  createdAt: string;
}

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";
const MAX_MB = 4;

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function AssetsPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<{ name: string; state: "pending" | "error"; msg?: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/assets");
      if (res.status === 401) return router.push("/login?next=/assets");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "載入失敗");
      setAssets(json.assets);
      setConfigured(json.configured);
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

  const uploadOne = useCallback(async (file: File) => {
    setUploads((u) => [...u, { name: file.name, state: "pending" }]);
    const fail = (msg: string) =>
      setUploads((u) => u.map((x) => (x.name === file.name && x.state === "pending" ? { ...x, state: "error", msg } : x)));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/assets", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        fail(json?.error?.message || "上傳失敗");
        return;
      }
      setAssets((a) => [json.asset, ...a]);
      setUploads((u) => u.filter((x) => !(x.name === file.name && x.state === "pending")));
    } catch {
      fail("連線失敗");
    }
  }, []);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      for (const f of Array.from(files)) {
        if (f.size > MAX_MB * 1024 * 1024) {
          setUploads((u) => [...u, { name: f.name, state: "error", msg: `超過 ${MAX_MB} MB` }]);
          continue;
        }
        uploadOne(f);
      }
    },
    [uploadOne]
  );

  const remove = async (id: number) => {
    if (!confirm("刪除這個素材？")) return;
    const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
    if (res.ok) setAssets((a) => a.filter((x) => x.id !== id));
    else alert("刪除失敗");
  };

  const copyUrl = async (a: Asset) => {
    try {
      await navigator.clipboard.writeText(new URL(a.src, location.origin).href);
      setCopiedId(a.id);
      setTimeout(() => setCopiedId((c) => (c === a.id ? null : c)), 1400);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div
      className="h-full overflow-y-auto"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
      }}
    >
      <div className="mx-auto max-w-[1000px] px-6 py-8">
        <h1 className="text-[22px] font-semibold tracking-tight">資產庫</h1>
        <p className="mt-1 text-[13px] text-[#8a8a8a]">
          上傳你的素材圖片，之後可在這裡管理、複製連結。單檔上限 {MAX_MB} MB。
        </p>

        {!configured && (
          <div className="mt-4 rounded-xl border border-[#3a2e18] bg-[#1a150c] px-4 py-3 text-[12.5px] text-[#f0c27f]">
            尚未設定素材儲存空間（Vercel Blob）。設定完成前無法上傳新素材。
          </div>
        )}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`mt-5 flex w-full flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition-colors ${
            dragOver ? "border-[#7ff0cd] bg-[#10201c]" : "border-[#333] bg-[#141414] hover:border-[#4a4a4a]"
          }`}
        >
          <span className="text-[13px] text-white">拖曳圖片到這裡，或點擊選擇檔案</span>
          <span className="mt-1 text-[11.5px] text-[#6d6d6d]">PNG · JPG · WebP · GIF · SVG</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {uploads.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {uploads.map((u, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <span className={u.state === "error" ? "text-[#ff9b9b]" : "text-[#8a8a8a]"}>
                  {u.state === "error" ? "✕" : "↑"}
                </span>
                <span className="truncate text-[#c9c9c9]">{u.name}</span>
                <span className={u.state === "error" ? "text-[#ff9b9b]" : "text-[#6d6d6d]"}>
                  {u.state === "error" ? u.msg : "上傳中…"}
                </span>
                {u.state === "error" && (
                  <button
                    onClick={() => setUploads((x) => x.filter((_, j) => j !== i))}
                    className="text-[#6d6d6d] hover:text-white"
                  >
                    清除
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {error ? (
          <div className="mt-6 rounded-xl border border-[#4a2020] bg-[#1a1010] px-4 py-3 text-[13px] text-[#ffb4b4]">{error}</div>
        ) : loading ? (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square bw-shimmer rounded-xl" />
            ))}
          </div>
        ) : assets.length === 0 ? (
          <p className="mt-10 text-center text-[13px] text-[#6d6d6d]">還沒有任何素材</p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {assets.map((a) => (
              <div key={a.id} className="group relative overflow-hidden rounded-xl border border-[#262626] bg-[#111]">
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated proxy stream, not a static asset */}
                <img src={a.src} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5 text-[10.5px] text-[#c9c9c9]">
                  <span>{fmtSize(a.size)}</span>
                  <span className="text-[#8a8a8a]">{new Date(a.createdAt).toLocaleDateString("zh-TW")}</span>
                </div>
                <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => copyUrl(a)}
                    className="rounded bg-black/70 px-1.5 py-0.5 text-[10.5px] text-white hover:bg-black"
                  >
                    {copiedId === a.id ? "已複製" : "複製連結"}
                  </button>
                  <button
                    onClick={() => remove(a.id)}
                    className="rounded bg-black/70 px-1.5 py-0.5 text-[10.5px] text-[#ff9b9b] hover:bg-black"
                  >
                    刪除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
