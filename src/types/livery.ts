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
  // Widths in normalized profile units
  widthStart: number;
  widthMid: number;
  widthEnd: number;
  // Secondary accent pinstripe
  pinstripeEnabled: boolean;
  pinstripeColorHex: string;
  pinstripeOffset: number;
  pinstripeWidth: number;
  // Optional lower belly fill below this Bezier curve (for two-tone belly/tail liveries like N532SL)
  fillBelowCurve?: boolean;
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
  heightInches: number;
  slantDeg: number;
  positionX: number;
  positionY: number;
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
  // Exact Sling 4 TSi POH Section 1.3 3-View Drawing dimensions (converted from mm to meters)
  wingspanM: number; // POH: 9500 mm (9.500 m)
  lengthM: number; // POH: 7200 mm (7.200 m)
  heightM: number; // POH: 2350 mm (2.350 m)
  propThrustlineHeightM: number; // POH: 1180 mm (1.180 m)
  noseAxleStationM: number; // POH: 900 mm (0.900 m) from spinner tip
  wheelbaseM: number; // POH: 1750 mm (1.750 m) nose to main axle
  wheelTrackM: number; // POH: 2050 mm (2.050 m) main wheel track
  wingLEStationM: number; // POH: 1912 mm (1.912 m) spinner tip to wing LE
  wingChordRootM: number; // POH: 1520 mm (1.520 m)
  wingChordTipM: number; // Outer tapered chord: 1.020 m
  cabinWidthM: number; // POH: 1188 mm (1.188 m)
  hStabSpanM: number; // POH: 3095 mm (3.095 m)
  hStabChordM: number; // POH: 921 mm (0.921 m)
  tailClearanceDeg: number; // POH: 14 deg
  dihedralDeg: number; // 4.5 deg
  tailSweepDeg: number; // 31 deg
  wheelPantsInstalled: boolean;
  antiGlareMaskEnabled: boolean;
  canopyTint: number;
  propellerBlades: number;
  showPanelLinesAndRivets: boolean;
  panelLineIntensity: number;
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
