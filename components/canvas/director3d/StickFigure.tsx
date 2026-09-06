"use client";

import type { ThreeEvent } from "@react-three/fiber";
import type { CharacterState, JointName, Pose } from "@/lib/canvas/director3d";

function rot(pose: Pose, name: JointName): [number, number, number] {
  const j = pose[name];
  return j ? [j.x, j.y, j.z] : [0, 0, 0];
}

/** A sphere joint marker — the "圓形" half of the 圓形加直立式 look. */
function Joint({ radius = 0.05, color }: { radius?: number; color: string }) {
  return (
    <mesh castShadow>
      <sphereGeometry args={[radius, 12, 12]} />
      <meshStandardMaterial color={color} roughness={0.5} />
    </mesh>
  );
}

/** A straight bone segment hanging down `length` from its parent joint — the "直立" half. */
function Bone({ length, radius = 0.032, color }: { length: number; radius?: number; color: string }) {
  return (
    <mesh position={[0, -length / 2, 0]} castShadow>
      <cylinderGeometry args={[radius, radius, Math.max(0.01, length), 8]} />
      <meshStandardMaterial color={color} roughness={0.5} />
    </mesh>
  );
}

/**
 * Simplified "圓形加直立式" avatar — sphere joints strung together with
 * straight bone segments, no boxy torso. Every joint pivot sits at exactly
 * the same offset as Mannequin.tsx (same JOINT_NAMES / Pose shape), so
 * switching a character's "體型" between the two styles doesn't change its
 * proportions, its pose, or where the camera "運鏡" presets frame it — this
 * is purely a plainer, easier-to-read skin over the identical rig.
 */
export default function StickFigure({
  character,
  selected,
  onSelect,
  onDragStart,
}: {
  character: CharacterState;
  selected: boolean;
  onSelect: () => void;
  /** Pointer-down on the figure — selects it and starts a floor-drag (see Director3DScene's DragPlane). */
  onDragStart?: () => void;
}) {
  const { position, rotation, scale, color, pose } = character;
  const c = selected ? "#7ff0cd" : color;
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect();
  };
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onSelect();
    onDragStart?.();
  };

  return (
    <group position={position} rotation={rotation} scale={scale} onClick={handleClick} onPointerDown={handlePointerDown}>
      {/* hips — the root of the pose hierarchy, offset up so feet land near y=0 */}
      <group position={[0, 1.0, 0]} rotation={rot(pose, "hips")}>
        <Joint radius={0.075} color={c} />
        {/* hips -> spine pivot: static, doesn't bend with the spine (matches Mannequin's hips box) */}
        <Bone length={0.12} color={c} />

        <group position={[0, 0.12, 0]} rotation={rot(pose, "spine")}>
          <Joint radius={0.065} color={c} />
          <Bone length={0.2} color={c} />

          <group position={[0, 0.2, 0]} rotation={rot(pose, "chest")}>
            <Joint radius={0.06} color={c} />
            <Bone length={0.28} radius={0.024} color={c} />

            <group position={[0, 0.28, 0]} rotation={rot(pose, "neck")}>
              <Joint radius={0.045} color={c} />
              <Bone length={0.12} radius={0.02} color={c} />
              <group position={[0, 0.12, 0]} rotation={rot(pose, "head")}>
                <mesh castShadow>
                  <sphereGeometry args={[0.15, 16, 16]} />
                  <meshStandardMaterial color={c} roughness={0.5} />
                </mesh>
              </group>
            </group>

            {/* left arm */}
            <group position={[-0.24, 0.16, 0]} rotation={rot(pose, "leftShoulder")}>
              <Joint radius={0.05} color={c} />
              <group rotation={rot(pose, "leftUpperArm")}>
                <Bone length={0.32} color={c} />
                <group position={[0, -0.32, 0]} rotation={rot(pose, "leftForearm")}>
                  <Joint radius={0.045} color={c} />
                  <Bone length={0.28} radius={0.028} color={c} />
                  <group position={[0, -0.28, 0]} rotation={rot(pose, "leftHand")}>
                    <Joint radius={0.045} color={c} />
                  </group>
                </group>
              </group>
            </group>

            {/* right arm (mirror) */}
            <group position={[0.24, 0.16, 0]} rotation={rot(pose, "rightShoulder")}>
              <Joint radius={0.05} color={c} />
              <group rotation={rot(pose, "rightUpperArm")}>
                <Bone length={0.32} color={c} />
                <group position={[0, -0.32, 0]} rotation={rot(pose, "rightForearm")}>
                  <Joint radius={0.045} color={c} />
                  <Bone length={0.28} radius={0.028} color={c} />
                  <group position={[0, -0.28, 0]} rotation={rot(pose, "rightHand")}>
                    <Joint radius={0.045} color={c} />
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>

        {/* left leg */}
        <group position={[-0.11, -0.1, 0]} rotation={rot(pose, "leftHip")}>
          <Joint radius={0.06} color={c} />
          <group rotation={rot(pose, "leftThigh")}>
            <Bone length={0.42} radius={0.036} color={c} />
            <group position={[0, -0.42, 0]} rotation={rot(pose, "leftShin")}>
              <Joint radius={0.05} color={c} />
              <Bone length={0.4} radius={0.03} color={c} />
              <group position={[0, -0.4, 0]} rotation={rot(pose, "leftFoot")}>
                <Joint radius={0.045} color={c} />
              </group>
            </group>
          </group>
        </group>

        {/* right leg (mirror) */}
        <group position={[0.11, -0.1, 0]} rotation={rot(pose, "rightHip")}>
          <Joint radius={0.06} color={c} />
          <group rotation={rot(pose, "rightThigh")}>
            <Bone length={0.42} radius={0.036} color={c} />
            <group position={[0, -0.42, 0]} rotation={rot(pose, "rightShin")}>
              <Joint radius={0.05} color={c} />
              <Bone length={0.4} radius={0.03} color={c} />
              <group position={[0, -0.4, 0]} rotation={rot(pose, "rightFoot")}>
                <Joint radius={0.045} color={c} />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
