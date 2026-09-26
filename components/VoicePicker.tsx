"use client";

import { useEffect, useState } from "react";
import { useTr } from "@/lib/i18n/client";
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
}: {
  characterId: number;
  value: string | null;
  onChange: (voiceName: string | null) => void;
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

  const save = async (voiceName: string | null) => {
    setSaving(true);
    setError(null);
    const previous = value;
    onChange(voiceName);
    try {
      const res = await fetch(`/api/characters/${characterId}/voice`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceName }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message || tr("儲存失敗"));
      }
    } catch (e) {
      onChange(previous ?? null);
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
      <p className="text-xs leading-6 text-[#9aaba3]">{tr("選好之後，這個角色的每則回覆都能點播放聽他說話。朗讀依文字長度計點，同一則重聽不再扣點。")}</p>
      <label className="block">
        <span className="sr-only">{tr("選擇聲音")}</span>
        <select
          aria-label={tr("選擇聲音")}
          disabled={saving}
          value={value ?? ""}
          onChange={(e) => void save(e.target.value || null)}
          className="w-full rounded-lg bg-[#242424] p-2 text-sm disabled:opacity-60"
        >
          <option value="">{tr("預設聲音")}（{catalogue.defaultVoice}）</option>
          {catalogue.voices.map((v) => (
            <option key={v.id} value={v.id}>{v.id} · {tr(v.tone)}</option>
          ))}
        </select>
      </label>
      {error && <p role="alert" className="text-xs text-[#ff9b9b]">{error}</p>}
    </section>
  );
}
