"use client";

import { useRouter } from "next/navigation";
import CharacterBuilder from "@/components/CharacterBuilder";

/** The form can be previewed publicly; saving and all private assets require login. */
export default function CreateCompanionPage() {
  const router = useRouter();
  return <CharacterBuilder onClose={() => router.push("/companions")} onSaved={c => router.push(`/companions/${c.id}`)} />;
}
