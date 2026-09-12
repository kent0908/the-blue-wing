"use client";

import { useEffect, useRef, useState } from "react";
import {
  POSE_PRESETS,
  defaultCharacter,
  interpolatePath,
  pathDuration,
  type BodyStyle,
  type CameraFollow,
  type CameraKeyframe,
  type CameraTrack,
  type CharacterState,
  type Director3DSceneData,
  type JointName,
  type Waypoint,
} from "@/lib/canvas/director3d";
import {
  CAMERA_MOVE_TEMPLATES,
  DEFAULT_SHOT,
  SHOT_PRESETS,
  buildCameraMove,
  cameraTrackDuration,
  characterAimPoint,
  computeCameraAt,
  computeCharacterShot,
  computeGroupShot,
  computeOriginShot,
  describeCameraMove,
  describeCameraTrack,
  type ShotRequest,
} from "@/lib/canvas/cameraShots";
import { MIN_VIDEO_REF_PIXELS } from "@/lib/videoRefs";

const deg2rad = (d: number) => (d * Math.PI) / 180;

/** How many still frames a 運鏡錄製 samples across its duration — handed to video generation as multi-reference images. */
const RECORDING_FRAME_SAMPLES = 6;

// Reference clips now upload browser → Blob directly (lib/videoRefs.ts's
// DIRECT cap, 48MB), so the bitrate no longer has to squeeze a 30s clip
// under 4MB the way the old 900kbps setting did — 2.5Mbps keeps the figure
// edges clean for SIRAYA to read (30s ≈ 9MB) while still far under the cap.
const RECORDING_BITS_PER_SECOND = 2_500_000;

/**
 * Re-samples the WebGL canvas into a bounded JPEG data URL. A raw
 * `canvas.toDataURL("image/png")` was unbounded: at devicePixelRatio 2 on a
 * large monitor the viewport is ~3000px wide and the PNG runs 3-6MB, which
 * (a) can't be saved inside a Canvas node (the graph document is capped at
 * 3MB), (b) blows the ~4.5MB request limit as an inline reference to
 * /api/images or /api/videos, and (c) exceeded the old asset upload cap on
 * the standalone page. The opposite edge — a tiny viewport under SIRAYA's
 * ~300px reference minimum — is also handled by upscaling. Solid background,
 * flat-shaded figures: JPEG q0.92 at ≤1600px is a few hundred KB and
 * indistinguishable as a reference.
 */
const CAPTURE_MAX_SIDE = 1600;
const CAPTURE_MIN_SIDE = 320;
function captureBounded(canvas: HTMLCanvasElement, quality: number): string {
  const w = canvas.width;
  const h = canvas.height;
  let scale = 1;
  if (Math.min(w, h) < CAPTURE_MIN_SIDE) scale = CAPTURE_MIN_SIDE / Math.min(w, h);
  if (Math.max(w, h) * scale > CAPTURE_MAX_SIDE) scale = CAPTURE_MAX_SIDE / Math.max(w, h);
  if (scale === 1) return canvas.toDataURL("image/jpeg", quality);
  const off = document.createElement("canvas");
  off.width = Math.max(1, Math.round(w * scale));
  off.height = Math.max(1, Math.round(h * scale));
  const ctx = off.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/jpeg", quality);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, off.width, off.height);
  return off.toDataURL("image/jpeg", quality);
}

export interface RecordedFrame {
  url: string;
  pose: ShotRequest;
}

export interface RecordedClip {
  url: string;
  blob: Blob;
}

export type EditorTab = "attribute" | "posture" | "path" | "camera";

/** Settings for 點擊放置 path mode — how each newly clicked waypoint is filled in. */
export interface PlaceOptions {
  /** seconds added after the previous waypoint */
  interval: number;
  /** pose for new points; "" = copy the previous point's pose (or stand for the first) */
  poseName: string;
  /** round clicked positions to a 0.25 grid */
  snap: boolean;
}

const EMPTY_TRACK: CameraTrack = { keyframes: [], follow: null, templateId: null };
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * All the state + mutation logic behind 3D導演台 — shared between the
 * Canvas-node modal (Director3DPanel) and the standalone /canvas/director3d
 * page, so the two entry points can't drift apart. `remotePersist`, when
 * true, autosaves every scene change to this account's own row in
 * director3d_scenes (see app/api/director3d/route.ts) — real per-account
 * storage, isolated the same way every other table here is (a plain
 * `where user_id = ...`), not the browser's localStorage. Debounced so a
 * mid-drag slider doesn't fire a request per pixel. The modal flow leaves
 * this false since a Canvas node's own save/cancel already owns that
 * scene's lifecycle (it lives in that workflow's own graph document).
 */
