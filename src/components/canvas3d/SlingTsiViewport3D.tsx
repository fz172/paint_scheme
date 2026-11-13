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

  const [hoverStation, setHoverStation] = useState<{
    partName: string;
    xM: number;
    yM: number;
    zM: number;
  } | null>(null);

  const meshParts = useMemo(
    () => buildSlingTsiGeometry(calibration),
    [calibration]
  );

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 960;
    const height = container.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(ENV_CONFIG.DARK_SHOWROOM.bg);
    sceneRef.current = scene;

    // Camera positioned at the exact front-left 3/4 angle of the N532SL reference photo!
    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 120);
    camera.position.set(-5.8, 0.72, 6.4);
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
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    if (onCanvasReady) {
      onCanvasReady(renderer.domElement);
    }

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const ambientLight = new THREE.AmbientLight("#F8FAFC", 1.0);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const keyLight = new THREE.DirectionalLight("#FFFFFF", 3.0);
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

    const fillLight = new THREE.DirectionalLight("#93C5FD", 1.35);
    fillLight.position.set(7, 5, -6);
    scene.add(fillLight);
    fillLightRef.current = fillLight;

    const rimLight = new THREE.DirectionalLight("#E2E8F0", 1.0);
    rimLight.position.set(2, -4, 5);
    scene.add(rimLight);
    rimLightRef.current = rimLight;

    const grid = new THREE.GridHelper(24, 24, "#334155", "#1E293B");
    grid.position.y = -1.18;
    scene.add(grid);
    gridHelperRef.current = grid;

    const shadowGeo = new THREE.PlaneGeometry(24, 24);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.45 });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.position.y = -1.175;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);
    shadowPlaneRef.current = shadowPlane;

    const aircraftGroup = new THREE.Group();
    scene.add(aircraftGroup);
    aircraftGroupRef.current = aircraftGroup;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 2.2;
    controls.maxDistance = 24;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.target.set(-0.2, -0.08, 0);
    controls.update();
    controlsRef.current = controls;

    let animFrameId = 0;

    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

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

  useEffect(() => {
    const group = aircraftGroupRef.current;
    if (!group) return;

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
      FINISH_PRESETS[zones.wingtips.finish] || FINISH_PRESETS.PEARLESCENT;
    const spatFinish =
      FINISH_PRESETS[zones.wheelPants.finish] || FINISH_PRESETS.HIGH_GLOSS;
    const spinnerFinish =
      FINISH_PRESETS[zones.spinner.finish] || FINISH_PRESETS.HIGH_GLOSS;

    // 1. Watertight Fuselage + Flush Smoked Cabin Windows + Fixed Vertical Stabilizer
    const fusMat = new THREE.MeshPhysicalMaterial({
      map: textures.fuselageAlbedo,
      roughnessMap: textures.fuselageRoughness,
      metalnessMap: textures.fuselageMetalness,
      bumpMap: textures.fuselageBump,
      bumpScale: calibration.showPanelLinesAndRivets ? 0.004 : 0,
      roughness: 1.0,
      metalness: 1.0,
      clearcoat: 0.96,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.35,
      side: THREE.DoubleSide,
    });
    const fusMesh = new THREE.Mesh(meshParts.fuselageAndTailGeo, fusMat);
    fusMesh.castShadow = true;
    fusMesh.receiveShadow = true;
    fusMesh.name = "Fuselage & Vertical Stab";
    group.add(fusMesh);

    // 1B. Individual Rudder (with Top Aerodynamic Horn Balance & Lower Rudder Horn)
    const rudderMesh = new THREE.Mesh(meshParts.rudderGeo, fusMat.clone());
    rudderMesh.castShadow = true;
    rudderMesh.receiveShadow = true;
    rudderMesh.name = "Rudder";
    group.add(rudderMesh);

    // 2. Fixed Main Low-Wing Box & D-Nose
    const wingMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(zones.wingBase.colorHex),
      roughness: wingFinish.roughness,
      metalness: wingFinish.metalness,
      clearcoat: wingFinish.clearcoat,
      clearcoatRoughness: wingFinish.clearcoatRoughness,
      envMapIntensity: 1.3,
      side: THREE.DoubleSide,
    });
    const wingMesh = new THREE.Mesh(meshParts.wingMainGeo, wingMat);
    wingMesh.castShadow = true;
    wingMesh.receiveShadow = true;
    wingMesh.name = "Main Wing";
    group.add(wingMesh);

    // 2B. Inboard Non-Skid Wing Walk Step Pads (Matte Textured Black per photo_16.jpg)
    const wingWalkMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#1E2024"),
      roughness: 0.92,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const wingWalkMesh = new THREE.Mesh(meshParts.wingWalkGeo, wingWalkMat);
    wingWalkMesh.receiveShadow = true;
    wingWalkMesh.name = "Wing Walk (Non-Skid)";
    group.add(wingWalkMesh);

    // 2C. Individual Slotted/Hinged Flaps (Left & Right)
    const flapsMesh = new THREE.Mesh(meshParts.flapsGeo, wingMat.clone());
    flapsMesh.castShadow = true;
    flapsMesh.receiveShadow = true;
    flapsMesh.name = "Flaps";
    group.add(flapsMesh);

    // 2D. Individual Ailerons (Left & Right)
    const aileronsMesh = new THREE.Mesh(meshParts.aileronsGeo, wingMat.clone());
    aileronsMesh.castShadow = true;
    aileronsMesh.receiveShadow = true;
    aileronsMesh.name = "Ailerons";
    group.add(aileronsMesh);

    // 3. Swept Curved Winglets + Horizontal Stabilizer Fiberglass Tip Caps
    const wingtipMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(zones.wingtips.colorHex),
      roughness: wingtipFinish.roughness,
      metalness: wingtipFinish.metalness,
      clearcoat: wingtipFinish.clearcoat,
      clearcoatRoughness: wingtipFinish.clearcoatRoughness,
      envMapIntensity: 1.35,
      side: THREE.DoubleSide,
    });
    const wingtipMesh = new THREE.Mesh(meshParts.wingtipsGeo, wingtipMat);
    wingtipMesh.castShadow = true;
    wingtipMesh.receiveShadow = true;
    wingtipMesh.name = "Winglets & H-Stab Tips";
    group.add(wingtipMesh);

    // 4. Fixed Horizontal Stabilizer
    const hStabMesh = new THREE.Mesh(
      meshParts.horizontalStabGeo,
      wingMat.clone()
    );
    hStabMesh.castShadow = true;
    hStabMesh.receiveShadow = true;
    hStabMesh.name = "Horizontal Stabilizer";
    group.add(hStabMesh);

    // 4B. Individual Elevators (with Outer Aerodynamic Horn Balances & Left Trim Tab)
    const elevatorsMesh = new THREE.Mesh(
      meshParts.elevatorsGeo,
      wingMat.clone()
    );
    elevatorsMesh.castShadow = true;
    elevatorsMesh.receiveShadow = true;
    elevatorsMesh.name = "Elevators & Trim Tab";
    group.add(elevatorsMesh);

    // 5. Sculpted Two-Tone Wheel Pants (Spats)
    if (calibration.wheelPantsInstalled) {
      const spatMat = new THREE.MeshPhysicalMaterial({
        map: textures.wheelPantsAlbedo,
        roughness: spatFinish.roughness,
        metalness: spatFinish.metalness,
        clearcoat: spatFinish.clearcoat,
        clearcoatRoughness: spatFinish.clearcoatRoughness,
        envMapIntensity: 1.3,
        side: THREE.DoubleSide,
      });
      const spatMesh = new THREE.Mesh(meshParts.wheelPantsGeo, spatMat);
      spatMesh.castShadow = true;
      spatMesh.receiveShadow = true;
      spatMesh.name = "wheelPants";
      group.add(spatMesh);
    }

    // 6. Painted Aerodynamic Gear Legs (lofted from fuselage belly outward to wheel hubs)
    const bellyOrWingtipColor =
      stripes.find((s) => s.visible && s.fillBelowCurve)?.colorHex ||
      zones.wingtips.colorHex;
    const gearLegsMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(bellyOrWingtipColor),
      roughness: wingtipFinish.roughness,
      metalness: wingtipFinish.metalness,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.3,
      side: THREE.DoubleSide,
    });
    const gearLegsMesh = new THREE.Mesh(
      meshParts.gearLegsPaintedGeo,
      gearLegsMat
    );
    gearLegsMesh.castShadow = true;
    gearLegsMesh.name = "gearLegsPainted";
    group.add(gearLegsMesh);

    // 7. Ogive Bullet Spinner Cone
    const spinnerMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(zones.spinner.colorHex),
      roughness: spinnerFinish.roughness,
      metalness: spinnerFinish.metalness,
      clearcoat: spinnerFinish.clearcoat,
      clearcoatRoughness: spinnerFinish.clearcoatRoughness,
      envMapIntensity: 1.5,
      side: THREE.DoubleSide,
    });
    const spinnerMesh = new THREE.Mesh(meshParts.spinnerGeo, spinnerMat);
    spinnerMesh.castShadow = true;
    spinnerMesh.name = "spinner";
    group.add(spinnerMesh);

    // 8. 3-Blade Scimitar Propeller
    const propMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#18181B"),
      roughness: 0.32,
      metalness: 0.25,
    });
    const propMesh = new THREE.Mesh(meshParts.propellerBladesGeo, propMat);
    propMesh.castShadow = true;
    propMesh.name = "propeller";
    propMeshRef.current = propMesh;
    group.add(propMesh);

    // 9. Rubber Tires & Whip VHF Antenna
    const gearMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#18181B"),
      roughness: 0.78,
      metalness: 0.15,
    });
    const gearMesh = new THREE.Mesh(meshParts.gearStrutsAndTiresGeo, gearMat);
    gearMesh.castShadow = true;
    gearMesh.name = "gear";
    group.add(gearMesh);

    const groundY = meshParts.bounds.yMin;
    if (gridHelperRef.current) gridHelperRef.current.position.y = groundY;
    if (shadowPlaneRef.current)
      shadowPlaneRef.current.position.y = groundY + 0.004;
  }, [meshParts, textures, zones, stripes, calibration]);

  useEffect(() => {
    const env = ENV_CONFIG[environmentPreset] || ENV_CONFIG.DARK_SHOWROOM;
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

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const target = new THREE.Vector3(-0.2, -0.08, 0);
    let pos = new THREE.Vector3(-5.8, 0.72, 6.4);

    switch (cameraPreset) {
      case "HERO_3_4":
        pos = new THREE.Vector3(-5.8, 0.72, 6.4);
        break;
      case "LEFT_PROFILE":
        pos = new THREE.Vector3(0, 0.05, 9.6);
        target.set(0, 0.05, 0);
        break;
      case "RIGHT_PROFILE":
        pos = new THREE.Vector3(0, 0.05, -9.6);
        target.set(0, 0.05, 0);
        break;
      case "TOP_PLANFORM":
        pos = new THREE.Vector3(0, 10.8, 0.01);
        target.set(0, 0, 0);
        break;
      case "BOTTOM_VIEW":
        pos = new THREE.Vector3(0, -10.8, 0.01);
        target.set(0, 0, 0);
        break;
      case "FRONT_VIEW":
        pos = new THREE.Vector3(-9.2, 0.1, 0);
        target.set(0, 0, 0);
        break;
      case "TAIL_CLOSEUP":
        pos = new THREE.Vector3(2.2, 0.55, 3.8);
        target.set(1.8, 0.25, 0);
        break;
      case "FREE_ORBIT":
      default:
        return;
    }

    camera.position.copy(pos);
    controls.target.copy(target);
    controls.update();
  }, [cameraPreset]);

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
        partName: hits[0].object.name || "Airframe",
        xM: Math.max(0, pt.x - meshParts.bounds.xMin),
        yM: pt.y - meshParts.bounds.yMin,
        zM: pt.z,
      });
    } else {
      setHoverStation(null);
    }
  };

  return (
    <div
      className="relative w-full h-full select-none overflow-hidden bg-slate-950"
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoverStation(null)}
    >
      <div ref={containerRef} className="w-full h-full" />

      {/* Top-Left Live POH Datum & Dimension HUD */}
      <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/85 backdrop-blur-md border border-slate-700/80 text-xs text-slate-200 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold tracking-wide">
            {calibration.aircraftName}
          </span>
          <span className="text-slate-400">|</span>
          <span className="font-mono text-[11px] text-sky-400">
            {(calibration.wingspanM * 1000).toFixed(0)}mm Span ×{" "}
            {(calibration.lengthM * 1000).toFixed(0)}mm Len ×{" "}
            {(calibration.heightM * 1000).toFixed(0)}mm Ht
          </span>
        </div>

        {hoverStation && (
          <div className="px-3 py-1 rounded-md bg-slate-950/90 border border-sky-500/40 font-mono text-[11px] text-sky-300 shadow">
            <span className="text-emerald-300 font-semibold">
              [{hoverStation.partName}]
            </span>{" "}
            STA X: {(hoverStation.xM * 1000).toFixed(0)}mm (
            {hoverStation.xM.toFixed(2)}m) | WL Y:{" "}
            {(hoverStation.yM * 1000).toFixed(0)}mm | BL Z:{" "}
            {(hoverStation.zM * 1000).toFixed(0)}mm
          </div>
        )}
      </div>

      {/* Top-Right POH Dimension Callout Pills */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5 pointer-events-none">
        <div className="px-2.5 py-1 rounded bg-slate-900/85 border border-amber-500/40 text-[11px] font-mono text-amber-300 shadow">
          Span: {(calibration.wingspanM * 1000).toFixed(0)} mm (
          {calibration.wingspanM.toFixed(2)} m)
        </div>
        <div className="px-2.5 py-1 rounded bg-slate-900/85 border border-sky-500/40 text-[11px] font-mono text-sky-300 shadow">
          Length: {(calibration.lengthM * 1000).toFixed(0)} mm | Wheelbase:{" "}
          {((calibration.noseAxleStationM || 0.9) * 1000).toFixed(0)}+
          {((calibration.wheelbaseM || 1.75) * 1000).toFixed(0)} mm
        </div>
        <div className="px-2.5 py-1 rounded bg-slate-900/85 border border-emerald-500/40 text-[11px] font-mono text-emerald-300 shadow">
          Height: {(calibration.heightM * 1000).toFixed(0)} mm | Track:{" "}
          {((calibration.wheelTrackM || 2.05) * 1000).toFixed(0)} mm | Reg:{" "}
          {registration.text}
        </div>
      </div>
    </div>
  );
}
