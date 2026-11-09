"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Grid,
  Html,
  OrbitControls,
} from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useLiveryStore } from "@/store/useLiveryStore";
import { buildSlingTsiGeometry } from "@/engine/slingTsiGeometry";
import { renderCompositedLiveryTextures } from "@/engine/liveryCompositor";
import { FINISH_PRESETS } from "@/data/aviationCatalog";
import { CameraViewPreset, EnvironmentPresetId } from "@/types/livery";

const ENV_CONFIG: Record<
  EnvironmentPresetId,
  {
    bg: string;
    ambientIntensity: number;
    keyColor: string;
    keyIntensity: number;
    fillColor: string;
    rimColor: string;
    preset: "city" | "warehouse" | "sunset" | "dawn" | "studio";
  }
> = {
  HANGAR_STUDIO: {
    bg: "#0B1120",
    ambientIntensity: 0.75,
    keyColor: "#F8FAFC",
    keyIntensity: 2.2,
    fillColor: "#93C5FD",
    rimColor: "#E2E8F0",
    preset: "studio",
  },
  SUNNY_TARMAC: {
    bg: "#0F172A",
    ambientIntensity: 0.95,
    keyColor: "#FEF9C3",
    keyIntensity: 2.8,
    fillColor: "#38BDF8",
    rimColor: "#FFFFFF",
    preset: "city",
  },
  GOLDEN_HOUR: {
    bg: "#18101C",
    ambientIntensity: 0.7,
    keyColor: "#FDBA74",
    keyIntensity: 2.6,
    fillColor: "#818CF8",
    rimColor: "#FCA5A5",
    preset: "sunset",
  },
  ALPINE_FLIGHT: {
    bg: "#0C192C",
    ambientIntensity: 0.9,
    keyColor: "#FFFFFF",
    keyIntensity: 2.5,
    fillColor: "#7DD3FC",
    rimColor: "#BAE6FD",
    preset: "dawn",
  },
  DARK_SHOWROOM: {
    bg: "#05070B",
    ambientIntensity: 0.5,
    keyColor: "#E2E8F0",
    keyIntensity: 2.4,
    fillColor: "#334155",
    rimColor: "#F97316",
    preset: "warehouse",
  },
};

function CameraController({
  cameraPreset,
}: {
  cameraPreset: CameraViewPreset;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    if (!controlsRef.current) return;
    const target = new THREE.Vector3(0, 0, 0);
    let pos = new THREE.Vector3(-4.8, 2.2, 6.8);

    switch (cameraPreset) {
      case "HERO_3_4":
        pos = new THREE.Vector3(-5.2, 2.1, 6.4);
        break;
      case "LEFT_PROFILE":
        pos = new THREE.Vector3(0, 0.2, 9.2);
        break;
      case "RIGHT_PROFILE":
        pos = new THREE.Vector3(0, 0.2, -9.2);
        break;
      case "TOP_PLANFORM":
        pos = new THREE.Vector3(0, 10.5, 0.01);
        break;
      case "BOTTOM_VIEW":
        pos = new THREE.Vector3(0, -10.5, 0.01);
        break;
      case "FRONT_VIEW":
        pos = new THREE.Vector3(-8.8, 0.4, 0);
        break;
      case "TAIL_CLOSEUP":
        pos = new THREE.Vector3(2.4, 0.65, 3.6);
        target.set(2.0, 0.35, 0);
        break;
      case "FREE_ORBIT":
      default:
        return;
    }

    camera.position.copy(pos);
    controlsRef.current.target.copy(target);
    controlsRef.current.update();
  }, [cameraPreset, camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.07}
      minDistance={2.2}
      maxDistance={24}
      maxPolarAngle={Math.PI * 0.85}
    />
  );
}

