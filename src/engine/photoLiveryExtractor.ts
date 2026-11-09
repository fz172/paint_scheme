import { AVIATION_SWATCHES } from "@/data/aviationCatalog";
import {
  AviationFinishType,
  AviationSwatch,
  LiverySchemePreset,
} from "@/types/livery";

export interface ExtractedPhotoLiveryResult {
  photoUrl: string;
  fileName: string;
  dominantBaseHex: string;
  dominantPrimaryAccentHex: string;
  dominantTrimHex: string;
  matchedBaseSwatch: AviationSwatch;
  matchedAccentSwatch: AviationSwatch;
  matchedTrimSwatch: AviationSwatch;
  generatedPreset: LiverySchemePreset;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16) || 0;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function findClosestAviationSwatch(hex: string): AviationSwatch {
  const [r1, g1, b1] = hexToRgb(hex);
  let best = AVIATION_SWATCHES[0];
  let bestDist = Infinity;

  for (const sw of AVIATION_SWATCHES) {
    const [r2, g2, b2] = hexToRgb(sw.hex);
    const dist =
      (r1 - r2) * (r1 - r2) * 0.3 +
      (g1 - g2) * (g1 - g2) * 0.59 +
      (b1 - b2) * (b1 - b2) * 0.11;
    if (dist < bestDist) {
      bestDist = dist;
      best = sw;
    }
  }
  return best;
}

/**
 * Analyzes an uploaded aircraft reference photo to extract its base fuselage color,
 * primary belly/tail sweep color, and secondary trim/stripe color, then constructs
 * a matching Sling TSi LiverySchemePreset that immediately updates the 3D preview.
 */
