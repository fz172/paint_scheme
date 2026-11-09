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
 * Traces either a tapered ribbon OR a lower-belly/rear-tail region fill below the Bezier curve
 */
export function traceTaperedBezierRibbon(
  ctx: CanvasRenderingContext2D,
  stripe: BezierStripeLayer,
  mapCoord: (uNorm: number, vNorm: number) => { x: number; y: number },
  offsetNorm = 0,
  overrideWidths?: { start: number; mid: number; end: number },
  forceRibbonOnly = false
) {
  const steps = 68;

  if (stripe.fillBelowCurve && !forceRibbonOnly && offsetNorm === 0) {
    // Fill lower belly or rear rudder zone below and behind the Bezier curve
    const startX = stripe.p0.x > 0.45 ? stripe.p0.x : 0.0;
    ctx.beginPath();
    const first = mapCoord(startX, stripe.p0.y);
    ctx.moveTo(first.x, first.y);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const pt = evalBezierPoint(stripe.p0, stripe.p1, stripe.p2, stripe.p3, t);
      const mapped = mapCoord(pt.x, pt.y);
      ctx.lineTo(mapped.x, mapped.y);
    }
    const rearTop = mapCoord(1.0, stripe.p3.y);
    const rearBot = mapCoord(1.0, 0.0);
    const frontBot = mapCoord(startX, 0.0);
    ctx.lineTo(rearTop.x, rearTop.y);
    ctx.lineTo(rearBot.x, rearBot.y);
    ctx.lineTo(frontBot.x, frontBot.y);
    ctx.closePath();
    return;
  }

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

    // 2. Vertical Tail Fin Base Zone
    fillAllChannels(
      zones.verticalTail.colorHex,
      zones.verticalTail.finish,
      (ctx) => {
        const pRootLE = mapCoord(0.76, 0.44);
        const pTipLE = mapCoord(0.87, 0.99);
        const pTipTE = mapCoord(0.99, 0.99);
        const pRootTE = mapCoord(0.98, 0.4);
        ctx.beginPath();
        ctx.moveTo(pRootLE.x, pRootLE.y);
        ctx.lineTo(pTipLE.x, pTipLE.y);
        ctx.lineTo(pTipTE.x, pTipTE.y);
        ctx.lineTo(pRootTE.x, pRootTE.y);
        ctx.closePath();
        ctx.fill();
      }
    );

    // 3. Anti-Glare Upper Cowling Panel (only if distinct from fuselageBase)
    if (
      calibration.antiGlareMaskEnabled &&
      zones.cowlingAntiGlare.colorHex.toLowerCase() !==
        zones.fuselageBase.colorHex.toLowerCase()
    ) {
      fillAllChannels(
        zones.cowlingAntiGlare.colorHex,
        zones.cowlingAntiGlare.finish,
        (ctx) => {
          const p1 = mapCoord(0.05, 0.45);
          const p2 = mapCoord(0.24, 0.54);
          const p3 = mapCoord(0.24, 0.65);
          const p4 = mapCoord(0.05, 0.55);
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

    // 4. Render Bezier Vector Stripes, Belly/Rudder Fills & Secondary Pinstripes
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
              start: stripe.pinstripeWidth * 0.75,
              mid: stripe.pinstripeWidth,
              end: stripe.pinstripeWidth * 0.85,
            },
            true
          );
          ctx.fill();
        });
      }
      ctxA.restore();
    }

    // 5. Render Custom Badges / Emblems
    for (const decal of decals) {
      if (!decal.visible) continue;
      if (!isPort && !decal.symmetry) continue;

      const center = mapCoord(decal.positionX, decal.positionY);
      const radiusPx = 0.024 * decal.scale * W;

      ctxA.save();
      ctxA.translate(center.x, center.y);
      ctxA.rotate(((isPort ? 1 : -1) * decal.rotationDeg * Math.PI) / 180);
      if (!isPort) {
        ctxA.scale(-1, 1);
      }

      if (decal.type === "SLING_BADGE") {
        ctxA.fillStyle = decal.colorHex;
        ctxA.beginPath();
        ctxA.moveTo(-radiusPx * 1.2, radiusPx * 0.2);
        ctxA.quadraticCurveTo(
          0,
          -radiusPx * 0.9,
          radiusPx * 1.3,
          -radiusPx * 0.4
        );
        ctxA.quadraticCurveTo(
          radiusPx * 0.2,
          -radiusPx * 0.1,
          -radiusPx * 1.2,
          radiusPx * 0.2
        );
        ctxA.fill();

        ctxA.beginPath();
        ctxA.moveTo(-radiusPx * 0.7, radiusPx * 0.55);
        ctxA.quadraticCurveTo(
          radiusPx * 0.2,
          -radiusPx * 0.2,
          radiusPx * 1.0,
          radiusPx * 0.05
        );
        ctxA.quadraticCurveTo(
          radiusPx * 0.1,
          radiusPx * 0.25,
          -radiusPx * 0.7,
          radiusPx * 0.55
        );
        ctxA.fill();
      }
      ctxA.restore();
    }

    // 6. Render Symmetric Registration Number (N-Number)
    if (registration.enabled && registration.text.trim().length > 0) {
      if (isPort || registration.symmetry) {
        const regCenter = mapCoord(
          registration.positionX,
          registration.positionY
        );
        const heightMeters = (registration.heightInches || 11.5) * 0.0254;
        const airframeHeightM = calibration.heightM || 2.35;
        const fontPx = Math.max(
          18,
          Math.round((heightMeters / airframeHeightM) * 0.46 * H * 1.22)
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
            ctx.scale(-1, 1);
          }
          const slantTan = Math.tan(
            (-(registration.slantDeg || 0) * Math.PI) / 180
          );
          ctx.transform(1, 0, slantTan, 1, 0, 0);

          ctx.font = fontMap[registration.font] || fontMap.AERO_ITALIC;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          if (withOutline && registration.outlineEnabled) {
            ctx.strokeStyle = registration.outlineColorHex;
            ctx.lineWidth = Math.max(
              2,
              (registration.outlineWidth || 2) * (W / 1024)
            );
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

  renderSideBand(true);
  renderSideBand(false);

  // 6b. Render the 3 Signature Sling 4 TSi Smoked Acrylic Cabin Windows
  // (1: One-piece Wrap-Around Windshield, 2: Gullwing Side Door Window, 3: Rear Passenger Quarter Window)
  // Painted A-pillar, B-pillar, and roof centerline spine remain in the fuselage paint scheme!
  const drawSlingCabinWindows = (isPort: boolean) => {
    const mapCoord = makeSideMapper(isPort);

    const traceWindshield = (ctx: CanvasRenderingContext2D) => {
      const p0 = mapCoord(0.233, 0.495);
      const c1 = mapCoord(0.265, 0.625);
      const c2 = mapCoord(0.305, 0.725);
      const pTop = mapCoord(0.34, 0.73);
      const pBotRear = mapCoord(0.348, 0.415);
      const c3 = mapCoord(0.305, 0.415);
      const c4 = mapCoord(0.265, 0.445);

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, pTop.x, pTop.y);
      ctx.lineTo(pBotRear.x, pBotRear.y);
      ctx.bezierCurveTo(c3.x, c3.y, c4.x, c4.y, p0.x, p0.y);
      ctx.closePath();
    };

    const traceGullwingDoorWindow = (ctx: CanvasRenderingContext2D) => {
      const pBotFront = mapCoord(0.364, 0.415);
      const pTopFront = mapCoord(0.356, 0.642);
      const cTop1 = mapCoord(0.388, 0.662);
      const cTop2 = mapCoord(0.432, 0.638);
      const pTopRear = mapCoord(0.464, 0.595);
      const pBotRear = mapCoord(0.46, 0.422);
      const cBot1 = mapCoord(0.425, 0.416);
      const cBot2 = mapCoord(0.39, 0.414);

      ctx.beginPath();
      ctx.moveTo(pBotFront.x, pBotFront.y);
      ctx.lineTo(pTopFront.x, pTopFront.y);
      ctx.bezierCurveTo(
        cTop1.x,
        cTop1.y,
        cTop2.x,
        cTop2.y,
        pTopRear.x,
        pTopRear.y
      );
      ctx.lineTo(pBotRear.x, pBotRear.y);
      ctx.bezierCurveTo(
        cBot1.x,
        cBot1.y,
        cBot2.x,
        cBot2.y,
        pBotFront.x,
        pBotFront.y
      );
      ctx.closePath();
    };

    const traceRearQuarterWindow = (ctx: CanvasRenderingContext2D) => {
      const pBotFront = mapCoord(0.482, 0.428);
      const pTopFront = mapCoord(0.485, 0.575);
      const cTop1 = mapCoord(0.508, 0.56);
      const cTop2 = mapCoord(0.528, 0.538);
      const pTopRear = mapCoord(0.542, 0.512);
      const pBotRear = mapCoord(0.538, 0.44);
      const cBot1 = mapCoord(0.518, 0.434);
      const cBot2 = mapCoord(0.498, 0.43);

      ctx.beginPath();
      ctx.moveTo(pBotFront.x, pBotFront.y);
      ctx.lineTo(pTopFront.x, pTopFront.y);
      ctx.bezierCurveTo(
        cTop1.x,
        cTop1.y,
        cTop2.x,
        cTop2.y,
        pTopRear.x,
        pTopRear.y
      );
      ctx.lineTo(pBotRear.x, pBotRear.y);
      ctx.bezierCurveTo(
        cBot1.x,
        cBot1.y,
        cBot2.x,
        cBot2.y,
        pBotFront.x,
        pBotFront.y
      );
      ctx.closePath();
    };

    const windowTracers = [
      traceWindshield,
      traceGullwingDoorWindow,
      traceRearQuarterWindow,
    ];

    const topSample = mapCoord(0.38, 0.68);
    const botSample = mapCoord(0.38, 0.41);
    const tint = Math.max(0.15, Math.min(0.95, calibration.canopyTint ?? 0.38));

    // Smoked aviation acrylic glass gradient with subtle horizon sheen
    const grad = ctxA.createLinearGradient(
      0,
      topSample.y,
      0,
      botSample.y
    );
    grad.addColorStop(0, tint > 0.5 ? "#0F172A" : "#1E293B");
    grad.addColorStop(0.38, tint > 0.5 ? "#1E293B" : "#334155");
    grad.addColorStop(0.52, tint > 0.5 ? "#334155" : "#475569");
    grad.addColorStop(1, "#0F172A");

    for (const traceFn of windowTracers) {
      ctxA.save();
      traceFn(ctxA);
      ctxA.fillStyle = grad;
      ctxA.fill();
      ctxA.strokeStyle = "#1E293B";
      ctxA.lineWidth = Math.max(2.5, W / 720);
      ctxA.lineJoin = "round";
      ctxA.stroke();
      ctxA.restore();

      // Mirror-smooth glass roughness (0.02) and high specular reflection
      ctxR.save();
      traceFn(ctxR);
      ctxR.fillStyle = finishToGrayHex(0.02);
      ctxR.fill();
      ctxR.restore();

      ctxM.save();
      traceFn(ctxM);
      ctxM.fillStyle = finishToGrayHex(0.22);
      ctxM.fill();
      ctxM.restore();
    }
  };

  drawSlingCabinWindows(true);
  drawSlingCabinWindows(false);

  // 7. Render Flush-Riveted Alclad Panel Seams
  ctxB.fillStyle = "#808080";
  ctxB.fillRect(0, 0, W, H);

  if (calibration.showPanelLinesAndRivets) {
    const intensity = calibration.panelLineIntensity ?? 0.55;
    for (const isPort of [true, false]) {
      const mapCoord = makeSideMapper(isPort);

      ctxB.strokeStyle = "#303030";
      ctxB.lineWidth = Math.max(1.5, W / 1024);

      ctxA.save();
      ctxA.strokeStyle = `rgba(15, 23, 42, ${0.15 * intensity})`;
      ctxA.lineWidth = Math.max(1.1, W / 1400);

      // Vertical fuselage bulkheads (Firewall at 0.225, Tailcone stations)
      const stationsU = [0.225, 0.56, 0.68, 0.78, 0.88];
      for (const u of stationsU) {
        const pTop = mapCoord(u, u > 0.78 ? 0.96 : 0.44);
        const pBot = mapCoord(u, 0.08);
        for (const c of [ctxB, ctxA]) {
          c.beginPath();
          c.moveTo(pTop.x, pTop.y);
          c.lineTo(pBot.x, pBot.y);
          c.stroke();
        }
      }

      // Rudder hinge seam on vertical tail (matches POH Page 1 rudder line!)
      const rTop = mapCoord(0.89, 0.96);
      const rMid = mapCoord(0.92, 0.96);
      const rBot = mapCoord(0.88, 0.36);
      for (const c of [ctxB, ctxA]) {
        c.beginPath();
        c.moveTo(rTop.x, rTop.y);
        c.lineTo(rMid.x, rMid.y);
        c.lineTo(rBot.x, rBot.y);
        c.stroke();
      }

      ctxA.restore();
    }
  }

  // 8. Render Two-Tone Wheel Pants (Spats) Texture (Upper Orange + Charcoal/White Stripe + Lower White, like N532SL!)
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
      0,
      undefined,
      true
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
        },
        true
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
