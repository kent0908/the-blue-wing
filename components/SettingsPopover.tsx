"use client";

import Popover from "./Popover";
import { IconRatio, IconReset } from "./Icons";
import {
  ASPECT_RATIOS,
  RESOLUTIONS,
  IMAGE_SIZES,
  DEFAULT_SETTINGS,
  type GenSettings,
  type Mode,
} from "@/lib/types";

function Choice({
  value,
  active,
  onClick,
  icon,
}: {
  value: string;
  active: boolean;
  onClick: () => void;
  icon?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex h-9 items-center justify-center gap-1.5 rounded-lg text-[13px] transition-colors",
        active
          ? "bg-[#2b2b2b] text-white ring-1 ring-[#4a4a4a]"
          : "bg-[#232323] text-[#c9c9c9] hover:bg-[#2b2b2b]",
      ].join(" ")}
    >
      {icon && <IconRatio className="h-[15px] w-[15px]" />}
      {value === "auto" ? "自動匹配" : value}
    </button>
  );
}

export default function SettingsPopover({
  mode,
  settings,
  onChange,
}: {
  mode: Mode;
  settings: GenSettings;
  onChange: (s: GenSettings) => void;
}) {
  const set = (patch: Partial<GenSettings>) => onChange({ ...settings, ...patch });

  const summary =
    mode === "video"
      ? [settings.aspectRatio === "auto" ? "自動匹配" : settings.aspectRatio, settings.resolution, `${settings.seconds}s`]
      : mode === "image"
        ? [settings.aspectRatio === "auto" ? "自動匹配" : settings.aspectRatio, settings.size, `×${settings.imageCount}`]
        : [`最多 ${settings.maxTokens} tokens`];

  return (
    <Popover
      widthClass="w-[348px]"
      trigger={() => (
        <span className="flex items-center gap-2">
          <IconRatio className="h-[15px] w-[15px]" />
          {summary.map((t, i) => (
            <span key={t + i} className="flex items-center gap-2">
              {i > 0 && <span className="h-3 w-px bg-[#3a3a3a]" />}
              <span>{t}</span>
            </span>
          ))}
        </span>
      )}
    >
      {() => (
        <div className="p-3">
          <div className="flex items-center justify-between pb-3">
            <span className="text-[13.5px] font-medium">
              {mode === "video" ? "影片設定" : mode === "image" ? "圖片設定" : "生成設定"}
            </span>
            <button
              type="button"
              onClick={() => onChange({ ...DEFAULT_SETTINGS })}
              className="flex items-center gap-1 text-[12px] text-[#8a8a8a] transition-colors hover:text-white"
            >
              <IconReset className="h-[13px] w-[13px]" />
              重設
            </button>
          </div>

          <div className="border-t border-[#262626] pt-3">
            {(mode === "video" || mode === "image") && (
              <>
                <div className="pb-2 text-[12.5px] text-[#a8a8a8]">畫面比例</div>
                <div className="grid grid-cols-3 gap-2">
                  {ASPECT_RATIOS.map((r) => (
                    <Choice
                      key={r}
                      value={r}
                      icon={r === "auto"}
                      active={settings.aspectRatio === r}
                      onClick={() => set({ aspectRatio: r })}
                    />
                  ))}
                </div>
              </>
            )}

            {mode === "video" && (
              <>
                <div className="pb-2 pt-4 text-[12.5px] text-[#a8a8a8]">解析度</div>
                <div className="grid grid-cols-3 gap-2">
                  {RESOLUTIONS.map((r) => (
                    <Choice key={r} value={r} active={settings.resolution === r} onClick={() => set({ resolution: r })} />
                  ))}
                </div>

                <div className="pb-2 pt-4 text-[12.5px] text-[#a8a8a8]">時長</div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={2}
                    max={30}
                    step={1}
                    value={settings.seconds}
                    onChange={(e) => set({ seconds: Number(e.target.value) })}
                    className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-[#333] accent-white"
                  />
                  <div className="grid h-9 w-14 place-items-center rounded-lg bg-[#232323] text-[13px]">
                    {settings.seconds}
                  </div>
                </div>
              </>
            )}

            {mode === "image" && (
              <>
                <div className="pb-2 pt-4 text-[12.5px] text-[#a8a8a8]">尺寸</div>
                <div className="grid grid-cols-2 gap-2">
                  {IMAGE_SIZES.map((s) => (
                    <Choice key={s} value={s} active={settings.size === s} onClick={() => set({ size: s })} />
                  ))}
                </div>

                <div className="pb-2 pt-4 text-[12.5px] text-[#a8a8a8]">生成張數</div>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((n) => (
                    <Choice
                      key={n}
                      value={String(n)}
                      active={settings.imageCount === n}
                      onClick={() => set({ imageCount: n })}
                    />
                  ))}
                </div>
              </>
            )}

            {mode === "text" && (
              <>
                <div className="pb-2 text-[12.5px] text-[#a8a8a8]">回覆長度上限（tokens）</div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={256}
                    max={8192}
                    step={256}
                    value={settings.maxTokens}
                    onChange={(e) => set({ maxTokens: Number(e.target.value) })}
                    className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-[#333] accent-white"
                  />
                  <div className="grid h-9 w-16 place-items-center rounded-lg bg-[#232323] text-[13px]">
                    {settings.maxTokens}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}
