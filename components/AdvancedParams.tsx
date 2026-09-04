"use client";

import Popover from "./Popover";
import { IconSettings, IconCheck } from "./Icons";
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
 */
export default function AdvancedParams({
  mode,
  moderation,
  onModerationChange,
  cameraFixed,
  onCameraFixedChange,
  cameraFixedAvailable,
}: {
  mode: Mode;
  moderation: string;
  onModerationChange: (v: string) => void;
  cameraFixed: boolean;
  onCameraFixedChange: (v: boolean) => void;
  /** camera_fixed only validates in image-to-video — needs a 素材 attached */
  cameraFixedAvailable: boolean;
}) {
  const active = (mode === "video" && cameraFixed) || (mode === "image" && moderation === "low");

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

          {mode === "image" && (
            <div className="border-t border-[#262626] pt-3">
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
            <div className="space-y-4 border-t border-[#262626] pt-3">
              <div>
                <button
                  type="button"
                  disabled={!cameraFixedAvailable}
                  onClick={() => onCameraFixedChange(!cameraFixed)}
                  className={[
                    "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-[13px] transition-colors",
                    cameraFixedAvailable ? "bg-[#232323] hover:bg-[#2b2b2b]" : "cursor-not-allowed bg-[#1c1c1c] text-[#6d6d6d]",
                  ].join(" ")}
                >
                  <span>固定鏡頭（不移動、不縮放）</span>
                  <span
                    className={[
                      "grid h-4 w-4 shrink-0 place-items-center rounded border",
                      cameraFixed && cameraFixedAvailable ? "border-[#7ff0cd] bg-[#7ff0cd] text-[#0a1a16]" : "border-[#4a4a4a]",
                    ].join(" ")}
                  >
                    {cameraFixed && cameraFixedAvailable && <IconCheck className="h-3 w-3" />}
                  </span>
                </button>
                {!cameraFixedAvailable && (
                  <p className="mt-1.5 text-[11px] text-[#6d6d6d]">
                    這個參數只在有加參考素材（打 @ 或按素材）時才能用（實測驗證）
                  </p>
                )}
              </div>

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
