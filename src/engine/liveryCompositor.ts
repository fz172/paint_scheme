import * as THREE from "three";
import {
  AirframeCalibration,
  AviationFinishType,
  BezierStripeLayer,
  CustomDecalLayer,
  LiverySchemePreset,
  RegistrationConfig,
} from "@/types/livery";
import { FINISH_PRESETS } from "@/data/aviationCatalog";

export interface CompositedLiveryTextures {
  fuselageAlbedo: THREE.CanvasTexture;
  fuselageRoughness: THREE.CanvasTexture;
  fuselageMetalness: THREE.CanvasTexture;
  fuselageBump: THREE.CanvasTexture;
  wheelPantsAlbedo: THREE.CanvasTexture;
}

function finishToGrayHex(val: number): string {
  const byte = Math.max(0, Math.min(255, Math.round(val * 255)));
  const hex = byte.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

/**
 * Evaluates a cubic Bezier curve at parameter t in [0, 1]
 */
export function evalBezierPoint(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const a = mt2 * mt;
  const b = 3 * mt2 * t;
  const c = 3 * mt * t2;
  const d = t2 * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/**
 * Evaluates the unit normal vector perpendicular to a cubic Bezier curve at t in [0, 1]
 */
export function evalBezierNormal(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
): { nx: number; ny: number } {
  const mt = 1 - t;
  const dx =
    3 * mt * mt * (p1.x - p0.x) +
    6 * mt * t * (p2.x - p1.x) +
    3 * t * t * (p3.x - p2.x);
  const dy =
    3 * mt * mt * (p1.y - p0.y) +
    6 * mt * t * (p2.y - p1.y) +
    3 * t * t * (p3.y - p2.y);
  const len = Math.hypot(dx, dy) || 1e-6;
  return { nx: -dy / len, ny: dx / len };
}

/**
 * Draws a tapered variable-width Bezier ribbon polygon onto a 2D canvas context
 */
export function traceTaperedBezierRibbon(
  ctx: CanvasRenderingContext2D,
  stripe: BezierStripeLayer,
  mapCoord: (uNorm: number, vNorm: number) => { x: number; y: number },
  offsetNorm = 0,
  overrideWidths?: { start: number; mid: number; end: number }
) {
  const steps = 64;
  const upperPts: { x: number; y: number }[] = [];
  const lowerPts: { x: number; y: number }[] = [];

  const wStart = overrideWidths ? overrideWidths.start : stripe.widthStart;
  const wMid = overrideWidths ? overrideWidths.mid : stripe.widthMid;
  const wEnd = overrideWidths ? overrideWidths.end : stripe.widthEnd;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pt = evalBezierPoint(stripe.p0, stripe.p1, stripe.p2, stripe.p3, t);
    const norm = evalBezierNormal(
      stripe.p0,
      stripe.p1,
      stripe.p2,
      stripe.p3,
      t
    );

    // Smooth quadratic width interpolation from start -> mid -> end
    const width =
      (1 - t) * (1 - t) * wStart +
      2 * (1 - t) * t * wMid +
      t * t * wEnd;
    const halfW = width * 0.5;

    const uUp = pt.x + norm.nx * (offsetNorm + halfW);
    const vUp = pt.y + norm.ny * (offsetNorm + halfW);
    const uLow = pt.x + norm.nx * (offsetNorm - halfW);
    const vLow = pt.y + norm.ny * (offsetNorm - halfW);

    upperPts.push(mapCoord(uUp, vUp));
    lowerPts.push(mapCoord(uLow, vLow));
  }

  ctx.beginPath();
  ctx.moveTo(upperPts[0].x, upperPts[0].y);
  for (let i = 1; i <= steps; i++) {
    ctx.lineTo(upperPts[i].x, upperPts[i].y);
  }
  for (let i = steps; i >= 0; i--) {
    ctx.lineTo(lowerPts[i].x, lowerPts[i].y);
  }
  ctx.closePath();
}

/**
 * Renders the 4K/2K Albedo, Roughness, Metalness, and Panel-Line Bump textures
 * for the Sling TSi airframe and wheel fairings.
 */
export function renderCompositedLiveryTextures(
  calibration: AirframeCalibration,
  zones: LiverySchemePreset["zones"],
  stripes: BezierStripeLayer[],
  registration: RegistrationConfig,
  decals: CustomDecalLayer[],
  resolution = 2048
): CompositedLiveryTextures {
  const W = resolution;
  const H = resolution;

  const albedoCanvas = document.createElement("canvas");
  albedoCanvas.width = W;
  albedoCanvas.height = H;
  const ctxA = albedoCanvas.getContext("2d")!;

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = W;
  roughCanvas.height = H;
  const ctxR = roughCanvas.getContext("2d")!;

  const metalCanvas = document.createElement("canvas");
  metalCanvas.width = W;
  metalCanvas.height = H;
  const ctxM = metalCanvas.getContext("2d")!;

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = W;
  bumpCanvas.height = H;
  const ctxB = bumpCanvas.getContext("2d")!;

  const fillAllChannels = (
    colorHex: string,
    finish: AviationFinishType,
    drawFn: (ctx: CanvasRenderingContext2D) => void
  ) => {
    const f = FINISH_PRESETS[finish] || FINISH_PRESETS.HIGH_GLOSS;
    ctxA.fillStyle = colorHex;
    drawFn(ctxA);

    ctxR.fillStyle = finishToGrayHex(f.roughness);
    drawFn(ctxR);

    ctxM.fillStyle = finishToGrayHex(f.metalness);
    drawFn(ctxM);
  };

  // 1. Fill Base Fuselage Coat across entire atlas
  fillAllChannels(
    zones.fuselageBase.colorHex,
    zones.fuselageBase.finish,
    (ctx) => {
      ctx.fillRect(0, 0, W, H);
    }
  );

  // Helper that maps normalized side-profile coordinates (uNorm in [0,1], vNorm in [0,1])
  // into either the Port half (isPort=true) or Starboard half (isPort=false) of the UV atlas
  const makeSideMapper =
    (isPort: boolean) => (uNorm: number, vNorm: number) => {
      const u = 0.02 + uNorm * 0.96;
      const v = isPort ? 0.52 + vNorm * 0.46 : 0.02 + vNorm * 0.46;
      return {
        x: u * W,
        y: (1 - v) * H,
      };
    };

  const renderSideBand = (isPort: boolean) => {
    const mapCoord = makeSideMapper(isPort);

    // 2. Vertical Tail Fin Base Zone (Swept polygon on rear upper empennage)
    fillAllChannels(
      zones.verticalTail.colorHex,
      zones.verticalTail.finish,
      (ctx) => {
        const pRootLE = mapCoord(0.76, 0.52);
        const pTipLE = mapCoord(0.87, 0.99);
        const pTipTE = mapCoord(0.99, 0.99);
        const pRootTE = mapCoord(0.97, 0.46);
        ctx.beginPath();
        ctx.moveTo(pRootLE.x, pRootLE.y);
        ctx.lineTo(pTipLE.x, pTipLE.y);
        ctx.lineTo(pTipTE.x, pTipTE.y);
        ctx.lineTo(pRootTE.x, pRootTE.y);
        ctx.closePath();
        ctx.fill();
      }
    );

    // 3. Anti-Glare Upper Cowling Panel (in front of windshield, u in [0.05, 0.27], v > 0.49)
    if (calibration.antiGlareMaskEnabled) {
      fillAllChannels(
        zones.cowlingAntiGlare.colorHex,
        zones.cowlingAntiGlare.finish,
        (ctx) => {
          const p1 = mapCoord(0.05, 0.47);
          const p2 = mapCoord(0.26, 0.56);
          const p3 = mapCoord(0.26, 0.68);
          const p4 = mapCoord(0.05, 0.56);
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.lineTo(p4.x, p4.y);
          ctx.closePath();
          ctx.fill();
        }
      );
    }

    // 4. Render Bezier Vector Stripes & Secondary Pinstripes
    for (const stripe of stripes) {
      if (!stripe.visible || stripe.targetZone !== "FUSELAGE_TAIL") continue;
      if (!isPort && !stripe.symmetry) continue;

      ctxA.save();
      ctxA.globalAlpha = stripe.opacity ?? 1;
      fillAllChannels(stripe.colorHex, stripe.finish, (ctx) => {
        traceTaperedBezierRibbon(ctx, stripe, mapCoord, 0);
        ctx.fill();
      });

      if (stripe.pinstripeEnabled) {
        fillAllChannels(stripe.pinstripeColorHex, stripe.finish, (ctx) => {
          traceTaperedBezierRibbon(
            ctx,
            stripe,
            mapCoord,
            stripe.pinstripeOffset,
            {
              start: stripe.pinstripeWidth * 0.7,
              mid: stripe.pinstripeWidth,
              end: stripe.pinstripeWidth * 0.8,
            }
          );
          ctx.fill();
        });
      }
      ctxA.restore();
    }

    // 5. Render Custom Badges / Emblems (e.g., Sling Tail Emblem)
    for (const decal of decals) {
      if (!decal.visible) continue;
      if (!isPort && !decal.symmetry) continue;

      const center = mapCoord(decal.positionX, decal.positionY);
      const radiusPx = 0.026 * decal.scale * W;

      ctxA.save();
      ctxA.translate(center.x, center.y);
      ctxA.rotate(((isPort ? 1 : -1) * decal.rotationDeg * Math.PI) / 180);
      if (!isPort) {
        ctxA.scale(-1, 1);
      }

      if (decal.type === "SLING_BADGE") {
        // Stylized aerodynamic Sling bird/wing emblem
        ctxA.fillStyle = decal.colorHex;
        ctxA.beginPath();
        ctxA.moveTo(-radiusPx * 1.2, radiusPx * 0.2);
        ctxA.quadraticCurveTo(0, -radiusPx * 0.9, radiusPx * 1.3, -radiusPx * 0.4);
        ctxA.quadraticCurveTo(radiusPx * 0.2, -radiusPx * 0.1, -radiusPx * 1.2, radiusPx * 0.2);
        ctxA.fill();

        ctxA.beginPath();
        ctxA.moveTo(-radiusPx * 0.7, radiusPx * 0.55);
        ctxA.quadraticCurveTo(radiusPx * 0.2, -radiusPx * 0.2, radiusPx * 1.0, radiusPx * 0.05);
        ctxA.quadraticCurveTo(radiusPx * 0.1, radiusPx * 0.25, -radiusPx * 0.7, radiusPx * 0.55);
        ctxA.fill();
      } else if (decal.type === "STAR_INSIGNIA") {
        ctxA.fillStyle = decal.colorHex;
        ctxA.beginPath();
        for (let k = 0; k < 5; k++) {
          const a1 = (k * 4 * Math.PI) / 5 - Math.PI / 2;
          const x = Math.cos(a1) * radiusPx;
          const y = Math.sin(a1) * radiusPx;
          if (k === 0) ctxA.moveTo(x, y);
          else ctxA.lineTo(x, y);
        }
        ctxA.closePath();
        ctxA.fill();
      }
      ctxA.restore();
    }

    // 6. Render Symmetric Registration Number (N-Number)
    // Port side reads Left->Right (+U), Starboard side is horizontally un-flipped so it ALSO reads Left->Right when viewed from the right side!
    if (registration.enabled && registration.text.trim().length > 0) {
      if (isPort || registration.symmetry) {
        const regCenter = mapCoord(
          registration.positionX,
          registration.positionY
        );
        // Physical height scaling: aircraft heightM is mapped across 0.46 of atlas height
        const heightMeters = (registration.heightInches || 12) * 0.0254;
        const airframeHeightM = calibration.heightM || 2.45;
        const fontPx = Math.max(
          18,
          Math.round((heightMeters / airframeHeightM) * 0.46 * H * 1.15)
        );

        const fontMap: Record<RegistrationConfig["font"], string> = {
          AERO_ITALIC: `900 ${fontPx}px "Arial Black", "Helvetica Neue", sans-serif`,
          FAA_BLOCK: `800 ${fontPx}px "Impact", "Arial Black", sans-serif`,
          MIL_STENCIL: `800 ${fontPx}px "Courier New", monospace`,
          EXEC_SANS: `700 ${fontPx}px "Inter", "Helvetica Neue", sans-serif`,
        };

        const drawRegText = (
          ctx: CanvasRenderingContext2D,
          fillStyle: string,
          withOutline: boolean
        ) => {
          ctx.save();
          ctx.translate(regCenter.x, regCenter.y);
          if (!isPort) {
            // Mirror horizontally so Starboard text reads Left-to-Right from outside the aircraft
            ctx.scale(-1, 1);
          }
          // Italic slant leans toward the tail on BOTH sides!
          const slantTan = Math.tan(
            (-(registration.slantDeg || 0) * Math.PI) / 180
          );
          ctx.transform(1, 0, slantTan, 1, 0, 0);

          ctx.font = fontMap[registration.font] || fontMap.AERO_ITALIC;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          if (withOutline && registration.outlineEnabled) {
            ctx.strokeStyle = registration.outlineColorHex;
            ctx.lineWidth = Math.max(2, (registration.outlineWidth || 2) * (W / 1024));
            ctx.lineJoin = "round";
            ctx.strokeText(registration.text.toUpperCase(), 0, 0);
          }
          ctx.fillStyle = fillStyle;
          ctx.fillText(registration.text.toUpperCase(), 0, 0);
          ctx.restore();
        };

        const regFinish =
          FINISH_PRESETS[registration.finish] || FINISH_PRESETS.HIGH_GLOSS;
        drawRegText(ctxA, registration.colorHex, true);
        drawRegText(ctxR, finishToGrayHex(regFinish.roughness), false);
        drawRegText(ctxM, finishToGrayHex(regFinish.metalness), false);
      }
    }
  };

  renderSideBand(true); // Port (Left)
  renderSideBand(false); // Starboard (Right)

  // 7. Render Flush-Riveted Alclad Panel Seams, Doors, NACA Louvers & Rivet Lines
  ctxB.fillStyle = "#808080";
  ctxB.fillRect(0, 0, W, H);

  if (calibration.showPanelLinesAndRivets) {
    const intensity = calibration.panelLineIntensity ?? 0.55;
    for (const isPort of [true, false]) {
      const mapCoord = makeSideMapper(isPort);

      ctxB.strokeStyle = "#303030";
      ctxB.lineWidth = Math.max(1.5, W / 1024);

      ctxA.save();
      ctxA.strokeStyle = `rgba(15, 23, 42, ${0.18 * intensity})`;
      ctxA.lineWidth = Math.max(1.2, W / 1200);

      // Vertical fuselage bulkheads / station seams (Firewall, Cabin Frame, Tailcone Stations)
      const stationsU = [0.22, 0.37, 0.53, 0.64, 0.75, 0.85, 0.92];
      for (const u of stationsU) {
        const pTop = mapCoord(u, u > 0.78 ? 0.96 : 0.62);
        const pBot = mapCoord(u, 0.08);
        for (const c of [ctxB, ctxA]) {
          c.beginPath();
          c.moveTo(pTop.x, pTop.y);
          c.lineTo(pBot.x, pBot.y);
          c.stroke();
        }
      }

      // Longitudinal skin lap seams
      for (const vLine of [0.28, 0.41]) {
        const pStart = mapCoord(0.22, vLine);
        const pEnd = mapCoord(0.92, vLine + 0.06);
        for (const c of [ctxB, ctxA]) {
          c.beginPath();
          c.moveTo(pStart.x, pStart.y);
          c.lineTo(pEnd.x, pEnd.y);
          c.stroke();
        }
      }

      // Rudder hinge seam on vertical tail
      const rTop = mapCoord(0.93, 0.98);
      const rBot = mapCoord(0.9, 0.48);
      for (const c of [ctxB, ctxA]) {
        c.beginPath();
        c.moveTo(rTop.x, rTop.y);
        c.lineTo(rBot.x, rBot.y);
        c.stroke();
      }

      // Cowling NACA cooling duct & exhaust louver detail
      const naca = mapCoord(0.14, 0.39);
      ctxA.fillStyle = `rgba(15, 23, 42, ${0.45 * intensity})`;
      ctxA.beginPath();
      ctxA.ellipse(naca.x, naca.y, W * 0.014, H * 0.005, 0, 0, Math.PI * 2);
      ctxA.fill();

      ctxA.restore();
    }
  }

  // 8. Render Wheel Pants (Spats) Texture
  const spatCanvas = document.createElement("canvas");
  spatCanvas.width = 512;
  spatCanvas.height = 512;
  const ctxSpat = spatCanvas.getContext("2d")!;
  ctxSpat.fillStyle = zones.wheelPants.colorHex;
  ctxSpat.fillRect(0, 0, 512, 512);

  for (const stripe of stripes) {
    if (!stripe.visible || stripe.targetZone !== "WHEEL_PANTS") continue;
    ctxSpat.fillStyle = stripe.colorHex;
    traceTaperedBezierRibbon(
      ctxSpat,
      stripe,
      (u, v) => ({ x: u * 512, y: (1 - v) * 512 }),
      0
    );
    ctxSpat.fill();

    if (stripe.pinstripeEnabled) {
      ctxSpat.fillStyle = stripe.pinstripeColorHex;
      traceTaperedBezierRibbon(
        ctxSpat,
        stripe,
        (u, v) => ({ x: u * 512, y: (1 - v) * 512 }),
        stripe.pinstripeOffset,
        {
          start: stripe.pinstripeWidth,
          mid: stripe.pinstripeWidth,
          end: stripe.pinstripeWidth,
        }
      );
      ctxSpat.fill();
    }
  }

  const makeTex = (canvas: HTMLCanvasElement, isColor: boolean) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    if (isColor) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.needsUpdate = true;
    return tex;
  };

  return {
    fuselageAlbedo: makeTex(albedoCanvas, true),
    fuselageRoughness: makeTex(roughCanvas, false),
    fuselageMetalness: makeTex(metalCanvas, false),
    fuselageBump: makeTex(bumpCanvas, false),
    wheelPantsAlbedo: makeTex(spatCanvas, true),
  };
}
