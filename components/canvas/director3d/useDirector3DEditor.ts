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
  DEFAULT_SHOT,
  SHOT_PRESETS,
  computeCharacterShot,
  computeGroupShot,
  computeOriginShot,
  describeCameraMove,
  type ShotRequest,
} from "@/lib/canvas/cameraShots";
import { MIN_VIDEO_REF_PIXELS } from "@/lib/videoRefs";

const deg2rad = (d: number) => (d * Math.PI) / 180;

/** How many still frames a 運鏡錄製 samples across its duration — handed to video generation as multi-reference images. */
const RECORDING_FRAME_SAMPLES = 6;

// Keep a 15-30s recording's file size under the ~4MB upload cap (see
// lib/videoRefs.ts) — this is just a previz/reference clip, not a final
// deliverable, so a lower bitrate is an acceptable trade for reliably
// fitting under Vercel's request body limit.
const RECORDING_BITS_PER_SECOND = 900_000;

export interface RecordedFrame {
  url: string;
  pose: ShotRequest;
}

export interface RecordedClip {
  url: string;
  blob: Blob;
}

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
  // Not React state — read at frame-sample time, not something that should
  // trigger a re-render on every drag/zoom tick.
  const poseRef = useRef<ShotRequest>(DEFAULT_SHOT);
  const updatePose = (pose: ShotRequest) => {
    poseRef.current = pose;
  };

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

  /**
   * "錄製運鏡" — a real screen-capture of the 3D viewport (via
   * canvas.captureStream + MediaRecorder), not a fake progress bar. You stay
   * free to drag/orbit/zoom (or click a 運鏡 preset — same camera, so it
   * composes) for however long the duration is set to; a handful of stills
   * get sampled along the way for the "送去影片生成" handoff, since SIRAYA's
   * video API takes reference images + a text prompt, not an actual
   * motion-reference video — the recorded clip itself is a real, downloadable
   * previz artifact, but nothing here can literally hand a video's motion to
   * the generation model.
   */
  const [recordSeconds, setRecordSeconds] = useState(20);
  const [recording, setRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [recordedClip, setRecordedClip] = useState<RecordedClip | null>(null);
  const [recordedFrames, setRecordedFrames] = useState<RecordedFrame[]>([]);
  const [recordError, setRecordError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearRecordingTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  };

  const captureFrameSample = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL("image/jpeg", 0.82);
    setRecordedFrames((cur) => [...cur, { url, pose: poseRef.current }]);
  };

  const stopRecording = () => {
    clearRecordingTimers();
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    setRecording(false);
  };

  const discardRecording = () => {
    setRecordedClip((cur) => {
      if (cur) URL.revokeObjectURL(cur.url);
      return null;
    });
    setRecordedFrames([]);
    setRecordError(null);
  };

  const startRecording = () => {
    setRecordError(null);
    const canvas = canvasRef.current;
    if (!canvas) {
      setRecordError("3D 場景還沒準備好，稍等一下再試");
      return;
    }
    if (typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
      setRecordError("這個瀏覽器不支援錄製 3D 畫面，換 Chrome / Edge 試試");
      return;
    }
    // SIRAYA rejects a reference clip below roughly 480p worth of pixels
    // (see lib/videoRefs.ts) — checked here so a too-small viewport fails
    // fast instead of after a full 15-30s recording.
    if (canvas.width * canvas.height < MIN_VIDEO_REF_PIXELS) {
      setRecordError("視窗太小，錄出來的畫面解析度會被影片生成 API 拒絕 — 請放大瀏覽器視窗再錄");
      return;
    }
    discardRecording();

    const stream = canvas.captureStream(30);
    const mimeType = ["video/webm;codecs=vp9", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const recorderOptions = { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: RECORDING_BITS_PER_SECOND };
    const mr = new MediaRecorder(stream, recorderOptions);
    chunksRef.current = [];
    mr.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: mimeType || "video/webm" });
      setRecordedClip({ url: URL.createObjectURL(blob), blob });
    };
    mediaRecorderRef.current = mr;
    mr.start();
    setRecording(true);
    setRecordElapsed(0);

    const durationMs = recordSeconds * 1000;
    for (let i = 0; i < RECORDING_FRAME_SAMPLES; i++) {
      const at = i === 0 ? 60 : Math.round((durationMs * i) / (RECORDING_FRAME_SAMPLES - 1));
      timersRef.current.push(setTimeout(captureFrameSample, at));
    }
    timersRef.current.push(setTimeout(stopRecording, durationMs));
    tickRef.current = setInterval(() => {
      setRecordElapsed((s) => Math.min(recordSeconds, s + 1));
    }, 1000);
  };

  useEffect(() => {
    return () => {
      clearRecordingTimers();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
    };
    // unmount cleanup only — deliberately not re-run per render
  }, []);

  /** Rough auto-generated camera-move description from the first/last sampled frame — see describeCameraMove(). */
  const cameraMoveHint =
    recordedFrames.length >= 2 ? describeCameraMove(recordedFrames[0].pose, recordedFrames[recordedFrames.length - 1].pose) : "";

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
  };
}

export type Director3DEditor = ReturnType<typeof useDirector3DEditor>;
