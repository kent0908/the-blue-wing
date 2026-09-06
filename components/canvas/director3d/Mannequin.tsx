"use client";

import type { ThreeEvent } from "@react-three/fiber";
import type { CharacterState, JointName, Pose } from "@/lib/canvas/director3d";

function rot(pose: Pose, name: JointName): [number, number, number] {
  const j = pose[name];
  return j ? [j.x, j.y, j.z] : [0, 0, 0];
}

/** One capsule limb segment, pivoted at its top (parent joint) and hanging down `length`. */
function Limb({ length, radius = 0.09, color }: { length: number; radius?: number; color: string }) {
  return (
    <mesh position={[0, -length / 2, 0]} castShadow>
      <capsuleGeometry args={[radius, Math.max(0.01, length - radius * 2), 4, 8]} />
      <meshStandardMaterial color={color} roughness={0.6} />
    </mesh>
  );
}

/**
 * A procedural humanoid mannequin — plain primitives in a joint hierarchy,
 * not a downloaded rigged mesh (see lib/canvas/director3d.ts for why).
 * `pose` rotations are applied per-joint; `character.position/rotation/scale`
 * is the whole figure's placement in the scene, separate from its pose.
 */
export default function Mannequin({
  character,
  selected,
  onSelect,
}: {
  character: CharacterState;
  selected: boolean;
  onSelect: () => void;
}) {
  const { position, rotation, scale, color, pose } = character;
  const c = selected ? "#7ff0cd" : color;
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect();
  };

  return (
    <group position={position} rotation={rotation} scale={scale} onClick={handleClick}>
      {/* hips — the root of the pose hierarchy, offset up so feet land near y=0 */}
      <group position={[0, 1.0, 0]} rotation={rot(pose, "hips")}>
        <mesh castShadow>
          <boxGeometry args={[0.32, 0.22, 0.2]} />
          <meshStandardMaterial color={c} roughness={0.6} />
        </mesh>

        <group position={[0, 0.12, 0]} rotation={rot(pose, "spine")}>
          <group position={[0, 0.2, 0]} rotation={rot(pose, "chest")}>
            <mesh position={[0, 0.05, 0]} castShadow>
              <boxGeometry args={[0.38, 0.4, 0.22]} />
              <meshStandardMaterial color={c} roughness={0.6} />
            </mesh>

            <group position={[0, 0.28, 0]} rotation={rot(pose, "neck")}>
              <mesh castShadow>
                <cylinderGeometry args={[0.06, 0.07, 0.08, 8]} />
                <meshStandardMaterial color={c} roughness={0.6} />
              </mesh>
              <group position={[0, 0.12, 0]} rotation={rot(pose, "head")}>
                <mesh castShadow>
                  <sphereGeometry args={[0.14, 16, 16]} />
                  <meshStandardMaterial color={c} roughness={0.6} />
                </mesh>
              </group>
            </group>

            {/* left arm */}
            <group position={[-0.24, 0.16, 0]} rotation={rot(pose, "leftShoulder")}>
              <group rotation={rot(pose, "leftUpperArm")}>
                <Limb length={0.32} color={c} />
                <group position={[0, -0.32, 0]} rotation={rot(pose, "leftForearm")}>
                  <Limb length={0.28} radius={0.075} color={c} />
                  <group position={[0, -0.28, 0]} rotation={rot(pose, "leftHand")}>
                    <mesh castShadow>
                      <sphereGeometry args={[0.06, 8, 8]} />
                      <meshStandardMaterial color={c} roughness={0.6} />
                    </mesh>
                  </group>
                </group>
              </group>
            </group>

            {/* right arm (mirror) */}
            <group position={[0.24, 0.16, 0]} rotation={rot(pose, "rightShoulder")}>
              <group rotation={rot(pose, "rightUpperArm")}>
                <Limb length={0.32} color={c} />
                <group position={[0, -0.32, 0]} rotation={rot(pose, "rightForearm")}>
                  <Limb length={0.28} radius={0.075} color={c} />
                  <group position={[0, -0.28, 0]} rotation={rot(pose, "rightHand")}>
                    <mesh castShadow>
                      <sphereGeometry args={[0.06, 8, 8]} />
                      <meshStandardMaterial color={c} roughness={0.6} />
                    </mesh>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>

        {/* left leg */}
        <group position={[-0.11, -0.1, 0]} rotation={rot(pose, "leftHip")}>
          <group rotation={rot(pose, "leftThigh")}>
            <Limb length={0.42} radius={0.1} color={c} />
            <group position={[0, -0.42, 0]} rotation={rot(pose, "leftShin")}>
              <Limb length={0.4} radius={0.085} color={c} />
              <group position={[0, -0.4, 0]} rotation={rot(pose, "leftFoot")}>
                <mesh position={[0, 0, 0.08]} castShadow>
                  <boxGeometry args={[0.1, 0.06, 0.24]} />
                  <meshStandardMaterial color={c} roughness={0.6} />
                </mesh>
              </group>
            </group>
          </group>
        </group>

        {/* right leg (mirror) */}
        <group position={[0.11, -0.1, 0]} rotation={rot(pose, "rightHip")}>
          <group rotation={rot(pose, "rightThigh")}>
            <Limb length={0.42} radius={0.1} color={c} />
            <group position={[0, -0.42, 0]} rotation={rot(pose, "rightShin")}>
              <Limb length={0.4} radius={0.085} color={c} />
              <group position={[0, -0.4, 0]} rotation={rot(pose, "rightFoot")}>
                <mesh position={[0, 0, 0.08]} castShadow>
                  <boxGeometry args={[0.1, 0.06, 0.24]} />
                  <meshStandardMaterial color={c} roughness={0.6} />
                </mesh>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
