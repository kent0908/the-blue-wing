"use client";

import { useEffect, useState } from "react";
import { uploadAsset } from "@/lib/uploadAsset";
import { IconClose } from "./Icons";
import { useTr } from "@/lib/i18n/client";

/**
 * "我的身份" — one persona shared across every 陪聊角色, not per-character.
 * Fed into buildSystemPrompt() server-side so every character addresses the
 * user consistently (matches Yollo's "set your name, gender and personality").
 */
export default function PersonaEditor({ onClose, embedded = false }: { onClose: () => void; embedded?: boolean }) {
  const tr = useTr();
  const [avatarAssetId, setAvatarAssetId] = useState<number | null>(null);
  const [assets, setAssets] = useState<{ id: number; src: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/assets").then(r => r.ok ? r.json() : Promise.reject(new Error("素材載入失敗"))).then(j => { if (alive) setAssets(j.assets ?? []); }).catch(() => alive && setError("素材載入失敗"));
    fetch("/api/persona")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setAvatarAssetId(j?.persona?.avatarAssetId ? Number(j.persona.avatarAssetId) : null);
        setName(j?.persona?.name ?? "");
        setBio(j?.persona?.bio ?? "");
      })
      .catch(() => alive && setError(tr("載入失敗")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/persona", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, bio, avatarAssetId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message || tr("儲存失敗"));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("儲存失敗"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={embedded ? "min-w-0 w-full" : "fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 px-4 py-6"}
      onClick={embedded ? undefined : onClose}
    >
      <div
        role={embedded ? "region" : "dialog"}
        aria-modal={embedded ? undefined : true}
        aria-label={tr("設定我的身份")}
        className={embedded
          ? "min-w-0 w-full overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#161616] p-4"
          : "min-w-0 w-full max-w-[420px] rounded-2xl border border-[#2a2a2a] bg-[#161616] p-5"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-medium">{tr("設定我的身份")}</h2>
          <button type="button" onClick={onClose} aria-label={tr("關閉")} className="shrink-0 text-[#8a8a8a] hover:text-white">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[#8a8a8a]">
          {tr("告訴每個角色你希望被怎麼稱呼、扮演什麼身分——所有角色共用這一份設定。")}
        </p>

        {loading ? (
          <div className="mt-4 h-[140px] animate-pulse rounded-xl bg-[#1c1c1c]" />
        ) : (
          <div className="mt-4 space-y-3">
            <div className="space-y-2">
              <label htmlFor="persona-image" className="block text-sm">我的形象照</label>
              <p className="text-xs leading-6 text-[#9aaba3]">供生活照與互動影片參照。建議使用清楚的單人形象照；未設定時只呈現角色本人。</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- authenticated personal asset */}
              {avatarAssetId && <img src={`/api/assets/${avatarAssetId}/raw`} alt="我的形象照" className="h-28 w-28 rounded-xl object-cover object-top" />}
              <select id="persona-image" value={avatarAssetId ?? ""} onChange={e => setAvatarAssetId(e.target.value ? Number(e.target.value) : null)} className="w-full rounded-lg bg-[#242424] p-2 text-sm">
                <option value="">不使用形象照</option>{assets.map(a => <option key={a.id} value={a.id}>{a.name || `圖片 ${a.id}`}</option>)}
              </select>
              <label className="block text-xs text-[#a9d8ca]">{uploading ? "上傳中…" : "上傳新的形象照"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} className="mt-2 block w-full text-xs" onChange={async e => {
                const file = e.target.files?.[0]; if (!file) return;
                setUploading(true); setError(null);
                try { const asset = await uploadAsset(file); setAssets(a => [{ id: Number(asset.id), src: asset.src, name: asset.name }, ...a]); setAvatarAssetId(Number(asset.id)); }
                catch (err) { setError(err instanceof Error ? err.message : "上傳失敗"); } finally { setUploading(false); }
              }} /></label>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] text-[#a8a8a8]">{tr("你的名字")}</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={tr("例如：小柯")}
                maxLength={40}
                className="h-9 w-full rounded-lg bg-[#1c1c1c] px-3 text-[13.5px] text-white placeholder:text-[#6d6d6d] focus:outline-none focus:ring-1 focus:ring-[#4a4a4a]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] text-[#a8a8a8]">{tr("身分 / 個性（選填）")}</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={tr("例如：25 歲的插畫師，說話直接、喜歡吐槽")}
                rows={3}
                maxLength={500}
                className="w-full resize-none rounded-lg bg-[#1c1c1c] px-3 py-2 text-[13.5px] leading-relaxed text-white placeholder:text-[#6d6d6d] focus:outline-none focus:ring-1 focus:ring-[#4a4a4a]"
              />
            </div>
          </div>
        )}

        {error && <p role="alert" className="mt-3 break-words text-[12px] text-[#ff9b9b]">{tr(error)}</p>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-full px-4 text-[13px] text-[#c9c9c9] transition-colors hover:text-white"
          >
            {tr("取消")}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || loading || uploading}
            className="h-9 rounded-full bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-4 text-[13px] font-medium text-[#0a1a16] transition-[filter] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? tr("儲存中…") : tr("儲存")}
          </button>
        </div>
      </div>
    </div>
  );
}
