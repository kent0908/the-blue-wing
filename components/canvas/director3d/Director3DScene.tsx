"use client";

import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import Mannequin from "./Mannequin";
import StickFigure from "./StickFigure";
import type { Director3DSceneData } from "@/lib/canvas/director3d";
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
}: {
  scene: Director3DSceneData;
  selectedId: string | null;
  /** a one-shot camera move request from a 運鏡 preset button, or null between clicks */
  shot: ShotRequest | null;
  onSelect: (id: string) => void;
  onReady: (canvas: HTMLCanvasElement) => void;
  /** fires on every camera move (drag, zoom, or an eased 運鏡 preset) — used to track the live pose while 錄製運鏡 is running */
  onPose?: (pose: ShotRequest) => void;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const reportPose = () => {
    const controls = controlsRef.current;
    if (!controls || !onPose) return;
    onPose({ position: controls.object.position.toArray() as [number, number, number], target: controls.target.toArray() as [number, number, number] });
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
          <StickFigure key={ch.id} character={ch} selected={ch.id === selectedId} onSelect={() => onSelect(ch.id)} />
        ) : (
          <Mannequin key={ch.id} character={ch} selected={ch.id === selectedId} onSelect={() => onSelect(ch.id)} />
        )
      )}

      <CameraRig shot={shot} controlsRef={controlsRef} />
      <OrbitControls ref={controlsRef} makeDefault target={[0, 0.9, 0]} enableDamping dampingFactor={0.15} onChange={reportPose} />
    </Canvas>
  );
}
