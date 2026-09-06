"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EMPTY_PROFILE, PROFILE_FIELDS, readProfile, validateProfile, type CharacterProfile, type ProfileKey } from "@/lib/characterProfile";

interface CharacterInput {
  id: number; name: string; personality: string; likes?: string; avatarSrc: string | null; profile?: CharacterProfile;
}
interface Asset { id: number; src: string; name: string }
const STEPS = ["角色靈感", "外觀細節", "個性與關係", "故事與開場", "確認角色"];
const HOBBIES = ["電影", "音樂", "閱讀", "電玩", "攝影", "旅行", "烹飪", "繪畫", "運動", "園藝", "貓", "咖啡"];
const fieldClass = "mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-sm text-white outline-none focus:border-[#7ff0cd] focus:ring-1 focus:ring-[#7ff0cd]";

export default function CharacterBuilder({ character, onClose, onSaved }: {
  character?: CharacterInput; onClose: () => void; onSaved: (value: CharacterInput) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const saveLock = useRef(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(character?.name ?? "");
  const [personality, setPersonality] = useState(character?.personality ?? "");
  const [likes, setLikes] = useState(character?.likes ?? "");
  const [profile, setProfile] = useState<CharacterProfile>(() => character?.profile ? readProfile(character.profile) : { ...EMPTY_PROFILE, style: "動漫", species: "人類", speaking: "自然簡短", relationship: "新朋友" });
  const [assets, setAssets] = useState<Asset[]>([]);
  // undefined preserves the current avatar on PATCH; null explicitly removes it.
  const [avatar, setAvatar] = useState<number | null | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetError, setAssetError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [summaryTab, setSummaryTab] = useState<"appearance" | "story">("appearance");

  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/assets", { signal: controller.signal })
      .then(async r => {
        if (!r.ok) throw new Error(r.status === 401 ? "請先登入後再建立角色" : "素材載入失敗，請關閉後重試");
        return r.json();
      })
      .then(j => setAssets((j.assets ?? []).map((a: Asset) => ({ ...a, id: Number(a.id) }))))
      .catch(e => { if (e.name !== "AbortError") setAssetError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setAssetsLoading(false); });
    return () => controller.abort();
  }, []);

  const set = (key: ProfileKey, value: string) => setProfile(p => ({ ...p, [key]: value }));
  const selectedSrc = avatar === undefined ? character?.avatarSrc : assets.find(a => a.id === avatar)?.src;
  const fields = (keys: ProfileKey[]) => keys.map(key => {
    const spec = PROFILE_FIELDS[key];
    return <div key={key} className="min-w-0">
      <label htmlFor={`character-${key}`} className="text-sm text-white/70">{spec.label}</label>
      {"options" in spec && <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`${spec.label}預設`}>
        {spec.options.map(option => <button key={option} type="button" aria-pressed={profile[key] === option} onClick={() => set(key, option)} className={`rounded-full border px-3 py-2 text-xs transition-colors ${profile[key] === option ? "border-[#7ff0cd] bg-[#7ff0cd]/10 text-[#7ff0cd]" : "border-white/15 text-white/60 hover:border-white/40"}`}>{option}</button>)}
      </div>}
      {spec.max >= 300 ? <textarea id={`character-${key}`} className={fieldClass} rows={3} maxLength={spec.max} value={profile[key]} onChange={e => set(key, e.target.value)} placeholder={`自訂${spec.label}（選填）`} />
        : <input id={`character-${key}`} className={fieldClass} maxLength={spec.max} value={profile[key]} onChange={e => set(key, e.target.value)} placeholder={`自訂${spec.label}（選填）`} />}
    </div>;
  });
  function go(next: number) {
    if (next > step && (!name.trim() || !Number.isInteger(profile.age) || profile.age < 18 || profile.age > 120)) {
      setError("請填寫角色名字，以及 18 至 120 歲的整數年齡"); setStep(0); return;
    }
    setError(""); setStep(next);
  }
  async function save() {
    if (saveLock.current) return;
    setError("");
    try {
      if (!name.trim()) throw new Error("請填寫角色名字");
      const valid = validateProfile(profile);
      saveLock.current = true; setSaving(true);
      const res = await fetch(character ? `/api/characters/${character.id}` : "/api/characters", {
        method: character ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), personality, likes, profile: valid, ...(avatar !== undefined ? { avatarAssetId: avatar } : {}) }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error?.message ?? "儲存失敗，請稍後再試");
      onSaved(result.character);
    } catch (e) { setError(e instanceof Error ? e.message : "儲存失敗"); }
    finally { saveLock.current = false; setSaving(false); }
  }
  const appearance: ProfileKey[] = ["gender", "style", "species", "skin", "hair", "eyes", "build", "outfit"];
  const story: ProfileKey[] = ["temperament", "speaking", "occupation", "relationship", "greeting", "scenario", "background", "boundaries", "tags"];

  return <dialog ref={dialog} aria-labelledby="character-builder-title" onCancel={e => { e.preventDefault(); if (!saving) onClose(); }} className="fixed inset-0 m-auto max-h-[94dvh] w-[min(1100px,96vw)] max-w-none overflow-hidden rounded-3xl border border-white/15 bg-[#101313] p-0 text-white shadow-2xl backdrop:bg-black/80">
    <div className="flex max-h-[94dvh] flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4 sm:px-8">
        <div><p className="text-[10px] tracking-[.25em] text-[#7ff0cd]">THE BLUE WING · CHARACTER</p><h2 id="character-builder-title" className="mt-1 text-lg">{character ? "編輯你的角色" : "讓角色，從想像走進對話"}</h2></div>
        <button type="button" disabled={saving} aria-label="關閉角色設定" onClick={onClose} className="rounded-full px-3 py-2 text-white/60 hover:bg-white/10">✕</button>
      </header>
      <nav aria-label="建立角色步驟" className="flex shrink-0 gap-2 overflow-x-auto border-b border-white/10 px-5 py-4 sm:px-8">
        {STEPS.map((label, i) => <button type="button" key={label} disabled={saving} aria-current={step === i ? "step" : undefined} onClick={() => go(i)} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs ${step === i ? "bg-[#7ff0cd] text-black" : "bg-white/5 text-white/55"}`}>{i + 1} · {label}</button>)}
      </nav>
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        <div className="grid gap-7 p-5 sm:p-8 lg:grid-cols-[240px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-0 overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(ellipse_at_top,#24473d,#101313_75%)]">
              {selectedSrc ?
                // eslint-disable-next-line @next/next/no-img-element -- private authenticated asset
                <img src={selectedSrc} alt={`${name || "角色"}的頭像`} className="aspect-[4/5] w-full object-cover" /> : <div className="grid aspect-[4/5] place-content-center text-center"><span className="text-7xl font-extralight text-[#7ff0cd]/70">✧</span><p className="mt-5 text-xs text-white/40">你的故事，由此開始</p></div>}
              <div className="p-5"><h3 className="break-words text-xl">{name || "未命名角色"}</h3><p className="mt-2 text-xs leading-6 text-white/50">{[profile.style, profile.temperament, profile.relationship].filter(Boolean).join(" · ")}</p></div>
            </div>
          </aside>
          <section className="min-w-0 space-y-6">
            <div><p className="text-xs text-[#7ff0cd]">0{step + 1} / 05</p><h3 ref={heading} tabIndex={-1} className="mt-2 text-2xl outline-none">{STEPS[step]}</h3><p className="mt-2 text-sm text-white/45">{["先給角色一個名字與風格。其餘設定可隨時回來修改。", "用文字定義外觀，將用於角色場景生成；不會自動更換頭像。", "讓每段回覆，都有自己的個性。", "設定故事的起點，也保留你喜歡的互動界線。", "檢查完成後儲存。建立角色不會自動呼叫付費生成。 "][step]}</p></div>
            <fieldset disabled={saving} className="space-y-6">
              {step === 0 && <>
                <label className="block text-sm text-white/70">角色名字 *<input autoComplete="off" className={fieldClass} maxLength={40} value={name} onChange={e => setName(e.target.value)} placeholder="例如：沐夏" /></label>
                <label className="block text-sm text-white/70">成年角色年齡 *<input type="number" min={18} max={120} step={1} className={fieldClass} value={Number.isNaN(profile.age) ? "" : profile.age} onChange={e => setProfile(p => ({ ...p, age: e.target.valueAsNumber }))} /></label>
                {fields(["gender", "style", "species"])}
              </>}
              {step === 1 && <>
                <div className="grid gap-5 sm:grid-cols-2">{fields(["skin", "hair", "eyes", "build"])}</div>{fields(["outfit"])}
                <div><label htmlFor="avatar-search" className="text-sm text-white/70">頭像 · 從素材庫選擇（選填）</label><input id="avatar-search" className={fieldClass} value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋素材名稱" />
                  {assetsLoading && <p className="mt-3 text-sm text-white/50">素材載入中…</p>}
                  {assetError && <p role="alert" className="mt-3 text-sm text-red-300">{assetError}</p>}
                  <div className="mt-3 grid max-h-60 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">{assets.filter(a => a.name.toLowerCase().includes(search.toLowerCase())).map(a => <button type="button" key={a.id} title={a.name} aria-label={`選擇頭像 ${a.name}`} aria-pressed={avatar === a.id || (avatar === undefined && character?.avatarSrc === a.src)} onClick={() => setAvatar(a.id)} className={`overflow-hidden rounded-xl border-2 ${avatar === a.id || (avatar === undefined && character?.avatarSrc === a.src) ? "border-[#7ff0cd]" : "border-transparent"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- private authenticated asset */}
                    <img src={a.src} alt={a.name} className="aspect-square w-full object-cover" /><span className="block truncate p-1 text-[10px]">{a.name}</span>
                  </button>)}</div>
                  {!assetsLoading && !assetError && !assets.length && <p className="mt-3 text-sm text-white/50">還沒有素材，可先建立角色，稍後上傳圖片再編輯頭像。</p>}
                  <button type="button" onClick={() => setAvatar(null)} className="mt-3 text-xs text-[#7ff0cd]">移除頭像</button><Link href="/assets" target="_blank" rel="noopener noreferrer" className="ml-4 text-xs text-white/60 underline">另開素材庫</Link>
                </div>
              </>}
              {step === 2 && <>
                {fields(["temperament", "speaking", "occupation", "relationship"])}
                <p className="text-xs text-white/40">說話方式調整文字回覆語氣，不是語音播放。</p>
                <label className="block text-sm text-white/70">補充人設<textarea className={fieldClass} rows={3} maxLength={2000} value={personality} onChange={e => setPersonality(e.target.value)} placeholder="習慣、價值觀、特殊經歷…" /></label>
                <div><label htmlFor="character-likes" className="text-sm text-white/70">興趣與喜好</label><div className="mt-2 flex flex-wrap gap-2">{HOBBIES.map(hobby => {
                  const selected = likes.split(/[,，、]+/).map(s => s.trim()).filter(Boolean);
                  return <button type="button" key={hobby} aria-pressed={selected.includes(hobby)} className={`rounded-full border px-3 py-2 text-xs ${selected.includes(hobby) ? "border-[#7ff0cd] text-[#7ff0cd]" : "border-white/15 text-white/50"}`} onClick={() => setLikes((selected.includes(hobby) ? selected.filter(s => s !== hobby) : [...selected, hobby]).join("、").slice(0, 200))}>{hobby}</button>;
                })}</div><input id="character-likes" className={fieldClass} maxLength={200} value={likes} onChange={e => setLikes(e.target.value)} placeholder="自訂興趣，以頓號分隔" /></div>
              </>}
              {step === 3 && fields(["greeting", "scenario", "background", "boundaries", "tags"])}
              {step === 4 && <>
                <div className="rounded-2xl border border-white/10 bg-white/[.03] p-5"><p className="text-xl">{name} <span className="text-sm text-white/40">{profile.age} 歲</span></p><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white/60">{profile.greeting || "尚未設定開場白，聊天時可直接打招呼。"}</p></div>
                <div className="flex gap-2" role="group" aria-label="設定總覽分類">{(["appearance", "story"] as const).map(tab => <button type="button" key={tab} aria-pressed={summaryTab === tab} onClick={() => setSummaryTab(tab)} className={`rounded-full px-5 py-2 text-sm ${summaryTab === tab ? "bg-[#7ff0cd]/15 text-[#7ff0cd]" : "bg-white/5 text-white/50"}`}>{tab === "appearance" ? "外觀" : "個性與故事"}</button>)}</div>
                <dl className="grid gap-3 sm:grid-cols-2">{(summaryTab === "appearance" ? appearance : story).map(key => <div key={key} className="rounded-xl border border-white/10 p-4"><dt className="text-xs text-white/40">{PROFILE_FIELDS[key].label}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm">{profile[key] || "未設定"}</dd></div>)}</dl>
                {summaryTab === "story" && <div className="space-y-3 text-sm text-white/60"><p className="whitespace-pre-wrap break-words">補充人設：{personality || "未設定"}</p><p className="break-words">喜好：{likes || "未設定"}</p></div>}
              </>}
            </fieldset>
          </section>
        </div>
      </div>
      <footer className="shrink-0 border-t border-white/10 bg-[#101313] px-5 py-4 sm:px-8">
        {error && <p role="alert" className="mb-3 text-sm text-red-300">{error}</p>}
        <div className="flex items-center justify-between gap-3"><button type="button" disabled={saving || step === 0} onClick={() => go(step - 1)} className="rounded-full border border-white/15 px-5 py-3 text-sm disabled:opacity-30">上一步</button>
          <button type="button" disabled={saving} onClick={() => step === 4 ? void save() : go(step + 1)} className="rounded-full bg-[#7ff0cd] px-6 py-3 text-sm font-medium text-[#0d201b] disabled:opacity-50">{saving ? "儲存中…" : step === 4 ? character ? "儲存設定" : "建立並開始聊天" : "下一步 →"}</button></div>
      </footer>
    </div>
  </dialog>;
}
