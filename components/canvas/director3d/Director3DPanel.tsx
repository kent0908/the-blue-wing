"use client";

import { Suspense, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { IconClose, IconPlus, IconTrash } from "../../Icons";
import {
  POSE_NAMES,
  POSE_PRESETS,
  defaultCharacter,
  type CharacterState,
  type Director3DSceneData,
  type JointName,
} from "@/lib/canvas/director3d";

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

const rad2deg = (r: number) => Math.round((r * 180) / Math.PI);
const deg2rad = (d: number) => (d * Math.PI) / 180;

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

/**
 * 3D導演台 editor — opened from a "director3d" Canvas node (see
 * lib/canvas/types.ts). Poses a procedural mannequin, aims the one free
 * camera, and captures a screenshot that becomes the node's own image
 * output on save.
 *
 * Deliberately NOT in v1 (see the ask that prompted this — full parity with
 * the reference product's multi-camera / panorama-background / keyframe-
 * timeline-video-export is a much bigger follow-up, not something to
 * half-build alongside everything else here):
 *   - multiple named cameras / camera switching (one free-orbit camera only)
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
  const [scene, setScene] = useState<Director3DSceneData>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial.characters[0]?.id ?? null);
  const [tab, setTab] = useState<"attribute" | "posture">("attribute");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [captured, setCaptured] = useState<string | null>(initial.capturedImage ?? null);

  const selected = scene.characters.find((c) => c.id === selectedId) ?? null;

  const updateSelected = (patch: Partial<CharacterState>) => {
    if (!selected) return;
    setScene((s) => ({ ...s, characters: s.characters.map((c) => (c.id === selected.id ? { ...c, ...patch } : c)) }));
  };

  const updateJoint = (joint: JointName, axis: "x" | "y" | "z", deg: number) => {
    if (!selected) return;
    const current = selected.pose[joint] ?? { x: 0, y: 0, z: 0 };
    const next = { ...current, [axis]: deg2rad(deg) };
    updateSelected({ pose: { ...selected.pose, [joint]: next } });
  };

  const applyPreset = (name: string) => {
    if (!selected) return;
    updateSelected({ pose: POSE_PRESETS[name] ?? {} });
  };

  const addCharacter = () => {
    const n = scene.characters.length + 1;
    const ch = defaultCharacter(`Role ${String.fromCharCode(64 + n)}`);
    ch.position = [scene.characters.length * 0.9, 0, 0];
    setScene((s) => ({ ...s, characters: [...s.characters, ch] }));
    setSelectedId(ch.id);
  };

  const removeCharacter = (id: string) => {
    setScene((s) => ({ ...s, characters: s.characters.filter((c) => c.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  };

  const takeScreenshot = () => {
    if (!canvasRef.current) return;
    setCaptured(canvasRef.current.toDataURL("image/png"));
  };

  const save = () => {
    onSave({ ...scene, capturedImage: captured });
    onClose();
  };

  const fieldCls = "w-full rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-2 py-1 text-[11.5px] text-white focus:border-[#4a4a4a] focus:outline-none";

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      {/* toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#1c1c1c] px-4">
        <span className="text-[13px] font-medium text-white">3D 導演台</span>
        <span className="text-[11px] text-[#6d6d6d]">拖曳畫面旋轉視角、滾輪縮放；點角色可選取</span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={takeScreenshot} className="h-8 rounded-full bg-[#1f1f1f] px-3.5 text-[12.5px] text-white hover:bg-[#282828]">
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

      <div className="flex min-h-0 flex-1">
        {/* left: character list + scene settings */}
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
              onSelect={(id) => setSelectedId(id || null)}
              onReady={(el) => {
                canvasRef.current = el;
              }}
            />
          </Suspense>
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
            {(["attribute", "posture"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 py-2 text-[12px] ${tab === t ? "border-b-2 border-[#7ff0cd] text-white" : "text-[#8a8a8a] hover:text-white"}`}
              >
                {t === "attribute" ? "attribute" : "posture"}
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
                          next[i] = deg2rad(Number(e.target.value));
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
          </div>
        </div>
      </div>
    </div>
  );
}
