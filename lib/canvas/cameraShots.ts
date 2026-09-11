/**
 * "運鏡" quick-camera presets for 3D導演台. Aiming a 3D camera by dragging
 * alone is exactly the kind of thing non-professionals find fiddly — these
 * are one-click angle+framing combos plus a "fit everyone in frame" group
 * shot, so a decent composition is a button away and free-drag (still fully
 * available via OrbitControls) is only needed for fine adjustment after.
 *
 * Positions/heights are hand-tuned against the mannequin/stick-figure's own
 * proportions (hips/chest/head offsets — see Mannequin.tsx / StickFigure.tsx),
 * same "close enough, not physically simulated" spirit as the pose presets
 * in director3d.ts.
 */
import type { CameraKeyframe, CameraTrack, CharacterState } from "./director3d";

export interface ShotRequest {
  position: [number, number, number];
  target: [number, number, number];
  /** snap the camera there this frame instead of easing over a few — used by timeline scrubbing, where a lagging camera would feel broken */
  immediate?: boolean;
}

type Angle = "front" | "back" | "left" | "right" | "45" | "top" | "low";
type Framing = "closeup" | "medium" | "full";

/** Direction the camera sits relative to the framing target (not normalized). */
const ANGLE_DIR: Record<Angle, [number, number, number]> = {
  front: [0, 0.18, 1],
  back: [0, 0.18, -1],
  left: [-1, 0.18, 0],
  right: [1, 0.18, 0],
  "45": [0.72, 0.22, 0.72],
  top: [0.2, 1.6, 0.2],
  low: [0, -0.35, 1],
};

/** How far back, and how high up the figure (roughly head/chest/hip height). */
const FRAMING: Record<Framing, { distance: number; height: number }> = {
  closeup: { distance: 0.85, height: 1.68 },
  medium: { distance: 1.7, height: 1.25 },
  full: { distance: 3.1, height: 0.85 },
};

export interface ShotPreset {
  id: string;
  label: string;
  angle: Angle;
  framing: Framing;
}

export const SHOT_PRESETS: ShotPreset[] = [
  { id: "front-full", label: "正面全身", angle: "front", framing: "full" },
  { id: "front-medium", label: "正面半身", angle: "front", framing: "medium" },
  { id: "front-closeup", label: "正面特寫", angle: "front", framing: "closeup" },
  { id: "side", label: "側面", angle: "left", framing: "medium" },
  { id: "back", label: "背面", angle: "back", framing: "full" },
  { id: "45", label: "45° 側前", angle: "45", framing: "full" },
  { id: "top", label: "鳥瞰俯視", angle: "top", framing: "full" },
  { id: "low", label: "仰視英雄鏡", angle: "low", framing: "medium" },
];

/** The Canvas's own initial camera — used for a "重置視角" button. */
export const DEFAULT_SHOT: ShotRequest = { position: [2.4, 1.8, 3.2], target: [0, 0.9, 0] };

