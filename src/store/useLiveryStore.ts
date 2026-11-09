import { create } from "zustand";
import {
  AirframeCalibration,
  AviationFinishType,
  BezierStripeLayer,
  CameraViewPreset,
  CustomDecalLayer,
  EnvironmentPresetId,
  LiverySchemePreset,
  RegistrationConfig,
  ZonePaintSpec,
} from "@/types/livery";
import { SLING_TSI_PRESETS } from "@/data/aviationCatalog";

export type ActiveWorkspaceTab = "LIVERY_STUDIO" | "BLUEPRINT_CALIBRATOR";

export interface GeneratedAIConcept {
  id: string;
  prompt: string;
  title: string;
  rationale: string;
  createdAt: string;
  presetData: LiverySchemePreset;
}

interface LiveryStoreState {
  projectName: string;
  activeWorkspaceTab: ActiveWorkspaceTab;
  split2DEditorOpen: boolean;
  environmentPreset: EnvironmentPresetId;
  cameraPreset: CameraViewPreset;
  selectedStripeId: string | null;
  activeSidePanel: "AI_COPILOT" | "ZONES" | "STRIPES" | "REGISTRATION" | "PRESETS";
  isExportingPdf: boolean;
  textureRevision: number;

  // 1. Sling TSi Calibration & Reconstruction State
  calibration: AirframeCalibration;

  // 2. Paint Zones
  zones: LiverySchemePreset["zones"];

  // 3. Vector Bezier Stripes
  stripes: BezierStripeLayer[];

  // 4. Tail Registration (N-Number)
  registration: RegistrationConfig;

  // 5. Custom Decals / Badges
  decals: CustomDecalLayer[];

  // 6. AI Generated Concepts History
  aiConcepts: GeneratedAIConcept[];

  // Actions
  setProjectName: (name: string) => void;
  setActiveWorkspaceTab: (tab: ActiveWorkspaceTab) => void;
  setSplit2DEditorOpen: (open: boolean) => void;
  setEnvironmentPreset: (env: EnvironmentPresetId) => void;
  setCameraPreset: (cam: CameraViewPreset) => void;
  setSelectedStripeId: (id: string | null) => void;
  setActiveSidePanel: (panel: LiveryStoreState["activeSidePanel"]) => void;
  setIsExportingPdf: (exporting: boolean) => void;

  updateCalibration: (partial: Partial<AirframeCalibration>) => void;
  resetSlingFactoryCalibration: () => void;

  updateZonePaint: (
    zoneKey: keyof LiverySchemePreset["zones"],
    spec: Partial<ZonePaintSpec>
  ) => void;

  addStripe: (targetZone?: BezierStripeLayer["targetZone"]) => void;
  updateStripe: (id: string, partial: Partial<BezierStripeLayer>) => void;
  removeStripe: (id: string) => void;
  duplicateStripe: (id: string) => void;

  updateRegistration: (partial: Partial<RegistrationConfig>) => void;

  addCustomDecal: (decal: Omit<CustomDecalLayer, "id">) => void;
  updateDecal: (id: string, partial: Partial<CustomDecalLayer>) => void;
  removeDecal: (id: string) => void;

  applySchemePreset: (preset: LiverySchemePreset) => void;
  addAIConcepts: (concepts: GeneratedAIConcept[]) => void;
}

const DEFAULT_PRESET = SLING_TSI_PRESETS[0];

