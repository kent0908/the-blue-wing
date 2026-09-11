"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { IconPlus, IconTrash } from "../../Icons";
import {
  BODY_STYLE_LABEL,
  POSE_NAMES,
  pathDuration,
  type BodyStyle,
  type JointName,
} from "@/lib/canvas/director3d";
import { CAMERA_MOVE_TEMPLATES, DEFAULT_SHOT, SHOT_PRESETS } from "@/lib/canvas/cameraShots";
import type { Director3DEditor, EditorTab, RecordedClip, RecordedFrame } from "./useDirector3DEditor";

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

const TAB_LABEL: Record<EditorTab, string> = { attribute: "屬性", posture: "姿勢", path: "路徑", camera: "鏡頭" };
const TABS: EditorTab[] = ["attribute", "posture", "path", "camera"];

const fmtSec = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

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
    selectedWaypoint,
    setSelectedWaypoint,
    placeMode,
    setPlaceMode,
    placeOptions,
    setPlaceOptions,
    placeWaypointAt,
    undoLastWaypoint,
    clearPath,
    cameraTrack,
    addCameraKeyframe,
    updateCameraKeyframe,
    recaptureCameraKeyframe,
    removeCameraKeyframe,
    clearCameraTrack,
    setCameraFollow,
    gotoCameraKeyframe,
    applyCameraTemplate,
    playing,
    playhead,
    playheadRef,
    timelineDuration,
    previewPath,
    previewTimeline,
    seek,
    stopPlayback,
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

  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewClip = () => {
    const v = previewVideoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.play();
  };

  // Real gap found on re-audit (2026-09-08): neither the 快速運鏡 (camera
  // shot) nor the POSE 預設姿勢庫 (pose) preset buttons showed which one was
  // last applied — clicking one gave no lasting visual confirmation at all.
  // Purely a "last clicked" UI hint (not derived from scene data), so it can
  // go stale once someone hand-tweaks a joint slider afterward — acceptable,
  // same trade every preset-button UI like this makes.
  const [lastShotId, setLastShotId] = useState<string | null>(null);
  const [lastPoseByChar, setLastPoseByChar] = useState<Record<string, string>>({});
  const activePoseName = selected ? lastPoseByChar[selected.id] : undefined;

  // 點擊放置 mode only makes sense with a character selected and the 路徑
  // tab open — leaving either drops out of it, and Esc is the quick exit.
  const placing = placeMode && !!selected && tab === "path";
  useEffect(() => {
    if (!placeMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlaceMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // setPlaceMode is a plain closure from the hook — identity changes every render, but the handler only needs the latest via the effect re-running on placeMode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeMode]);

  const followTemplateActive = (id: string) =>
    !!cameraTrack.follow && cameraTrack.follow.mode === (id === "follow-aim" ? "aim" : "chase") && cameraTrack.follow.characterId === (selected ?? scene.characters[0])?.id;

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
                onClick={() => {
                  applyShot(p.id);
                  setLastShotId(p.id);
                }}
                className={`rounded-lg px-1.5 py-1.5 text-[10.5px] ${
                  lastShotId === p.id ? "bg-[#233a34] text-[#7ff0cd] ring-1 ring-[#3a5a50]" : "bg-[#1f1f1f] text-[#c9c9c9] hover:bg-[#282828]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => {
                applyGroupShot();
                setLastShotId(null);
              }}
              disabled={!scene.characters.length}
              className="rounded-lg bg-[#1f1f1f] px-1.5 py-1.5 text-[10.5px] text-[#c9c9c9] hover:bg-[#282828] disabled:opacity-40"
            >
              全員入鏡
            </button>
            <button
              type="button"
              onClick={() => {
                setShot(DEFAULT_SHOT);
                setLastShotId(null);
              }}
              className="rounded-lg bg-[#1f1f1f] px-1.5 py-1.5 text-[10.5px] text-[#c9c9c9] hover:bg-[#282828]"
            >
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
              <Slider label="錄製時長（秒）" value={recordSeconds} min={1} max={30} onChange={setRecordSeconds} />
              <button type="button" onClick={startRecording} className="mt-1.5 w-full rounded-lg bg-[#1f1f1f] px-2 py-1.5 text-[11px] text-[#c9c9c9] hover:bg-[#282828]">
                ● 開始錄製
              </button>
              <p className="mt-1.5 text-[10px] leading-relaxed text-[#6d6d6d]">
                {cameraTrack.keyframes.length || cameraTrack.follow
                  ? "已設定鏡頭軌道：錄製時鏡頭會自動照「鏡頭」分頁的軌道跑，角色也會照路徑走。"
                  : "錄製期間可以自由拖曳、滾輪、點運鏡按鈕，畫面怎麼動就錄成怎樣——時間到會自動停止。想要精準的運鏡，到右邊「鏡頭」分頁設定軌道。"}
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
              <video
                ref={previewVideoRef}
                src={recordedClip.url}
                controls
                loop
                disablePictureInPicture
                disableRemotePlayback
                className="w-full rounded-lg border border-[#2c2c2c]"
              />
              <div className="grid grid-cols-3 gap-1.5">
                <button type="button" onClick={previewClip} className="rounded-lg bg-[#1f1f1f] px-2 py-1.5 text-[10.5px] text-[#c9c9c9] hover:bg-[#282828]">
                  ▶ 預覽
                </button>
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
                一起帶到輸入框。生成服務對參考影片有解析度下限，畫面太小的視窗錄出來可能會被拒絕，建議放大瀏覽器視窗再錄。
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
            playing={playing}
            playheadRef={playheadRef}
            placeMode={placing}
            placeSnap={placeOptions.snap}
            selectedWaypoint={selectedWaypoint}
            showCameraTrack={tab === "camera" || playing}
            hideGuides={recording}
            onSelect={(id) => setSelectedId(id || null)}
            onReady={(el) => {
              canvasRef.current = el;
            }}
            onPose={updatePose}
            onDragCharacter={(id, position) => updateCharacter(id, { position })}
            onDragWaypoint={(characterId, index, position) => {
              if (characterId === selected?.id) updateWaypoint(index, { position });
            }}
            onSelectWaypoint={(index) => {
              setSelectedWaypoint(index);
              setTab("path");
            }}
            onPlacePoint={placeWaypointAt}
            onGotoCameraKeyframe={gotoCameraKeyframe}
          />
        </Suspense>
        {placing && (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-[#f0c27f] px-3 py-1 text-[11px] font-medium text-[#1a1408] shadow-lg">
            點擊放置模式：在地面點一下新增路徑點 · 拖曳可旋轉視角 · Esc 結束
          </div>
        )}
        {/* timeline: scrub / play the whole thing (paths + camera track) */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 rounded-full border border-[#2a2a2a] bg-[#111]/90 px-2 py-1.5 backdrop-blur">
          <button
            type="button"
            onClick={playing ? stopPlayback : previewTimeline}
            disabled={recording}
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] ${playing ? "bg-[#2a1414] text-[#ff9b9b]" : "bg-[#7ff0cd] text-[#0a1a16]"} disabled:opacity-40`}
            aria-label={playing ? "停止" : "播放時間軸"}
          >
            {playing ? "■" : "▶"}
          </button>
          <input
            type="range"
            min={0}
            max={timelineDuration}
            step={0.1}
            value={Math.min(playhead, timelineDuration)}
            onChange={(e) => seek(Number(e.target.value))}
            disabled={recording}
            className="min-w-0 flex-1 accent-[#7ff0cd]"
            aria-label="時間軸"
          />
          <span className="w-[76px] shrink-0 text-right font-mono text-[10.5px] text-[#c9c9c9]">
            {fmtSec(Math.min(playhead, timelineDuration))} / {fmtSec(timelineDuration)}s
          </span>
        </div>
        {recording && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] text-[#ff9b9b]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff5555]" />
            錄製中 {recordElapsed}/{recordSeconds}s
          </div>
        )}
        {captured && (
          <div className="absolute bottom-14 right-3 w-[160px] overflow-hidden rounded-lg border border-[#3a3a3a] shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={captured} alt="截圖預覽" className="w-full" />
            <div className="bg-black/70 px-2 py-1 text-center text-[10px] text-[#c9c9c9]">已截圖，儲存後會用這張</div>
          </div>
        )}
      </div>

      {/* right: attribute / posture tabs */}
      <div className="flex w-[260px] shrink-0 flex-col border-l border-[#1c1c1c]">
        <div className="flex border-b border-[#1c1c1c]">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-[12px] ${tab === t ? "border-b-2 border-[#7ff0cd] text-white" : "text-[#8a8a8a] hover:text-white"}`}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {!selected && tab !== "camera" && <p className="text-[12px] text-[#6d6d6d]">選一個角色來編輯</p>}

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
                      onClick={() => {
                        applyPreset(name);
                        setLastPoseByChar((cur) => ({ ...cur, [selected.id]: name }));
                      }}
                      className={`rounded-lg px-2 py-1.5 text-[11px] ${
                        activePoseName === name ? "bg-[#233a34] text-[#7ff0cd] ring-1 ring-[#3a5a50]" : "bg-[#1f1f1f] text-[#c9c9c9] hover:bg-[#282828]"
                      }`}
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
              {/* 點擊放置 — the primary way to lay out a route */}
              <button
                type="button"
                onClick={() => setPlaceMode(!placing)}
                className={`w-full rounded-lg px-2 py-2 text-[11.5px] font-medium ${
                  placing ? "bg-[#f0c27f] text-[#1a1408]" : "bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] text-[#0a1a16] hover:brightness-105"
                }`}
              >
                {placing ? "■ 結束點擊放置（Esc）" : "🖱 點擊放置路徑點"}
              </button>
              <p className="text-[10px] leading-relaxed text-[#6d6d6d]">
                {placing
                  ? "在地面每點一下就多一個路徑點，時間會自動接在上一點之後。第一點會把角色搬過去當起點。"
                  : "開啟後，在畫面的地面點一下就放一個點——比拖曳黃球精準得多。放好的點可以點選（清單同步反白）、拖曳微調或在下面改時間／姿勢。"}
              </p>

              <div className="grid grid-cols-2 gap-1.5">
                <label className="block">
                  <div className="mb-1 text-[10px] text-[#8a8a8a]">每點間隔（秒）</div>
                  <input
                    type="number"
                    step={0.5}
                    min={0.5}
                    value={placeOptions.interval}
                    onChange={(e) => setPlaceOptions({ ...placeOptions, interval: Math.max(0.1, Number(e.target.value) || 0.1) })}
                    className={fieldCls}
                  />
                </label>
                <label className="block">
                  <div className="mb-1 text-[10px] text-[#8a8a8a]">新點的姿勢</div>
                  <select value={placeOptions.poseName} onChange={(e) => setPlaceOptions({ ...placeOptions, poseName: e.target.value })} className={fieldCls}>
                    <option value="">同上一點</option>
                    {POSE_NAMES.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-1 gap-1 rounded-lg bg-[#161616] p-2">
                <label className="flex items-center justify-between text-[11px] text-[#c9c9c9]">
                  對齊格線（0.25）
                  <input type="checkbox" checked={placeOptions.snap} onChange={(e) => setPlaceOptions({ ...placeOptions, snap: e.target.checked })} />
                </label>
                <label className="flex items-center justify-between text-[11px] text-[#c9c9c9]">
                  移動時自動轉向前方
                  <input type="checkbox" checked={selected.faceAlongPath !== false} onChange={(e) => updateSelected({ faceAlongPath: e.target.checked })} />
                </label>
                <label className="flex items-center justify-between text-[11px] text-[#c9c9c9]">
                  轉彎走平滑曲線
                  <input type="checkbox" checked={selected.pathSmooth !== false} onChange={(e) => updateSelected({ pathSmooth: e.target.checked })} />
                </label>
              </div>

              <div className="space-y-2">
                {(selected.path ?? []).length === 0 && (
                  <p className="rounded-lg bg-[#161616] px-2 py-3 text-center text-[11px] text-[#6d6d6d]">
                    還沒有路徑點——按上面「點擊放置」，然後在地面依序點出路線
                  </p>
                )}
                {(selected.path ?? []).map((wp, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedWaypoint(i)}
                    className={`cursor-pointer space-y-1.5 rounded-lg p-2 ${selectedWaypoint === i ? "bg-[#1b2a25] ring-1 ring-[#3a5a50]" : "bg-[#161616]"}`}
                  >
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-[10px] text-[#8a8a8a]">
                        <span className={`grid h-4 w-4 place-items-center rounded-full text-[9px] font-semibold ${selectedWaypoint === i ? "bg-[#7ff0cd] text-[#0a1a16]" : "bg-[#2a2a2a] text-[#f0c27f]"}`}>{i + 1}</span>
                        時間（秒）
                        <input
                          type="number"
                          step={0.5}
                          min={0}
                          value={wp.t}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => updateWaypoint(i, { t: Math.max(0, Number(e.target.value)) })}
                          className="w-16 rounded-md border border-[#2c2c2c] bg-[#1c1c1c] px-1.5 py-0.5 text-[11px] text-white focus:border-[#4a4a4a] focus:outline-none"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeWaypoint(i);
                        }}
                        className="text-[#6d6d6d] hover:text-[#ff8a8a]"
                      >
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
                          onClick={(e) => e.stopPropagation()}
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
                      onClick={(e) => e.stopPropagation()}
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

              <div className="grid grid-cols-3 gap-1.5">
                <button type="button" onClick={addWaypoint} className="rounded-lg bg-[#1f1f1f] px-1.5 py-1.5 text-[10.5px] text-[#c9c9c9] hover:bg-[#282828]">
                  ＋ 目前位置
                </button>
                <button type="button" onClick={undoLastWaypoint} disabled={!selected.path?.length} className="rounded-lg bg-[#1f1f1f] px-1.5 py-1.5 text-[10.5px] text-[#c9c9c9] hover:bg-[#282828] disabled:opacity-40">
                  ↶ 復原上一點
                </button>
                <button type="button" onClick={clearPath} disabled={!selected.path?.length} className="rounded-lg bg-[#1f1f1f] px-1.5 py-1.5 text-[10.5px] text-[#c9c9c9] hover:bg-[#2a1414] hover:text-[#ff9b9b] disabled:opacity-40">
                  清除全部
                </button>
              </div>

              <button
                type="button"
                onClick={playing ? stopPlayback : previewPath}
                disabled={pathDuration(selected.path) <= 0 && !cameraTrack.keyframes.length}
                className="w-full rounded-lg bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-2 py-1.5 text-[11px] font-medium text-[#0a1a16] hover:brightness-105 disabled:opacity-40"
              >
                {playing ? "■ 停止" : `▶ 預覽路徑（${pathDuration(selected.path)}s）`}
              </button>
            </div>
          )}

          {tab === "camera" && (
            <div className="space-y-3">
              <p className="text-[10px] leading-relaxed text-[#6d6d6d]">
                鏡頭軌道＝幾個「第幾秒鏡頭在哪、看哪裡」的關鍵影格，中間自動平滑運鏡（環繞會走弧線、推拉沿視線）。
                最快的做法：先用左邊「快速運鏡」或拖曳擺好起始視角，再點一個運鏡模板，時長跟著左邊「錄製時長」（目前 {recordSeconds}s）。
              </p>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-[10.5px] text-[#8a8a8a]">
                  <span>運鏡模板</span>
                  <span className="text-[#6d6d6d]">以 {(selected ?? scene.characters[0])?.name ?? "原點"} 為主體</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {CAMERA_MOVE_TEMPLATES.map((tpl) => {
                    const active = tpl.kind === "keyframes" ? cameraTrack.templateId === tpl.id && cameraTrack.keyframes.length > 0 : followTemplateActive(tpl.id);
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        title={tpl.hint}
                        disabled={playing || recording}
                        onClick={() => {
                          if (tpl.kind === "follow" && active) setCameraFollow(null);
                          else applyCameraTemplate(tpl.id);
                        }}
                        className={`rounded-lg px-2 py-1.5 text-left text-[11px] disabled:opacity-40 ${
                          active ? "bg-[#1e2a3d] text-[#8ab4ff] ring-1 ring-[#3a5080]" : "bg-[#1f1f1f] text-[#c9c9c9] hover:bg-[#282828]"
                        }`}
                      >
                        <div>{tpl.label}</div>
                        <div className="text-[9.5px] text-[#7d7d7d]">{tpl.hint}</div>
                      </button>
                    );
                  })}
                </div>
                {cameraTrack.follow && (
                  <p className="mt-1.5 rounded-lg bg-[#161616] px-2 py-1.5 text-[10px] leading-relaxed text-[#8ab4ff]">
                    {cameraTrack.follow.mode === "chase" ? "跟拍" : "定點跟蹤"}中：
                    {scene.characters.find((c) => c.id === cameraTrack.follow!.characterId)?.name ?? "（角色已刪除）"}
                    。再點一次同一個按鈕可取消；角色需要有路徑才看得出效果。
                  </p>
                )}
              </div>

              <div className="border-t border-[#1e1e1e] pt-3">
                <div className="mb-1.5 flex items-center justify-between text-[10.5px] text-[#8a8a8a]">
                  <span>關鍵影格（{cameraTrack.keyframes.length}）</span>
                  {cameraTrack.keyframes.length > 0 && (
                    <button type="button" onClick={clearCameraTrack} className="text-[10px] text-[#6d6d6d] hover:text-[#ff9b9b]">
                      清除軌道
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => addCameraKeyframe(playhead)}
                  disabled={playing || recording}
                  className="w-full rounded-lg bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-2 py-1.5 text-[11px] font-medium text-[#0a1a16] hover:brightness-105 disabled:opacity-40"
                >
                  ＋ 把目前視角記成第 {fmtSec(playhead)}s 的影格
                </button>
                <p className="mt-1.5 text-[10px] leading-relaxed text-[#6d6d6d]">
                  手動做法：拖時間軸到某一秒 → 拖曳／滾輪擺好鏡頭 → 按上面記下來，重複幾次就是一段運鏡。畫面上的藍色小相機是每個影格的位置，點它可以跳過去看。
                </p>

                <div className="mt-2 space-y-1.5">
                  {cameraTrack.keyframes.map((kf, i) => (
                    <div key={i} className="rounded-lg bg-[#161616] p-2">
                      <div className="flex items-center gap-1.5">
                        <span className="grid h-4 w-7 place-items-center rounded-full bg-[#1e2a3d] text-[9px] font-semibold text-[#8ab4ff]">C{i + 1}</span>
                        <input
                          type="number"
                          step={0.5}
                          min={0}
                          value={kf.t}
                          onChange={(e) => updateCameraKeyframe(i, { t: Math.max(0, Number(e.target.value)) })}
                          className="w-14 rounded-md border border-[#2c2c2c] bg-[#1c1c1c] px-1.5 py-0.5 text-[11px] text-white focus:border-[#4a4a4a] focus:outline-none"
                          aria-label="秒"
                        />
                        <span className="text-[10px] text-[#8a8a8a]">s</span>
                        <select
                          value={kf.ease ?? "smooth"}
                          onChange={(e) => updateCameraKeyframe(i, { ease: e.target.value as "smooth" | "linear" })}
                          className="ml-auto rounded-md border border-[#2c2c2c] bg-[#1c1c1c] px-1 py-0.5 text-[10px] text-[#c9c9c9] focus:outline-none"
                          aria-label="緩動"
                        >
                          <option value="smooth">緩入緩出</option>
                          <option value="linear">等速</option>
                        </select>
                        <button type="button" onClick={() => removeCameraKeyframe(i)} className="text-[#6d6d6d] hover:text-[#ff8a8a]" aria-label="刪除影格">
                          <IconTrash className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                        <button type="button" onClick={() => gotoCameraKeyframe(i)} className="rounded-md bg-[#1f1f1f] px-1.5 py-1 text-[10px] text-[#c9c9c9] hover:bg-[#282828]">
                          跳到此視角
                        </button>
                        <button type="button" onClick={() => recaptureCameraKeyframe(i)} className="rounded-md bg-[#1f1f1f] px-1.5 py-1 text-[10px] text-[#c9c9c9] hover:bg-[#282828]">
                          用目前視角覆蓋
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={playing ? stopPlayback : previewTimeline}
                disabled={recording || (!cameraTrack.keyframes.length && !cameraTrack.follow)}
                className="w-full rounded-lg bg-[#1e2a3d] px-2 py-1.5 text-[11px] font-medium text-[#8ab4ff] hover:bg-[#243450] disabled:opacity-40"
              >
                {playing ? "■ 停止" : `▶ 預覽運鏡（${fmtSec(timelineDuration)}s）`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
