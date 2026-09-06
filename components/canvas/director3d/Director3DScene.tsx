"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import Mannequin from "./Mannequin";
import type { Director3DSceneData } from "@/lib/canvas/director3d";

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
  onSelect,
  onReady,
}: {
  scene: Director3DSceneData;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReady: (canvas: HTMLCanvasElement) => void;
}) {
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

      {scene.characters.map((ch) => (
        <Mannequin key={ch.id} character={ch} selected={ch.id === selectedId} onSelect={() => onSelect(ch.id)} />
      ))}

      <OrbitControls makeDefault target={[0, 0.9, 0]} enableDamping dampingFactor={0.15} />
    </Canvas>
  );
}
