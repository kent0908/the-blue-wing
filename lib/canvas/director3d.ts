/**
 * 3D導演台 (Director's Desk) — a Canvas node type (see lib/canvas/types.ts)
 * that opens a small 3D scene editor: pose a mannequin, aim a camera,
 * capture a screenshot, and that screenshot becomes the node's own
 * "image" output — feeds into Image/Video Generation nodes exactly like a
 * Load Image node does, just composed in 3D instead of picked from a file.
 *
 * The mannequin is procedural (primitive capsules/boxes in a joint
 * hierarchy — see components/canvas/director3d/Mannequin.tsx), not a
 * downloaded rigged mesh: matches the plain grey-dummy look the reference
 * product itself uses, and sidesteps needing to source/license a 3D asset.
 *
 * v1 scope: one free-orbit camera, ground + solid-color background, pose
 * presets + per-joint rig sliders, screenshot capture, 15-30s camera-move
 * recording (see cameraShots.ts), and a minimal movement-path system (see
 * Waypoint below — position + a picked pose per point, linearly blended;
 * not a real walk cycle). Multi-camera and panorama backgrounds are still
 * follow-ups — see the module comment in Director3DPanel.tsx for what's
 * deliberately not here yet.
 */

export interface JointRotation {
  x: number;
  y: number;
  z: number;
}

export const JOINT_NAMES = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "leftShoulder",
  "leftUpperArm",
  "leftForearm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightForearm",
  "rightHand",
  "leftHip",
  "leftThigh",
  "leftShin",
  "leftFoot",
  "rightHip",
  "rightThigh",
  "rightShin",
  "rightFoot",
] as const;

export type JointName = (typeof JOINT_NAMES)[number];

export type Pose = Partial<Record<JointName, JointRotation>>;

/**
 * Two visual styles sharing the exact same joint hierarchy/pose shape (see
 * Mannequin.tsx and StickFigure.tsx) — only how the bones/joints are drawn
 * differs. "stick" is the plain sphere-joints + straight-bones skeleton
 * look ("圓形加直立式"): easier to read at a glance if you're not used to
 * posing a 3D model, since there's no boxy torso hiding which way a joint
 * is actually rotated.
 */
export type BodyStyle = "mannequin" | "stick";

export const BODY_STYLE_LABEL: Record<BodyStyle, string> = {
  mannequin: "精細模特兒",
  stick: "簡易關節人偶（新手推薦）",
};

/**
 * A point on a character's movement path: at `t` seconds, be at `position`
 * holding `poseName` (one of POSE_PRESETS). Between two waypoints, position
 * lerps linearly and the pose blends joint-by-joint (linear Euler-angle
 * interpolation, not a real walk cycle — see interpolatePath()). Minimal
 * "路徑點＋手動姿勢" version: you pick the pose at each point yourself,
 * there's no automatic footstep animation.
 */
export interface Waypoint {
  t: number;
  position: [number, number, number];
  poseName: string;
}

export interface CharacterState {
  id: string;
  name: string;
  position: [number, number, number];
  /** body-facing rotation (radians), separate from the pose's own joint rotations */
  rotation: [number, number, number];
  scale: number;
  color: string;
  pose: Pose;
  bodyStyle: BodyStyle;
  /** movement path — see Waypoint. Undefined/short (<2 points) = character stays put. */
  path?: Waypoint[];
}

export interface Director3DSceneData {
  characters: CharacterState[];
  ground: { show: boolean; opacity: number; height: number };
  background: { color: string };
  /** last screenshot taken — this IS the node's output once captured */
  capturedImage?: string | null;
}

/** sessionStorage key used to hand a captured screenshot's asset off to /studio (see app/studio/page.tsx). */
export const DIRECTOR3D_HANDOFF_KEY = "bw:director3d:handoff";

let seq = 0;
export function newCharacterId(): string {
  seq += 1;
  return `char_${Date.now().toString(36)}_${seq}`;
}

export function defaultCharacter(name: string): CharacterState {
  return {
    id: newCharacterId(),
    name,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: 1,
    color: "#c9c9c9",
    pose: {},
    bodyStyle: "mannequin",
  };
}

export function defaultDirector3DData(): Director3DSceneData {
  return {
    characters: [defaultCharacter("Role A")],
    ground: { show: true, opacity: 0.6, height: 0 },
    background: { color: "#14141c" },
    capturedImage: null,
  };
}

/* ---- pose presets — hand-authored approximations, not motion-captured ---- */
const deg = (d: number): number => (d * Math.PI) / 180;
const r = (x: number, y: number, z: number): JointRotation => ({ x: deg(x), y: deg(y), z: deg(z) });

