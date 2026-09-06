"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid, Line } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import Mannequin from "./Mannequin";
import StickFigure from "./StickFigure";
import type { CharacterState, Director3DSceneData } from "@/lib/canvas/director3d";
import type { ShotRequest } from "@/lib/canvas/cameraShots";

/**
 * Eases the camera toward a requested position/target over a few frames
 * instead of snapping to it — makes the 運鏡 preset buttons read as an
 * actual camera move rather than a hard cut. Changing `shot`'s identity
 * re-triggers the ease; free dragging (OrbitControls) still works at any
 * time, including mid-ease (it just stops the ease early next frame since
 * the distance check below will already be satisfied from the user's poll).
 */
function CameraRig({ shot, controlsRef }: { shot: ShotRequest | null; controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3());
  const targetLook = useRef(new THREE.Vector3());
  const easing = useRef(false);

  useEffect(() => {
    if (!shot) return;
    targetPos.current.set(...shot.position);
    targetLook.current.set(...shot.target);
    easing.current = true;
  }, [shot]);

  useFrame((_, delta) => {
    if (!easing.current) return;
    const t = 1 - Math.pow(0.001, delta);
    camera.position.lerp(targetPos.current, t);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.lerp(targetLook.current, t);
      controls.update();
    }
    if (camera.position.distanceTo(targetPos.current) < 0.008) easing.current = false;
  });

  return null;
}

/**
 * A large, flat, invisible-but-raycastable plane at a fixed height — the
 * thing a drag actually tracks against. Only mounted while something is
 * being dragged (see Director3DScene), so it never intercepts the ordinary
 * "click empty space to deselect" click (that relies on onPointerMissed,
 * which only fires when nothing in the scene was hit).
 */
function DragPlane({ y, onMove }: { y: number; onMove: (point: THREE.Vector3) => void }) {
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} onPointerMove={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onMove(e.point); }}>
      <planeGeometry args={[60, 60]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/**
 * Shows the selected character's movement path (see lib/canvas/director3d.ts's
 * Waypoint) as a line with a draggable marker at each point — dragging a
 * marker moves that one waypoint (via the same DragPlane mechanism as
 * dragging the character itself). Only rendered for the selected character,
 * to keep multi-character scenes readable.
 */
function PathVisual({ character, dragging, onMarkerDragStart }: { character: CharacterState; dragging: boolean; onMarkerDragStart: (index: number) => void }) {
  const sorted = useMemo(() => [...(character.path ?? [])].sort((a, b) => a.t - b.t), [character.path]);
  if (sorted.length < 1) return null;
  const points = sorted.map((w) => new THREE.Vector3(...w.position));

  return (
    <group>
      {points.length >= 2 && <Line points={points} color="#7ff0cd" lineWidth={2} dashed dashScale={8} transparent opacity={0.8} />}
      {sorted.map((wp, i) => (
        <mesh
          key={i}
          position={wp.position}
          onPointerDown={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            onMarkerDragStart(i);
          }}
        >
          <sphereGeometry args={[dragging ? 0.09 : 0.06, 12, 12]} />
          <meshStandardMaterial color="#f0c27f" emissive="#f0c27f" emissiveIntensity={0.4} />
        </mesh>
      ))}
    </group>
  );
}

type DragTarget = { kind: "character"; id: string } | { kind: "waypoint"; characterId: string; index: number };

/**
 * The actual WebGL viewport. `onReady` hands the parent panel the raw
 * canvas element (via preserveDrawingBuffer:true) so it can call
 * `.toDataURL()` on demand for the screenshot capture button — that's the
 * node's real output, so it has to survive being read outside R3F's own
 * render loop.
 */
