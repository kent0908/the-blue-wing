"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { IconPlus, IconTrash } from "../../Icons";
import {
  BODY_STYLE_LABEL,
  POSE_NAMES,
  pathDuration,
  type BodyStyle,
  type JointName,
} from "@/lib/canvas/director3d";
import { DEFAULT_SHOT, SHOT_PRESETS } from "@/lib/canvas/cameraShots";
import type { Director3DEditor, RecordedClip, RecordedFrame } from "./useDirector3DEditor";

// R3F touches WebGL/DOM at import time in a way that doesn't survive SSR —
// load the scene client-side only.
const Director3DScene = dynamic(() => import("./Director3DScene"), { ssr: false });

const JOINT_GROUPS: { label: string; joints: JointName[] }[] = [
  { label: "軀幹", joints: ["hips", "spine", "chest", "neck", "head"] },
  { label: "左臂", joints: ["leftShoulder", "leftUpperArm", "leftForearm", "leftHand"] },
  { label: "右臂", joints: ["rightShoulder", "rightUpperArm", "rightForearm", "rightHand"] },
  { label: "左腿", joints: ["leftHip", "leftThigh", "leftShin", "leftFoot"] },
  { label: "右腿", joints: ["rightHip", "rightThigh", "rightShin", "rightFoot"] },
];

const BODY_STYLES: BodyStyle[] = ["mannequin", "stick"];

const rad2deg = (r: number) => Math.round((r * 180) / Math.PI);

function Slider({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="flex items-center justify-between text-[10.5px] text-[#8a8a8a]">
        <span>{label}</span>
        <span className="text-[#c9c9c9]">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#7ff0cd]"
      />
    </label>
  );
}

const fieldCls = "w-full rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-2 py-1 text-[11.5px] text-white focus:border-[#4a4a4a] focus:outline-none";

/**
 * The actual editor UI — character list, ground/background, 運鏡 camera
 * presets, 3D viewport, attribute/posture tabs. Shared as-is between the
 * Canvas-node modal (Director3DPanel, which wraps this in a fixed overlay
 * with its own save/close toolbar) and the standalone /canvas/director3d
 * page (which wraps it in a normal page with its own export actions) — see
 * useDirector3DEditor.ts for the state this reads/mutates.
 */
