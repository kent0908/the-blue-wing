"use client";

import { useEffect, useRef, useState } from "react";
import { OFFICIAL_STORIES, type ReplySuggestion } from "@/lib/officialCompanionStory";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconChevronLeft, IconChat, IconTrash, IconArrowRight } from "./Icons";
import PersonaEditor from "./PersonaEditor";
import CharacterBuilder from "./CharacterBuilder";
import type { CharacterProfile } from "@/lib/characterProfile";
import CharacterScenes from "./CharacterScenes";
import CompanionIdleStage from "./CompanionIdleStage";
import CompanionWardrobe from "./CompanionWardrobe";
import RelationshipStages from "./RelationshipStages";
import styles from "./CharacterChat.module.css";
import { useTr } from "@/lib/i18n/client";

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
  profile?: CharacterProfile;
  likes?: string;
  model?: string;
  affection?: number;
  level?: CharacterLevel;
  contentRating?: "all_ages" | "adult";
  officialKey?: string | null;
  /** what this character can do — see lib/characters.ts contentRules */
  rules?: { ladder: "romance" | "trust"; scenes: boolean; wardrobe: boolean; idleRegen: boolean; editable: boolean };
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
  const tr = useTr();
  const router = useRouter();
  const [character, setCharacter] = useState(initial);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [suggestions, setSuggestions] = useState<ReplySuggestion[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [relationshipOpen, setRelationshipOpen] = useState(true);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [scenesOpen, setScenesOpen] = useState(false);
  const [toast, setToast] = useState<AffectionToast | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rules = character.rules ?? { ladder: "romance" as const, scenes: true, wardrobe: true, idleRegen: true, editable: true };
  const isOfficial = !!character.officialKey;
  // all_ages characters measure 信賴度, not 好感度 — same counter, different meaning
  const meter = rules.ladder === "trust" ? tr("信賴度") : tr("好感度");

  useEffect(() => {
    fetch(`/api/characters/${character.id}/messages`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((j) => { setMessages(j.messages ?? []); setSuggestions(j.suggestions ?? []); })
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
      if (!res.ok) throw new Error(j?.error?.message || tr("傳送失敗"));
      setMessages((cur) => [
        ...(cur ?? []).map((m) => (m.id === optimisticId ? { ...m, pending: false } : m)),
        j.reply,
      ]);
      setSuggestions(j.suggestions ?? []);
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
        if (j.affection.gain > 0) setToast({
          id: Date.now(),
          gain: j.affection.gain,
          leveledUp: j.affection.leveledUp,
          levelName: j.affection.level,
          unlock: j.affection.unlock,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("傳送失敗"));
      setMessages((cur) => (cur ?? []).map((m) => (m.id === optimisticId ? { ...m, pending: false, failed: true } : m)));
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    if (!confirm(tr("刪除角色「{name}」？聊天紀錄也會一起消失。", { name: character.name }))) return;
    const res = await fetch(`/api/characters/${character.id}`, { method: "DELETE" });
    if (res.ok) router.push("/companions");
    else alert(tr("刪除失敗"));
  };

  return (
    <div className="flex h-full min-h-0 justify-center bg-[#090c0b] sm:p-4 lg:p-6">
      <div className="relative flex h-full max-h-[960px] w-full max-w-[1720px] min-h-0 min-w-0 flex-col overflow-hidden border border-white/10 bg-[#101313] sm:rounded-2xl">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-[#141918] px-3 py-3 sm:gap-3 sm:px-5">
          <Link href="/companions" aria-label={tr("返回角色列表")} className="shrink-0 text-[#8a8a8a] transition-colors hover:text-white">
            <IconChevronLeft className="h-5 w-5" />
          </Link>
          {character.avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated proxy stream
            <img src={character.avatarSrc} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover object-top" />
          ) : (
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#1c1c1c] text-[#5c5c5c]">
              <IconChat className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0 flex-1 basis-[calc(100%-100px)] sm:basis-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[14.5px] font-medium">{tr(character.name)}</span>
              {isOfficial && <span className="shrink-0 rounded-full bg-[#1e2a3d] px-2 py-0.5 text-[10.5px] text-[#8ab4ff]">{tr("官方")}</span>}
              {character.contentRating === "all_ages" && <span className="shrink-0 rounded-full bg-[#1c1c1c] px-2 py-0.5 text-[10.5px] text-[#c9c9c9]" title={tr("全年齡角色：只有友誼與夥伴互動")}>{tr("全年齡")}</span>}
              {character.level && (
                <span className="shrink-0 rounded-full bg-[#1c1c1c] px-2 py-0.5 text-[10.5px] text-[#7ff0cd]" title={character.level.unlock}>
                  {tr(character.level.name)}
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
                  {character.level.nextMin === null ? tr("已達最高階段") : `${meter} ${character.affection ?? 0}`}
                </span>
              </div>
            )}
          </div>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
          {rules.editable && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg p-2 text-[#8a8a8a] transition-colors hover:text-white"
            aria-label={tr("編輯角色")}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <path d="M15.5 4.5 19.5 8.5 8 20H4v-4z" strokeLinejoin="round" />
            </svg>
          </button>
          )}
          <button
            type="button"
            onClick={remove}
            className="rounded-lg p-2 text-[#8a8a8a] transition-colors hover:text-[#ff9b9b]"
            aria-label={tr("刪除角色")}
          >
            <IconTrash className="h-4 w-4" />
          </button>
          </div>
        </header>
        <nav className={styles.mobileTabs} aria-label={tr("陪聊設定")}>
          <button type="button" onClick={() => { setScenesOpen(true); setPersonaOpen(false); setRelationshipOpen(true); setWardrobeOpen(false); }}>{rules.ladder === "trust" ? tr("信賴階段") : tr("關係階段")}</button>
          {rules.scenes && <button type="button" onClick={() => { setScenesOpen(true); setPersonaOpen(false); setRelationshipOpen(false); setWardrobeOpen(false); }}>{tr("解鎖場景")}</button>}
          <button type="button" onClick={() => { setScenesOpen(true); setPersonaOpen(true); setRelationshipOpen(false); setWardrobeOpen(false); }}>{tr("我的身分")}</button>
          {rules.wardrobe && <button type="button" onClick={() => { setScenesOpen(true); setPersonaOpen(false); setRelationshipOpen(false); setWardrobeOpen(true); }}>{tr("換裝衣櫃")}</button>}
        </nav>

      {toast && (
        <div
          className={[
            "pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-full px-4 py-2 text-[12.5px] font-medium shadow-lg transition-opacity",
            toast.leveledUp ? "bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] text-[#0a1a16]" : "bg-[#1c1c1c] text-[#7ff0cd]",
          ].join(" ")}
        >
          {toast.leveledUp ? tr("🎉 {meter}提升：{level}！{unlock}", { meter, level: tr(toast.levelName), unlock: toast.unlock }) : `${meter} +${toast.gain}`}
        </div>
      )}

      <div className={styles.layout}>
        <aside className={styles.portrait} aria-label={tr("人物立繪")}><CompanionIdleStage key={`${character.id}:${character.avatarSrc ?? ""}`} characterId={character.id} wardrobeOpen={wardrobeOpen} /></aside>
        <section className={styles.conversation} aria-label={tr("聊天紀錄與訊息")}>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end gap-4">
          {messages === null && <div className="mx-auto h-6 w-6 animate-pulse rounded-full bg-[#1c1c1c]" />}

          {messages?.length === 0 && (
            <p className="mt-10 text-center text-[13px] leading-relaxed text-[#6d6d6d]">
              {character.profile?.greeting || tr("跟「{name}」還沒有任何對話", { name: character.name })}
              <br />
              {tr("打個招呼開始聊吧")}
            </p>
          )}

          {messages?.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={[
                  "max-w-[88%] whitespace-pre-wrap [overflow-wrap:anywhere] sm:max-w-[80%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed",
                  m.role === "user" ? "bg-[#2a2a2a] text-white" : "border border-[#262626] bg-[#141414] text-[#e5e5e5]",
                  m.pending ? "opacity-60" : "",
                  m.failed ? "border border-[#4a2020] text-[#ffb4b4]" : "",
                ].join(" ")}
              >
                {m.content}
                {m.failed && <span className="mt-2 block text-xs text-[#ffb4b4]">{tr("未送達 · 請查看下方提示")}</span>}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-[#262626] bg-[#141414] px-4 py-2.5 text-[13px] text-[#7d7d7d]">
                {tr(character.name)} {tr("正在輸入…")}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#141918] px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-6 sm:pb-5">
        {isOfficial && messages !== null && suggestions.length > 0 && <div className="mx-auto mb-3 max-w-3xl">
          <p className="mb-2 text-xs leading-relaxed text-[#a2bcb2]">接下來想怎麼回應？點選帶入後，可修改再送出。</p>
          <div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-3">
            {suggestions.map((s) => <button key={s.direction} type="button" disabled={sending} onClick={() => setInput(s.text)} className="rounded-xl border border-white/10 bg-white/[0.025] p-3 text-left text-sm leading-relaxed text-[#d5ded9] transition hover:border-[#7ff0cd]/40 disabled:opacity-40">
              <span className="mb-1 block text-xs text-[#87b4a5]">{s.direction}</span>{s.text}
            </button>)}
          </div>
        </div>}
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-[#2a2a2a] bg-[#161616] p-2.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            aria-label={tr("傳訊息給 {name}", { name: character.name })}
            placeholder={tr("傳訊息給 {name}", { name: character.name })}
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
            aria-label={tr("送出")}
          >
            <IconArrowRight className="h-4 w-4" />
          </button>
        </div>
        {error && (
          <p role="alert" className="mx-auto mt-2 max-w-3xl rounded-xl border border-red-300/20 bg-red-300/5 px-3 py-2 text-[13px] text-[#ffb4b4]">
            {tr(error)}
            {error.includes(tr("點數不足")) && (
              <>
                {" "}
                <Link href="/account" className="text-[#7ff0cd] hover:underline">
                  {tr("查看方案")}
                </Link>
              </>
            )}
          </p>
        )}
      </div>

        </section>
        <aside className={styles.details + " " + ((scenesOpen || personaOpen) ? styles.detailsOpen : "")} aria-label={tr("場景與身分設定")}>
          <div className={styles.tabs}>
            <button type="button" aria-pressed={relationshipOpen} onClick={() => { setRelationshipOpen(true); setPersonaOpen(false); setWardrobeOpen(false); }}>{rules.ladder === "trust" ? tr("信賴階段") : tr("關係階段")}</button>
            {rules.scenes && <button type="button" aria-pressed={!personaOpen && !relationshipOpen && !wardrobeOpen} onClick={() => { setRelationshipOpen(false); setPersonaOpen(false); setWardrobeOpen(false); }}>{tr("解鎖場景")}</button>}
            <button type="button" aria-pressed={personaOpen} onClick={() => { setPersonaOpen(true); setRelationshipOpen(false); setWardrobeOpen(false); }}>{tr("我的身分")}</button>
            {rules.wardrobe && <button type="button" aria-pressed={wardrobeOpen} onClick={() => { setPersonaOpen(false); setRelationshipOpen(false); setWardrobeOpen(true); }}>{tr("換裝衣櫃")}</button>}
          </div>
          {rules.editable ? (
            <button type="button" className="shrink-0 border-b border-white/10 px-4 py-2 text-left text-xs text-[#a2bcb2]" onClick={() => setEditing(true)}>{tr("編輯角色設定")}</button>
          ) : (
            <p className="shrink-0 border-b border-white/10 px-4 py-2 text-xs text-[#6d6d6d]">{tr("官方角色的設定由官方維護")}{character.contentRating === "all_ages" ? tr("・全年齡：只有友誼與夥伴互動") : ""}</p>
          )}
          {relationshipOpen && <div className="min-h-0 flex-1 overflow-y-auto">{isOfficial && <div className="space-y-3 border-b border-white/10 p-4 text-sm leading-7 text-[#baccc3]">
            <h3 className="text-base text-white">{OFFICIAL_STORIES[character.officialKey ?? ""]?.title}</h3>
            <p>{OFFICIAL_STORIES[character.officialKey ?? ""]?.goal}</p>
            <details><summary className="cursor-pointer text-[#87b4a5]">可探索的故事方向</summary><ol className="mt-2 list-decimal space-y-2 pl-5">{OFFICIAL_STORIES[character.officialKey ?? ""]?.events.map((event) => <li key={event}>{event}</li>)}</ol></details>
            <p className="text-xs leading-6 text-[#8c9e95]">這是你與角色的私人篇章。方向列表不代表事件已完成。舊有關係數值保留；目前不再依訊息數或喜好關鍵字加分，事件進度尚未自動計分。</p>
          </div>}<div className="flex justify-end px-3 pt-2 lg:hidden"><button type="button" onClick={() => setScenesOpen(false)} aria-label={tr("關閉設定")}>{tr("關閉")}</button></div><RelationshipStages affection={character.affection ?? 0} kind={rules.ladder} /></div>}
          {personaOpen && <PersonaEditor embedded onClose={() => { setPersonaOpen(false); setScenesOpen(false); }} />}
          <div className={styles.scenePanel} hidden={personaOpen || relationshipOpen || wardrobeOpen || !rules.scenes}>{rules.scenes && <CharacterScenes characterId={character.id} refreshKey={character.affection} onClose={() => setScenesOpen(false)} />}</div>
          {wardrobeOpen && rules.wardrobe && <div className="flex min-h-0 flex-1 flex-col"><div className="flex justify-end px-3 pt-2 lg:hidden"><button type="button" onClick={() => { setScenesOpen(false); setWardrobeOpen(false); setRelationshipOpen(true); }} aria-label={tr("關閉衣櫃")}>{tr("關閉")}</button></div><div className="flex min-h-0 flex-1 overflow-y-auto [&>div]:w-full"><CompanionWardrobe key={`${character.id}:${character.affection ?? 0}`} characterId={character.id} /></div></div>}
        </aside>
      </div>
      {editing && (
        <CharacterBuilder
          character={character}
          onClose={() => setEditing(false)}
          onSaved={(c) => {
            setCharacter((cur) => ({ ...cur, ...c }));
            setEditing(false);
          }}
        />
      )}
      </div>
    </div>
  );
}