export default function Director3DScene({
  scene,
  selectedId,
  shot,
  onSelect,
  onReady,
  onPose,
  onDragCharacter,
  onDragWaypoint,
}: {
  scene: Director3DSceneData;
  selectedId: string | null;
  /** a one-shot camera move request from a 運鏡 preset button, or null between clicks */
  shot: ShotRequest | null;
  onSelect: (id: string) => void;
  onReady: (canvas: HTMLCanvasElement) => void;
  /** fires on every camera move (drag, zoom, or an eased 運鏡 preset) — used to track the live pose while 錄製運鏡 is running */
  onPose?: (pose: ShotRequest) => void;
  /** dragging a character across the floor — see DragPlane */
  onDragCharacter?: (id: string, position: [number, number, number]) => void;
  /** dragging one of the selected character's path markers — see PathVisual */
  onDragWaypoint?: (characterId: string, index: number, position: [number, number, number]) => void;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const reportPose = () => {
    const controls = controlsRef.current;
    if (!controls || !onPose) return;
    onPose({ position: controls.object.position.toArray() as [number, number, number], target: controls.target.toArray() as [number, number, number] });
  };

  // Local to the viewport — purely an interaction concern, doesn't need to
  // live in the shared editor state. A global pointerup (not just onPointerUp
  // on some mesh) ends the drag reliably even if the pointer leaves the
  // drag plane's bounds before release.
  const [dragging, setDragging] = useState<DragTarget | null>(null);
  useEffect(() => {
    if (!dragging) return;
    const up = () => setDragging(null);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [dragging]);

  const draggingCharacter = dragging ? scene.characters.find((c) => c.id === (dragging.kind === "character" ? dragging.id : dragging.characterId)) : undefined;
  const selectedCharacter = scene.characters.find((c) => c.id === selectedId);

  const handleDragMove = (point: THREE.Vector3) => {
    if (!dragging) return;
    if (dragging.kind === "character") {
      const y = draggingCharacter?.position[1] ?? 0;
      onDragCharacter?.(dragging.id, [point.x, y, point.z]);
    } else {
      const y = draggingCharacter?.path?.[dragging.index]?.position[1] ?? 0;
      onDragWaypoint?.(dragging.characterId, dragging.index, [point.x, y, point.z]);
    }
  };

  return (
    <Canvas
      shadows
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      camera={{ position: [2.4, 1.8, 3.2], fov: 45 }}
      onCreated={(state) => onReady(state.gl.domElement)}
      onPointerMissed={() => onSelect("")}
    >
      <color attach="background" args={[scene.background.color]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 2]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} />

      {scene.ground.show && (
        <>
          <Grid
            position={[0, scene.ground.height, 0]}
            args={[20, 20]}
            cellColor="#3a3a3a"
            sectionColor="#555"
            fadeDistance={14}
            fadeStrength={1.5}
          />
          <mesh position={[0, scene.ground.height - 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[20, 20]} />
            <meshStandardMaterial color="#202020" transparent opacity={scene.ground.opacity} />
          </mesh>
        </>
      )}

      {scene.characters.map((ch) =>
        ch.bodyStyle === "stick" ? (
          <StickFigure
            key={ch.id}
            character={ch}
            selected={ch.id === selectedId}
            onSelect={() => onSelect(ch.id)}
            onDragStart={() => setDragging({ kind: "character", id: ch.id })}
          />
        ) : (
          <Mannequin
            key={ch.id}
            character={ch}
            selected={ch.id === selectedId}
            onSelect={() => onSelect(ch.id)}
            onDragStart={() => setDragging({ kind: "character", id: ch.id })}
          />
        )
      )}

      {selectedCharacter && (
        <PathVisual
          character={selectedCharacter}
          dragging={!!dragging}
          onMarkerDragStart={(index) => setDragging({ kind: "waypoint", characterId: selectedCharacter.id, index })}
        />
      )}

      {dragging && <DragPlane y={draggingCharacter?.position[1] ?? 0} onMove={handleDragMove} />}

      <CameraRig shot={shot} controlsRef={controlsRef} />
      <OrbitControls ref={controlsRef} makeDefault enabled={!dragging} target={[0, 0.9, 0]} enableDamping dampingFactor={0.15} onChange={reportPose} />
    </Canvas>
  );
}
