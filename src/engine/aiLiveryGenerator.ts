import { AVIATION_SWATCHES } from "@/data/aviationCatalog";
import { GeneratedAIConcept } from "@/store/useLiveryStore";
import {
  AviationFinishType,
  AviationSwatch,
  BezierStripeLayer,
  LiverySchemePreset,
} from "@/types/livery";

const KEYWORD_TO_SWATCH_ID: { keywords: string[]; swatchId: string }[] = [
  { keywords: ["orange", "blaze", "factory", "amber", "copper"], swatchId: "sw-sling-orange" },
  { keywords: ["red", "crimson", "viper", "scarlet", "ferrari", "daytona"], swatchId: "sw-daytona-red" },
  { keywords: ["bordeaux", "burgundy", "maroon", "wine", "ruby"], swatchId: "sw-crimson-pearl" },
  { keywords: ["navy", "midnight", "corsair", "dark blue", "ocean"], swatchId: "sw-corsair-blue" },
  { keywords: ["blue", "cobalt", "royal", "sapphire", "aero"], swatchId: "sw-cerulean-aero" },
  { keywords: ["cyan", "electric", "teal", "aqua", "turquoise", "sky"], swatchId: "sw-sky-cyan" },
  { keywords: ["gold", "champagne", "brass", "yellow", "imperial"], swatchId: "sw-champagne-gold" },
  { keywords: ["bronze", "sahara", "sand", "desert", "tan"], swatchId: "sw-sand-gold" },
  { keywords: ["green", "emerald", "british", "racing", "forest", "jade"], swatchId: "sw-emerald-pearl" },
  { keywords: ["black", "stealth", "carbon", "matte", "obsidian", "tactical", "shadow"], swatchId: "sw-stealth-graphite" },
  { keywords: ["gunmetal", "anthracite", "charcoal", "dark grey", "dark gray", "slate"], swatchId: "sw-gunmetal-grey" },
  { keywords: ["titanium", "silver", "aluminum", "grey", "gray"], swatchId: "sw-titanium-silver" },
  { keywords: ["platinum", "mist", "light silver"], swatchId: "sw-platinum-mist" },
  { keywords: ["chrome", "bare", "polished", "mirror", "alclad"], swatchId: "sw-polished-alclad" },
  { keywords: ["pearl", "glacier", "ivory", "cream"], swatchId: "sw-snow-white" },
  { keywords: ["white", "matterhorn", "clean", "snow"], swatchId: "sw-matterhorn-white" },
];

function findSwatchById(id: string): AviationSwatch {
  return (
    AVIATION_SWATCHES.find((s) => s.id === id) || AVIATION_SWATCHES[0]
  );
}

function toZoneSpec(swatch: AviationSwatch, overrideFinish?: AviationFinishType) {
  return {
    colorHex: swatch.hex,
    paintCode: swatch.paintCode,
    colorName: swatch.name,
    finish: overrideFinish || swatch.defaultFinish,
  };
}

/**
 * Parses a natural language livery prompt and synthesizes 3 distinct,
 * multi-layered parametric vector livery schemes for the Sling TSi.
 */
