import { IconImage, IconMic, IconLock, IconRatio, IconSparkle } from "@/components/Icons";

/**
 * 數位人 (Avatar) — interface shell only, no generation backend yet.
 *
 * SIRAYA has no avatar/lip-sync/TTS endpoint at all (checked the live
 * /v1/models list and every doc category — nothing). Composer.tsx already
 * flags this in its mode menu ("數位人（即將推出）"); this page makes that
 * same honesty visible on its own route instead of leaving /avatar empty.
 * Every control here is deliberately inert (disabled attributes, no file
 * pickers wired up, no submit handler) so nothing looks clickable that would
 * actually error — see the same reasoning in the 智慧畫布 v1 commit.
 *
 * Layout/tokens are lifted from Composer.tsx's own reference-image tile and
 * submit-pill patterns so this reads as part of the app, not a bolted-on
 * mockup. Swap this for the real thing once there's a model to call.
 */

function UploadTile({
  icon: Icon,
  label,
  hint,
}: {
  icon: (p: { className?: string }) => React.ReactElement;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] text-[#8a8a8a]">{label}</span>
      <div className="grid h-[74px] w-[74px] shrink-0 place-items-center gap-1 rounded-xl border border-dashed border-[#3a3a3a] bg-[#1f1f1f] text-[#9a9a9a]">
        <Icon className="h-[18px] w-[18px]" />
        <span className="text-[11px]">{hint}</span>
      </div>
    </div>
  );
}

export default function AvatarPage() {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-8 overflow-y-auto px-8 py-12">
      <div className="max-w-lg text-center">
        <h1 className="text-[34px] font-normal text-[#f2f2f2]">用 OmniHuman 點亮你的數位分身</h1>
        <p className="mt-3 text-[14px] text-[#6d6d6d]">
          上傳一張人像和一段語音，生成會說話、有表情動作的數位分身影片
        </p>
        <div className="mt-5 rounded-xl border border-[#3a2e18] bg-[#1a150c] px-4 py-3 text-[12.5px] leading-relaxed text-[#f0c27f]">
          此頁面為介面預覽 — OmniHuman 1.5 目前尚未串接生成後端，暫時無法實際生成。
        </div>
      </div>

      <div className="w-full max-w-[880px] rounded-2xl border border-[#2a2a2a] bg-[#161616]">
        <div className="flex gap-4 px-4 pt-4">
          <UploadTile icon={IconImage} label="人像" hint="上傳圖片" />
          <UploadTile icon={IconMic} label="語音" hint="上傳語音" />

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex h-[30px] items-center rounded-full bg-[#232323] px-3 text-[12.5px] text-white">
                上傳語音檔
              </span>
              <span className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-dashed border-[#333] px-3 text-[12.5px] text-[#5c5c5c]">
                文字轉語音
                <span className="bw-badge" style={{ color: "#5c5c5c", borderColor: "#3a3a3a" }}>
                  即將推出
                </span>
              </span>
            </div>
            <textarea
              disabled
              rows={3}
              placeholder="（選填）動作與運鏡描述，例如：微笑點頭、鏡頭緩慢推近"
              className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-[#c9c9c9] placeholder:text-[#6d6d6d] focus:outline-none disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-3">
          <span className="bw-chip cursor-not-allowed text-[#8a8a8a]">
            <IconLock className="h-[13px] w-[13px]" />
            OmniHuman 1.5
          </span>
          <span className="bw-chip">
            <IconRatio className="h-[15px] w-[15px]" />
            自動匹配 · 720p
          </span>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-[11.5px] text-[#5c5c5c]">尚未開放計費預估</span>
            <button
              type="button"
              disabled
              className="flex h-9 cursor-not-allowed items-center gap-1.5 rounded-full bg-[#2a2a2a] px-4 text-[13.5px] font-medium text-[#6d6d6d]"
            >
              <IconSparkle className="h-4 w-4" />
              即將推出
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
