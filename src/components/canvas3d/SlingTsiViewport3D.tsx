"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useLiveryStore } from "@/store/useLiveryStore";
import { buildSlingTsiGeometry } from "@/engine/slingTsiGeometry";
import { renderCompositedLiveryTextures } from "@/engine/liveryCompositor";
import { FINISH_PRESETS } from "@/data/aviationCatalog";
import { EnvironmentPresetId } from "@/types/livery";

const ENV_CONFIG: Record<
  EnvironmentPresetId,
  {
    bg: string;
    ambientColor: string;
    ambientIntensity: number;
    keyColor: string;
    keyIntensity: number;
    fillColor: string;
    fillIntensity: number;
    rimColor: string;
    rimIntensity: number;
    exposure: number;
  }
> = {
  HANGAR_STUDIO: {
    bg: "#0B1120",
    ambientColor: "#E2E8F0",
    ambientIntensity: 0.85,
    keyColor: "#FFFFFF",
    keyIntensity: 2.6,
    fillColor: "#93C5FD",
    fillIntensity: 1.25,
    rimColor: "#E2E8F0",
    rimIntensity: 0.9,
    exposure: 1.15,
  },
  SUNNY_TARMAC: {
    bg: "#0F172A",
    ambientColor: "#F8FAFC",
    ambientIntensity: 1.05,
    keyColor: "#FEF9C3",
    keyIntensity: 3.2,
    fillColor: "#38BDF8",
    fillIntensity: 1.4,
    rimColor: "#FFFFFF",
    rimIntensity: 1.0,
    exposure: 1.25,
  },
  GOLDEN_HOUR: {
    bg: "#18101C",
    ambientColor: "#FDE68A",
    ambientIntensity: 0.75,
    keyColor: "#FDBA74",
    keyIntensity: 3.0,
    fillColor: "#818CF8",
    fillIntensity: 1.1,
    rimColor: "#FCA5A5",
    rimIntensity: 1.2,
    exposure: 1.18,
  },
  ALPINE_FLIGHT: {
    bg: "#0C192C",
    ambientColor: "#E0F2FE",
    ambientIntensity: 1.0,
    keyColor: "#FFFFFF",
    keyIntensity: 2.9,
    fillColor: "#7DD3FC",
    fillIntensity: 1.5,
    rimColor: "#BAE6FD",
    rimIntensity: 1.0,
    exposure: 1.22,
  },
  DARK_SHOWROOM: {
    bg: "#05070B",
    ambientColor: "#94A3B8",
    ambientIntensity: 0.55,
    keyColor: "#F8FAFC",
    keyIntensity: 2.8,
    fillColor: "#334155",
    fillIntensity: 0.9,
    rimColor: "#F97316",
    rimIntensity: 1.3,
    exposure: 1.08,
  },
};