export function useDirector3DEditor(initial: Director3DSceneData, remotePersist?: boolean) {
  const [scene, setScene] = useState<Director3DSceneData>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial.characters[0]?.id ?? null);
  const [tab, setTab] = useState<EditorTab>("attribute");
  const [selectedWaypoint, setSelectedWaypoint] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [captured, setCaptured] = useState<string | null>(initial.capturedImage ?? null);
  const [shot, setShot] = useState<ShotRequest | null>(null);
  // Not React state — read at frame-sample time, not something that should
  // trigger a re-render on every drag/zoom tick.
  const poseRef = useRef<ShotRequest>(DEFAULT_SHOT);
  const updatePose = (pose: ShotRequest) => {
    poseRef.current = pose;
  };

  // how long 錄製運鏡 runs — also the length 運鏡 templates are built to (see applyCameraTemplate)
  const [recordSeconds, setRecordSeconds] = useState(20);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSaveRef = useRef(true); // don't PUT back the scene we just GET'd
  useEffect(() => {
    if (!remotePersist) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch("/api/director3d", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene }),
      }).catch(() => {
        // best-effort autosave only — a transient network error shouldn't interrupt editing
      });
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [remotePersist, scene]);

  const selected = scene.characters.find((c) => c.id === selectedId) ?? null;

  /** Updates any character by id — the general form; updateSelected below is just this pinned to whichever one is currently selected. */
  const updateCharacter = (id: string, patch: Partial<CharacterState>) => {
    setScene((s) => ({ ...s, characters: s.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  };

  const updateSelected = (patch: Partial<CharacterState>) => {
    if (!selected) return;
    updateCharacter(selected.id, patch);
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

  /** Adds a waypoint at the selected character's current position, 3s after its last one (0s if it's the first). */
  const addWaypoint = () => {
    if (!selected) return;
    const path = selected.path ?? [];
    const t = path.length ? Math.max(...path.map((w) => w.t)) + 3 : 0;
    const wp: Waypoint = { t, position: [...selected.position], poseName: "stand" };
    updateSelected({ path: [...path, wp].sort((a, b) => a.t - b.t) });
  };

  const updateWaypoint = (index: number, patch: Partial<Waypoint>) => {
    if (!selected?.path) return;
    const next = selected.path.map((w, i) => (i === index ? { ...w, ...patch } : w));
    updateSelected({ path: next.sort((a, b) => a.t - b.t) });
  };

  const removeWaypoint = (index: number) => {
    if (!selected?.path) return;
    updateSelected({ path: selected.path.filter((_, i) => i !== index) });
    setSelectedWaypoint((cur) => (cur === null ? null : cur === index ? null : cur > index ? cur - 1 : cur));
  };

  /**
   * 點擊放置 mode — while on, a click on the floor in the viewport drops the
   * next waypoint right there (see Director3DScene's PlacePlane) instead of
   * the old add-then-drag-the-marker dance. Time auto-continues from the
   * previous point by `interval`; the pose copies the previous point's unless
   * one is pinned in the options. The first point also moves the character
   * onto it, so what you see standing there is where playback starts.
   */
  const [placeMode, setPlaceModeState] = useState(false);
  const [placeOptions, setPlaceOptions] = useState<PlaceOptions>({ interval: 2, poseName: "", snap: true });
  const setPlaceMode = (on: boolean) => {
    setPlaceModeState(on && !!selected);
    if (on) setTab("path");
  };

  const placeWaypointAt = (point: [number, number, number]) => {
    if (!selected) return;
    const snap = (n: number) => (placeOptions.snap ? Math.round(n * 4) / 4 : round2(n));
    const position: [number, number, number] = [snap(point[0]), selected.position[1], snap(point[2])];
    const path = selected.path ?? [];
    const prev = path.length ? [...path].sort((a, b) => a.t - b.t)[path.length - 1] : null;
    const t = prev ? round2(prev.t + Math.max(0.1, placeOptions.interval)) : 0;
    const poseName = placeOptions.poseName || prev?.poseName || "stand";
    const next = [...path, { t, position, poseName }].sort((a, b) => a.t - b.t);
    updateSelected({ path: next, ...(prev ? {} : { position }) });
    setSelectedWaypoint(next.length - 1);
  };

  const undoLastWaypoint = () => {
    if (!selected?.path?.length) return;
    const sorted = [...selected.path].sort((a, b) => a.t - b.t);
    sorted.pop();
    updateSelected({ path: sorted });
    setSelectedWaypoint(sorted.length ? sorted.length - 1 : null);
  };

  const clearPath = () => {
    if (!selected) return;
    updateSelected({ path: [] });
    setSelectedWaypoint(null);
  };

  /* ---- camera track (see CameraTrack in lib/canvas/director3d.ts) ---- */
  const cameraTrack: CameraTrack = scene.camera ?? EMPTY_TRACK;

  const updateCameraTrack = (patch: Partial<CameraTrack>) => {
    setScene((s) => ({ ...s, camera: { ...(s.camera ?? EMPTY_TRACK), ...patch } }));
  };

  /** Records the live camera (wherever you've dragged/zoomed it to) as a keyframe at `t` — replaces one already sitting at that exact second. */
  const addCameraKeyframe = (t: number) => {
    const pose = poseRef.current;
    const kf: CameraKeyframe = { t: round2(Math.max(0, t)), position: [...pose.position], target: [...pose.target], ease: "smooth" };
    const rest = cameraTrack.keyframes.filter((k) => Math.abs(k.t - kf.t) > 0.049);
    updateCameraTrack({ keyframes: [...rest, kf].sort((a, b) => a.t - b.t), templateId: null });
  };

  const updateCameraKeyframe = (index: number, patch: Partial<CameraKeyframe>) => {
    const next = cameraTrack.keyframes.map((k, i) => (i === index ? { ...k, ...patch } : k));
    updateCameraTrack({ keyframes: next.sort((a, b) => a.t - b.t), ...("position" in patch || "target" in patch ? { templateId: null } : {}) });
  };

  /** Overwrites one keyframe's pose with the live camera — "I nudged the view, keep the timing". */
  const recaptureCameraKeyframe = (index: number) => {
    const pose = poseRef.current;
    updateCameraKeyframe(index, { position: [...pose.position], target: [...pose.target] });
  };

  const removeCameraKeyframe = (index: number) => {
    updateCameraTrack({ keyframes: cameraTrack.keyframes.filter((_, i) => i !== index) });
  };

  const clearCameraTrack = () => updateCameraTrack({ keyframes: [], follow: null, templateId: null });

  const setCameraFollow = (follow: CameraFollow | null) => updateCameraTrack({ follow });

  /** Jumps the viewport camera to a keyframe's pose (eased) so it can be inspected/adjusted. */
  const gotoCameraKeyframe = (index: number) => {
    const kf = cameraTrack.keyframes[index];
    if (kf) setShot({ position: kf.position, target: kf.target });
  };

  /**
   * One-click 運鏡 template — keyframe templates rebuild the whole track
   * starting from the live camera pose and centred on the selected character
   * (or the first one), lasting the recording duration; follow templates
   * just set the follow mode and keep any keyframes.
   */
  const applyCameraTemplate = (templateId: string) => {
    const template = CAMERA_MOVE_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    const focus = selected ?? scene.characters[0] ?? null;
    if (template.kind === "follow") {
      if (!focus) return;
      updateCameraTrack({ follow: { characterId: focus.id, mode: templateId === "follow-aim" ? "aim" : "chase" }, templateId });
      return;
    }
    const keyframes = buildCameraMove(templateId, poseRef.current, focus ? characterAimPoint(focus) : null, recordSeconds);
    updateCameraTrack({ keyframes, templateId });
    // show the opening frame right away so the template's start is visible before pressing play
    if (keyframes[0]) setShot({ position: keyframes[0].position, target: keyframes[0].target });
  };

  /** Next unused "Role X" letter given who's currently in the scene — real
   *  bug found on re-audit (2026-09-08): naming purely off
   *  `characters.length + 1` meant deleting a character and adding a new
   *  one could reissue a name still in use by another character (e.g. A/B/C,
   *  delete B → A/C (length 2) → add → "Role C", colliding with the
   *  existing C). Falls back to a numbered name past Z (26 characters in
   *  one scene is already an extreme case). */
  const nextCharacterName = (): string => {
    const used = new Set(scene.characters.map((c) => c.name));
    for (let letter = 65; letter <= 90; letter++) {
      const name = `Role ${String.fromCharCode(letter)}`;
      if (!used.has(name)) return name;
    }
    return `Role ${scene.characters.length + 1}`;
  };

  const addCharacter = () => {
    const ch = defaultCharacter(nextCharacterName());
    ch.position = [scene.characters.length * 0.9, 0, 0];
    setScene((s) => ({ ...s, characters: [...s.characters, ch] }));
    setSelectedId(ch.id);
  };

  const removeCharacter = (id: string) => {
    setScene((s) => ({ ...s, characters: s.characters.filter((c) => c.id !== id) }));
    // Real UX bug found on re-audit: used to just clear selection outright,
    // forcing a manual re-click even when other characters are still in the
    // scene — fall back to whichever one is now first, same as how a fresh
    // scene starts out with its first character selected.
    if (selectedId === id) {
      const remaining = scene.characters.filter((c) => c.id !== id);
      setSelectedId(remaining[0]?.id ?? null);
    }
  };

  /**
   * Timeline playback — one requestAnimationFrame loop that drives every
   * character with a ≥2-point path along it (interpolated position/pose/
   * heading written back into `scene` each frame) and publishes the current
   * time via `playheadRef` for Director3DScene's CameraTrackPlayer, which
   * reads it inside its own useFrame to move the camera along the camera
   * track without a React state update per frame. Runs standalone for
   * 預覽, or alongside 錄製運鏡 so the recorded clip actually shows the
   * movement — canvas.captureStream() just grabs whatever's on screen, so
   * animating via normal re-renders is enough, no separate video-encoding
   * path needed.
   */
  const pathAnimFrameRef = useRef<number | null>(null);
  const pathAnimStartRef = useRef<number>(0);
  const playheadRef = useRef<number>(0);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Moves every pathed character to where it should be at `t` — shared by live playback and scrubbing. */
  const applyCharactersAt = (t: number) => {
    setScene((s) => {
      let changed = false;
      const characters = s.characters.map((c) => {
        const r = interpolatePath(c.path, t, c.pathSmooth !== false);
        if (!r) return c;
        changed = true;
        const rotation: [number, number, number] =
          c.faceAlongPath !== false && r.heading !== undefined ? [c.rotation[0], r.heading, c.rotation[2]] : c.rotation;
        return { ...c, position: r.position, pose: r.pose, rotation };
      });
      return changed ? { ...s, characters } : s;
    });
  };

  const stopPathAnimation = () => {
    if (pathAnimFrameRef.current !== null) cancelAnimationFrame(pathAnimFrameRef.current);
    pathAnimFrameRef.current = null;
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    setPlaying(false);
  };

  const startPathAnimation = () => {
    stopPathAnimation();
    pathAnimStartRef.current = performance.now();
    playheadRef.current = 0;
    setPlaying(true);
    const tick = () => {
      const elapsed = (performance.now() - pathAnimStartRef.current) / 1000;
      playheadRef.current = elapsed;
      setPlayhead(elapsed);
      applyCharactersAt(elapsed);
      pathAnimFrameRef.current = requestAnimationFrame(tick);
    };
    pathAnimFrameRef.current = requestAnimationFrame(tick);
  };

  /** Total timeline length: whichever of the recording length, the longest path or the camera track runs longest. */
  const timelineDuration = Math.max(recordSeconds, cameraTrackDuration(scene.camera), ...scene.characters.map((c) => pathDuration(c.path)));

  /** Manual "check it looks right" playback of paths + camera track, independent of recording. */
  const previewPath = () => {
    const duration = Math.max(cameraTrackDuration(scene.camera), ...scene.characters.map((c) => pathDuration(c.path)));
    if (duration <= 0 && !scene.camera?.follow) return;
    startPathAnimation();
    stopTimerRef.current = setTimeout(stopPathAnimation, Math.max(duration, 0.5) * 1000 + 150);
  };

  /** Full-length preview (the whole timeline, so the recording can be rehearsed exactly). */
  const previewTimeline = () => {
    startPathAnimation();
    stopTimerRef.current = setTimeout(stopPathAnimation, timelineDuration * 1000 + 150);
  };

  /**
   * Scrub to `t` while stopped — characters jump to their path positions
   * and the camera snaps to the track's pose there (immediate, not eased —
   * a lagging camera under a dragged slider feels broken).
   */
  const seek = (t: number) => {
    stopPathAnimation();
    playheadRef.current = t;
    setPlayhead(t);
    applyCharactersAt(t);
    const at = scene.characters.map((c) => {
      const r = interpolatePath(c.path, t, c.pathSmooth !== false);
      return r ? { ...c, position: r.position } : c;
    });
    const pose = computeCameraAt(scene.camera, t, at, poseRef.current);
    if (pose) setShot({ ...pose, immediate: true });
  };

  const takeScreenshot = (): string | null => {
    if (!canvasRef.current) return null;
    const url = captureBounded(canvasRef.current, 0.92);
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
    const url = captureBounded(canvasRef.current, 0.82);
    setRecordedFrames((cur) => [...cur, { url, pose: poseRef.current }]);
  };

  const stopRecording = () => {
    clearRecordingTimers();
    stopPathAnimation();
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
    // If any character has a movement path set, or the camera track has
    // anything on it, play the timeline during the recording so the clip
    // actually shows the motion, not just a static pose.
    if (scene.characters.some((c) => pathDuration(c.path) > 0) || cameraTrack.keyframes.length || cameraTrack.follow) startPathAnimation();

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
      stopPathAnimation();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
    };
    // unmount cleanup only — deliberately not re-run per render
  }, []);

  /** Camera-move wording for the video prompt: the camera track's own description when one is set, else a rough read of the first/last sampled frame — see describeCameraTrack() / describeCameraMove(). */
  const cameraMoveHint =
    describeCameraTrack(scene.camera) ??
    (recordedFrames.length >= 2 ? describeCameraMove(recordedFrames[0].pose, recordedFrames[recordedFrames.length - 1].pose) : "");

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
    stopPlayback: stopPathAnimation,
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
