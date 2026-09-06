"use client";

import { useEffect, useRef, useState } from "react";
import {
  POSE_PRESETS,
  defaultCharacter,
  type BodyStyle,
  type CharacterState,
  type Director3DSceneData,
  type JointName,
} from "@/lib/canvas/director3d";
import {
  SHOT_PRESETS,
  computeCharacterShot,
  computeGroupShot,
  computeOriginShot,
  type ShotRequest,
} from "@/lib/canvas/cameraShots";

const deg2rad = (d: number) => (d * Math.PI) / 180;

/**
 * All the state + mutation logic behind 3D導演台 — shared between the
 * Canvas-node modal (Director3DPanel) and the standalone /canvas/director3d
 * page, so the two entry points can't drift apart. `persistKey`, when given,
 * autosaves every scene change to localStorage under that key (used by the
 * standalone page so navigating away and back doesn't lose your blocking —
 * the modal flow leaves this unset since a Canvas node's own save/cancel
 * already owns that lifecycle).
 */
export function useDirector3DEditor(initial: Director3DSceneData, persistKey?: string) {
  const [scene, setScene] = useState<Director3DSceneData>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial.characters[0]?.id ?? null);
  const [tab, setTab] = useState<"attribute" | "posture">("attribute");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [captured, setCaptured] = useState<string | null>(initial.capturedImage ?? null);
  const [shot, setShot] = useState<ShotRequest | null>(null);

  useEffect(() => {
    if (!persistKey) return;
    try {
      localStorage.setItem(persistKey, JSON.stringify(scene));
    } catch {
      // best-effort autosave only — a full/blocked storage quota shouldn't break editing
    }
  }, [persistKey, scene]);

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

  const setBodyStyle = (style: BodyStyle) => updateSelected({ bodyStyle: style });

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

  const takeScreenshot = (): string | null => {
    if (!canvasRef.current) return null;
    const url = canvasRef.current.toDataURL("image/png");
    setCaptured(url);
    return url;
  };

  /** Fires a 運鏡 preset, focused on the selected character (or the first one, or the origin). */
  const applyShot = (presetId: string) => {
    const preset = SHOT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const focus = selected ?? scene.characters[0] ?? null;
    setShot(focus ? computeCharacterShot(preset, focus) : computeOriginShot(preset));
  };

  const applyGroupShot = () => setShot(computeGroupShot(scene.characters));

  return {
    scene,
    setScene,
    selectedId,
    setSelectedId,
    selected,
    tab,
    setTab,
    canvasRef,
    captured,
    setCaptured,
    shot,
    setShot,
    updateSelected,
    updateJoint,
    applyPreset,
    setBodyStyle,
    addCharacter,
    removeCharacter,
    takeScreenshot,
    applyShot,
    applyGroupShot,
  };
}

export type Director3DEditor = ReturnType<typeof useDirector3DEditor>;