const DEFAULT_CALIBRATION: AirframeCalibration = {
  aircraftName: "Sling TSi (Rotax 915iS / 916iS)",
  wingspanM: 9.53,
  lengthM: 7.175,
  heightM: 2.45,
  wingChordRootM: 1.42,
  wingChordTipM: 1.02,
  dihedralDeg: 4.5,
  tailSweepDeg: 28,
  wheelPantsInstalled: true,
  antiGlareMaskEnabled: true,
  canopyTint: 0.35,
  propellerBlades: 3,
  showPanelLinesAndRivets: true,
  panelLineIntensity: 0.55,
  customBlueprintSideUrl: null,
  customBlueprintTopUrl: null,
  referencePhotoUrls: [],
  customGlbUrl: null,
  rulers: [
    {
      id: "ruler-length",
      label: "Overall Fuselage Length (Spinner Tip to Rudder Trailing Edge)",
      axis: "LENGTH",
      p1: { x: 0.04, y: 0.48 },
      p2: { x: 0.96, y: 0.48 },
      measuredMeters: 7.175,
    },
    {
      id: "ruler-height",
      label: "Overall Height (Ground to Vertical Fin Tip)",
      axis: "HEIGHT",
      p1: { x: 0.91, y: 0.12 },
      p2: { x: 0.91, y: 0.92 },
      measuredMeters: 2.45,
    },
    {
      id: "ruler-span",
      label: "Wingspan (Wingtip to Wingtip)",
      axis: "WINGSPAN",
      p1: { x: 0.05, y: 0.5 },
      p2: { x: 0.95, y: 0.5 },
      measuredMeters: 9.53,
    },
  ],
};

