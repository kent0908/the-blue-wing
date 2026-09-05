"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconChevronLeft, IconChat, IconTrash, IconClose, IconArrowRight } from "./Icons";
import PersonaEditor from "./PersonaEditor";

export interface CharacterLevel {
  name: string;
  unlock: string;
  progressPct: number;
  nextMin: number | null;
}

export interface CharacterData {
  id: number;
  name: string;
  avatarSrc: string | null;
  personality: string;
  likes?: string;
  model?: string;
  affection?: number;
  level?: CharacterLevel;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** optimistic message that hasn't round-tripped yet */
  pending?: boolean;
  failed?: boolean;
}

interface AffectionToast {
  id: number;
  gain: number;
  leveledUp: boolean;
  levelName: string;
  unlock: string;
}

export default function CharacterChat({ character: initial }: { character: CharacterData }) {
  const router = useRouter();
  const [character, setCharacter] = useState(initial);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [toast, setToast] = useState<AffectionToast | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/characters/${character.id}/messages`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((j) => setMessages(j.messages ?? []))
      .catch(() => setMessages([]));
  }, [character.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.leveledUp ? 5000 : 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const send = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setInput("");
    setError(null);
    const optimisticId = `pending-${Date.now()}`;
    setMessages((cur) => [
      ...(cur ?? []),
      { id: optimisticId, role: "user", content, createdAt: new Date().toISOString(), pending: true },
    ]);
    setSending(true);
    try {
      const res = await fetch(`/api/characters/${character.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || "傳送失敗");
      setMessages((cur) => [
        ...(cur ?? []).map((m) => (m.id === optimisticId ? { ...m, pending: false } : m)),
        j.reply,
      ]);
      if (j.affection) {
        setCharacter((cur) => ({
          ...cur,
          affection: j.affection.value,
          level: {
            name: j.affection.level,
            unlock: j.affection.unlock,
            progressPct: j.affection.progressPct,
            nextMin: j.affection.nextMin,
          },
        }));
        setToast({
          id: Date.now(),
          gain: j.affection.gain,
          leveledUp: j.affection.leveledUp,
          levelName: j.affection.level,
          unlock: j.affection.unlock,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "傳送失敗");
      setMessages((cur) => (cur ?? []).map((m) => (m.id === optimisticId ? { ...m, pending: false, failed: true } : m)));
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    if (!confirm(`刪除角色「${character.name}」？聊天紀錄也會一起消失。`)) return;
    const res = await fetch(`/api/characters/${character.id}`, { method: "DELETE" });
    if (res.ok) router.push("/companions");
    else alert("刪除失敗");
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-[#1c1c1c] px-5 py-3">
        <Link href="/companions" className="text-[#8a8a8a] transition-colors hover:text-white">
          <IconChevronLeft className="h-5 w-5" />
        </Link>
        {character.avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated proxy stream
          <img src={character.avatarSrc} alt="" className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <div className="grid h-9 w-9 place-items-center rounded-full bg-[#1c1c1c] text-[#5c5c5c]">
            <IconChat className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14.5px] font-medium">{character.name}</span>
            {character.level && (
              <span className="shrink-0 rounded-full bg-[#1c1c1c] px-2 py-0.5 text-[10.5px] text-[#7ff0cd]" title={character.level.unlock}>
                {character.level.name}
              </span>
            )}
          </div>
          {character.level && (
            <div className="mt-1 flex items-center gap-1.5">
              <div className="h-1 w-24 overflow-hidden rounded-full bg-[#232323]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5]"
                  style={{ width: `${character.level.progressPct}%` }}
                />
              </div>
              <span className="text-[10px] text-[#6d6d6d]">
                {character.level.nextMin === null ? "已達最高階段" : `好感度 ${character.affection ?? 0}`}
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setPersonaOpen(true)}
          className="whitespace-nowrap rounded-full border border-[#3a3a3a] px-3 py-1.5 text-[12px] text-[#c9c9c9] transition-colors hover:border-[#555] hover:text-white"
        >
          我的身份
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-lg p-2 text-[#8a8a8a] transition-colors hover:text-white"
          aria-label="編輯角色"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <path d="M15.5 4.5 19.5 8.5 8 20H4v-4z" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={remove}
          className="rounded-lg p-2 text-[#8a8a8a] transition-colors hover:text-[#ff9b9b]"
          aria-label="刪除角色"
        >
          <IconTrash className="h-4 w-4" />
        </button>
      </header>

      {toast && (
        <div
          className={[
            "pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-full px-4 py-2 text-[12.5px] font-medium shadow-lg transition-opacity",
            toast.leveledUp ? "bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] text-[#0a1a16]" : "bg-[#1c1c1c] text-[#7ff0cd]",
          ].join(" ")}
        >
          {toast.leveledUp ? `🎉 好感度提升：${toast.levelName}！解鎖：${toast.unlock}` : `好感度 +${toast.gain}`}
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {messages === null && <div className="mx-auto h-6 w-6 animate-pulse rounded-full bg-[#1c1c1c]" />}

          {messages?.length === 0 && (
            <p className="mt-10 text-center text-[13px] leading-relaxed text-[#6d6d6d]">
              跟「{character.name}」還沒有任何對話
              <br />
              打個招呼開始聊吧
            </p>
          )}

          {messages?.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={[
                  "max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed",
                  m.role === "user" ? "bg-[#2a2a2a] text-white" : "border border-[#262626] bg-[#141414] text-[#e5e5e5]",
                  m.pending ? "opacity-60" : "",
                  m.failed ? "border border-[#4a2020] text-[#ffb4b4]" : "",
                ].join(" ")}
              >
                {m.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-[#262626] bg-[#141414] px-4 py-2.5 text-[13px] text-[#7d7d7d]">
                {character.name} 正在輸入…
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-5 pb-5">
        <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-2xl border border-[#2a2a2a] bg-[#161616] p-2.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`傳訊息給 ${character.name}`}
            rows={1}
            className="max-h-[120px] min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] leading-relaxed text-white placeholder:text-[#6d6d6d] focus:outline-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={!input.trim() || sending}
            className={[
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all",
              input.trim() && !sending
                ? "bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] text-[#0a1a16]"
                : "cursor-not-allowed bg-[#2a2a2a] text-[#6d6d6d]",
            ].join(" ")}
            aria-label="送出"
          >
            <IconArrowRight className="h-4 w-4" />
          </button>
        </div>
        {error && (
          <p className="mx-auto mt-2 max-w-2xl text-[12px] text-[#ff9b9b]">
            {error}
            {error.includes("點數不足") && (
              <>
                {" "}
                <Link href="/account" className="text-[#7ff0cd] hover:underline">
                  查看方案
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      {editing && (
        <EditCharacterModal
          character={character}
          onClose={() => setEditing(false)}
          onSaved={(c) => {
            setCharacter((cur) => ({ ...cur, ...c }));
            setEditing(false);
          }}
        />
      )}
      {personaOpen && <PersonaEditor onClose={() => setPersonaOpen(false)} />}
    </div>
  );
}

interface AssetLite {
  id: number;
  src: string;
  name: string;
}

function EditCharacterModal({
  character,
  onClose,
  onSaved,
}: {
  character: CharacterData;
  onClose: () => void;
  onSaved: (c: CharacterData) => void;
}) {
  const [name, setName] = useState(character.name);
  const [personality, setPersonality] = useState(character.personality);
  const [likes, setLikes] = useState(character.likes ?? "");
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

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("名字不能是空的");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name: trimmed, personality, likes };
      if (avatarAssetId !== null) body.avatarAssetId = avatarAssetId;
      const res = await fetch(`/api/characters/${character.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || "儲存失敗");
      onSaved(j.character);
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存失敗");
    } finally {
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
          <h2 className="text-[15px] font-medium">編輯角色</h2>
          <button type="button" onClick={onClose} aria-label="關閉" className="text-[#8a8a8a] hover:text-white">
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-[12px] text-[#a8a8a8]">換頭像（選填，不選就維持原本的）</label>
          <div className="grid max-h-[160px] grid-cols-5 gap-1.5 overflow-y-auto">
            {assets === null && <span className="col-span-5 py-4 text-center text-[12px] text-[#6d6d6d]">載入中…</span>}
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
            maxLength={40}
            className="h-9 w-full rounded-lg bg-[#1c1c1c] px-3 text-[13.5px] text-white placeholder:text-[#6d6d6d] focus:outline-none focus:ring-1 focus:ring-[#4a4a4a]"
          />
        </div>

        <div className="mt-3">
          <label className="mb-1.5 block text-[12px] text-[#a8a8a8]">人設</label>
          <textarea
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full resize-none rounded-lg bg-[#1c1c1c] px-3 py-2 text-[13.5px] leading-relaxed text-white placeholder:text-[#6d6d6d] focus:outline-none focus:ring-1 focus:ring-[#4a4a4a]"
          />
        </div>

        <div className="mt-3">
          <label className="mb-1.5 block text-[12px] text-[#a8a8a8]">喜好（用逗號分隔）</label>
          <input
            value={likes}
            onChange={(e) => setLikes(e.target.value)}
            placeholder="例如：電影, 音樂, 貓"
            maxLength={200}
            className="h-9 w-full rounded-lg bg-[#1c1c1c] px-3 text-[13.5px] text-white placeholder:text-[#6d6d6d] focus:outline-none focus:ring-1 focus:ring-[#4a4a4a]"
          />
        </div>

        {error && <p className="mt-3 text-[12px] text-[#ff9b9b]">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-full px-4 text-[13px] text-[#c9c9c9] hover:text-white">
            取消
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-9 rounded-full bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-4 text-[13px] font-medium text-[#0a1a16] transition-[filter] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "儲存中…" : "儲存"}
          </button>
        </div>
      </div>
    </div>
  );
}
