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

  calibration: AirframeCalibration;
  zones: LiverySchemePreset["zones"];
  stripes: BezierStripeLayer[];
  registration: RegistrationConfig;
  decals: CustomDecalLayer[];
  aiConcepts: GeneratedAIConcept[];

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
  aircraftName: "Sling 4 TSi (POH Rev 3.5 Calibrated)",
  wingspanM: 9.5, // POH: 9500 mm
  lengthM: 7.2, // POH: 7200 mm
  heightM: 2.35, // POH: 2350 mm
  propThrustlineHeightM: 1.18, // POH: 1180 mm
  noseAxleStationM: 0.9, // POH: 900 mm
  wheelbaseM: 1.75, // POH: 1750 mm
  wheelTrackM: 2.05, // POH: 2050 mm
  wingLEStationM: 1.912, // POH: 1912 mm
  wingChordRootM: 1.52, // POH: 1520 mm
  wingChordTipM: 1.02,
  cabinWidthM: 1.188, // POH: 1188 mm
  hStabSpanM: 3.095, // POH: 3095 mm
  hStabChordM: 0.921, // POH: 921 mm
  tailClearanceDeg: 14, // POH: 14 deg
  dihedralDeg: 4.5,
  tailSweepDeg: 31,
  wheelPantsInstalled: true,
  antiGlareMaskEnabled: true,
  canopyTint: 0.38,
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
      label: "Overall Fuselage Length (7200 mm)",
      axis: "LENGTH",
      p1: { x: 0.166, y: 0.15 },
      p2: { x: 0.818, y: 0.15 },
      measuredMeters: 7.2,
    },
    {
      id: "ruler-height",
      label: "Overall Tail Height (2350 mm)",
      axis: "HEIGHT",
      p1: { x: 0.865, y: 0.184 },
      p2: { x: 0.865, y: 0.338 },
      measuredMeters: 2.35,
    },
    {
      id: "ruler-span",
      label: "Total Wingspan (9500 mm)",
      axis: "WINGSPAN",
      p1: { x: 0.096, y: 0.481 },
      p2: { x: 0.875, y: 0.481 },
      measuredMeters: 9.5,
    },
  ],
};

export const useLiveryStore = create<LiveryStoreState>((set) => ({
  projectName: "Sling 4 TSi — N532SL Reference Livery",
  activeWorkspaceTab: "LIVERY_STUDIO",
  split2DEditorOpen: true,
  environmentPreset: "DARK_SHOWROOM",
  cameraPreset: "FREE_ORBIT",
  selectedStripeId: DEFAULT_PRESET.stripes[0]?.id ?? null,
  activeSidePanel: "PRESETS",
  isExportingPdf: false,
  textureRevision: 1,

  calibration: DEFAULT_CALIBRATION,
  zones: structuredClone(DEFAULT_PRESET.zones),
  stripes: structuredClone(DEFAULT_PRESET.stripes),
  registration: {
    enabled: true,
    text: DEFAULT_PRESET.registration.text ?? "N532SL",
    font: "AERO_ITALIC",
    heightInches: DEFAULT_PRESET.registration.heightInches ?? 11.5,
    slantDeg: DEFAULT_PRESET.registration.slantDeg ?? 14,
    positionX: DEFAULT_PRESET.registration.positionX ?? 0.67,
    positionY: DEFAULT_PRESET.registration.positionY ?? 0.47,
    colorHex: DEFAULT_PRESET.registration.colorHex ?? "#374151",
    paintCode: DEFAULT_PRESET.registration.paintCode ?? "MK-7021M",
    outlineEnabled: DEFAULT_PRESET.registration.outlineEnabled ?? true,
    outlineColorHex: DEFAULT_PRESET.registration.outlineColorHex ?? "#EA580C",
    outlineWidth: 2.2,
    finish: "HIGH_GLOSS",
    symmetry: true,
  },
  decals: [],
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
        colorHex: "#EA580C",
        paintCode: "SL-2040M",
        colorName: "Sling Factory Blaze Orange",
        finish: "PEARLESCENT" as AviationFinishType,
        opacity: 1,
        p0: { x: 0.1, y: 0.42 },
        p1: { x: 0.38, y: 0.4 },
        p2: { x: 0.68, y: 0.45 },
        p3: { x: 0.93, y: 0.78 },
        widthStart: 0.014,
        widthMid: 0.04,
        widthEnd: 0.06,
        pinstripeEnabled: true,
        pinstripeColorHex: "#374151",
        pinstripeOffset: 0.03,
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
          state.selectedStripeId === id
            ? (next[0]?.id ?? null)
            : state.selectedStripeId,
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
        fillBelowCurve: false,
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
