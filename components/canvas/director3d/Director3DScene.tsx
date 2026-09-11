"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import Mannequin from "./Mannequin";
import StickFigure from "./StickFigure";
import { samplePathPolyline, type CameraTrack, type CharacterState, type Director3DSceneData } from "@/lib/canvas/director3d";
import { cameraTrackDuration, computeCameraAt, interpolateCameraTrack, type ShotRequest } from "@/lib/canvas/cameraShots";

type Vec3 = [number, number, number];

/**
 * Eases the camera toward a requested position/target over a few frames
 * instead of snapping to it — makes the 運鏡 preset buttons read as an
 * actual camera move rather than a hard cut. Changing `shot`'s identity
 * re-triggers the ease; free dragging (OrbitControls) still works at any
 * time, including mid-ease (it just stops the ease early next frame since
 * the distance check below will already be satisfied from the user's poll).
 * A shot flagged `immediate` (timeline scrubbing) snaps instead.
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
    if (shot.immediate) {
      camera.position.copy(targetPos.current);
      const controls = controlsRef.current;
      if (controls) {
        controls.target.copy(targetLook.current);
        controls.update();
      }
      easing.current = false;
      return;
    }
    easing.current = true;
  }, [shot, camera, controlsRef]);

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
 * Drives the camera along the scene's camera track while the timeline is
 * playing (see useDirector3DEditor's playheadRef — read here each frame
 * rather than pushed through React state, so a 60fps camera move costs no
 * re-renders of its own). Characters are already at their path positions
 * for this frame (the same rAF loop wrote them into `scene`), which is
 * what a follow mode aims at. Does nothing when the track drives nothing,
 * leaving the camera to free orbit as before.
 */