export const POSE_PRESETS: Record<string, Pose> = {
  stand: {},
  "T-pose": {
    leftUpperArm: r(0, 0, 88),
    rightUpperArm: r(0, 0, -88),
  },
  walk: {
    leftUpperArm: r(22, 0, 0),
    rightUpperArm: r(-22, 0, 0),
    leftThigh: r(-18, 0, 0),
    rightThigh: r(18, 0, 0),
    leftShin: r(12, 0, 0),
  },
  running: {
    leftUpperArm: r(45, 0, 0),
    rightUpperArm: r(-45, 0, 0),
    leftForearm: r(-70, 0, 0),
    rightForearm: r(-70, 0, 0),
    leftThigh: r(-45, 0, 0),
    rightThigh: r(40, 0, 0),
    leftShin: r(70, 0, 0),
    rightShin: r(10, 0, 0),
    spine: r(8, 0, 0),
  },
  throw: {
    rightUpperArm: r(-30, 0, -80),
    rightForearm: r(-90, 0, 0),
    spine: r(0, -15, 0),
  },
  push: {
    leftUpperArm: r(70, 0, 12),
    rightUpperArm: r(70, 0, -12),
    spine: r(10, 0, 0),
  },
  "sitting position": {
    leftThigh: r(-90, 0, 0),
    rightThigh: r(-90, 0, 0),
    leftShin: r(90, 0, 0),
    rightShin: r(90, 0, 0),
    spine: r(-5, 0, 0),
  },
  "squat down": {
    leftThigh: r(-100, 0, 0),
    rightThigh: r(-100, 0, 0),
    leftShin: r(120, 0, 0),
    rightShin: r(120, 0, 0),
    spine: r(10, 0, 0),
  },
  "Get down on one knee": {
    leftThigh: r(-90, 0, 0),
    leftShin: r(130, 0, 0),
    rightThigh: r(-20, 0, 0),
  },
  "On your knees": {
    hips: r(-90, 0, 0),
    leftThigh: r(80, 0, 8),
    rightThigh: r(80, 0, -8),
    leftShin: r(-90, 0, 0),
    rightShin: r(-90, 0, 0),
  },
  beckon: {
    rightUpperArm: r(70, 0, -10),
    rightForearm: r(-100, 0, 0),
  },
  handshake: {
    rightUpperArm: r(55, 15, -25),
    rightForearm: r(-90, 0, 0),
  },
  bow: {
    spine: r(40, 0, 0),
    neck: r(10, 0, 0),
  },
  akimbo: {
    leftUpperArm: r(0, 0, 30),
    leftForearm: r(0, 90, 90),
    rightUpperArm: r(0, 0, -30),
    rightForearm: r(0, -90, -90),
  },
  "arm hug": {
    leftUpperArm: r(55, 0, 45),
    rightUpperArm: r(55, 0, -45),
    leftForearm: r(-100, 0, 0),
    rightForearm: r(-100, 0, 0),
  },
  "rely on": {
    spine: r(0, 0, 20),
    leftUpperArm: r(0, 0, 15),
    rightUpperArm: r(20, 0, -40),
  },
  stretch: {
    leftUpperArm: r(0, 0, 160),
    rightUpperArm: r(0, 0, -160),
    spine: r(-8, 0, 0),
  },
  "Check your phone": {
    rightUpperArm: r(70, 0, -8),
    rightForearm: r(-130, 0, 0),
    neck: r(28, 0, 0),
  },
  "take a picture": {
    leftUpperArm: r(80, 0, 20),
    rightUpperArm: r(80, 0, -20),
    leftForearm: r(-90, 0, 0),
    rightForearm: r(-90, 0, 0),
  },
  fighting: {
    leftUpperArm: r(60, 0, 20),
    rightUpperArm: r(60, 0, -20),
    leftForearm: r(-110, 0, 0),
    rightForearm: r(-110, 0, 0),
    leftThigh: r(-12, 0, 0),
    rightThigh: r(12, 0, 0),
  },
  Dance: {
    leftUpperArm: r(30, 0, 60),
    rightUpperArm: r(-20, 0, -40),
    spine: r(0, 15, 10),
    leftThigh: r(10, 0, -10),
  },
};

export const POSE_NAMES = Object.keys(POSE_PRESETS);

/* ---- movement path interpolation — see Waypoint's own comment ---- */
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out: Pose = {};
  for (const j of JOINT_NAMES) {
    const pa = a[j] ?? { x: 0, y: 0, z: 0 };
    const pb = b[j] ?? { x: 0, y: 0, z: 0 };
    out[j] = { x: lerp(pa.x, pb.x, t), y: lerp(pa.y, pb.y, t), z: lerp(pa.z, pb.z, t) };
  }
  return out;
}

/** How long a path takes to play out, in seconds — the last waypoint's time. */
export function pathDuration(path: Waypoint[] | undefined): number {
  if (!path || !path.length) return 0;
  return path.reduce((m, w) => Math.max(m, w.t), 0);
}

/**
 * Where a character following `path` should be at time `t` (seconds since
 * the path started) — lerped position, blended pose. Holds at the first/last
 * waypoint outside the path's own time range. Returns null for an
 * unusably-short path (0-1 points — nothing to interpolate between).
 */
export function interpolatePath(path: Waypoint[] | undefined, t: number): { position: [number, number, number]; pose: Pose } | null {
  if (!path || path.length < 2) return null;
  const sorted = [...path].sort((a, b) => a.t - b.t);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (t <= first.t) return { position: first.position, pose: POSE_PRESETS[first.poseName] ?? {} };
  if (t >= last.t) return { position: last.position, pose: POSE_PRESETS[last.poseName] ?? {} };
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t || 1);
      const position: [number, number, number] = [
        lerp(a.position[0], b.position[0], f),
        lerp(a.position[1], b.position[1], f),
        lerp(a.position[2], b.position[2], f),
      ];
      const pose = lerpPose(POSE_PRESETS[a.poseName] ?? {}, POSE_PRESETS[b.poseName] ?? {}, f);
      return { position, pose };
    }
  }
  return { position: last.position, pose: POSE_PRESETS[last.poseName] ?? {} };
}
