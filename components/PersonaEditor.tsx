"use client";

import { useEffect, useState } from "react";
import { IconClose } from "./Icons";

/**
 * "我的身份" — one persona shared across every 陪聊角色, not per-character.
 * Fed into buildSystemPrompt() server-side so every character addresses the
 * user consistently (matches Yollo's "set your name, gender and personality").
 */
export default function PersonaEditor({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/persona")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setName(j?.persona?.name ?? "");
        setBio(j?.persona?.bio ?? "");
      })
      .catch(() => alive && setError("載入失敗"))
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
        body: JSON.stringify({ name, bio }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message || "儲存失敗");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="w-full max-w-[420px] rounded-2xl border border-[#2a2a2a] bg-[#161616] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-medium">設定我的身份</h2>
          <button type="button" onClick={onClose} aria-label="關閉" className="text-[#8a8a8a] hover:text-white">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[#8a8a8a]">
          告訴每個角色你希望被怎麼稱呼、扮演什麼身分——所有角色共用這一份設定。
        </p>

        {loading ? (
          <div className="mt-4 h-[140px] animate-pulse rounded-xl bg-[#1c1c1c]" />
        ) : (
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1.5 block text-[12px] text-[#a8a8a8]">你的名字</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：小柯"
                maxLength={40}
                className="h-9 w-full rounded-lg bg-[#1c1c1c] px-3 text-[13.5px] text-white placeholder:text-[#6d6d6d] focus:outline-none focus:ring-1 focus:ring-[#4a4a4a]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] text-[#a8a8a8]">身分 / 個性（選填）</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="例如：25 歲的插畫師，說話直接、喜歡吐槽"
                rows={3}
                maxLength={500}
                className="w-full resize-none rounded-lg bg-[#1c1c1c] px-3 py-2 text-[13.5px] leading-relaxed text-white placeholder:text-[#6d6d6d] focus:outline-none focus:ring-1 focus:ring-[#4a4a4a]"
              />
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-[12px] text-[#ff9b9b]">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-full px-4 text-[13px] text-[#c9c9c9] transition-colors hover:text-white"
          >
            取消
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || loading}
            className="h-9 rounded-full bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-4 text-[13px] font-medium text-[#0a1a16] transition-[filter] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "儲存中…" : "儲存"}
          </button>
        </div>
      </div>
    </div>
  );
}