export async function extractLiveryFromReferencePhoto(
  file: File
): Promise<ExtractedPhotoLiveryResult> {
  const photoUrl = URL.createObjectURL(file);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`Failed to decode photo: ${file.name}`));
    el.src = photoUrl;
  });

  const W = 320;
  const H = 220;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;

  // Sample aircraft ROI (x in [0.15, 0.88], y in [0.18, 0.78]) while excluding grass/trees and tarmac
  let lightR = 0,
    lightG = 0,
    lightB = 0,
    lightCount = 0;

  // 12 Hue bins (30 deg each) for vibrant aircraft paint colors (orange, red, blue, gold, green, etc.)
  const hueBins = Array.from({ length: 12 }, () => ({
    r: 0,
    g: 0,
    b: 0,
    weight: 0,
    count: 0,
  }));

  let darkTrimR = 0,
    darkTrimG = 0,
    darkTrimB = 0,
    darkTrimCount = 0;

  for (let y = Math.floor(H * 0.18); y < Math.floor(H * 0.78); y += 2) {
    const yNorm = y / H;
    for (let x = Math.floor(W * 0.14); x < Math.floor(W * 0.88); x += 2) {
      const idx = (y * W + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const [h, s, l] = rgbToHsl(r, g, b);

      // Ignore background foliage/grass (hue 75..150 in upper background)
      if (yNorm < 0.36 && h > 70 && h < 155 && s > 0.18) continue;
      // Ignore overcast sky in top 25%
      if (yNorm < 0.25 && l > 0.82 && s < 0.12) continue;

      // 1. High-luminance aircraft skin (Matterhorn White / Pearl / Silver)
      if (l > 0.78 && s < 0.22 && yNorm > 0.26 && yNorm < 0.62) {
        lightR += r;
        lightG += g;
        lightB += b;
        lightCount++;
      }

      // 2. Chromatic / Saturated livery paint (e.g., Blaze Orange, Viper Red, Cobalt Blue, Gold)
      if (s > 0.32 && l > 0.22 && l < 0.78) {
        const binIdx = Math.floor(h / 30) % 12;
        const w = s * s * (1 - Math.abs(l - 0.5));
        hueBins[binIdx].r += r * w;
        hueBins[binIdx].g += g * w;
        hueBins[binIdx].b += b * w;
        hueBins[binIdx].weight += w;
        hueBins[binIdx].count++;
      }

      // 3. Dark metallic / charcoal trim & registration marks
      if (l >= 0.16 && l <= 0.42 && s < 0.28 && yNorm > 0.35 && yNorm < 0.65) {
        darkTrimR += r;
        darkTrimG += g;
        darkTrimB += b;
        darkTrimCount++;
      }
    }
  }

  const dominantBaseHex =
    lightCount > 20
      ? rgbToHex(lightR / lightCount, lightG / lightCount, lightB / lightCount)
      : "#F5F7FA";

  // Find strongest chromatic hue bin for primary livery accent
  let bestBin = hueBins[0];
  for (const bin of hueBins) {
    if (bin.weight > bestBin.weight) {
      bestBin = bin;
    }
  }

  const dominantPrimaryAccentHex =
    bestBin.weight > 2
      ? rgbToHex(
          bestBin.r / bestBin.weight,
          bestBin.g / bestBin.weight,
          bestBin.b / bestBin.weight
        )
      : "#EA580C";

  const dominantTrimHex =
    darkTrimCount > 15
      ? rgbToHex(
          darkTrimR / darkTrimCount,
          darkTrimG / darkTrimCount,
          darkTrimB / darkTrimCount
        )
      : "#374151";

  const matchedBaseSwatch = findClosestAviationSwatch(dominantBaseHex);
  const matchedAccentSwatch = findClosestAviationSwatch(
    dominantPrimaryAccentHex
  );
  const matchedTrimSwatch = findClosestAviationSwatch(dominantTrimHex);

  const ts = Date.now();
  const generatedPreset: LiverySchemePreset = {
    id: `photo-extracted-${ts}`,
    name: `Photo-Matched Scheme (${file.name.slice(0, 18)})`,
    tagline: `Extracted from uploaded photo: ${matchedBaseSwatch.name} upper fuselage with ${matchedAccentSwatch.name} belly/tail sweep and ${matchedTrimSwatch.name} trim`,
    zones: {
      fuselageBase: {
        colorHex: dominantBaseHex,
        paintCode: matchedBaseSwatch.paintCode,
        colorName: matchedBaseSwatch.name,
        finish: "HIGH_GLOSS" as AviationFinishType,
      },
      cowlingAntiGlare: {
        colorHex: dominantBaseHex,
        paintCode: matchedBaseSwatch.paintCode,
        colorName: matchedBaseSwatch.name,
        finish: "HIGH_GLOSS" as AviationFinishType,
      },
      wingBase: {
        colorHex: dominantBaseHex,
        paintCode: matchedBaseSwatch.paintCode,
        colorName: matchedBaseSwatch.name,
        finish: "HIGH_GLOSS" as AviationFinishType,
      },
      wingtips: {
        colorHex: dominantPrimaryAccentHex,
        paintCode: matchedAccentSwatch.paintCode,
        colorName: matchedAccentSwatch.name,
        finish: "PEARLESCENT" as AviationFinishType,
      },
      verticalTail: {
        colorHex: dominantBaseHex,
        paintCode: matchedBaseSwatch.paintCode,
        colorName: matchedBaseSwatch.name,
        finish: "HIGH_GLOSS" as AviationFinishType,
      },
      wheelPants: {
        colorHex: dominantBaseHex,
        paintCode: matchedBaseSwatch.paintCode,
        colorName: matchedBaseSwatch.name,
        finish: "HIGH_GLOSS" as AviationFinishType,
      },
      spinner: {
        colorHex: dominantBaseHex,
        paintCode: matchedBaseSwatch.paintCode,
        colorName: matchedBaseSwatch.name,
        finish: "HIGH_GLOSS" as AviationFinishType,
      },
    },
    stripes: [
      {
        id: `photo-${ts}-belly`,
        name: `Photo-Extracted ${matchedAccentSwatch.name} Lower Belly Zone`,
        visible: true,
        targetZone: "FUSELAGE_TAIL",
        symmetry: true,
        colorHex: dominantPrimaryAccentHex,
        paintCode: matchedAccentSwatch.paintCode,
        colorName: matchedAccentSwatch.name,
        finish: "PEARLESCENT",
        opacity: 1,
        fillBelowCurve: true,
        p0: { x: 0.05, y: 0.29 },
        p1: { x: 0.36, y: 0.31 },
        p2: { x: 0.66, y: 0.23 },
        p3: { x: 0.96, y: 0.28 },
        widthStart: 0.015,
        widthMid: 0.022,
        widthEnd: 0.025,
        pinstripeEnabled: true,
        pinstripeColorHex: dominantTrimHex,
        pinstripeOffset: 0.018,
        pinstripeWidth: 0.012,
      },
      {
        id: `photo-${ts}-rudder`,
        name: `Photo-Extracted ${matchedAccentSwatch.name} Rear Rudder Sweep`,
        visible: true,
        targetZone: "FUSELAGE_TAIL",
        symmetry: true,
        colorHex: dominantPrimaryAccentHex,
        paintCode: matchedAccentSwatch.paintCode,
        colorName: matchedAccentSwatch.name,
        finish: "PEARLESCENT",
        opacity: 1,
        fillBelowCurve: true,
        p0: { x: 0.81, y: 0.25 },
        p1: { x: 0.89, y: 0.36 },
        p2: { x: 0.94, y: 0.65 },
        p3: { x: 0.976, y: 0.96 },
        widthStart: 0.015,
        widthMid: 0.024,
        widthEnd: 0.028,
        pinstripeEnabled: true,
        pinstripeColorHex: dominantTrimHex,
        pinstripeOffset: 0.018,
        pinstripeWidth: 0.013,
      },
      {
        id: `photo-${ts}-spear`,
        name: `Photo-Extracted ${matchedTrimSwatch.name} Cabin Spear`,
        visible: true,
        targetZone: "FUSELAGE_TAIL",
        symmetry: true,
        colorHex: dominantTrimHex,
        paintCode: matchedTrimSwatch.paintCode,
        colorName: matchedTrimSwatch.name,
        finish: "METALLIC",
        opacity: 1,
        p0: { x: 0.16, y: 0.32 },
        p1: { x: 0.33, y: 0.35 },
        p2: { x: 0.46, y: 0.37 },
        p3: { x: 0.56, y: 0.43 },
        widthStart: 0.005,
        widthMid: 0.024,
        widthEnd: 0.004,
        pinstripeEnabled: true,
        pinstripeColorHex: "#94A3B8",
        pinstripeOffset: -0.015,
        pinstripeWidth: 0.008,
      },
      {
        id: `photo-${ts}-fincap`,
        name: "Vertical Fin Top Cap Trim",
        visible: true,
        targetZone: "FUSELAGE_TAIL",
        symmetry: true,
        colorHex: dominantPrimaryAccentHex,
        paintCode: matchedAccentSwatch.paintCode,
        colorName: matchedAccentSwatch.name,
        finish: "PEARLESCENT",
        opacity: 1,
        p0: { x: 0.85, y: 0.94 },
        p1: { x: 0.89, y: 0.95 },
        p2: { x: 0.94, y: 0.95 },
        p3: { x: 0.98, y: 0.95 },
        widthStart: 0.06,
        widthMid: 0.06,
        widthEnd: 0.06,
        pinstripeEnabled: true,
        pinstripeColorHex: dominantBaseHex,
        pinstripeOffset: -0.036,
        pinstripeWidth: 0.008,
      },
      {
        id: `photo-${ts}-spats`,
        name: "Two-Tone Wheel Pant Upper Cap",
        visible: true,
        targetZone: "WHEEL_PANTS",
        symmetry: true,
        colorHex: dominantPrimaryAccentHex,
        paintCode: matchedAccentSwatch.paintCode,
        colorName: matchedAccentSwatch.name,
        finish: "PEARLESCENT",
        opacity: 1,
        p0: { x: 0.02, y: 0.65 },
        p1: { x: 0.35, y: 0.72 },
        p2: { x: 0.7, y: 0.62 },
        p3: { x: 0.98, y: 0.52 },
        widthStart: 0.42,
        widthMid: 0.46,
        widthEnd: 0.35,
        pinstripeEnabled: true,
        pinstripeColorHex: dominantTrimHex,
        pinstripeOffset: -0.24,
        pinstripeWidth: 0.055,
      },
    ],
    registration: {
      text: "N532SL",
      colorHex: dominantTrimHex,
      paintCode: matchedTrimSwatch.paintCode,
      outlineEnabled: false,
      outlineColorHex: dominantBaseHex,
      heightInches: 11.5,
      slantDeg: 14,
      positionX: 0.605,
      positionY: 0.34,
    },
  };

  return {
    photoUrl,
    fileName: file.name,
    dominantBaseHex,
    dominantPrimaryAccentHex,
    dominantTrimHex,
    matchedBaseSwatch,
    matchedAccentSwatch,
    matchedTrimSwatch,
    generatedPreset,
  };
}