export default function Director3DStudioBody({
  editor,
  onExportFramesForVideo,
  exportingFrames,
}: {
  editor: Director3DEditor;
  /** Uploads the recorded clip itself (as a real video-type reference — Seedance 2.0/2.5 only) plus its sampled stills and a camera-move text hint, and hands off to 影片生成 — only the standalone page provides this; the Canvas-node modal has nowhere to navigate to, so it just omits the button. */
  onExportFramesForVideo?: (frames: RecordedFrame[], promptHint: string, clip: RecordedClip | null) => void;
  exportingFrames?: boolean;
}) {
  const {
    scene,
    setScene,
    selectedId,
    setSelectedId,
    selected,
    tab,
    setTab,
    canvasRef,
    captured,
    shot,
    setShot,
    updateSelected,
    updateCharacter,
    updateJoint,
    applyPreset,
    setBodyStyle,
    addCharacter,
    removeCharacter,
    addWaypoint,
    updateWaypoint,
    removeWaypoint,
    previewPath,
    applyShot,
    applyGroupShot,
    updatePose,
    recordSeconds,
    setRecordSeconds,
    recording,
    recordElapsed,
    recordedClip,
    recordedFrames,
    recordError,
    cameraMoveHint,
    startRecording,
    stopRecording,
    discardRecording,
  } = editor;

  return (
    <div className="flex min-h-0 flex-1">
      {/* left: character list + scene settings + 運鏡 */}
      <div className="flex w-[200px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-[#1c1c1c] p-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] text-[#8a8a8a]">角色</span>
            <button type="button" onClick={addCharacter} className="grid h-5 w-5 place-items-center rounded text-[#8a8a8a] hover:bg-[#1f1f1f] hover:text-white">
              <IconPlus className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-1">
            {scene.characters.map((ch) => (
              <div
                key={ch.id}
                onClick={() => setSelectedId(ch.id)}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] ${ch.id === selectedId ? "bg-[#1f1f1f] text-white" : "text-[#9a9a9a] hover:bg-[#161616]"}`}
              >
                <span className="flex-1 truncate">{ch.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCharacter(ch.id);
                  }}
                  className="text-[#6d6d6d] hover:text-[#ff8a8a]"
                >
                  <IconTrash className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-[#1e1e1e] pt-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-[#8a8a8a]">
            <span>快速運鏡</span>
            {shot && <span className="text-[#7ff0cd]">移動中…</span>}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {SHOT_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyShot(p.id)}
                className="rounded-lg bg-[#1f1f1f] px-1.5 py-1.5 text-[10.5px] text-[#c9c9c9] hover:bg-[#282828]"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={applyGroupShot}
              disabled={!scene.characters.length}
              className="rounded-lg bg-[#1f1f1f] px-1.5 py-1.5 text-[10.5px] text-[#c9c9c9] hover:bg-[#282828] disabled:opacity-40"
            >
              全員入鏡
            </button>
            <button type="button" onClick={() => setShot(DEFAULT_SHOT)} className="rounded-lg bg-[#1f1f1f] px-1.5 py-1.5 text-[10.5px] text-[#c9c9c9] hover:bg-[#282828]">
              重置視角
            </button>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-[#6d6d6d]">選好角色再點按鈕，鏡頭會自動移過去；之後仍可拖曳、滾輪微調。</p>
        </div>

        <div className="border-t border-[#1e1e1e] pt-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-[#8a8a8a]">
            <span>🎬 錄製運鏡</span>
            {recording && <span className="flex items-center gap-1 text-[#ff8a8a]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff5555]" />{recordElapsed}/{recordSeconds}s</span>}
          </div>

          {!recording && !recordedClip && (
            <>
              <Slider label="錄製時長（秒）" value={recordSeconds} min={15} max={30} onChange={setRecordSeconds} />
              <button type="button" onClick={startRecording} className="mt-1.5 w-full rounded-lg bg-[#1f1f1f] px-2 py-1.5 text-[11px] text-[#c9c9c9] hover:bg-[#282828]">
                ● 開始錄製
              </button>
              <p className="mt-1.5 text-[10px] leading-relaxed text-[#6d6d6d]">
                錄製期間可以自由拖曳、滾輪、點運鏡按鈕，畫面怎麼動就錄成怎樣——時間到會自動停止。
              </p>
            </>
          )}

          {recording && (
            <button type="button" onClick={stopRecording} className="w-full rounded-lg bg-[#2a1414] px-2 py-1.5 text-[11px] text-[#ff9b9b] hover:bg-[#331818]">
              ■ 提前停止
            </button>
          )}

          {recordError && <p className="mt-1.5 text-[10px] leading-relaxed text-[#ff9b9b]">{recordError}</p>}

          {!recording && recordedClip && (
            <div className="mt-1.5 space-y-1.5">
              <video src={recordedClip.url} controls loop className="w-full rounded-lg border border-[#2c2c2c]" />
              <div className="grid grid-cols-2 gap-1.5">
                <a
                  href={recordedClip.url}
                  download="director3d-camera-move.webm"
                  className="rounded-lg bg-[#1f1f1f] px-2 py-1.5 text-center text-[10.5px] text-[#c9c9c9] hover:bg-[#282828]"
                >
                  下載影片
                </a>
                <button type="button" onClick={discardRecording} className="rounded-lg bg-[#1f1f1f] px-2 py-1.5 text-[10.5px] text-[#c9c9c9] hover:bg-[#282828]">
                  重新錄製
                </button>
              </div>
              {onExportFramesForVideo && (
                <button
                  type="button"
                  disabled={!!exportingFrames}
                  onClick={() => onExportFramesForVideo(recordedFrames, cameraMoveHint, recordedClip)}
                  className="w-full rounded-lg bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-2 py-1.5 text-[11px] font-medium text-[#0a1a16] hover:brightness-105 disabled:opacity-50"
                >
                  {exportingFrames ? "傳送中…" : "送去影片生成（運鏡影片＋畫面＋文字）"}
                </button>
              )}
              <p className="text-[10px] leading-relaxed text-[#6d6d6d]">
                這段錄製會直接當「運鏡影片參考」送給 Seedance 2.0 / 2.5（僅這兩個版本支援，其他模型會自動忽略、退回只用畫面）；
                同時也會把錄製時抽出的 {recordedFrames.length} 張畫面當多重參考圖，加上自動判讀的運鏡文字提示
                {cameraMoveHint ? `（目前判讀：「${cameraMoveHint}」，可在輸入框自行修改）` : ""}
                一起帶到輸入框。SIRAYA 對參考影片有解析度下限，畫面太小的視窗錄出來可能會被拒絕，建議放大瀏覽器視窗再錄。
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-[#1e1e1e] pt-3">
          <div className="mb-1.5 text-[11px] text-[#8a8a8a]">地面</div>
          <label className="flex items-center justify-between text-[11px] text-[#c9c9c9]">
            顯示地面
            <input type="checkbox" checked={scene.ground.show} onChange={(e) => setScene((s) => ({ ...s, ground: { ...s.ground, show: e.target.checked } }))} />
          </label>
          <div className="mt-1.5">
            <Slider label="透明度" value={Math.round(scene.ground.opacity * 100)} min={0} max={100} onChange={(v) => setScene((s) => ({ ...s, ground: { ...s.ground, opacity: v / 100 } }))} />
          </div>
          <div className="mt-1.5">
            <Slider label="高度" value={Math.round(scene.ground.height * 100)} min={-100} max={100} onChange={(v) => setScene((s) => ({ ...s, ground: { ...s.ground, height: v / 100 } }))} />
          </div>
        </div>

        <div className="border-t border-[#1e1e1e] pt-3">
          <div className="mb-1.5 text-[11px] text-[#8a8a8a]">背景顏色</div>
          <input
            type="color"
            value={scene.background.color}
            onChange={(e) => setScene((s) => ({ ...s, background: { color: e.target.value } }))}
            className="h-8 w-full cursor-pointer rounded-lg border border-[#2c2c2c] bg-[#1c1c1c]"
          />
        </div>
      </div>

      {/* center: 3D viewport */}
      <div className="relative min-w-0 flex-1 bg-[#0a0a0a]">
        <Suspense fallback={<div className="grid h-full place-items-center text-[13px] text-[#6d6d6d]">載入 3D 場景中…</div>}>
          <Director3DScene
            scene={scene}
            selectedId={selectedId}
            shot={shot}
            onSelect={(id) => setSelectedId(id || null)}
            onReady={(el) => {
              canvasRef.current = el;
            }}
            onPose={updatePose}
            onDragCharacter={(id, position) => updateCharacter(id, { position })}
            onDragWaypoint={(characterId, index, position) => {
              if (characterId === selected?.id) updateWaypoint(index, { position });
            }}
          />
        </Suspense>
        {recording && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] text-[#ff9b9b]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff5555]" />
            錄製中 {recordElapsed}/{recordSeconds}s
          </div>
        )}
        {captured && (
          <div className="absolute bottom-3 right-3 w-[160px] overflow-hidden rounded-lg border border-[#3a3a3a] shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={captured} alt="截圖預覽" className="w-full" />
            <div className="bg-black/70 px-2 py-1 text-center text-[10px] text-[#c9c9c9]">已截圖，儲存後會用這張</div>
          </div>
        )}
      </div>

      {/* right: attribute / posture tabs */}
      <div className="flex w-[260px] shrink-0 flex-col border-l border-[#1c1c1c]">
        <div className="flex border-b border-[#1c1c1c]">
          {(["attribute", "posture", "path"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-[12px] ${tab === t ? "border-b-2 border-[#7ff0cd] text-white" : "text-[#8a8a8a] hover:text-white"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {!selected && <p className="text-[12px] text-[#6d6d6d]">選一個角色來編輯</p>}

          {selected && tab === "attribute" && (
            <div className="space-y-3">
              <label className="block">
                <div className="mb-1 text-[10.5px] text-[#8a8a8a]">名字</div>
                <input value={selected.name} maxLength={20} onChange={(e) => updateSelected({ name: e.target.value })} className={fieldCls} />
              </label>

              <div>
                <div className="mb-1 text-[10.5px] text-[#8a8a8a]">體型</div>
                <div className="grid grid-cols-1 gap-1.5">
                  {BODY_STYLES.map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setBodyStyle(style)}
                      className={`rounded-lg px-2 py-1.5 text-left text-[11px] ${(selected.bodyStyle ?? "mannequin") === style ? "bg-[#233a34] text-[#7ff0cd]" : "bg-[#1f1f1f] text-[#c9c9c9] hover:bg-[#282828]"}`}
                    >
                      {BODY_STYLE_LABEL[style]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1 text-[10.5px] text-[#8a8a8a]">location</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["x", "y", "z"] as const).map((axis, i) => (
                    <input
                      key={axis}
                      type="number"
                      step={0.1}
                      value={selected.position[i]}
                      onChange={(e) => {
                        const next = [...selected.position] as [number, number, number];
                        next[i] = Number(e.target.value);
                        updateSelected({ position: next });
                      }}
                      className={fieldCls}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1 text-[10.5px] text-[#8a8a8a]">spin</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["x", "y", "z"] as const).map((axis, i) => (
                    <input
                      key={axis}
                      type="number"
                      step={1}
                      value={rad2deg(selected.rotation[i])}
                      onChange={(e) => {
                        const next = [...selected.rotation] as [number, number, number];
                        next[i] = (Number(e.target.value) * Math.PI) / 180;
                        updateSelected({ rotation: next });
                      }}
                      className={fieldCls}
                    />
                  ))}
                </div>
              </div>

              <Slider label="overall scaling" value={selected.scale} min={0.3} max={2.5} step={0.05} onChange={(v) => updateSelected({ scale: v })} />

              <label className="block">
                <div className="mb-1 text-[10.5px] text-[#8a8a8a]">Color（僅預覽辨識，不影響最終圖像）</div>
                <input type="color" value={selected.color} onChange={(e) => updateSelected({ color: e.target.value })} className="h-8 w-full cursor-pointer rounded-lg border border-[#2c2c2c] bg-[#1c1c1c]" />
              </label>
            </div>
          )}

          {selected && tab === "posture" && (
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 text-[10.5px] text-[#8a8a8a]">POSE 預設姿勢庫</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {POSE_NAMES.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => applyPreset(name)}
                      className="rounded-lg bg-[#1f1f1f] px-2 py-1.5 text-[11px] text-[#c9c9c9] hover:bg-[#282828]"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-[#1e1e1e] pt-3">
                <div className="mb-1.5 text-[10.5px] text-[#8a8a8a]">調整參數（RIG）— 精細姿勢控制</div>
                <div className="space-y-3">
                  {JOINT_GROUPS.map((group) => (
                    <div key={group.label}>
                      <div className="mb-1 text-[10.5px] text-[#7ff0cd]">{group.label}</div>
                      <div className="space-y-2">
                        {group.joints.map((joint) => {
                          const v = selected.pose[joint] ?? { x: 0, y: 0, z: 0 };
                          return (
                            <div key={joint} className="rounded-lg bg-[#161616] p-2">
                              <div className="mb-1 text-[10px] text-[#8a8a8a]">{joint}</div>
                              <div className="space-y-1">
                                <Slider label="X" value={rad2deg(v.x)} min={-180} max={180} onChange={(d) => updateJoint(joint, "x", d)} />
                                <Slider label="Y" value={rad2deg(v.y)} min={-180} max={180} onChange={(d) => updateJoint(joint, "y", d)} />
                                <Slider label="Z" value={rad2deg(v.z)} min={-180} max={180} onChange={(d) => updateJoint(joint, "z", d)} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {selected && tab === "path" && (
            <div className="space-y-3">
              <p className="text-[10px] leading-relaxed text-[#6d6d6d]">
                直接在畫面裡<span className="text-[#c9c9c9]">按住角色拖曳</span>就能移動它（沿地面滑動，會暫時停用旋轉視角，
                放開滑鼠就恢復）；已經加的路徑點在畫面上是黃色小球，接起來的虛線就是路徑，<span className="text-[#c9c9c9]">
                黃色小球也可以直接拖曳</span>調整那個點的位置。時間和姿勢還是在下面清單裡設定——每個路徑點是「幾秒時、
                在哪個位置、擺什麼姿勢」，點與點之間位置和姿勢都會自動平滑內插（不是真的走路動畫，沒有腳步交替）。
                錄製運鏡時，只要角色有 2 個以上路徑點，就會自動照路徑播放。
              </p>

              <div className="space-y-2">
                {(selected.path ?? []).length === 0 && (
                  <p className="rounded-lg bg-[#161616] px-2 py-3 text-center text-[11px] text-[#6d6d6d]">
                    還沒有路徑點——把角色拖到起始位置，按下面的按鈕新增第一個點
                  </p>
                )}
                {(selected.path ?? []).map((wp, i) => (
                  <div key={i} className="space-y-1.5 rounded-lg bg-[#161616] p-2">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-[10px] text-[#8a8a8a]">
                        時間（秒）
                        <input
                          type="number"
                          step={0.5}
                          min={0}
                          value={wp.t}
                          onChange={(e) => updateWaypoint(i, { t: Math.max(0, Number(e.target.value)) })}
                          className="w-16 rounded-md border border-[#2c2c2c] bg-[#1c1c1c] px-1.5 py-0.5 text-[11px] text-white focus:border-[#4a4a4a] focus:outline-none"
                        />
                      </label>
                      <button type="button" onClick={() => removeWaypoint(i)} className="text-[#6d6d6d] hover:text-[#ff8a8a]">
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(["x", "y", "z"] as const).map((axis, ai) => (
                        <input
                          key={axis}
                          type="number"
                          step={0.1}
                          value={wp.position[ai]}
                          onChange={(e) => {
                            const next = [...wp.position] as [number, number, number];
                            next[ai] = Number(e.target.value);
                            updateWaypoint(i, { position: next });
                          }}
                          className={fieldCls}
                        />
                      ))}
                    </div>
                    <select
                      value={wp.poseName}
                      onChange={(e) => updateWaypoint(i, { poseName: e.target.value })}
                      className={fieldCls}
                    >
                      {POSE_NAMES.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <button type="button" onClick={addWaypoint} className="w-full rounded-lg bg-[#1f1f1f] px-2 py-1.5 text-[11px] text-[#c9c9c9] hover:bg-[#282828]">
                ＋ 用目前位置新增路徑點
              </button>

              <button
                type="button"
                onClick={previewPath}
                disabled={pathDuration(selected.path) <= 0}
                className="w-full rounded-lg bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-2 py-1.5 text-[11px] font-medium text-[#0a1a16] hover:brightness-105 disabled:opacity-40"
              >
                ▶ 預覽路徑（{pathDuration(selected.path)}s）
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