export function synthesizeParametricAIConcepts(
  prompt: string,
  currentTailNumber = "N915TS"
): GeneratedAIConcept[] {
  const lower = prompt.toLowerCase();

  // Extract matched swatches in order of mention
  const matchedSwatches: AviationSwatch[] = [];
  for (const entry of KEYWORD_TO_SWATCH_ID) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      const sw = findSwatchById(entry.swatchId);
      if (!matchedSwatches.some((m) => m.id === sw.id)) {
        matchedSwatches.push(sw);
      }
    }
  }

  // Determine if user asked for a dark/metallic base or light base
  const wantsDarkBase =
    lower.includes("dark base") ||
    lower.includes("stealth") ||
    lower.includes("all black") ||
    lower.includes("gunmetal base") ||
    lower.includes("titanium base") ||
    lower.includes("silver base");

  const baseSwatch = wantsDarkBase
    ? matchedSwatches.find((s) =>
        ["sw-titanium-silver", "sw-gunmetal-grey", "sw-stealth-graphite", "sw-platinum-mist"].includes(
          s.id
        )
      ) || findSwatchById("sw-titanium-silver")
    : matchedSwatches.find((s) =>
        ["sw-matterhorn-white", "sw-snow-white", "sw-platinum-mist"].includes(s.id)
      ) || findSwatchById("sw-matterhorn-white");

  // Pick Primary & Secondary accent swatches distinct from base
  const nonBase = matchedSwatches.filter((s) => s.id !== baseSwatch.id);
  const primarySwatch =
    nonBase[0] || findSwatchById("sw-corsair-blue");
  const accentSwatch =
    nonBase[1] ||
    (primarySwatch.id === "sw-sling-orange"
      ? findSwatchById("sw-corsair-blue")
      : findSwatchById("sw-sling-orange"));
  const tertiarySwatch =
    nonBase[2] || findSwatchById("sw-titanium-silver");

  const antiGlareSwatch = findSwatchById("sw-stealth-graphite");
  const chromeSwatch = findSwatchById("sw-polished-alclad");

  const ts = Date.now();

  // Concept 1: Swept Aerodynamic Dorsal-to-Fin Ribbon (Sling TSi Modern Sport)
  const concept1Stripes: BezierStripeLayer[] = [
    {
      id: `ai-${ts}-c1-s1`,
      name: `${primarySwatch.name} Swept Dorsal Ribbon`,
      visible: true,
      targetZone: "FUSELAGE_TAIL",
      symmetry: true,
      colorHex: primarySwatch.hex,
      paintCode: primarySwatch.paintCode,
      colorName: primarySwatch.name,
      finish: primarySwatch.defaultFinish,
      opacity: 1,
      p0: { x: 0.06, y: 0.45 },
      p1: { x: 0.36, y: 0.38 },
      p2: { x: 0.68, y: 0.44 },
      p3: { x: 0.96, y: 0.89 },
      widthStart: 0.016,
      widthMid: 0.065,
      widthEnd: 0.13,
      pinstripeEnabled: true,
      pinstripeColorHex: accentSwatch.hex,
      pinstripeOffset: 0.048,
      pinstripeWidth: 0.014,
    },
    {
      id: `ai-${ts}-c1-s2`,
      name: `${tertiarySwatch.name} Belly Counter-Sweep`,
      visible: true,
      targetZone: "FUSELAGE_TAIL",
      symmetry: true,
      colorHex: tertiarySwatch.hex,
      paintCode: tertiarySwatch.paintCode,
      colorName: tertiarySwatch.name,
      finish: tertiarySwatch.defaultFinish,
      opacity: 1,
      p0: { x: 0.12, y: 0.35 },
      p1: { x: 0.44, y: 0.29 },
      p2: { x: 0.72, y: 0.34 },
      p3: { x: 0.94, y: 0.58 },
      widthStart: 0.01,
      widthMid: 0.038,
      widthEnd: 0.02,
      pinstripeEnabled: false,
      pinstripeColorHex: accentSwatch.hex,
      pinstripeOffset: -0.03,
      pinstripeWidth: 0.01,
    },
    {
      id: `ai-${ts}-c1-s3`,
      name: "Wheel Pant Speed Vector",
      visible: true,
      targetZone: "WHEEL_PANTS",
      symmetry: true,
      colorHex: accentSwatch.hex,
      paintCode: accentSwatch.paintCode,
      colorName: accentSwatch.name,
      finish: accentSwatch.defaultFinish,
      opacity: 1,
      p0: { x: 0.08, y: 0.52 },
      p1: { x: 0.4, y: 0.57 },
      p2: { x: 0.72, y: 0.48 },
      p3: { x: 0.92, y: 0.53 },
      widthStart: 0.04,
      widthMid: 0.11,
      widthEnd: 0.03,
      pinstripeEnabled: true,
      pinstripeColorHex: primarySwatch.hex,
      pinstripeOffset: -0.08,
      pinstripeWidth: 0.04,
    },
  ];

  // Concept 2: Executive Twin-Horizon Split with High-Contrast Tail
  const concept2Stripes: BezierStripeLayer[] = [
    {
      id: `ai-${ts}-c2-s1`,
      name: `${primarySwatch.name} Executive Horizon Sweep`,
      visible: true,
      targetZone: "FUSELAGE_TAIL",
      symmetry: true,
      colorHex: primarySwatch.hex,
      paintCode: primarySwatch.paintCode,
      colorName: primarySwatch.name,
      finish: primarySwatch.defaultFinish,
      opacity: 1,
      p0: { x: 0.05, y: 0.41 },
      p1: { x: 0.38, y: 0.39 },
      p2: { x: 0.66, y: 0.41 },
      p3: { x: 0.96, y: 0.78 },
      widthStart: 0.028,
      widthMid: 0.082,
      widthEnd: 0.15,
      pinstripeEnabled: true,
      pinstripeColorHex: accentSwatch.hex,
      pinstripeOffset: 0.056,
      pinstripeWidth: 0.016,
    },
    {
      id: `ai-${ts}-c2-s2`,
      name: `${accentSwatch.name} Upper Canopy Accent`,
      visible: true,
      targetZone: "FUSELAGE_TAIL",
      symmetry: true,
      colorHex: accentSwatch.hex,
      paintCode: accentSwatch.paintCode,
      colorName: accentSwatch.name,
      finish: accentSwatch.defaultFinish,
      opacity: 1,
      p0: { x: 0.18, y: 0.52 },
      p1: { x: 0.46, y: 0.46 },
      p2: { x: 0.74, y: 0.54 },
      p3: { x: 0.92, y: 0.93 },
      widthStart: 0.008,
      widthMid: 0.025,
      widthEnd: 0.014,
      pinstripeEnabled: false,
      pinstripeColorHex: primarySwatch.hex,
      pinstripeOffset: 0.02,
      pinstripeWidth: 0.008,
    },
  ];

  // Concept 3: Aggressive S-Curve Aero Slash
  const concept3Stripes: BezierStripeLayer[] = [
    {
      id: `ai-${ts}-c3-s1`,
      name: `${accentSwatch.name} Dynamic S-Curve Slash`,
      visible: true,
      targetZone: "FUSELAGE_TAIL",
      symmetry: true,
      colorHex: accentSwatch.hex,
      paintCode: accentSwatch.paintCode,
      colorName: accentSwatch.name,
      finish: accentSwatch.defaultFinish,
      opacity: 1,
      p0: { x: 0.07, y: 0.51 },
      p1: { x: 0.34, y: 0.32 },
      p2: { x: 0.64, y: 0.58 },
      p3: { x: 0.95, y: 0.85 },
      widthStart: 0.014,
      widthMid: 0.062,
      widthEnd: 0.105,
      pinstripeEnabled: true,
      pinstripeColorHex: primarySwatch.hex,
      pinstripeOffset: -0.046,
      pinstripeWidth: 0.022,
    },
  ];

  const makeConcept = (
    idx: number,
    title: string,
    rationale: string,
    stripes: BezierStripeLayer[],
    tailSwatch: AviationSwatch,
    wingtipSwatch: AviationSwatch,
    spatSwatch: AviationSwatch
  ): GeneratedAIConcept => ({
    id: `ai-concept-${ts}-${idx}`,
    prompt,
    title,
    rationale,
    createdAt: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    presetData: {
      id: `ai-preset-${ts}-${idx}`,
      name: title,
      tagline: rationale,
      zones: {
        fuselageBase: toZoneSpec(baseSwatch),
        cowlingAntiGlare: toZoneSpec(antiGlareSwatch, "MATTE_STEALTH"),
        wingBase: toZoneSpec(baseSwatch),
        wingtips: toZoneSpec(wingtipSwatch),
        verticalTail: toZoneSpec(tailSwatch),
        wheelPants: toZoneSpec(spatSwatch),
        spinner: toZoneSpec(chromeSwatch, "POLISHED_CHROME"),
      },
      stripes,
      registration: {
        text: currentTailNumber,
        colorHex:
          baseSwatch.id === "sw-stealth-graphite" ||
          baseSwatch.id === "sw-gunmetal-grey"
            ? "#F4F6F9"
            : primarySwatch.hex,
        paintCode: primarySwatch.paintCode,
        outlineEnabled: true,
        outlineColorHex: accentSwatch.hex,
        heightInches: 12,
        slantDeg: 14,
        positionX: 0.71,
        positionY: 0.54,
      },
    },
  });

  return [
    makeConcept(
      1,
      `Variant A: ${primarySwatch.name} & ${accentSwatch.name} Dorsal Sweep`,
      `Swept aerodynamic ribbon flowing from the Rotax cowling along the waist longeron up into a ${primarySwatch.name} vertical fin with ${accentSwatch.name} pinstripes and matching wheel fairings.`,
      concept1Stripes,
      primarySwatch,
      accentSwatch,
      baseSwatch
    ),
    makeConcept(
      2,
      `Variant B: ${baseSwatch.name} Executive Twin-Ribbon`,
      `High-contrast executive tourer pairing ${baseSwatch.name} skin with a deep ${primarySwatch.name} lower fuselage sweep and ${accentSwatch.name} upper beltline accent.`,
      concept2Stripes,
      primarySwatch,
      primarySwatch,
      primarySwatch
    ),
    makeConcept(
      3,
      `Variant C: ${accentSwatch.name} Aero S-Slash`,
      `Sport-focused S-inflection curve in ${accentSwatch.name} over ${baseSwatch.name} with ${primarySwatch.name} shadow framing and matte carbon anti-glare nose panel.`,
      concept3Stripes,
      antiGlareSwatch,
      accentSwatch,
      tertiarySwatch
    ),
  ];
}
