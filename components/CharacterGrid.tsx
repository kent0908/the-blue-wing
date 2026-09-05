"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconPlus, IconClose, IconChat } from "./Icons";
import PersonaEditor from "./PersonaEditor";

interface Character {
  id: number;
  name: string;
  avatarSrc: string | null;
  personality: string;
  updatedAt: string;
}

interface AssetLite {
  id: number;
  src: string;
  name: string;
}

/**
 * 陪聊角色 — 把資產庫裡的一張圖綁成一個有名字、有人設的角色，點進去長期聊天
 * （像 yollo.ai 的 persona 陪聊）。模型固定用 lib/characters.ts 的
 * DEFAULT_CHARACTER_MODEL（deepseek-v4-flash-0731），這裡不開放切換。
 */
export default function CharacterGrid() {
  const router = useRouter();
  const [characters, setCharacters] = useState<Character[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);

  const load = () =>
    fetch("/api/characters")
      .then((r) => r.json())
      .then((j) => setCharacters(j.characters ?? []))
      .catch(() => setError("載入失敗，請重新整理"));

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-[13px] leading-relaxed text-[#8a8a8a]">
          把資產庫裡生成好的圖片或數位人綁成一個角色，設定人設之後就能長期跟它聊天。
        </p>
        <button
          type="button"
          onClick={() => setPersonaOpen(true)}
          className="shrink-0 whitespace-nowrap rounded-full border border-[#3a3a3a] px-3.5 py-1.5 text-[12.5px] text-[#c9c9c9] transition-colors hover:border-[#555] hover:text-white"
        >
          設定我的身份
        </button>
      </div>

      {error && <p className="mb-3 text-[13px] text-[#ff9b9b]">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#3a3a3a] bg-[#141414] text-[#9a9a9a] transition-colors hover:border-[#555] hover:text-white"
        >
          <IconPlus className="h-5 w-5" />
          <span className="text-[13px]">新增角色</span>
        </button>

        {characters === null &&
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="aspect-square animate-pulse rounded-xl bg-[#1c1c1c]" />)}

        {characters?.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => router.push(`/assets/characters/${c.id}`)}
            className="group relative flex aspect-square flex-col overflow-hidden rounded-xl border border-[#262626] bg-[#111] text-left"
          >
            {c.avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- authenticated proxy stream
              <img src={c.avatarSrc} alt="" className="h-2/3 w-full object-cover" />
            ) : (
              <div className="grid h-2/3 w-full place-items-center bg-[#1c1c1c] text-[#5c5c5c]">
                <IconChat className="h-6 w-6" />
              </div>
            )}
            <div className="flex flex-1 flex-col justify-center gap-0.5 px-3">
              <span className="truncate text-[13.5px] font-medium text-white">{c.name}</span>
              <span className="truncate text-[11px] text-[#7d7d7d]">
                {c.personality || "還沒設定人設"}
              </span>
            </div>
          </button>
        ))}
      </div>

      {characters?.length === 0 && (
        <p className="mt-10 text-center text-[13px] text-[#6d6d6d]">還沒有任何角色 — 點左上角「新增角色」開始</p>
      )}

      {creating && (
        <CreateCharacterModal
          onClose={() => setCreating(false)}
          onCreated={(id) => router.push(`/assets/characters/${id}`)}
        />
      )}
      {personaOpen && <PersonaEditor onClose={() => setPersonaOpen(false)} />}
    </div>
  );
}

function CreateCharacterModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [name, setName] = useState("");
  const [personality, setPersonality] = useState("");
  const [assets, setAssets] = useState<AssetLite[] | null>(null);
  const [avatarAssetId, setAvatarAssetId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/assets")
      .then((r) => r.json())
      .then((j) => setAssets(j.assets ?? []))
      .catch(() => setAssets([]));
  }, []);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("請幫角色取個名字");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, personality, avatarAssetId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || "建立失敗");
      onCreated(j.character.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "建立失敗");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="w-full max-w-[440px] rounded-2xl border border-[#2a2a2a] bg-[#161616] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-medium">新增角色</h2>
          <button type="button" onClick={onClose} aria-label="關閉" className="text-[#8a8a8a] hover:text-white">
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-[12px] text-[#a8a8a8]">從資產庫選一張圖當頭像（選填）</label>
          <div className="grid max-h-[160px] grid-cols-5 gap-1.5 overflow-y-auto">
            {assets === null && <span className="col-span-5 py-4 text-center text-[12px] text-[#6d6d6d]">載入中…</span>}
            {assets?.length === 0 && (
              <span className="col-span-5 py-4 text-center text-[12px] text-[#6d6d6d]">資產庫還沒有圖片</span>
            )}
            {assets?.map((a) => (
              <button
                key={a.id}
                type="button"
                title={a.name}
                onClick={() => setAvatarAssetId((cur) => (cur === a.id ? null : a.id))}
                className={`relative aspect-square overflow-hidden rounded-md border ${
                  avatarAssetId === a.id ? "border-[#7ff0cd]" : "border-[#2a2a2a] hover:border-[#4a4a4a]"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated proxy stream */}
                <img src={a.src} alt={a.name} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-[12px] text-[#a8a8a8]">角色名字</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：小艾"
            maxLength={40}
            className="h-9 w-full rounded-lg bg-[#1c1c1c] px-3 text-[13.5px] text-white placeholder:text-[#6d6d6d] focus:outline-none focus:ring-1 focus:ring-[#4a4a4a]"
          />
        </div>

        <div className="mt-3">
          <label className="mb-1.5 block text-[12px] text-[#a8a8a8]">人設（選填）</label>
          <textarea
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
            placeholder="例如：溫柔體貼的大學生，喜歡聊電影和音樂，講話會帶一點撒嬌"
            rows={3}
            maxLength={2000}
            className="w-full resize-none rounded-lg bg-[#1c1c1c] px-3 py-2 text-[13.5px] leading-relaxed text-white placeholder:text-[#6d6d6d] focus:outline-none focus:ring-1 focus:ring-[#4a4a4a]"
          />
        </div>

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
            onClick={submit}
            disabled={saving}
            className="h-9 rounded-full bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-4 text-[13px] font-medium text-[#0a1a16] transition-[filter] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "建立中…" : "建立並開始聊天"}
          </button>
        </div>
      </div>
    </div>
  );
}
