"use client";

import { useCallback, useEffect, useState } from "react";
import { MAX_ASSET_BYTES_DIRECT } from "@/lib/assets";
import AssetUploader from "@/components/AssetUploader";
import { useRouter } from "next/navigation";
import ProviderAssetLibrary from "@/components/ProviderAssetLibrary";
import { useTr, useLocale } from "@/lib/i18n/client";
import { LOCALE_INTL } from "@/lib/i18n/locale";
import { assetUploadCopy } from "@/lib/i18n/assetUpload";

interface Asset {
  id: number;
  src: string;
  name: string;
  contentType: string;
  size: number;
  createdAt: string;
}

const MAX_MB = Math.floor(MAX_ASSET_BYTES_DIRECT / 1024 / 1024);

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function AssetsPage() {
  const tr = useTr();
  const locale = useLocale();
  const copy = assetUploadCopy(locale);
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/assets?media=all");
      if (res.status === 401) return router.push("/login?next=/assets");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || tr("載入失敗"));
      setAssets(json.assets);
      setConfigured(json.configured);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("載入失敗"));
    } finally {
      setLoading(false);
    }
  }, [router, tr]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is this view's data fetch
    load();
  }, [load]);

  const remove = async (id: number) => {
    if (!confirm(tr("刪除這個素材？"))) return;
    const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
    if (res.ok) setAssets((a) => a.filter((x) => x.id !== id));
    else alert(tr("刪除失敗"));
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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1000px] px-6 py-8">
        <h1 className="text-[22px] font-semibold tracking-tight">{tr("資產庫")}</h1>

        <p className="mt-1 text-[13px] text-[#8a8a8a]">
          {tr("上傳圖片、影片或音訊，之後可在這裡管理、登錄人物參考素材。單檔上限")} {MAX_MB} MB。
        </p>

        {!configured && (
          <div className="mt-4 rounded-xl border border-[#3a2e18] bg-[#1a150c] px-4 py-3 text-[12.5px] text-[#f0c27f]">
            {tr("尚未設定素材儲存空間（Vercel Blob）。設定完成前無法上傳新素材。")}
          </div>
        )}

        <AssetUploader disabled={!configured || loading} onUploaded={asset => setAssets(current => [asset, ...current.filter(item => item.id !== asset.id)])} />
        <details className="mt-6 rounded-xl border border-[#35443d] p-4">
          <summary className="cursor-pointer text-sm text-[#b4c2bc]">{copy.review}</summary>
          <p className="mt-3 text-sm text-[#b4c2bc]">{copy.reviewHelp}</p>
          <ProviderAssetLibrary sources={assets} />
        </details>
        <div className="mt-8 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{copy.personal} · {assets.length}</h2><button type="button" disabled={loading} onClick={() => void load()} className="text-sm text-[#7ff0cd]">{copy.refresh}</button></div>
        {error ? (
          <div className="mt-6 rounded-xl border border-[#4a2020] bg-[#1a1010] px-4 py-3 text-[13px] text-[#ffb4b4]">{tr(error)}</div>
        ) : loading ? (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square bw-shimmer rounded-xl" />
            ))}
          </div>
        ) : assets.length === 0 ? (
          <p className="mt-10 text-center text-[13px] text-[#6d6d6d]">{tr("還沒有任何素材")}</p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {assets.map((a) => (
              <div key={a.id} className="group relative overflow-hidden rounded-xl border border-[#262626] bg-[#111]">
                {a.contentType.startsWith("video/") ? (
                  <video disablePictureInPicture disableRemotePlayback src={a.src} aria-label={tr(a.name)} className="aspect-square w-full object-contain" controls playsInline preload="metadata" />
                ) : a.contentType.startsWith("audio/") ? (
                  <div className="flex aspect-square flex-col items-center justify-center gap-4 px-2"><span className="text-sm text-[#9caaa5]">{tr("音訊素材")}</span><audio src={a.src} aria-label={tr(a.name)} className="w-full" controls preload="metadata" /></div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- authenticated proxy stream, not a static asset
                  <img src={a.src} alt={tr(a.name)} className="aspect-square w-full object-cover" loading="lazy" />
                )}
                <div className="bg-[#151515] px-2 py-1.5">
                  <div className="truncate text-[10.5px] text-white" title={tr(a.name)}>{tr(a.name)}</div>
                  <div className="flex items-center justify-between gap-1 text-[10.5px] text-[#c9c9c9]">
                    <span>{fmtSize(a.size)}</span>
                    <span className="text-[#8a8a8a]">{new Date(a.createdAt).toLocaleDateString(LOCALE_INTL[locale])}</span>
                  </div>
                </div>
                <div className="flex justify-end gap-1 px-2 pb-2">
                  <button
                    onClick={() => copyUrl(a)}
                    className="rounded bg-black/70 px-1.5 py-0.5 text-[10.5px] text-white hover:bg-black"
                  >
                    {copiedId === a.id ? tr("已複製") : tr("複製連結")}
                  </button>
                  <button
                    onClick={() => remove(a.id)}
                    className="rounded bg-black/70 px-1.5 py-0.5 text-[10.5px] text-[#ff9b9b] hover:bg-black"
                  >
                    {tr("刪除")}
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