function CameraTrackPlayer({
  scene,
  playing,
  playheadRef,
  controlsRef,
}: {
  scene: Director3DSceneData;
  playing: boolean;
  playheadRef: React.RefObject<number>;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  useFrame(() => {
    if (!playing) return;
    const controls = controlsRef.current;
    const fallback: ShotRequest = {
      position: camera.position.toArray() as Vec3,
      target: (controls ? controls.target.toArray() : [0, 0.9, 0]) as Vec3,
    };
    const pose = computeCameraAt(scene.camera, playheadRef.current ?? 0, scene.characters, fallback);
    if (!pose) return;
    camera.position.set(...pose.position);
    if (controls) {
      controls.target.set(...pose.target);
      controls.update();
    } else {
      camera.lookAt(...pose.target);
    }
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
 * 點擊放置 mode's floor: a click drops a waypoint there, and a ghost marker
 * follows the pointer so you can see the snapped spot before committing.
 * Mounted only while the mode is on. Verified against react-three-fiber's
 * source (2026-09-11): it does NOT suppress onClick after a drag when the
 * pointer is still over the same object — it only exposes the down→up
 * travel as `event.delta` — so an orbit-drag that starts and ends on this
 * (huge) plane would count as a click without the delta check below.
 */
const CLICK_MAX_TRAVEL_PX = 4;
function PlacePlane({ y, snap, onPlace }: { y: number; snap: boolean; onPlace: (point: Vec3) => void }) {
  const [hover, setHover] = useState<Vec3 | null>(null);
  const snapped = (p: THREE.Vector3): Vec3 => {
    const r = (n: number) => (snap ? Math.round(n * 4) / 4 : n);
    return [r(p.x), y, r(p.z)];
  };
  return (
    <group>
      <mesh
        position={[0, y, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHover(snapped(e.point));
        }}
        onPointerLeave={() => setHover(null)}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          if (e.delta > CLICK_MAX_TRAVEL_PX) return; // was an orbit drag, not a click
          onPlace(snapped(e.point));
        }}
      >
        <planeGeometry args={[60, 60]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {hover && (
        <group position={hover}>
          <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.16, 0.2, 32]} />
            <meshBasicMaterial color="#f0c27f" transparent opacity={0.8} />
          </mesh>
          <mesh position={[0, 0.06, 0]}>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshBasicMaterial color="#f0c27f" transparent opacity={0.6} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/**
 * Shows the selected character's movement path (see lib/canvas/director3d.ts's
 * Waypoint) — the exact curve playback follows (samplePathPolyline) plus a
 * numbered marker at each point. Markers: click selects the point (and the
 * matching row in the path tab), press-and-drag moves it (via the same
 * DragPlane mechanism as dragging the character itself). Only rendered for
 * the selected character, to keep multi-character scenes readable.
 */
function PathVisual({
  character,
  dragging,
  selectedIndex,
  onMarkerDragStart,
  onMarkerSelect,
}: {
  character: CharacterState;
  dragging: boolean;
  selectedIndex: number | null;
  onMarkerDragStart: (index: number) => void;
  onMarkerSelect: (index: number) => void;
}) {
  const sorted = useMemo(() => [...(character.path ?? [])].sort((a, b) => a.t - b.t), [character.path]);
  const curve = useMemo(() => samplePathPolyline(sorted, character.pathSmooth !== false).map((p) => new THREE.Vector3(...p)), [sorted, character.pathSmooth]);
  if (sorted.length < 1) return null;

  return (
    <group>
      {curve.length >= 2 && <Line points={curve} color="#7ff0cd" lineWidth={2} dashed dashScale={8} transparent opacity={0.8} />}
      {sorted.map((wp, i) => {
        const active = i === selectedIndex;
        return (
          <group key={i} position={wp.position}>
            <mesh
              onPointerDown={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                onMarkerDragStart(i);
              }}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                if (e.delta > CLICK_MAX_TRAVEL_PX) return; // a marker drag ends here too — that's not a select
                onMarkerSelect(i);
              }}
            >
              <sphereGeometry args={[dragging || active ? 0.09 : 0.06, 12, 12]} />
              <meshStandardMaterial color={active ? "#7ff0cd" : "#f0c27f"} emissive={active ? "#7ff0cd" : "#f0c27f"} emissiveIntensity={0.4} />
            </mesh>
            <Html position={[0, 0.16, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
              <div
                style={{
                  background: active ? "rgba(127,240,205,0.92)" : "rgba(0,0,0,0.7)",
                  color: active ? "#0a1a16" : "#f0c27f",
                  fontSize: 10,
                  lineHeight: "14px",
                  padding: "0 5px",
                  borderRadius: 7,
                  whiteSpace: "nowrap",
                  fontWeight: 600,
                }}
              >
                {i + 1} · {wp.t}s
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

/**
 * The camera track drawn in the viewport: the actual interpolated camera
 * route (sampled through interpolateCameraTrack, so arcs show as arcs) and
 * a little camera body at each keyframe — click one to jump the viewport
 * camera there. Shown only while the 鏡頭 tab is open or the timeline is
 * playing, since it's clutter when posing.
 */
function CameraTrackVisual({ track, onGoto }: { track: CameraTrack; onGoto: (index: number) => void }) {
  const kfs = useMemo(() => [...track.keyframes].sort((a, b) => a.t - b.t), [track.keyframes]);
  const route = useMemo(() => {
    if (kfs.length < 2) return [];
    const duration = cameraTrackDuration(track);
    const steps = Math.max(24, kfs.length * 16);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const p = interpolateCameraTrack(track, (duration * i) / steps);
      if (p) pts.push(new THREE.Vector3(...p.position));
    }
    return pts;
  }, [kfs, track]);
  if (!kfs.length) return null;

  return (
    <group>
      {route.length >= 2 && <Line points={route} color="#8ab4ff" lineWidth={1.5} transparent opacity={0.7} />}
      {kfs.map((kf, i) => {
        const look = new THREE.Vector3(...kf.target).sub(new THREE.Vector3(...kf.position));
        const yaw = Math.atan2(look.x, look.z);
        const pitch = -Math.atan2(look.y, Math.hypot(look.x, look.z));
        return (
          <group key={i} position={kf.position} rotation={[pitch, yaw, 0]}>
            <mesh
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                onGoto(i);
              }}
            >
              <boxGeometry args={[0.16, 0.11, 0.1]} />
              <meshStandardMaterial color="#8ab4ff" emissive="#8ab4ff" emissiveIntensity={0.35} />
            </mesh>
            <mesh position={[0, 0, 0.09]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.05, 0.08, 4, 1, true]} />
              <meshStandardMaterial color="#8ab4ff" transparent opacity={0.7} side={THREE.DoubleSide} />
            </mesh>
            <Html position={[0, 0.12, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
              <div style={{ background: "rgba(0,0,0,0.7)", color: "#8ab4ff", fontSize: 10, lineHeight: "14px", padding: "0 5px", borderRadius: 7, whiteSpace: "nowrap", fontWeight: 600 }}>
                C{i + 1} · {kf.t}s
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

type DragTarget = { kind: "character"; id: string } | { kind: "waypoint"; characterId: string; index: number };

// Hoisted, not an inline literal in the JSX below — real bug found on
// re-audit (2026-09-08): react-three-fiber reconciles a vector-like prop
// (like OrbitControls' `target`) by calling .set(...) whenever the prop
// VALUE it's handed is a new array reference, which `target={[0, 0.9, 0]}`
// inline would be on every single re-render of this component. That fights
// CameraRig's own controls.target.lerp() in its useFrame — most visibly
// during 錄製運鏡／預覽路徑, which re-renders this component via setScene on
// every animation frame (~60fps): the orbit target would get silently
// yanked back to the origin mid-lerp, on top of a 運鏡 preset's intended
// framing. A stable reference makes react-three-fiber skip re-applying it
// after the first render.
const CAMERA_ORBIT_TARGET: [number, number, number] = [0, 0.9, 0];

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
  playing,
  playheadRef,
  placeMode,
  placeSnap,
  selectedWaypoint,
  showCameraTrack,
  hideGuides,
  onSelect,
  onReady,
  onPose,
  onDragCharacter,
  onDragWaypoint,
  onSelectWaypoint,
  onPlacePoint,
  onGotoCameraKeyframe,
}: {
  scene: Director3DSceneData;
  selectedId: string | null;
  /** a one-shot camera move request from a 運鏡 preset button, or null between clicks */
  shot: ShotRequest | null;
  /** timeline playback running — the camera track (if any) takes over the camera, see CameraTrackPlayer */
  playing: boolean;
  playheadRef: React.RefObject<number>;
  /** 點擊放置 path mode — see PlacePlane */
  placeMode: boolean;
  placeSnap: boolean;
  selectedWaypoint: number | null;
  showCameraTrack: boolean;
  /** 錄製中 — path/camera guides are editing aids, not something the recorded reference clip should contain */
  hideGuides?: boolean;
  onSelect: (id: string) => void;
  onReady: (canvas: HTMLCanvasElement) => void;
  /** fires on every camera move (drag, zoom, or an eased 運鏡 preset) — used to track the live pose while 錄製運鏡 is running */
  onPose?: (pose: ShotRequest) => void;
  /** dragging a character across the floor — see DragPlane */
  onDragCharacter?: (id: string, position: [number, number, number]) => void;
  /** dragging one of the selected character's path markers — see PathVisual */
  onDragWaypoint?: (characterId: string, index: number, position: [number, number, number]) => void;
  onSelectWaypoint?: (index: number) => void;
  onPlacePoint?: (point: Vec3) => void;
  onGotoCameraKeyframe?: (index: number) => void;
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
  const cameraDriven = playing && !!(scene.camera?.keyframes.length || scene.camera?.follow);

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
      onPointerMissed={() => {
        if (!placeMode) onSelect("");
      }}
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

      {selectedCharacter && !hideGuides && (
        <PathVisual
          character={selectedCharacter}
          dragging={!!dragging}
          selectedIndex={selectedWaypoint}
          onMarkerDragStart={(index) => setDragging({ kind: "waypoint", characterId: selectedCharacter.id, index })}
          onMarkerSelect={(index) => onSelectWaypoint?.(index)}
        />
      )}

      {showCameraTrack && !hideGuides && scene.camera && <CameraTrackVisual track={scene.camera} onGoto={(i) => onGotoCameraKeyframe?.(i)} />}

      {dragging && <DragPlane y={draggingCharacter?.position[1] ?? 0} onMove={handleDragMove} />}
      {placeMode && !dragging && selectedCharacter && (
        <PlacePlane y={selectedCharacter.position[1]} snap={placeSnap} onPlace={(p) => onPlacePoint?.(p)} />
      )}

      <CameraRig shot={shot} controlsRef={controlsRef} />
      <CameraTrackPlayer scene={scene} playing={playing} playheadRef={playheadRef} controlsRef={controlsRef} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enabled={!dragging && !cameraDriven}
        target={CAMERA_ORBIT_TARGET}
        enableDamping
        dampingFactor={0.15}
        onChange={reportPose}
      />
    </Canvas>
  );
}
