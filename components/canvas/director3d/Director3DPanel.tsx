"use client";

import { IconClose } from "../../Icons";
import type { Director3DSceneData } from "@/lib/canvas/director3d";
import Director3DStudioBody from "./Director3DStudioBody";
import { useDirector3DEditor } from "./useDirector3DEditor";

/**
 * 3D導演台 editor — opened from a "director3d" Canvas node (see
 * lib/canvas/types.ts). Poses a character (mannequin or the simplified
 * "圓形加直立式" stick figure — see lib/canvas/director3d.ts), aims the
 * camera (free-orbit, plus one-click 運鏡 presets — see cameraShots.ts),
 * and captures a screenshot that becomes the node's own image output on
 * save. The actual editor UI lives in Director3DStudioBody, shared with the
 * standalone /canvas/director3d page — this file is just the modal chrome
 * (toolbar + save/close) around it.
 *
 * Deliberately NOT in v1 (see the ask that prompted this — full parity with
 * the reference product's multi-camera / panorama-background / keyframe-
 * timeline-video-export is a much bigger follow-up, not something to
 * half-build alongside everything else here):
 *   - multiple simultaneously-active cameras (運鏡 presets move the one
 *     camera one shot at a time, they don't add new camera objects)
 *   - 360° panorama background upload (solid color only)
 *   - timeline keyframes + recorded video export (single still capture only)
 */
export default function Director3DPanel({
  initial,
  onSave,
  onClose,
}: {
  initial: Director3DSceneData;
  onSave: (data: Director3DSceneData) => void;
  onClose: () => void;
}) {
  const editor = useDirector3DEditor(initial);

  const save = () => {
    onSave({ ...editor.scene, capturedImage: editor.captured });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      {/* toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#1c1c1c] px-4">
        <span className="text-[13px] font-medium text-white">3D 導演台</span>
        <span className="text-[11px] text-[#6d6d6d]">拖曳空白處旋轉視角、滾輪縮放；拖曳角色可移動；「路徑」分頁可點擊放置路線、「鏡頭」分頁設定運鏡</span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={editor.takeScreenshot} className="h-8 rounded-full bg-[#1f1f1f] px-3.5 text-[12.5px] text-white hover:bg-[#282828]">
            📷 截圖
          </button>
          <button
            type="button"
            onClick={save}
            className="h-8 rounded-full bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-4 text-[12.5px] font-medium text-[#0a1a16] hover:brightness-105"
          >
            儲存並關閉
          </button>
          <button type="button" onClick={onClose} aria-label="關閉（不儲存）" className="grid h-8 w-8 place-items-center rounded-full text-[#8a8a8a] hover:bg-[#1f1f1f] hover:text-white">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Director3DStudioBody editor={editor} />
    </div>
  );
}
