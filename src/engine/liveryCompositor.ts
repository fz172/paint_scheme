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

  // 6b. Render the 3 Signature Sling 4 TSi Smoked Acrylic Cabin Windows using exact POH meter coordinates!
  //     s in [0, 7.20m] from spinner tip, y in [-0.58m, +1.17m] relative to thrustline.
  const drawSlingCabinWindows = (isPort: boolean) => {
    const mapCoord = makeSideMapper(isPort);
    const mapMeters = (sMeters: number, yMeters: number) => {
      const uNorm = Math.max(0, Math.min(1, sMeters / 7.2));
      const vNorm = Math.max(0, Math.min(1, (yMeters + 0.58) / 1.75));
      return mapCoord(uNorm, vNorm);
    };

    // 1. One-Piece Wrap-Around Front Windshield (s = 1.46m .. 2.02m)
    const traceWindshield = (ctx: CanvasRenderingContext2D) => {
      const pFront = mapMeters(1.46, 0.305);
      const cTop1 = mapMeters(1.64, 0.44);
      const cTop2 = mapMeters(1.84, 0.55);
      const pTopRear = mapMeters(2.02, 0.58); // wraps across top centerline
      const pBotRear = mapMeters(1.94, 0.095);
      const cBot1 = mapMeters(1.75, 0.115);
      const cBot2 = mapMeters(1.58, 0.195);

      ctx.beginPath();
      ctx.moveTo(pFront.x, pFront.y);
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
        pFront.x,
        pFront.y
      );
      ctx.closePath();
    };

    // 2. Gullwing Front Side Door Window (s = 2.05m .. 2.98m, leaves painted roof spine on top!)
    const traceGullwingDoorWindow = (ctx: CanvasRenderingContext2D) => {
      const pBotFront = mapMeters(2.05, 0.09);
      const pTopFront = mapMeters(2.13, 0.51);
      const cTop1 = mapMeters(2.4, 0.56);
      const cTop2 = mapMeters(2.72, 0.545);
      const pTopRear = mapMeters(2.98, 0.49);
      const pBotRear = mapMeters(2.93, 0.085);
      const cBot1 = mapMeters(2.65, 0.082);
      const cBot2 = mapMeters(2.32, 0.085);

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

    // 3. Sleek Teardrop / D-Shaped Rear Passenger Window (s = 3.07m .. 3.59m, matched to POH & N916TS!)
    //    Front edge parallels the B-pillar; top follows sloping rear cabin roof;
    //    bottom sill sweeps smoothly upward at the rear to meet the rounded rear apex!
    const traceRearQuarterWindow = (ctx: CanvasRenderingContext2D) => {
      const pBotFront = mapMeters(3.06, 0.098);
      const pTopFront = mapMeters(3.12, 0.458);
      const cTop1 = mapMeters(3.28, 0.435);
      const cTop2 = mapMeters(3.45, 0.395);
      const pRearApex = mapMeters(3.58, 0.315);
      const cBot1 = mapMeters(3.56, 0.195);
      const cBot2 = mapMeters(3.34, 0.102);

      ctx.beginPath();
      ctx.moveTo(pBotFront.x, pBotFront.y);
      ctx.lineTo(pTopFront.x, pTopFront.y);
      ctx.bezierCurveTo(
        cTop1.x,
        cTop1.y,
        cTop2.x,
        cTop2.y,
        pRearApex.x,
        pRearApex.y
      );
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

    const topSample = mapMeters(2.55, 0.58);
    const botSample = mapMeters(2.55, 0.08);
    const tint = Math.max(0.15, Math.min(0.95, calibration.canopyTint ?? 0.38));

    const grad = ctxA.createLinearGradient(0, topSample.y, 0, botSample.y);
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

      // Vertical fuselage bulkheads (Firewall at 0.205, Tailcone stations)
      const stationsU = [0.205, 0.56, 0.68, 0.8];
      for (const u of stationsU) {
        const pTop = mapCoord(u, 0.49);
        const pBot = mapCoord(u, 0.04);
        for (const c of [ctxB, ctxA]) {
          c.beginPath();
          c.moveTo(pTop.x, pTop.y);
          c.lineTo(pBot.x, pBot.y);
          c.stroke();
        }
      }

      // Rudder hinge seam on vertical tail (matches POH Page 1 rudder line!)
      const rTop = mapCoord(0.925, 0.94);
      const rMid = mapCoord(0.952, 0.94);
      const rBot = mapCoord(0.908, 0.45);
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
