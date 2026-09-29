"use client";

import { useCallback, useState } from "react";
import { COMPANION_MODELS } from "@/lib/companionModels";
import { useTr } from "@/lib/i18n/client";

/**
 * Which model answers for this character, as five tiers.
 *
 * The list is imported rather than fetched: it is a small static allowlist
 * that the server validates against anyway (PUT .../model), and fetching it
 * would put a spinner in front of a settings panel for no gain.
 *
 * The price shown is what the next message will cost. It is the deciding
 * factor between tiers — tier 5 is twelve times tier 1 — so it is on the row
 * itself, not in a tooltip.
 */
export default function CompanionModelPicker({
  characterId,
  value,
  disabled,
  onChange,
}: {
  characterId: number;
  value: string | null;
  disabled?: boolean;
  onChange: (model: string) => void;
}) {
  const tr = useTr();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  // A row the character already uses but that is no longer on the menu stays
  // working; show nothing as selected rather than silently implying tier 1.
  const current = value ?? "";

  const pick = useCallback(async (model: string) => {
    if (disabled || saving || model === current) return;
    setSaving(model);
    setError("");
    try {
      const res = await fetch(`/api/characters/${characterId}/model`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || tr("儲存失敗，請稍後再試。"));
      onChange(model);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("儲存失敗，請稍後再試。"));
    } finally {
      setSaving(null);
    }
  }, [characterId, current, disabled, saving, onChange, tr]);

  return (
    <section className="space-y-3 p-4 text-sm leading-7">
      <h3 className="text-base">{tr("對話模型")}</h3>
      <p className="text-xs leading-6 text-white/55">
        {tr("換模型會改變回覆的長度、速度與每則訊息的點數。設定立即生效，不影響已經發生的對話。")}
      </p>
      <ul className="space-y-2">
        {COMPANION_MODELS.map((model) => {
          const selected = model.id === current;
          return (
            <li key={model.id}>
              <button
                type="button"
                onClick={() => pick(model.id)}
                disabled={disabled || !!saving}
                aria-pressed={selected}
                className={`w-full rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${
                  selected ? "border-[#7ff0cd] bg-[#11251f]" : "border-white/10 hover:border-white/25"
                }`}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] text-white">
                    {tr(model.label)}
                    {model.unfiltered ? (
                      <span className="ml-2 rounded px-1.5 py-0.5 text-[11px] text-[#f0c27f] ring-1 ring-[#f0c27f]/40">
                        {tr("無過濾")}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-[#9af2da]">
                    {model.credits === 1 ? tr("1 點 / 則") : tr("{n} 點 / 則", { n: model.credits })}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-6 text-white/55">{tr(model.blurb)}</span>
                {saving === model.id ? (
                  <span className="mt-1 block text-xs text-white/40">{tr("儲存中…")}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {error ? <p role="alert" className="text-xs text-[#ff8080]">{error}</p> : null}
      <p className="text-xs leading-6 text-white/40">
        {tr("「無過濾」指模型端不做內容過濾。角色的相處深度階段、年齡設定與全年齡角色的規則不受影響。")}
      </p>
    </section>
  );
}
