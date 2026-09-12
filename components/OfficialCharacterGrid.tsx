"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface OfficialCharacter {
  key: string;
  name: string;
  roleTitle: string;
  age: number;
  contentRating: "all_ages" | "adult";
  avatarSrc: string;
  personality: string;
  greeting: string;
  idleVideoUrl: string | null;
  idleVideoStatus: "none" | "pending" | "completed" | "failed";
  adopted: { id: number; affection: number; levelName: string; updatedAt: string } | null;
}

/**
 * 官方角色 roster (GET /api/official-characters). Opening one calls
 * /adopt — which hands the user their own copy (see lib/officialCharacters.ts)
 * — then navigates to that copy's chat, so the second visit resumes where
 * they left off. Signed-out visitors can browse; adopting needs a login.
 */
export default function OfficialCharacterGrid() {
  const router = useRouter();
  const [characters, setCharacters] = useState<OfficialCharacter[] | null>(null);
  const [signedIn, setSignedIn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/official-characters", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("載入官方角色失敗"))))
      .then((j: { characters: OfficialCharacter[]; signedIn: boolean }) => {
        if (!alive) return;
        setCharacters(j.characters);
        setSignedIn(j.signedIn);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "載入失敗"));
    return () => {
      alive = false;
    };
  }, []);

  const open = async (c: OfficialCharacter) => {
    if (!signedIn) {
      router.push("/login?next=%2Fcompanions");
      return;
    }
    if (c.adopted) {
      router.push(`/companions/${c.adopted.id}`);
      return;
    }
    setOpening(c.key);
    setError(null);
    try {
      const r = await fetch(`/api/official-characters/${c.key}/adopt`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error?.message || "無法開始聊天");
      router.push(`/companions/${j.character.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "無法開始聊天");
      setOpening(null);
    }
  };

  return (
    <div>
      <p className="mb-4 text-[13px] leading-relaxed text-[#8a8a8a]">
        私立蒼翼高中 二年A班——整班被拉進荒廢的太古修真世界，只有一群高中生和他們從現代帶來的知識與特長。
        點一位同學開始聊天，好感度、記憶和對話都是你自己的進度。
      </p>
      {error && <p className="mb-3 text-[13px] text-[#ff9b9b]">{error}</p>}
      {!signedIn && (
        <p className="mb-3 rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-2 text-[12.5px] text-[#c9c9c9]">
          可以先瀏覽角色，<Link href="/login?next=%2Fcompanions" className="text-[#7ff0cd] underline">登入</Link>後才能開始聊天。
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {characters === null && Array.from({ length: 5 }).map((_, i) => <div key={i} className="aspect-[9/14] animate-pulse rounded-xl bg-[#1c1c1c]" />)}
        {characters?.map((c) => (
          <button
            key={c.key}
            type="button"
            disabled={opening !== null}
            onClick={() => void open(c)}
            className="group relative flex aspect-[9/14] flex-col overflow-hidden rounded-xl border border-[#262626] bg-[#111] text-left transition-colors hover:border-[#3a5a50] disabled:opacity-70"
          >
            <div className="relative h-[68%] w-full overflow-hidden bg-[#f4f4f4]">
              {c.idleVideoUrl && c.idleVideoStatus === "completed" && signedIn ? (
                <video src={c.idleVideoUrl} poster={c.avatarSrc} autoPlay muted loop playsInline disablePictureInPicture disableRemotePlayback className="h-full w-full object-cover object-top" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- static public asset
                <img src={c.avatarSrc} alt={c.name} className="h-full w-full object-cover object-top" />
              )}
              <span className="absolute left-2 top-2 rounded-full bg-[#1e2a3d]/90 px-2 py-0.5 text-[10px] text-[#8ab4ff]">官方</span>
              <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white" title={c.contentRating === "all_ages" ? "全年齡角色：只有友誼與夥伴互動" : "成年角色"}>
                {c.age} 歲{c.contentRating === "all_ages" ? " · 全年齡" : ""}
              </span>
            </div>
            <div className="flex flex-1 flex-col justify-center gap-0.5 px-3 py-2">
              <span className="truncate text-[13.5px] font-medium text-white">{c.name}</span>
              <span className="truncate text-[11px] text-[#7d7d7d]">{c.roleTitle}</span>
              {c.adopted ? (
                <span className="mt-0.5 inline-flex w-fit items-center rounded-full bg-[#14332d] px-2 py-0.5 text-[10px] text-[#7ff0cd]">
                  {opening === c.key ? "開啟中…" : `繼續聊天 · ${c.adopted.levelName}`}
                </span>
              ) : (
                <span className="mt-0.5 inline-flex w-fit items-center rounded-full bg-[#1c1c1c] px-2 py-0.5 text-[10px] text-[#c9c9c9]">
                  {opening === c.key ? "準備中…" : "開始聊天"}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
