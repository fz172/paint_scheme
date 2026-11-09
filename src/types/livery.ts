export type AviationFinishType =
  | "HIGH_GLOSS"
  | "METALLIC"
  | "PEARLESCENT"
  | "MATTE_STEALTH"
  | "POLISHED_CHROME";

export interface FinishMaterialParams {
  id: AviationFinishType;
  label: string;
  description: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
}

export interface AviationSwatch {
  id: string;
  name: string;
  manufacturer: string;
  paintCode: string;
  hex: string;
  defaultFinish: AviationFinishType;
}

export interface ZonePaintSpec {
  colorHex: string;
  paintCode: string;
  colorName: string;
  finish: AviationFinishType;
}

export interface Point2D {
  x: number; // Normalized 0.0 (Nose) -> 1.0 (Tail tip)
  y: number; // Normalized 0.0 (Bottom belly) -> 1.0 (Top fin tip)
}

export type StripeTargetZone = "FUSELAGE_TAIL" | "WING_TOP" | "WHEEL_PANTS";

export interface BezierStripeLayer {
  id: string;
  name: string;
  visible: boolean;
  targetZone: StripeTargetZone;
  symmetry: boolean;
  colorHex: string;
  paintCode: string;
  colorName: string;
  finish: AviationFinishType;
  opacity: number;
  // Cubic Bezier control points in normalized orthographic profile space (0..1)
  p0: Point2D;
  p1: Point2D;
  p2: Point2D;
  p3: Point2D;
  // Widths in normalized profile units (1.0 = full profile height, so 0.04 = ~10cm)
  widthStart: number;
  widthMid: number;
  widthEnd: number;
  // Secondary accent pinstripe
  pinstripeEnabled: boolean;
  pinstripeColorHex: string;
  pinstripeOffset: number; // signed offset above/below main ribbon
  pinstripeWidth: number;
}

export type RegistrationFont =
  | "AERO_ITALIC"
  | "FAA_BLOCK"
  | "MIL_STENCIL"
  | "EXEC_SANS";

export interface RegistrationConfig {
  enabled: boolean;
  text: string;
  font: RegistrationFont;
  heightInches: number; // Physical height on aircraft in inches (e.g., 12.0" FAA standard or 3.0" Experimental)
  slantDeg: number; // Slant toward tail (automatically mirrored on starboard side)
  positionX: number; // 0.0 (Nose) -> 1.0 (Tail)
  positionY: number; // 0.0 (Bottom) -> 1.0 (Top)
  colorHex: string;
  paintCode: string;
  outlineEnabled: boolean;
  outlineColorHex: string;
  outlineWidth: number;
  finish: AviationFinishType;
  symmetry: boolean;
}

export interface CustomDecalLayer {
  id: string;
  name: string;
  visible: boolean;
  type: "SLING_BADGE" | "EXPERIMENTAL_PLACARD" | "STAR_INSIGNIA" | "CUSTOM_IMAGE";
  imageUrl?: string;
  positionX: number;
  positionY: number;
  scale: number;
  rotationDeg: number;
  colorHex: string;
  symmetry: boolean;
}

export interface RulerCalibrationLine {
  id: string;
  label: string;
  axis: "LENGTH" | "WINGSPAN" | "HEIGHT";
  p1: Point2D;
  p2: Point2D;
  measuredMeters: number;
}

export interface AirframeCalibration {
  aircraftName: string;
  wingspanM: number; // Default Sling TSi: 9.53m
  lengthM: number; // Default Sling TSi: 7.175m
  heightM: number; // Default Sling TSi: 2.45m
  wingChordRootM: number; // Default: 1.42m
  wingChordTipM: number; // Default: 1.02m
  dihedralDeg: number; // Default: 4.5 deg
  tailSweepDeg: number; // Default: 28 deg
  wheelPantsInstalled: boolean;
  antiGlareMaskEnabled: boolean;
  canopyTint: number; // 0.1 to 0.85
  propellerBlades: number; // 3 blades (Airmaster / Rotax 915iS/916iS)
  showPanelLinesAndRivets: boolean;
  panelLineIntensity: number; // 0..1
  customBlueprintSideUrl: string | null;
  customBlueprintTopUrl: string | null;
  referencePhotoUrls: string[];
  customGlbUrl: string | null;
  rulers: RulerCalibrationLine[];
}

export type EnvironmentPresetId =
  | "HANGAR_STUDIO"
  | "SUNNY_TARMAC"
  | "GOLDEN_HOUR"
  | "ALPINE_FLIGHT"
  | "DARK_SHOWROOM";

export type CameraViewPreset =
  | "FREE_ORBIT"
  | "HERO_3_4"
  | "LEFT_PROFILE"
  | "RIGHT_PROFILE"
  | "TOP_PLANFORM"
  | "BOTTOM_VIEW"
  | "FRONT_VIEW"
  | "TAIL_CLOSEUP";

export interface LiverySchemePreset {
  id: string;
  name: string;
  tagline: string;
  zones: {
    fuselageBase: ZonePaintSpec;
    cowlingAntiGlare: ZonePaintSpec;
    wingBase: ZonePaintSpec;
    wingtips: ZonePaintSpec;
    verticalTail: ZonePaintSpec;
    wheelPants: ZonePaintSpec;
    spinner: ZonePaintSpec;
  };
  stripes: BezierStripeLayer[];
  registration: Partial<RegistrationConfig>;
}