function SlingTsiAircraftMesh({
  showDimensionCallouts,
  onInspectStation,
}: {
  showDimensionCallouts: boolean;
  onInspectStation: (info: { xM: number; yM: number; zM: number } | null) => void;
}) {
  const calibration = useLiveryStore((s) => s.calibration);
  const zones = useLiveryStore((s) => s.zones);
  const stripes = useLiveryStore((s) => s.stripes);
  const registration = useLiveryStore((s) => s.registration);
  const decals = useLiveryStore((s) => s.decals);
  const textureRevision = useLiveryStore((s) => s.textureRevision);

  const propRef = useRef<THREE.Mesh>(null);
  const [spinPropeller, setSpinPropeller] = useState(false);

  // Build parametric Sling TSi geometry whenever calibration changes
  const meshParts = useMemo(
    () => buildSlingTsiGeometry(calibration),
    [calibration]
  );

  // Render composite 2K/4K PBR textures whenever livery layers or calibration change
  const textures = useMemo(() => {
    void textureRevision;
    return renderCompositedLiveryTextures(
      calibration,
      zones,
      stripes,
      registration,
      decals,
      2048
    );
  }, [calibration, zones, stripes, registration, decals, textureRevision]);

  useFrame((_, delta) => {
    if (spinPropeller && propRef.current) {
      propRef.current.rotation.x += delta * 18;
    }
  });

  const wingFinish =
    FINISH_PRESETS[zones.wingBase.finish] || FINISH_PRESETS.HIGH_GLOSS;
  const wingtipFinish =
    FINISH_PRESETS[zones.wingtips.finish] || FINISH_PRESETS.HIGH_GLOSS;
  const spatFinish =
    FINISH_PRESETS[zones.wheelPants.finish] || FINISH_PRESETS.HIGH_GLOSS;
  const spinnerFinish =
    FINISH_PRESETS[zones.spinner.finish] || FINISH_PRESETS.POLISHED_CHROME;

  return (
    <group
      onPointerMove={(e) => {
        e.stopPropagation();
        const pt = e.point;
        const xFromNose = pt.x - meshParts.bounds.xMin;
        onInspectStation({
          xM: Math.max(0, xFromNose),
          yM: pt.y - meshParts.bounds.yMin,
          zM: pt.z,
        });
      }}
      onPointerOut={() => onInspectStation(null)}
    >
      {/* 1. Fuselage + Swept Vertical Stabilizer + Dorsal Fin (Unified Orthographic UV Map) */}
      <mesh
        geometry={meshParts.fuselageAndTailGeo}
        castShadow
        receiveShadow
      >
        <meshPhysicalMaterial
          map={textures.fuselageAlbedo}
          roughnessMap={textures.fuselageRoughness}
          metalnessMap={textures.fuselageMetalness}
          bumpMap={textures.fuselageBump}
          bumpScale={calibration.showPanelLinesAndRivets ? 0.006 : 0}
          roughness={1.0}
          metalness={1.0}
          clearcoat={0.95}
          clearcoatRoughness={0.04}
          envMapIntensity={1.35}
        />
      </mesh>

      {/* 2. Protected Bubble Canopy Tinted Acrylic Glass */}
      <mesh geometry={meshParts.canopyGlassGeo}>
        <meshPhysicalMaterial
          color="#1E293B"
          transparent
          opacity={0.42 + calibration.canopyTint * 0.45}
          roughness={0.04}
          metalness={0.12}
          clearcoat={1.0}
          clearcoatRoughness={0.02}
          envMapIntensity={1.8}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 3. Main Low-Wing Airfoil */}
      <mesh geometry={meshParts.wingMainGeo} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={zones.wingBase.colorHex}
          roughness={wingFinish.roughness}
          metalness={wingFinish.metalness}
          clearcoat={wingFinish.clearcoat}
          clearcoatRoughness={wingFinish.clearcoatRoughness}
          envMapIntensity={1.3}
        />
      </mesh>

      {/* 4. Swept Upturned Composite Wingtips */}
      <mesh geometry={meshParts.wingtipsGeo} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={zones.wingtips.colorHex}
          roughness={wingtipFinish.roughness}
          metalness={wingtipFinish.metalness}
          clearcoat={wingtipFinish.clearcoat}
          clearcoatRoughness={wingtipFinish.clearcoatRoughness}
          envMapIntensity={1.35}
        />
      </mesh>

      {/* 5. Horizontal Stabilizer & Elevator */}
      <mesh geometry={meshParts.horizontalStabGeo} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={zones.wingBase.colorHex}
          roughness={wingFinish.roughness}
          metalness={wingFinish.metalness}
          clearcoat={wingFinish.clearcoat}
          clearcoatRoughness={wingFinish.clearcoatRoughness}
          envMapIntensity={1.25}
        />
      </mesh>

      {/* 6. Aerodynamic Teardrop Wheel Fairings (Wheel Pants / Spats) */}
      {calibration.wheelPantsInstalled && (
        <mesh geometry={meshParts.wheelPantsGeo} castShadow receiveShadow>
          <meshPhysicalMaterial
            map={textures.wheelPantsAlbedo}
            roughness={spatFinish.roughness}
            metalness={spatFinish.metalness}
            clearcoat={spatFinish.clearcoat}
            clearcoatRoughness={spatFinish.clearcoatRoughness}
            envMapIntensity={1.3}
          />
        </mesh>
      )}

      {/* 7. Spinner Cone */}
      <mesh
        geometry={meshParts.spinnerGeo}
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          setSpinPropeller((v) => !v);
        }}
      >
        <meshPhysicalMaterial
          color={zones.spinner.colorHex}
          roughness={spinnerFinish.roughness}
          metalness={spinnerFinish.metalness}
          clearcoat={spinnerFinish.clearcoat}
          clearcoatRoughness={spinnerFinish.clearcoatRoughness}
          envMapIntensity={1.6}
        />
      </mesh>

      {/* 8. Protected 3-Blade Scimitar Constant-Speed Propeller */}
      <mesh ref={propRef} geometry={meshParts.propellerBladesGeo} castShadow>
        <meshStandardMaterial
          color="#18181B"
          roughness={0.35}
          metalness={0.25}
        />
      </mesh>

      {/* 9. Protected Landing Gear Struts & Tires */}
      <mesh geometry={meshParts.gearStrutsAndTiresGeo} castShadow>
        <meshStandardMaterial
          color="#1E293B"
          roughness={0.75}
          metalness={0.2}
        />
      </mesh>

      {/* 10. Cockpit Glare-shield & 4 Ergonomic Seats */}
      <mesh geometry={meshParts.cockpitInteriorGeo}>
        <meshStandardMaterial
          color="#1E2430"
          roughness={0.65}
          metalness={0.08}
        />
      </mesh>

      {/* Optional 3D Dimension Callouts Floating in Hangar */}
      {showDimensionCallouts && (
        <group>
          <Html
            position={[0, meshParts.bounds.yMin - 0.15, meshParts.bounds.zMax + 0.35]}
            center
          >
            <div className="px-2.5 py-1 rounded bg-slate-900/90 border border-sky-500/50 text-[11px] font-mono text-sky-300 whitespace-nowrap shadow-lg">
              Length: {calibration.lengthM.toFixed(3)}m ({(calibration.lengthM * 3.28084).toFixed(2)}ft)
            </div>
          </Html>
          <Html
            position={[meshParts.bounds.xMin + 2.2, 0.1, meshParts.bounds.zMax + 0.25]}
            center
          >
            <div className="px-2.5 py-1 rounded bg-slate-900/90 border border-amber-500/50 text-[11px] font-mono text-amber-300 whitespace-nowrap shadow-lg">
              Wingspan: {calibration.wingspanM.toFixed(2)}m ({(calibration.wingspanM * 3.28084).toFixed(2)}ft)
            </div>
          </Html>
          <Html
            position={[meshParts.bounds.xMax - 0.25, meshParts.bounds.yMax + 0.25, 0]}
            center
          >
            <div className="px-2.5 py-1 rounded bg-slate-900/90 border border-emerald-500/50 text-[11px] font-mono text-emerald-300 whitespace-nowrap shadow-lg">
              Height: {calibration.heightM.toFixed(2)}m | Reg: {registration.text} ({registration.heightInches}&quot;)
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}

export default function SlingTsiViewport3D({
  onCanvasReady,
}: {
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}) {
  const environmentPreset = useLiveryStore((s) => s.environmentPreset);
  const cameraPreset = useLiveryStore((s) => s.cameraPreset);
  const calibration = useLiveryStore((s) => s.calibration);

  const [showDimensions, setShowDimensions] = useState(true);
  const [hoverStation, setHoverStation] = useState<{
    xM: number;
    yM: number;
    zM: number;
  } | null>(null);

  const env = ENV_CONFIG[environmentPreset] || ENV_CONFIG.HANGAR_STUDIO;

  return (
    <div className="relative w-full h-full select-none overflow-hidden">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{
          preserveDrawingBuffer: true,
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.15,
        }}
        camera={{ position: [-5.2, 2.1, 6.4], fov: 36, near: 0.1, far: 100 }}
        onCreated={({ gl }) => {
          if (onCanvasReady) {
            onCanvasReady(gl.domElement);
          }
        }}
      >
        <color attach="background" args={[env.bg]} />

        <ambientLight intensity={env.ambientIntensity} />
        <directionalLight
          position={[-6, 9, 7]}
          intensity={env.keyIntensity}
          color={env.keyColor}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <directionalLight
          position={[7, 5, -6]}
          intensity={1.1}
          color={env.fillColor}
        />
        <directionalLight
          position={[2, -4, 5]}
          intensity={0.65}
          color={env.rimColor}
        />

        <Environment preset={env.preset} />

        <SlingTsiAircraftMesh
          showDimensionCallouts={showDimensions}
          onInspectStation={setHoverStation}
        />

        <ContactShadows
          position={[0, -calibration.heightM * 0.44 - 0.01, 0]}
          opacity={0.55}
          scale={16}
          blur={2.2}
          far={4}
        />

        <Grid
          position={[0, -calibration.heightM * 0.44 - 0.02, 0]}
          args={[24, 24]}
          cellSize={1}
          cellThickness={0.6}
          cellColor="#1E293B"
          sectionSize={5}
          sectionThickness={1.2}
          sectionColor="#334155"
          fadeDistance={22}
          fadeStrength={1}
        />

        <CameraController cameraPreset={cameraPreset} />
      </Canvas>

      {/* Top-Left Live Datum & Dimension HUD */}
      <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/85 backdrop-blur-md border border-slate-700/80 text-xs text-slate-200 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold tracking-wide">
            {calibration.aircraftName}
          </span>
          <span className="text-slate-400">|</span>
          <span className="font-mono text-[11px] text-sky-400">
            {calibration.wingspanM}m × {calibration.lengthM}m ×{" "}
            {calibration.heightM}m
          </span>
        </div>

        {hoverStation && (
          <div className="px-3 py-1 rounded-md bg-slate-950/90 border border-sky-500/40 font-mono text-[11px] text-sky-300 shadow">
            Datum Station X: {hoverStation.xM.toFixed(2)}m (
            {(hoverStation.xM * 39.3701).toFixed(1)}&quot;) | WL Y:{" "}
            {hoverStation.yM.toFixed(2)}m | BL Z: {hoverStation.zM.toFixed(2)}m
          </div>
        )}
      </div>

      {/* Bottom-Left Quick Toggle for 3D Dimension Callouts */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowDimensions((v) => !v)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
            showDimensions
              ? "bg-sky-500/20 border-sky-500/60 text-sky-300"
              : "bg-slate-900/80 border-slate-700 text-slate-400 hover:text-slate-200"
          }`}
        >
          {showDimensions ? "✓ 3D Dimensions On" : "3D Dimensions Off"}
        </button>
        <div className="px-2.5 py-1.5 rounded-lg bg-slate-900/75 border border-slate-800 text-[11px] text-slate-400 hidden sm:block">
          Tip: Click spinner to toggle prop rotation • Drag to orbit • Scroll to zoom
        </div>
      </div>
    </div>
  );
}
