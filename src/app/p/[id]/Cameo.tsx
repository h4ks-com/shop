"use client";

// R3F extends JSX with three.js elements (ambientLight, primitive, etc.) and
// uses props (intensity, position, object) the React plugin doesn't recognise.
/* eslint-disable react/no-unknown-property */
import { Canvas, useFrame } from "@react-three/fiber";
import { Bounds, Center, useAnimations, useGLTF } from "@react-three/drei";
import { Component, Suspense, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import type { Cameo } from "@/lib/cameos";

const DEFAULT_MIN_MS = 10000;
const DEFAULT_MAX_MS = 18000;
const DEFAULT_CAMERA: [number, number, number] = [0, 1, 4];
const DEFAULT_FOV = 35;
const DEFAULT_W = 280;
const DEFAULT_H = 420;
// Padding multiplier around the model's bounding box. Larger = character
// appears smaller but has more room for animated movement (dancing).
const FIT_MARGIN = 1.6;
// How much of a full turn the mouse covers (radians). PI = 180° each side
// → sweeping the whole window does one full 360° spin.
const MOUSE_TURN_RANGE = Math.PI;
// Higher = snappier follow, lower = smoother. 5 ≈ ~80%/s closure.
const MOUSE_TURN_LERP = 5;

function Figure({
  glbUrl,
  minDurationMs,
  maxDurationMs,
}: {
  glbUrl: string;
  minDurationMs: number;
  maxDurationMs: number;
}) {
  // Outer group: mouse-driven Y rotation. Inner ref: animation target.
  // Wrapping in a parent group lets the dance animation rotate freely inside
  // a frame we control externally — the two rotations compose naturally.
  const outerRef = useRef<THREE.Group>(null);
  const sceneRef = useRef<THREE.Group>(null);
  const gltf = useGLTF(glbUrl);
  const { actions, names } = useAnimations(gltf.animations, sceneRef);
  const [current, setCurrent] = useState<string | null>(null);

  const targetY = useRef(0);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1; // -1..+1
      targetY.current = nx * MOUSE_TURN_RANGE;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useFrame((_, delta) => {
    if (!outerRef.current) return;
    const cur = outerRef.current.rotation.y;
    const t = Math.min(1, delta * MOUSE_TURN_LERP);
    outerRef.current.rotation.y = cur + (targetY.current - cur) * t;
  });

  useEffect(() => {
    if (names.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pickNext = () => {
      const pool = names.length > 1 ? names.filter((n) => n !== current) : names;
      const next = pool[Math.floor(Math.random() * pool.length)];
      const nextAction = actions[next];
      if (!nextAction) return;
      // Hard cut between clips: stop the previous action entirely before
      // starting the next so the mixer only ever evaluates one at a time.
      if (current) actions[current]?.stop();
      nextAction.reset().play();
      setCurrent(next);
      const clipMs = nextAction.getClip().duration * 1000;
      const minLoops = Math.max(1, Math.ceil(minDurationMs / clipMs));
      const canAddLoop = (minLoops + 1) * clipMs <= maxDurationMs;
      const loops = canAddLoop && Math.random() < 0.5 ? minLoops + 1 : minLoops;
      timer = setTimeout(pickNext, loops * clipMs);
    };
    pickNext();
    return () => {
      if (timer) clearTimeout(timer);
    };
    // current is intentionally excluded — re-running on every swap would
    // restart the cycle. names/actions/url are the only real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names, actions, glbUrl, minDurationMs, maxDurationMs]);

  return (
    <group ref={outerRef}>
      <primitive ref={sceneRef} object={gltf.scene} />
    </group>
  );
}

// Catches WebGL/asset failures so a render hiccup never affects the page.
class SilentBoundary extends Component<{ children: ReactNode }, { dead: boolean }> {
  state = { dead: false };
  static getDerivedStateFromError() {
    return { dead: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("[cameo] disabled after error:", err);
  }
  render() {
    return this.state.dead ? null : this.props.children;
  }
}

export default function CameoStage({ cameo }: { cameo: Cameo }) {
  const min = cameo.minDurationMs ?? DEFAULT_MIN_MS;
  const max = cameo.maxDurationMs ?? DEFAULT_MAX_MS;
  const camera = cameo.cameraPosition ?? DEFAULT_CAMERA;
  const fov = cameo.cameraFov ?? DEFAULT_FOV;
  const w = cameo.widthPx ?? DEFAULT_W;
  const h = cameo.heightPx ?? DEFAULT_H;

  return (
    <div
      className="hidden min-[1500px]:block fixed bottom-0 pointer-events-none z-40"
      // Anchor the box to the gutter outside the 1280px content container so
      // the character sits in empty space, not over the page content. Falls
      // back to 0 when there's no gutter (covered by the breakpoint anyway).
      style={{
        width: w,
        height: h,
        right: "max(0px, calc((100vw - 1280px) / 2 - " + w + "px))",
      }}
      aria-hidden="true"
    >
      <SilentBoundary>
        <Canvas
          gl={{ alpha: true, antialias: true }}
          camera={{ position: camera, fov }}
          dpr={[1, 2]}
          style={{ background: "transparent" }}
        >
          <ambientLight intensity={0.7} />
          <directionalLight position={[5, 5, 5]} intensity={1} />
          <Suspense fallback={null}>
            <Bounds fit clip observe margin={FIT_MARGIN}>
              <Center>
                <Figure glbUrl={cameo.glbUrl} minDurationMs={min} maxDurationMs={max} />
              </Center>
            </Bounds>
          </Suspense>
        </Canvas>
      </SilentBoundary>
    </div>
  );
}