function normalize([x, y, z]: [number, number, number]): [number, number, number] {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

/** Frame one character (whichever is selected, or the first in the scene). */
export function computeCharacterShot(preset: ShotPreset, character: Pick<CharacterState, "position" | "scale">): ShotRequest {
  const [dx, dy, dz] = normalize(ANGLE_DIR[preset.angle]);
  const { distance, height } = FRAMING[preset.framing];
  const [cx, cy, cz] = character.position;
  const h = height * character.scale;
  return {
    target: [cx, cy + h, cz],
    position: [cx + dx * distance, cy + h + dy * distance, cz + dz * distance],
  };
}

/** No character to focus on yet — frame the scene origin instead. */
export function computeOriginShot(preset: ShotPreset): ShotRequest {
  return computeCharacterShot(preset, { position: [0, 0, 0], scale: 1 });
}

const rad2deg = (r: number) => (r * 180) / Math.PI;

interface PoseFeatures {
  azimuth: number;
  elevation: number;
  distance: number;
}

function poseFeatures(p: ShotRequest): PoseFeatures {
  const dx = p.position[0] - p.target[0];
  const dy = p.position[1] - p.target[1];
  const dz = p.position[2] - p.target[2];
  const distance = Math.hypot(dx, dy, dz) || 1;
  return { azimuth: Math.atan2(dx, dz), elevation: Math.asin(dy / distance), distance };
}

/**
 * A rough, best-effort text description of how the camera moved between two
 * sampled poses — used as a prompt hint when handing a recorded 運鏡 off to
 * video generation (see app/canvas/director3d/page.tsx). Deliberately
 * coarse: SIRAYA's video API takes reference images + a text prompt, not an
 * actual motion-reference video, so this is meant to nudge the model's own
 * interpretation of "pan left" / "push in" — not claim frame-accurate
 * motion transfer, which nothing here can actually do.
 */
export function describeCameraMove(from: ShotRequest, to: ShotRequest): string {
  const a = poseFeatures(from);
  const b = poseFeatures(to);
  const parts: string[] = [];

  let dAz = b.azimuth - a.azimuth;
  while (dAz > Math.PI) dAz -= Math.PI * 2;
  while (dAz < -Math.PI) dAz += Math.PI * 2;
  if (Math.abs(rad2deg(dAz)) > 8) parts.push(dAz > 0 ? "鏡頭向右環繞移動" : "鏡頭向左環繞移動");

  const dEl = rad2deg(b.elevation - a.elevation);
  if (Math.abs(dEl) > 6) parts.push(dEl > 0 ? "同時升高視角（往上看）" : "同時降低視角（往下看）");

  const dDist = b.distance - a.distance;
  if (Math.abs(dDist) > 0.3) parts.push(dDist < 0 ? "並持續拉近（推鏡）" : "並持續拉遠（拉鏡）");

  return parts.length ? parts.join("，") : "鏡頭在原地小幅度環顧";
}

/** Fit every character in frame at once — for multi-character blocking. */
export function computeGroupShot(characters: CharacterState[]): ShotRequest {
  if (!characters.length) return computeOriginShot(SHOT_PRESETS[0]);
  const xs = characters.map((c) => c.position[0]);
  const zs = characters.map((c) => c.position[2]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 1);
  const distance = 2.6 + span * 1.1;
  const [dx, dy, dz] = normalize(ANGLE_DIR.front);
  return {
    target: [cx, 0.9, cz],
    position: [cx + dx * distance, 0.9 + dy * distance, cz + dz * distance],
  };
}

/* ------------------------------------------------------------------------ */
/* Camera track — keyframed 運鏡 (see CameraTrack in director3d.ts)          */
/* ------------------------------------------------------------------------ */

type Vec3 = [number, number, number];

/** Camera pose relative to what it's looking at: where around the subject, how high, how far. */
interface Spherical {
  azimuth: number;
  elevation: number;
  distance: number;
}

function toSpherical(position: Vec3, target: Vec3): Spherical {
  const dx = position[0] - target[0];
  const dy = position[1] - target[1];
  const dz = position[2] - target[2];
  const distance = Math.hypot(dx, dy, dz) || 0.001;
  return { azimuth: Math.atan2(dx, dz), elevation: Math.asin(Math.max(-1, Math.min(1, dy / distance))), distance };
}

function fromSpherical(s: Spherical, target: Vec3): Vec3 {
  const horizontal = Math.cos(s.elevation) * s.distance;
  return [target[0] + Math.sin(s.azimuth) * horizontal, target[1] + Math.sin(s.elevation) * s.distance, target[2] + Math.cos(s.azimuth) * horizontal];
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const lerp3 = (a: Vec3, b: Vec3, f: number): Vec3 => [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
const smoothstep = (f: number) => f * f * (3 - 2 * f);

/** shortest-way angular lerp — so a keyframe at 170° → -170° swings 20°, not 340° */
function lerpAngle(a: number, b: number, f: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * f;
}

export function cameraTrackDuration(track: CameraTrack | undefined): number {
  if (!track?.keyframes.length) return 0;
  return track.keyframes.reduce((m, k) => Math.max(m, k.t), 0);
}

/**
 * The keyframed camera pose at `t` — target lerps straight, the camera's
 * offset from it interpolates in spherical coordinates (so a change in
 * azimuth is an arc around the subject and a change in distance is a
 * push/pull along the line of sight — the two things every classic camera
 * move is built from). Holds the first/last keyframe outside the track's
 * range; null with no keyframes at all.
 */
export function interpolateCameraTrack(track: CameraTrack | undefined, t: number): ShotRequest | null {
  const kfs = track?.keyframes;
  if (!kfs?.length) return null;
  const sorted = [...kfs].sort((a, b) => a.t - b.t);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (t <= first.t || sorted.length === 1) return { position: first.position, target: first.target };
  if (t >= last.t) return { position: last.position, target: last.target };
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t < a.t || t > b.t) continue;
    const raw = (t - a.t) / (b.t - a.t || 1);
    const f = (a.ease ?? "smooth") === "linear" ? raw : smoothstep(raw);
    const target = lerp3(a.target, b.target, f);
    const sa = toSpherical(a.position, a.target);
    const sb = toSpherical(b.position, b.target);
    const position = fromSpherical(
      { azimuth: lerpAngle(sa.azimuth, sb.azimuth, f), elevation: lerp(sa.elevation, sb.elevation, f), distance: lerp(sa.distance, sb.distance, f) },
      target
    );
    return { position, target };
  }
  return { position: last.position, target: last.target };
}

/** Where the camera looks on a character — chest height, scaled with the figure. */
export function characterAimPoint(character: Pick<CharacterState, "position" | "scale">): Vec3 {
  return [character.position[0], character.position[1] + 1.1 * character.scale, character.position[2]];
}

/**
 * The camera pose the scene's track wants at time `t`, combining keyframes
 * with `follow` (see CameraFollow). `characters` are used for follow —
 * whatever positions they hold at that moment (during playback the caller
 * has already moved them along their paths). `fallback` is the pose to
 * build on when the track has no keyframes (the live camera, so a bare
 * "跟拍" with no keyframes keeps the framing you set by hand).
 * Returns null when the track drives nothing — leave the camera to free orbit.
 */
export function computeCameraAt(track: CameraTrack | undefined, t: number, characters: CharacterState[], fallback: ShotRequest): ShotRequest | null {
  const keyed = interpolateCameraTrack(track, t);
  const follow = track?.follow ?? null;
  const subject = follow ? characters.find((c) => c.id === follow.characterId) : undefined;
  if (!keyed && !subject) return null;
  if (!subject) return keyed;
  const base = keyed ?? fallback;
  const aim = characterAimPoint(subject);
  if (follow!.mode === "aim") return { position: base.position, target: aim };
  const offset: Vec3 = [base.position[0] - base.target[0], base.position[1] - base.target[1], base.position[2] - base.target[2]];
  return { position: [aim[0] + offset[0], aim[1] + offset[1], aim[2] + offset[2]], target: aim };
}

/* ---- one-click 運鏡 templates ------------------------------------------ */

export interface CameraMoveTemplate {
  id: string;
  label: string;
  /** one-line description shown under the button */
  hint: string;
  /** wording for the video-generation prompt hint (see describeCameraTrack) */
  prompt: string;
  /** whether this template is a keyframe move (rebuilds keyframes) or a follow mode (sets follow, keeps keyframes) */
  kind: "keyframes" | "follow";
}

export const CAMERA_MOVE_TEMPLATES: CameraMoveTemplate[] = [
  { id: "dolly-in", label: "推鏡", hint: "從目前視角慢慢推近主體", prompt: "鏡頭緩慢推近主體（推鏡）", kind: "keyframes" },
  { id: "dolly-out", label: "拉鏡", hint: "從目前視角慢慢拉遠", prompt: "鏡頭緩慢拉遠、逐漸帶出環境（拉鏡）", kind: "keyframes" },
  { id: "orbit-left", label: "左環繞 180°", hint: "繞著主體向左轉半圈", prompt: "鏡頭以主體為中心向左環繞半圈", kind: "keyframes" },
  { id: "orbit-right", label: "右環繞 180°", hint: "繞著主體向右轉半圈", prompt: "鏡頭以主體為中心向右環繞半圈", kind: "keyframes" },
  { id: "orbit-360", label: "環繞一圈 360°", hint: "繞著主體轉整整一圈", prompt: "鏡頭以主體為中心環繞一整圈", kind: "keyframes" },
  { id: "crane-up", label: "升起", hint: "從目前高度升到俯視", prompt: "鏡頭逐漸升高、轉為俯視主體（升降鏡頭向上）", kind: "keyframes" },
  { id: "crane-down", label: "下降", hint: "從俯視降到目前高度", prompt: "鏡頭由高處逐漸下降到與主體平視（升降鏡頭向下）", kind: "keyframes" },
  { id: "pan", label: "搖鏡", hint: "鏡頭不動、視線由左掃到右", prompt: "鏡頭定點由左向右搖鏡掃過場景", kind: "keyframes" },
  { id: "truck", label: "橫移", hint: "鏡頭與視線一起向右平移", prompt: "鏡頭沿水平方向向右平移（橫移）", kind: "keyframes" },
  { id: "arc-in", label: "弧形推近", hint: "邊環繞邊推近，最有電影感", prompt: "鏡頭沿弧線環繞並逐漸推近主體", kind: "keyframes" },
  { id: "follow-chase", label: "跟拍", hint: "鏡頭跟著角色一起移動", prompt: "鏡頭跟隨主體移動、保持相同距離（跟拍）", kind: "follow" },
  { id: "follow-aim", label: "定點跟蹤", hint: "鏡頭不動、視線一直對著角色", prompt: "鏡頭定點不動，視線持續跟蹤主體（跟蹤搖鏡）", kind: "follow" },
];

/** `right` vector on the ground plane for a camera looking from `position` at `target`. */
function rightOf(position: Vec3, target: Vec3): Vec3 {
  const fx = target[0] - position[0];
  const fz = target[2] - position[2];
  const len = Math.hypot(fx, fz) || 1;
  // forward × up (0,1,0) → right
  return [fz / len, 0, -fx / len];
}

/**
 * Builds the keyframes for a 運鏡 template, starting from the camera's
 * current pose (`from`) and lasting `duration` seconds — so every template
 * begins exactly at the framing you set up by hand, then moves from there.
 * `focus` (the selected character's aim point) is what orbits/pushes centre
 * on; the pan/truck templates keep the current target instead.
 */
export function buildCameraMove(templateId: string, from: ShotRequest, focus: Vec3 | null, duration: number): CameraKeyframe[] {
  const target = focus ?? from.target;
  const start = toSpherical(from.position, target);
  const at = (t: number, s: Spherical, tgt: Vec3 = target): CameraKeyframe => ({ t, position: fromSpherical(s, tgt), target: tgt, ease: "smooth" });
  const D = Math.max(1, duration);
  const orbit = (totalDeg: number) => {
    // split into ≤90° legs so shortest-way angle lerp can't take a shortcut
    const legs = Math.max(2, Math.ceil(Math.abs(totalDeg) / 90));
    const kfs: CameraKeyframe[] = [];
    for (let i = 0; i <= legs; i++) {
      const s = { ...start, azimuth: start.azimuth + ((totalDeg * Math.PI) / 180) * (i / legs) };
      kfs.push({ ...at((D * i) / legs, s), ease: "linear" });
    }
    // ease only the very start/end so the middle legs join at constant speed
    kfs[0].ease = "smooth";
    if (kfs.length >= 2) kfs[kfs.length - 2].ease = "smooth";
    return kfs;
  };
  switch (templateId) {
    case "dolly-in":
      return [at(0, start), at(D, { ...start, distance: Math.max(0.6, start.distance * 0.42) })];
    case "dolly-out":
      return [at(0, start), at(D, { ...start, distance: start.distance * 2.2 })];
    case "orbit-left":
      return orbit(-180);
    case "orbit-right":
      return orbit(180);
    case "orbit-360":
      return orbit(360);
    case "crane-up":
      return [at(0, start), at(D, { ...start, elevation: Math.max(start.elevation, 0.95) })];
    case "crane-down":
      return [at(0, { ...start, elevation: Math.max(start.elevation, 0.95) }), at(D, start)];
    case "pan": {
      const r = rightOf(from.position, from.target);
      const sweep = Math.max(1, start.distance * 0.6);
      const left: Vec3 = [from.target[0] - r[0] * sweep, from.target[1], from.target[2] - r[2] * sweep];
      const right: Vec3 = [from.target[0] + r[0] * sweep, from.target[1], from.target[2] + r[2] * sweep];
      return [
        { t: 0, position: from.position, target: left, ease: "smooth" },
        { t: D, position: from.position, target: right, ease: "smooth" },
      ];
    }
    case "truck": {
      const r = rightOf(from.position, from.target);
      const d = Math.max(1, start.distance * 0.5);
      const shift = (v: Vec3, k: number): Vec3 => [v[0] + r[0] * d * k, v[1], v[2] + r[2] * d * k];
      return [
        { t: 0, position: shift(from.position, -1), target: shift(from.target, -1), ease: "smooth" },
        { t: D, position: shift(from.position, 1), target: shift(from.target, 1), ease: "smooth" },
      ];
    }
    case "arc-in":
      return [at(0, start), at(D, { azimuth: start.azimuth + Math.PI / 3, elevation: start.elevation, distance: Math.max(0.6, start.distance * 0.5) })];
    default:
      return [];
  }
}

/**
 * Prompt wording for a camera track — the template's own text when one
 * was applied, else a best-effort read of first→last keyframe, else null
 * (free-hand recording falls back to describeCameraMove on sampled frames).
 */
export function describeCameraTrack(track: CameraTrack | undefined): string | null {
  if (!track) return null;
  const parts: string[] = [];
  const template = track.templateId ? CAMERA_MOVE_TEMPLATES.find((tpl) => tpl.id === track.templateId) : undefined;
  if (template && template.kind === "keyframes" && track.keyframes.length >= 2) parts.push(template.prompt);
  else if (track.keyframes.length >= 2) {
    const sorted = [...track.keyframes].sort((a, b) => a.t - b.t);
    parts.push(describeCameraMove(sorted[0], sorted[sorted.length - 1]));
  }
  if (track.follow) parts.push(CAMERA_MOVE_TEMPLATES.find((tpl) => tpl.id === `follow-${track.follow!.mode === "aim" ? "aim" : "chase"}`)!.prompt);
  return parts.length ? parts.join("，") : null;
}
