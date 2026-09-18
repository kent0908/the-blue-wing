"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import CharacterScenes from "@/components/CharacterScenes";
export default function MemoriesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const characterId = Number(id);
  if (!Number.isSafeInteger(characterId) || characterId <= 0) return <p>找不到角色</p>;
  return <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-8">
    <Link href={`/companions/${id}`} className="text-sm text-[#a9d8ca]">← 回到對話</Link>
    <header className="space-y-3"><h1 className="text-3xl tracking-widest">一起留下的片刻</h1><p className="max-w-xl text-sm leading-7 text-white/55">一張生活照，一段相處的影像。保留你與角色的每次創作，隨時回來翻看。</p></header>
    <CharacterScenes characterId={characterId} onClose={() => router.push(`/companions/${id}`)} />
  </main>;
}
