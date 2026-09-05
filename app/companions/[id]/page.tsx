"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import CharacterChat, { type CharacterData } from "@/components/CharacterChat";

export default function CharacterChatPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [character, setCharacter] = useState<CharacterData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/characters/${params.id}`)
      .then((r) => {
        if (r.status === 401) {
          router.push(`/login?next=/companions/${params.id}`);
          return null;
        }
        return r.ok ? r.json() : Promise.reject(new Error("找不到這個角色"));
      })
      .then((j: { character: CharacterData } | null) => {
        if (!alive || !j) return;
        setCharacter(j.character);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "載入失敗"));
    return () => {
      alive = false;
    };
  }, [params.id, router]);

  if (error) {
    return (
      <div className="grid h-full place-items-center">
        <div className="max-w-sm rounded-xl border border-[#4a2020] bg-[#1a1010] px-5 py-4 text-center text-[13.5px] text-[#ffb4b4]">
          {error}
        </div>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="grid h-full place-items-center">
        <div className="bw-shimmer h-8 w-8 rounded-full" />
      </div>
    );
  }

  return <CharacterChat character={character} />;
}
