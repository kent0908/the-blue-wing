"use client";

import Popover from "./Popover";
import { IconSettings } from "./Icons";
import type { Mode } from "@/lib/types";

/**
 * The "進階" (advanced) button. Only exposes settings that are real, verified
 * SIRAYA/BytePlus parameters — no placeholder controls for things like
 * "guidance scale" or "inference steps", which aren't documented as tunable
 * for these managed models (Seedream/Seedance don't expose raw diffusion
 * knobs). Camera control and composition are real capabilities, but they're
 * driven by natural-language prompt direction on these models, not a
 * separate API field — so those show up here as a prompt cheat-sheet
 * instead of fake sliders.
 *
 * `watermark` is real for Seedream (image) and Seedance (video) — verified
 * empirically, including for video (confirmed by generating the same clip
 * both ways and comparing frames: the "AI generated" badge only appears
 * when watermark is true). It's gated to those families specifically —
 * GPT Image 2 was found to actively REJECT the field ("Unknown parameter:
 * 'watermark'"), since it proxies straight to OpenAI's own API. The switch
 * only renders when `watermarkSupported` says the current model accepts it.
 */
function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-3 py-1"
    >
      <span className="text-left text-[12.5px] text-[#c9c9c9]">{label}</span>
      <span
        className={[
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          on ? "bg-[#4a4a4a]" : "bg-[#2fae8c]",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
            on ? "translate-x-[18px]" : "translate-x-0.5",
          ].join(" ")}
        />
      </span>
    </button>
  );
}

export default function AdvancedParams({
  mode,
  moderation,
  onModerationChange,
  watermark,
  onWatermarkChange,
  watermarkSupported,
}: {
  mode: Mode;
  moderation: string;
  onModerationChange: (v: string) => void;
  /** true = keep the provider's "AI generated" watermark; false = strip it. */
  watermark: boolean;
  onWatermarkChange: (v: boolean) => void;
  /** false when the current model doesn't accept the field at all (see lib/imageModels.ts). */
  watermarkSupported: boolean;
}) {
  const active = (mode === "image" && moderation === "low") || (watermarkSupported && watermark);

  return (
    <Popover
      widthClass="w-[320px]"
      trigger={() => (
        <>
          <IconSettings className="h-[15px] w-[15px]" />
          {active && <span className="h-1.5 w-1.5 rounded-full bg-[#7ff0cd]" />}
        </>
      )}
    >
      {() => (
        <div className="max-h-[70vh] overflow-y-auto p-3">
          <div className="pb-3 text-[13px] font-medium text-white">進階設定</div>

          {(mode === "image" || mode === "video") && (
            <div className="border-t border-[#262626] pt-3">
              {watermarkSupported ? (
                <>
                  <Switch label="保留浮水印（AI generated 標記）" on={watermark} onChange={onWatermarkChange} />
                  <p className="mt-1 text-[10.5px] leading-relaxed text-[#6d6d6d]">
                    預設關閉，生成結果不帶浮水印；打開後畫面右下角會出現「AI generated」標記。
                  </p>
                </>
              ) : (
                <p className="text-[11.5px] leading-relaxed text-[#6d6d6d]">這個模型沒有浮水印開關（由服務商決定）</p>
              )}
            </div>
          )}

          {mode === "image" && (
            <div className="border-t border-[#262626] pt-3 mt-3">
              <div className="pb-2 text-[12.5px] text-[#a8a8a8]">內容審核強度</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: "auto", label: "自動（預設）" },
                  { v: "low", label: "寬鬆" },
                ].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => onModerationChange(o.v)}
                    className={[
                      "flex h-9 items-center justify-center rounded-lg text-[13px] transition-colors",
                      moderation === o.v
                        ? "bg-[#2b2b2b] text-white ring-1 ring-[#4a4a4a]"
                        : "bg-[#232323] text-[#c9c9c9] hover:bg-[#2b2b2b]",
                    ].join(" ")}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "video" && (
            <div className="space-y-4 border-t border-[#262626] pt-3 mt-3">
              <div>
                <div className="pb-1.5 text-[12.5px] text-[#a8a8a8]">Prompt 小技巧（Seedance 官方寫法）</div>
                <ul className="space-y-1 text-[11.5px] leading-relaxed text-[#8a8a8a]">
                  <li>
                    <span className="text-[#c9c9c9]">鏡頭：</span>
                    景別（wide / medium / close-up）、角度（eye-level / low angle / overhead）、
                    運鏡（dolly-in / pan / tilt / tracking / orbit）直接寫進 prompt 就會生效
                  </li>
                  <li>
                    <span className="text-[#c9c9c9]">配樂：</span>
                    <code className="text-[#9a9a9a]">(輕柔鋼琴聲)</code>
                  </li>
                  <li>
                    <span className="text-[#c9c9c9]">音效：</span>
                    <code className="text-[#9a9a9a]">&lt;火車鳴笛聲&gt;</code>
                  </li>
                  <li>
                    <span className="text-[#c9c9c9]">對白：</span>
                    <code className="text-[#9a9a9a]">{"{我從沒想過會回到這裡}"}</code>
                  </li>
                  <li>
                    <span className="text-[#c9c9c9]">章節/字幕：</span>
                    <code className="text-[#9a9a9a]">【第一章：啟程】</code>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {mode !== "image" && mode !== "video" && (
            <p className="border-t border-[#262626] pt-3 text-[12px] text-[#6d6d6d]">這個模式目前沒有進階設定</p>
          )}
        </div>
      )}
    </Popover>
  );
}
