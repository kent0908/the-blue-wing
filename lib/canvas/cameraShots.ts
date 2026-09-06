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
import type { CharacterState } from "./director3d";

export interface ShotRequest {
  position: [number, number, number];
  target: [number, number, number];
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