export const useLiveryStore = create<LiveryStoreState>((set) => ({
  projectName: "Sling TSi Custom Livery #01",
  activeWorkspaceTab: "LIVERY_STUDIO",
  split2DEditorOpen: true,
  environmentPreset: "HANGAR_STUDIO",
  cameraPreset: "FREE_ORBIT",
  selectedStripeId: DEFAULT_PRESET.stripes[0]?.id ?? null,
  activeSidePanel: "AI_COPILOT",
  isExportingPdf: false,
  textureRevision: 1,

  calibration: DEFAULT_CALIBRATION,
  zones: structuredClone(DEFAULT_PRESET.zones),
  stripes: structuredClone(DEFAULT_PRESET.stripes),
  registration: {
    enabled: true,
    text: DEFAULT_PRESET.registration.text ?? "N915TS",
    font: "AERO_ITALIC",
    heightInches: DEFAULT_PRESET.registration.heightInches ?? 12.0,
    slantDeg: DEFAULT_PRESET.registration.slantDeg ?? 14,
    positionX: DEFAULT_PRESET.registration.positionX ?? 0.71,
    positionY: DEFAULT_PRESET.registration.positionY ?? 0.53,
    colorHex: DEFAULT_PRESET.registration.colorHex ?? "#0D2346",
    paintCode: DEFAULT_PRESET.registration.paintCode ?? "AG-50192M",
    outlineEnabled: DEFAULT_PRESET.registration.outlineEnabled ?? true,
    outlineColorHex: DEFAULT_PRESET.registration.outlineColorHex ?? "#F96B13",
    outlineWidth: 2.5,
    finish: "HIGH_GLOSS",
    symmetry: true,
  },
  decals: [
    {
      id: "decal-sling-emblem",
      name: "Sling TSi Tail Fin Badge",
      visible: true,
      type: "SLING_BADGE",
      positionX: 0.89,
      positionY: 0.76,
      scale: 1.0,
      rotationDeg: 0,
      colorHex: "#F96B13",
      symmetry: true,
    },
  ],
  aiConcepts: [],

  setProjectName: (projectName) => set({ projectName }),
  setActiveWorkspaceTab: (activeWorkspaceTab) => set({ activeWorkspaceTab }),
  setSplit2DEditorOpen: (split2DEditorOpen) => set({ split2DEditorOpen }),
  setEnvironmentPreset: (environmentPreset) => set({ environmentPreset }),
  setCameraPreset: (cameraPreset) => set({ cameraPreset }),
  setSelectedStripeId: (selectedStripeId) => set({ selectedStripeId }),
  setActiveSidePanel: (activeSidePanel) => set({ activeSidePanel }),
  setIsExportingPdf: (isExportingPdf) => set({ isExportingPdf }),

  updateCalibration: (partial) =>
    set((state) => ({
      calibration: { ...state.calibration, ...partial },
      textureRevision: state.textureRevision + 1,
    })),

  resetSlingFactoryCalibration: () =>
    set((state) => ({
      calibration: DEFAULT_CALIBRATION,
      textureRevision: state.textureRevision + 1,
    })),

  updateZonePaint: (zoneKey, spec) =>
    set((state) => ({
      zones: {
        ...state.zones,
        [zoneKey]: {
          ...state.zones[zoneKey],
          ...spec,
        },
      },
      textureRevision: state.textureRevision + 1,
    })),

  addStripe: (targetZone = "FUSELAGE_TAIL") =>
    set((state) => {
      const id = `stripe-${Date.now()}`;
      const newStripe: BezierStripeLayer = {
        id,
        name: `Accent Ribbon #${state.stripes.length + 1}`,
        visible: true,
        targetZone,
        symmetry: true,
        colorHex: "#F96B13",
        paintCode: "SL-2040G",
        colorName: "Sling Factory Blaze Orange",
        finish: "HIGH_GLOSS" as AviationFinishType,
        opacity: 1,
        p0: { x: 0.1, y: 0.45 },
        p1: { x: 0.38, y: 0.42 },
        p2: { x: 0.68, y: 0.49 },
        p3: { x: 0.93, y: 0.78 },
        widthStart: 0.016,
        widthMid: 0.05,
        widthEnd: 0.08,
        pinstripeEnabled: true,
        pinstripeColorHex: "#0D2346",
        pinstripeOffset: 0.038,
        pinstripeWidth: 0.012,
      };
      return {
        stripes: [...state.stripes, newStripe],
        selectedStripeId: id,
        textureRevision: state.textureRevision + 1,
      };
    }),

  updateStripe: (id, partial) =>
    set((state) => ({
      stripes: state.stripes.map((s) =>
        s.id === id ? { ...s, ...partial } : s
      ),
      textureRevision: state.textureRevision + 1,
    })),

  removeStripe: (id) =>
    set((state) => {
      const next = state.stripes.filter((s) => s.id !== id);
      return {
        stripes: next,
        selectedStripeId:
          state.selectedStripeId === id ? (next[0]?.id ?? null) : state.selectedStripeId,
        textureRevision: state.textureRevision + 1,
      };
    }),

  duplicateStripe: (id) =>
    set((state) => {
      const target = state.stripes.find((s) => s.id === id);
      if (!target) return state;
      const copyId = `stripe-${Date.now()}`;
      const copy: BezierStripeLayer = {
        ...structuredClone(target),
        id: copyId,
        name: `${target.name} (Copy)`,
        p0: { x: target.p0.x, y: Math.min(0.95, target.p0.y + 0.04) },
        p1: { x: target.p1.x, y: Math.min(0.95, target.p1.y + 0.04) },
        p2: { x: target.p2.x, y: Math.min(0.95, target.p2.y + 0.04) },
        p3: { x: target.p3.x, y: Math.min(0.95, target.p3.y + 0.04) },
      };
      return {
        stripes: [...state.stripes, copy],
        selectedStripeId: copyId,
        textureRevision: state.textureRevision + 1,
      };
    }),

  updateRegistration: (partial) =>
    set((state) => ({
      registration: { ...state.registration, ...partial },
      textureRevision: state.textureRevision + 1,
    })),

  addCustomDecal: (decal) =>
    set((state) => ({
      decals: [...state.decals, { ...decal, id: `decal-${Date.now()}` }],
      textureRevision: state.textureRevision + 1,
    })),

  updateDecal: (id, partial) =>
    set((state) => ({
      decals: state.decals.map((d) => (d.id === id ? { ...d, ...partial } : d)),
      textureRevision: state.textureRevision + 1,
    })),

  removeDecal: (id) =>
    set((state) => ({
      decals: state.decals.filter((d) => d.id !== id),
      textureRevision: state.textureRevision + 1,
    })),

  applySchemePreset: (preset) =>
    set((state) => ({
      zones: structuredClone(preset.zones),
      stripes: structuredClone(preset.stripes),
      selectedStripeId: preset.stripes[0]?.id ?? null,
      registration: {
        ...state.registration,
        ...preset.registration,
      },
      textureRevision: state.textureRevision + 1,
    })),

  addAIConcepts: (concepts) =>
    set((state) => ({
      aiConcepts: [...concepts, ...state.aiConcepts],
    })),
}));
