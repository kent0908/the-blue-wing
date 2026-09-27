"use client";

import { useEffect, useState } from "react";
import { useTr } from "@/lib/i18n/client";
import { COMPANION_LANGUAGES, OFFICIAL_VOICES, isCompanionLanguage, type CompanionLanguage } from "@/lib/companionVoices";
import type { Voice } from "@/lib/voices";

/**
 * Per-character voice. Official characters are editable here even though
 * PATCH /api/characters/<id> refuses them: the voice lives on this user's
 * own copy of the character and changes nothing anyone else sees (see the
 * voice route's own note).
 */
export default function VoicePicker({
  characterId,
  value,
  onChange,
  officialKey,
  language,
  disabled,
}: {
  characterId: number;
  value: string | null;
  officialKey?: string | null;
  language: CompanionLanguage;
  disabled?: boolean;
  onChange: (voiceName: string | null, language: CompanionLanguage) => void;
}) {
  const tr = useTr();
  const [catalogue, setCatalogue] = useState<{ enabled: boolean; defaultVoice: string; voices: Voice[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/speech/voices")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((j) => { if (alive) setCatalogue(j); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!catalogue) return null;

  const casting = officialKey ? OFFICIAL_VOICES[officialKey] : undefined;
  const save = async (voiceName: string | null, nextLanguage = language) => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/characters/${characterId}/voice`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceName, language: nextLanguage }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message || tr("儲存失敗"));
      }
      onChange(voiceName, nextLanguage);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("儲存失敗"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-2 p-4 text-sm">
      <h3 className="text-base">{tr("聲音")}</h3>
      {!catalogue.enabled && (
        <p className="text-xs leading-6 text-[#c7a46a]">{tr("語音朗讀還沒開放，設定會先保留，開放後立即生效。")}</p>
      )}
      {casting && <p className="text-xs leading-6 text-[#b9d9ce]">{tr(casting.description)}</p>}
      <label className="block space-y-2">
        <span className="text-xs text-[#9aaba3]">{tr("對話與朗讀語言")}</span>
        <select aria-label={tr("對話與朗讀語言")} disabled={saving || disabled} value={language}
          onChange={e => { if (isCompanionLanguage(e.target.value)) void save(value, e.target.value); }}
          className="w-full rounded-lg bg-[#242424] p-2 text-sm disabled:opacity-60">
          {COMPANION_LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}{l.id === "ja-JP" && casting ? " · 預設" : ""}</option>)}
        </select>
      </label>
      <p className="text-xs leading-6 text-[#9aaba3]">{tr("儲存後從下一則回覆使用所選語言。新生成的朗讀使用所選聲線；歷史文字及已保存的音訊保留原樣，重聽不再扣點。")}</p>
      <label className="block">
        <span className="sr-only">{tr("選擇聲音")}</span>
        <select
          aria-label={tr("選擇聲音")}
          disabled={saving || disabled}
          value={value ?? ""}
          onChange={(e) => void save(e.target.value || null)}
          className="w-full rounded-lg bg-[#242424] p-2 text-sm disabled:opacity-60"
        >
          <option value="">{tr("預設聲音")}（{casting?.voice ?? catalogue.defaultVoice}）</option>
          {catalogue.voices.map((v) => (
            <option key={v.id} value={v.id}>{v.id} · {tr(v.tone)}</option>
          ))}
        </select>
      </label>
      {casting && <div className="rounded-lg border border-white/10 p-3 text-xs leading-6">
        <p className="text-[#9aaba3]">{tr("角色試音台詞")}</p>
        <p lang={language} className="mt-1 text-[#d4e1dc]">{casting.samples[language]}</p>
        <p className="mt-2 text-[#9aaba3]">{tr("聲線已配置，實際效果待語音服務啟用後試聽。")}</p>
      </div>}
      <p role="status" className="text-xs text-[#9aaba3]">{saving ? tr("儲存中…") : ""}</p>
      {error && <p role="alert" className="text-xs text-[#ff9b9b]">{error}</p>}
    </section>
  );
}
