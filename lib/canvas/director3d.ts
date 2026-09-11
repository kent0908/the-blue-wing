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
 * Scope: one free-orbit camera, ground + solid-color background, pose
 * presets + per-joint rig sliders, screenshot capture, 1-30s camera-move
 * recording, a movement-path system (see Waypoint below — position + a
 * picked pose per point, smoothly blended; not a real walk cycle) and a
 * keyframed camera track with one-click 運鏡 templates (see CameraTrack
 * below and lib/canvas/cameraShots.ts). Multi-camera and panorama
 * backgrounds are still follow-ups — see the module comment in
 * Director3DPanel.tsx for what's deliberately not here yet.
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
  /**
   * Turn to face the direction of travel while moving along `path`
   * (default true — a figure sliding sideways/backwards along its route
   * reads as broken). The body-facing `rotation` is overwritten during
   * playback when this is on; off keeps whatever `rotation` was set by hand.
   */
  faceAlongPath?: boolean;
  /**
   * Round corners with a Catmull-Rom spline through the waypoints instead
   * of straight segments (default true). Off = the old hard-cornered
   * polyline, which is still what you want for e.g. a march in a square.
   */
  pathSmooth?: boolean;
}

/**
 * One camera pose on the scene's camera track (see CameraTrack): at `t`
 * seconds the camera sits at `position` looking at `target`. Between two
 * keyframes the camera doesn't lerp position in straight XYZ — it
 * interpolates in spherical coordinates around the (lerped) target
 * (see interpolateCameraTrack in cameraShots.ts), so two keyframes that
 * differ only in azimuth produce a real arc around the subject, not a cut
 * through it. `ease` controls the timing curve into the NEXT keyframe.
 */
export type CameraEase = "smooth" | "linear";

export interface CameraKeyframe {
  t: number;
  position: [number, number, number];
  target: [number, number, number];
  ease?: CameraEase;
}

/**
 * The scene's one camera's motion over time — plays during 預覽 and 錄製運鏡
 * (see useDirector3DEditor.ts). Empty keyframes + no follow = the camera
 * is left entirely to free orbit, which is how a scene starts.
 *
 * `follow` keeps the camera pinned to a moving character on top of (or
 * instead of) keyframes: "aim" holds the camera's position but keeps the
 * look-at on the character (定點跟蹤); "chase" keeps the camera's offset
 * from the character constant so it travels with them (跟拍).
 */
export interface CameraFollow {
  characterId: string;
  mode: "aim" | "chase";
}

export interface CameraTrack {
  keyframes: CameraKeyframe[];
  follow?: CameraFollow | null;
  /** id of the last 運鏡 template applied (see CAMERA_MOVE_TEMPLATES) — only used to word the prompt hint */
  templateId?: string | null;
}

export interface Director3DSceneData {
  characters: CharacterState[];
  ground: { show: boolean; opacity: number; height: number };
  background: { color: string };
  /** camera keyframes / follow — see CameraTrack. Optional for scenes saved before it existed. */
  camera?: CameraTrack;
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

type Vec3 = [number, number, number];

/**
 * Uniform Catmull-Rom between p1 and p2 (p0/p3 are the neighbours, duplicated
 * at the ends of the path). Also returns the tangent, which is what the
 * auto-facing heading is read from — the derivative of the same curve, so
 * the figure turns exactly as the route bends rather than snapping at
 * each waypoint.
 */
function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, f: number): { point: Vec3; tangent: Vec3 } {
  const f2 = f * f;
  const f3 = f2 * f;
  const point: Vec3 = [0, 0, 0];
  const tangent: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const a = p0[i];
    const b = p1[i];
    const c = p2[i];
    const d = p3[i];
    point[i] = 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f2 + (-a + 3 * b - 3 * c + d) * f3);
    tangent[i] = 0.5 * (-a + c + 2 * (2 * a - 5 * b + 4 * c - d) * f + 3 * (-a + 3 * b - 3 * c + d) * f2);
  }
  return { point, tangent };
}

export interface PathSample {
  position: Vec3;
  pose: Pose;
  /** body yaw (radians, around Y) pointing along the direction of travel — undefined when not moving at this instant */
  heading?: number;
}

/** yaw that makes a figure whose front is +Z face along `tangent` (ignoring its vertical component) */
function headingOf(tangent: Vec3): number | undefined {
  const [x, , z] = tangent;
  if (Math.hypot(x, z) < 1e-4) return undefined;
  return Math.atan2(x, z);
}

/**
 * Where a character following `path` should be at time `t` (seconds since
 * the path started) — position along the route (Catmull-Rom curve unless
 * `smooth` is false, then straight segments), blended pose, and the
 * direction-of-travel heading. Holds at the first/last waypoint outside the
 * path's own time range. Returns null for an unusably-short path (0-1
 * points — nothing to interpolate between).
 */
export function interpolatePath(path: Waypoint[] | undefined, t: number, smooth = true): PathSample | null {
  if (!path || path.length < 2) return null;
  const sorted = [...path].sort((a, b) => a.t - b.t);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const endHeading = (i: number) => {
    // face the way we'll leave (at the start) / arrived (at the end)
    const a = sorted[Math.max(0, i - 1)];
    const b = sorted[Math.min(sorted.length - 1, i + 1)];
    return headingOf([b.position[0] - a.position[0], 0, b.position[2] - a.position[2]]);
  };
  if (t <= first.t) return { position: first.position, pose: POSE_PRESETS[first.poseName] ?? {}, heading: endHeading(0) };
  if (t >= last.t) return { position: last.position, pose: POSE_PRESETS[last.poseName] ?? {}, heading: endHeading(sorted.length - 1) };
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t || 1);
      const pose = lerpPose(POSE_PRESETS[a.poseName] ?? {}, POSE_PRESETS[b.poseName] ?? {}, f);
      if (smooth) {
        const p0 = sorted[Math.max(0, i - 1)].position;
        const p3 = sorted[Math.min(sorted.length - 1, i + 2)].position;
        const { point, tangent } = catmullRom(p0, a.position, b.position, p3, f);
        return { position: point, pose, heading: headingOf(tangent) };
      }
      const position: Vec3 = [
        lerp(a.position[0], b.position[0], f),
        lerp(a.position[1], b.position[1], f),
        lerp(a.position[2], b.position[2], f),
      ];
      return { position, pose, heading: headingOf([b.position[0] - a.position[0], 0, b.position[2] - a.position[2]]) };
    }
  }
  return { position: last.position, pose: POSE_PRESETS[last.poseName] ?? {}, heading: endHeading(sorted.length - 1) };
}

/**
 * Dense polyline of a path for drawing it in the viewport — samples the
 * same curve playback uses, so what you see is exactly where the figure
 * will go. Straight-segment paths just return the waypoints themselves.
 */
export function samplePathPolyline(path: Waypoint[] | undefined, smooth = true, perSegment = 12): Vec3[] {
  if (!path || path.length < 2) return [];
  const sorted = [...path].sort((a, b) => a.t - b.t);
  if (!smooth) return sorted.map((w) => w.position);
  const out: Vec3[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const p0 = sorted[Math.max(0, i - 1)].position;
    const p3 = sorted[Math.min(sorted.length - 1, i + 2)].position;
    for (let k = 0; k < perSegment; k++) out.push(catmullRom(p0, sorted[i].position, sorted[i + 1].position, p3, k / perSegment).point);
  }
  out.push(sorted[sorted.length - 1].position);
  return out;
}