export default function SlingTsiViewport3D({
  onCanvasReady,
}: {
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}) {
  const environmentPreset = useLiveryStore((s) => s.environmentPreset);
  const cameraPreset = useLiveryStore((s) => s.cameraPreset);
  const calibration = useLiveryStore((s) => s.calibration);
  const zones = useLiveryStore((s) => s.zones);
  const stripes = useLiveryStore((s) => s.stripes);
  const registration = useLiveryStore((s) => s.registration);
  const decals = useLiveryStore((s) => s.decals);
  const textureRevision = useLiveryStore((s) => s.textureRevision);

  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const aircraftGroupRef = useRef<THREE.Group | null>(null);
  const propMeshRef = useRef<THREE.Mesh | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const shadowPlaneRef = useRef<THREE.Mesh | null>(null);

  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const fillLightRef = useRef<THREE.DirectionalLight | null>(null);
  const rimLightRef = useRef<THREE.DirectionalLight | null>(null);

  const spinPropRef = useRef<boolean>(false);
  const [spinPropeller, setSpinPropeller] = useState(false);
  const [showDimensions, setShowDimensions] = useState(true);
  const [hoverStation, setHoverStation] = useState<{
    xM: number;
    yM: number;
    zM: number;
  } | null>(null);

  // Build parametric Sling TSi geometry whenever calibration changes
  const meshParts = useMemo(
    () => buildSlingTsiGeometry(calibration),
    [calibration]
  );

  // Render composite 2K PBR textures whenever livery layers or calibration change
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

  // 1. Initialize Three.js WebGLRenderer, PMREM Studio Environment, Lights & OrbitControls
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 960;
    const height = container.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0B1120");
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 120);
    camera.position.set(-5.2, 2.1, 6.4);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    rendererRef.current = renderer;

    // Clear any existing canvas and mount
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    if (onCanvasReady) {
      onCanvasReady(renderer.domElement);
    }

    // Generate offline-ready procedural studio reflection environment map (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    // Studio & Hangar Lights
    const ambientLight = new THREE.AmbientLight("#E2E8F0", 0.85);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const keyLight = new THREE.DirectionalLight("#FFFFFF", 2.6);
    keyLight.position.set(-6, 9, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 25;
    const d = 6.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);
    keyLightRef.current = keyLight;

    const fillLight = new THREE.DirectionalLight("#93C5FD", 1.25);
    fillLight.position.set(7, 5, -6);
    scene.add(fillLight);
    fillLightRef.current = fillLight;

    const rimLight = new THREE.DirectionalLight("#E2E8F0", 0.9);
    rimLight.position.set(2, -4, 5);
    scene.add(rimLight);
    rimLightRef.current = rimLight;

    // Hangar Floor Reference Grid
    const grid = new THREE.GridHelper(24, 24, "#334155", "#1E293B");
    grid.position.y = -1.1;
    scene.add(grid);
    gridHelperRef.current = grid;

    // Soft Shadow Receiver Floor Plane
    const shadowGeo = new THREE.PlaneGeometry(24, 24);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.42 });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.position.y = -1.095;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);
    shadowPlaneRef.current = shadowPlane;

    // Aircraft Root Group
    const aircraftGroup = new THREE.Group();
    scene.add(aircraftGroup);
    aircraftGroupRef.current = aircraftGroup;

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 2.2;
    controls.maxDistance = 24;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.target.set(0, 0, 0);
    controls.update();
    controlsRef.current = controls;

    // Animation Loop
    let animFrameId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      if (spinPropRef.current && propMeshRef.current) {
        propMeshRef.current.rotation.x += delta * 18;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // ResizeObserver for responsive container sizing
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animFrameId);
      resizeObserver.disconnect();
      controls.dispose();
      pmremGenerator.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, [onCanvasReady]);

  // 2. Rebuild / Update Aircraft Meshes & PBR Materials when geometry, zones, or textures change
  useEffect(() => {
    const group = aircraftGroupRef.current;
    if (!group) return;

    // Clear previous meshes cleanly
    while (group.children.length > 0) {
      const child = group.children[0] as THREE.Mesh;
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
      group.remove(child);
    }

    const wingFinish =
      FINISH_PRESETS[zones.wingBase.finish] || FINISH_PRESETS.HIGH_GLOSS;
    const wingtipFinish =
      FINISH_PRESETS[zones.wingtips.finish] || FINISH_PRESETS.HIGH_GLOSS;
    const spatFinish =
      FINISH_PRESETS[zones.wheelPants.finish] || FINISH_PRESETS.HIGH_GLOSS;
    const spinnerFinish =
      FINISH_PRESETS[zones.spinner.finish] || FINISH_PRESETS.POLISHED_CHROME;

    // 1. Fuselage + Swept Vertical Tail + Dorsal Fin
    const fusMat = new THREE.MeshPhysicalMaterial({
      map: textures.fuselageAlbedo,
      roughnessMap: textures.fuselageRoughness,
      metalnessMap: textures.fuselageMetalness,
      bumpMap: textures.fuselageBump,
      bumpScale: calibration.showPanelLinesAndRivets ? 0.006 : 0,
      roughness: 1.0,
      metalness: 1.0,
      clearcoat: 0.95,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.35,
    });
    const fusMesh = new THREE.Mesh(meshParts.fuselageAndTailGeo, fusMat);
    fusMesh.castShadow = true;
    fusMesh.receiveShadow = true;
    fusMesh.name = "fuselage";
    group.add(fusMesh);

    // 2. Protected Bubble Canopy Glass
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#1E293B"),
      transparent: true,
      opacity: 0.42 + calibration.canopyTint * 0.45,
      roughness: 0.04,
      metalness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      envMapIntensity: 1.8,
      side: THREE.DoubleSide,
    });
    const glassMesh = new THREE.Mesh(meshParts.canopyGlassGeo, glassMat);
    glassMesh.name = "canopyGlass";
    group.add(glassMesh);

    // 3. Main Low-Wing
    const wingMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(zones.wingBase.colorHex),
      roughness: wingFinish.roughness,
      metalness: wingFinish.metalness,
      clearcoat: wingFinish.clearcoat,
      clearcoatRoughness: wingFinish.clearcoatRoughness,
      envMapIntensity: 1.3,
    });
    const wingMesh = new THREE.Mesh(meshParts.wingMainGeo, wingMat);
    wingMesh.castShadow = true;
    wingMesh.receiveShadow = true;
    wingMesh.name = "wingMain";
    group.add(wingMesh);

    // 4. Swept Upturned Composite Wingtips
    const wingtipMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(zones.wingtips.colorHex),
      roughness: wingtipFinish.roughness,
      metalness: wingtipFinish.metalness,
      clearcoat: wingtipFinish.clearcoat,
      clearcoatRoughness: wingtipFinish.clearcoatRoughness,
      envMapIntensity: 1.35,
    });
    const wingtipMesh = new THREE.Mesh(meshParts.wingtipsGeo, wingtipMat);
    wingtipMesh.castShadow = true;
    wingtipMesh.receiveShadow = true;
    wingtipMesh.name = "wingtips";
    group.add(wingtipMesh);

    // 5. Horizontal Stabilizer
    const hStabMesh = new THREE.Mesh(
      meshParts.horizontalStabGeo,
      wingMat.clone()
    );
    hStabMesh.castShadow = true;
    hStabMesh.receiveShadow = true;
    hStabMesh.name = "horizontalStab";
    group.add(hStabMesh);

    // 6. Aerodynamic Teardrop Wheel Pants (Spats)
    if (calibration.wheelPantsInstalled) {
      const spatMat = new THREE.MeshPhysicalMaterial({
        map: textures.wheelPantsAlbedo,
        roughness: spatFinish.roughness,
        metalness: spatFinish.metalness,
        clearcoat: spatFinish.clearcoat,
        clearcoatRoughness: spatFinish.clearcoatRoughness,
        envMapIntensity: 1.3,
      });
      const spatMesh = new THREE.Mesh(meshParts.wheelPantsGeo, spatMat);
      spatMesh.castShadow = true;
      spatMesh.receiveShadow = true;
      spatMesh.name = "wheelPants";
      group.add(spatMesh);
    }

    // 7. Spinner Cone
    const spinnerMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(zones.spinner.colorHex),
      roughness: spinnerFinish.roughness,
      metalness: spinnerFinish.metalness,
      clearcoat: spinnerFinish.clearcoat,
      clearcoatRoughness: spinnerFinish.clearcoatRoughness,
      envMapIntensity: 1.6,
    });
    const spinnerMesh = new THREE.Mesh(meshParts.spinnerGeo, spinnerMat);
    spinnerMesh.castShadow = true;
    spinnerMesh.name = "spinner";
    group.add(spinnerMesh);

    // 8. Protected 3-Blade Propeller
    const propMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#18181B"),
      roughness: 0.35,
      metalness: 0.25,
    });
    const propMesh = new THREE.Mesh(meshParts.propellerBladesGeo, propMat);
    propMesh.castShadow = true;
    propMesh.name = "propeller";
    propMeshRef.current = propMesh;
    group.add(propMesh);

    // 9. Protected Landing Gear Struts & Tires
    const gearMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#1E293B"),
      roughness: 0.75,
      metalness: 0.2,
    });
    const gearMesh = new THREE.Mesh(meshParts.gearStrutsAndTiresGeo, gearMat);
    gearMesh.castShadow = true;
    gearMesh.name = "gear";
    group.add(gearMesh);

    // 10. Cockpit Glare-shield & 4 Seats
    const interiorMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#1E2430"),
      roughness: 0.65,
      metalness: 0.08,
    });
    const interiorMesh = new THREE.Mesh(
      meshParts.cockpitInteriorGeo,
      interiorMat
    );
    interiorMesh.name = "interior";
    group.add(interiorMesh);

    // Align floor grid and shadow plane to aircraft ground level
    const groundY = meshParts.bounds.yMin - 0.02;
    if (gridHelperRef.current) gridHelperRef.current.position.y = groundY;
    if (shadowPlaneRef.current)
      shadowPlaneRef.current.position.y = groundY + 0.005;
  }, [meshParts, textures, zones, calibration]);

  // 3. Update Environment Lighting Preset
  useEffect(() => {
    const env = ENV_CONFIG[environmentPreset] || ENV_CONFIG.HANGAR_STUDIO;
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(env.bg);
    }
    if (rendererRef.current) {
      rendererRef.current.toneMappingExposure = env.exposure;
    }
    if (ambientLightRef.current) {
      ambientLightRef.current.color.set(env.ambientColor);
      ambientLightRef.current.intensity = env.ambientIntensity;
    }
    if (keyLightRef.current) {
      keyLightRef.current.color.set(env.keyColor);
      keyLightRef.current.intensity = env.keyIntensity;
    }
    if (fillLightRef.current) {
      fillLightRef.current.color.set(env.fillColor);
      fillLightRef.current.intensity = env.fillIntensity;
    }
    if (rimLightRef.current) {
      rimLightRef.current.color.set(env.rimColor);
      rimLightRef.current.intensity = env.rimIntensity;
    }
  }, [environmentPreset]);

  // 4. Update Camera View Preset
  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

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
    controls.target.copy(target);
    controls.update();
  }, [cameraPreset]);

  // 5. Raycast on Pointer Move to display real-time Datum Station (X, Y, Z) in meters/inches
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    const camera = cameraRef.current;
    const group = aircraftGroupRef.current;
    if (!container || !camera || !group) return;

    const rect = container.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(group.children, false);
    if (hits.length > 0) {
      const pt = hits[0].point;
      setHoverStation({
        xM: Math.max(0, pt.x - meshParts.bounds.xMin),
        yM: pt.y - meshParts.bounds.yMin,
        zM: pt.z,
      });
    } else {
      setHoverStation(null);
    }
  };

  const togglePropSpin = () => {
    spinPropRef.current = !spinPropRef.current;
    setSpinPropeller(spinPropRef.current);
  };

  return (
    <div
      className="relative w-full h-full select-none overflow-hidden bg-slate-950"
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoverStation(null)}
    >
      {/* Pure Three.js WebGL Mount Container */}
      <div ref={containerRef} className="w-full h-full" />

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

      {/* Top-Right Dimension Callout Pills */}
      {showDimensions && (
        <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5 pointer-events-none">
          <div className="px-2.5 py-1 rounded bg-slate-900/85 border border-amber-500/40 text-[11px] font-mono text-amber-300 shadow">
            Wingspan: {calibration.wingspanM.toFixed(2)}m (
            {(calibration.wingspanM * 3.28084).toFixed(2)}ft)
          </div>
          <div className="px-2.5 py-1 rounded bg-slate-900/85 border border-sky-500/40 text-[11px] font-mono text-sky-300 shadow">
            Length: {calibration.lengthM.toFixed(3)}m (
            {(calibration.lengthM * 3.28084).toFixed(2)}ft)
          </div>
          <div className="px-2.5 py-1 rounded bg-slate-900/85 border border-emerald-500/40 text-[11px] font-mono text-emerald-300 shadow">
            Tail Height: {calibration.heightM.toFixed(2)}m | Reg:{" "}
            {registration.text} ({registration.heightInches}&quot;)
          </div>
        </div>
      )}

      {/* Bottom-Left Controls */}
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
          {showDimensions ? "✓ Dimensions HUD" : "Dimensions Off"}
        </button>

        <button
          type="button"
          onClick={togglePropSpin}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
            spinPropeller
              ? "bg-amber-500/20 border-amber-500/60 text-amber-300"
              : "bg-slate-900/80 border-slate-700 text-slate-400 hover:text-slate-200"
          }`}
        >
          {spinPropeller ? "⟳ Prop Spinning" : "Prop Static"}
        </button>

        <div className="px-2.5 py-1.5 rounded-lg bg-slate-900/75 border border-slate-800 text-[11px] text-slate-400 hidden md:block">
          Drag to orbit • Right-drag to pan • Scroll to zoom
        </div>
      </div>
    </div>
  );
}
