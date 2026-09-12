"use client";
import Link from "next/link";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconPlus, IconChat } from "./Icons";
import PersonaEditor from "./PersonaEditor";

interface Character {
  id: number;
  name: string;
  avatarSrc: string | null;
  personality: string;
  updatedAt: string;
  level: { name: string; progressPct: number };
  /** copies of 官方角色 live on the official shelf, not here */
  officialKey?: string | null;
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
  const [needsLogin, setNeedsLogin] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);

  const load = () =>
    fetch("/api/characters")
      .then(async (r) => {
        if(r.status===401){setNeedsLogin(true);throw new Error("請先登入以查看角色");}
        if(!r.ok)throw new Error("載入角色失敗，請稍後重試");
        return r.json();
      })
      .then((j) => setCharacters((j.characters ?? []).filter((c: Character) => !c.officialKey)))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  if(needsLogin) return <div className="rounded-xl border border-[#303030] p-6"><p>登入後即可建立與管理你的專屬角色。</p><Link href="/login?next=%2Fcompanions" className="mt-4 inline-block rounded-full bg-[#7ff0cd] px-5 py-2 text-black">登入帳號</Link></div>;
  if(error && characters===null) return <p role="alert" className="py-6 text-red-300">{error}</p>;
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
          onClick={() => router.push("/companions/create")}
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
            onClick={() => router.push(`/companions/${c.id}`)}
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
              <span className="mt-0.5 inline-flex w-fit items-center rounded-full bg-[#1c1c1c] px-2 py-0.5 text-[10px] text-[#7ff0cd]">
                {c.level.name}
              </span>
            </div>
          </button>
        ))}
      </div>

      {characters?.length === 0 && (
        <p className="mt-10 text-center text-[13px] text-[#6d6d6d]">還沒有任何角色 — 點左上角「新增角色」開始</p>
      )}

      {personaOpen && <PersonaEditor onClose={() => setPersonaOpen(false)} />}
    </div>
  );
}
