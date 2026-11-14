import { jsPDF } from "jspdf";
import {
  AirframeCalibration,
  BezierStripeLayer,
  CustomDecalLayer,
  LiverySchemePreset,
  RegistrationConfig,
} from "@/types/livery";
import { FINISH_PRESETS } from "@/data/aviationCatalog";
import {
  evalBezierPoint,
  traceTaperedBezierRibbon,
} from "@/engine/liveryCompositor";
import { evaluateSlingFuselageStation } from "@/engine/slingTsiGeometry";

export interface ExportPdfOptions {
  projectName: string;
  calibration: AirframeCalibration;
  zones: LiverySchemePreset["zones"];
  stripes: BezierStripeLayer[];
  registration: RegistrationConfig;
  decals: CustomDecalLayer[];
  webglCanvas?: HTMLCanvasElement | null;
}

/**
 * Renders a high-resolution 2D Orthographic Side Profile (Port or Starboard)
 * of the Sling TSi with full livery, panel lines, canopy glass, wheel pants, and dimension callouts.
 */
export function renderOrthographicSideViewCanvas(
  opts: ExportPdfOptions,
  isPort: boolean,
  width = 1600,
  height = 680
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Clean architectural blueprint / studio card background
  ctx.fillStyle = "#F8FAFC";
  ctx.fillRect(0, 0, width, height);

  // Subtle engineering grid
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 1;
  const gridStep = 40;
  for (let x = 0; x < width; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.save();
  if (!isPort) {
    // Starboard view faces right-to-left (nose on right)
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }

  const L = opts.calibration.lengthM || 7.2;
  const H_m = opts.calibration.heightM || 2.35;
  const thrustY = opts.calibration.propThrustlineHeightM || 1.18;
  const pxPerM = Math.min((width * 0.82) / L, (height * 0.68) / H_m);
  const drawW = L * pxPerM;
  const drawH = H_m * pxPerM;
  const padX = (width - drawW) * 0.5;
  const padY = (height - drawH) * 0.5;

  const mapProfile = (uNorm: number, vNorm: number) => ({
    x: padX + uNorm * drawW,
    y: padY + (1 - vNorm) * drawH,
  });

  const toU = (xM: number) => Math.max(0, Math.min(1, xM / L));
  const toV = (yGroundM: number) => Math.max(0, Math.min(1, yGroundM / H_m));

  // Build Sling 4 TSi POH Section 1.3 fuselage + vertical fin silhouette path
  const traceFuselageAndFinSilhouette = () => {
    ctx.beginPath();
    const steps = 64;
    const spTip = mapProfile(0.0, toV(thrustY));
    const spTop1 = mapProfile(toU(0.14), toV(thrustY + 0.14));
    const spTop2 = mapProfile(toU(0.42), toV(thrustY + 0.22));
    ctx.moveTo(spTip.x, spTip.y);
    ctx.lineTo(spTop1.x, spTop1.y);
    ctx.lineTo(spTop2.x, spTop2.y);

    // Upper contour from s=0.42m to dorsal fin root (t=0.76)
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 0.76;
      const sM = 0.42 + t * 6.46;
      const st = evaluateSlingFuselageStation(t);
      const pt = mapProfile(toU(sM), toV(thrustY + st.yTop));
      ctx.lineTo(pt.x, pt.y);
    }

    // Dorsal fillet -> swept vertical stabilizer leading edge -> fin tip -> rudder TE -> tailcone
    for (const [xM, yM] of [
      [5.65, thrustY + 0.16],
      [5.85, thrustY + 0.24],
      [6.38, H_m * 0.99],
      [7.16, H_m * 0.99],
      [6.92, thrustY + 0.04],
      [7.05, thrustY + 0.015],
    ]) {
      const pt = mapProfile(toU(xM), toV(yM));
      ctx.lineTo(pt.x, pt.y);
    }

    // Bottom contour back from tailcone (t=1.0) to spinner
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const sM = 0.42 + t * 6.46;
      const st = evaluateSlingFuselageStation(t);
      const pt = mapProfile(toU(sM), toV(thrustY + st.yBottom));
      ctx.lineTo(pt.x, pt.y);
    }
    const spBot2 = mapProfile(toU(0.42), toV(thrustY - 0.2));
    const spBot1 = mapProfile(toU(0.14), toV(thrustY - 0.13));
    ctx.lineTo(spBot2.x, spBot2.y);
    ctx.lineTo(spBot1.x, spBot1.y);
    ctx.closePath();
  };

  // 1. Ground reference line & Landing gear struts + wheel pants (POH 900mm & 2650mm)
  const gLeft = mapProfile(0.02, 0);
  const gRight = mapProfile(0.98, 0);
  ctx.strokeStyle = "#CBD5E1";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(gLeft.x, gLeft.y);
  ctx.lineTo(gRight.x, gRight.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const noseGearU = toU(opts.calibration.noseAxleStationM || 0.9);
  const mainGearU = toU(
    (opts.calibration.noseAxleStationM || 0.9) +
      (opts.calibration.wheelbaseM || 1.75)
  );

  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 5;
  const noseTop = mapProfile(noseGearU + 0.017, 0.28);
  const noseWheel = mapProfile(noseGearU, 0.06);
  ctx.beginPath();
  ctx.moveTo(noseTop.x, noseTop.y);
  ctx.lineTo(noseWheel.x, noseWheel.y);
  ctx.stroke();

  const mainTop = mapProfile(mainGearU, 0.28);
  const mainWheel = mapProfile(mainGearU, 0.06);
  ctx.beginPath();
  ctx.moveTo(mainTop.x, mainTop.y);
  ctx.lineTo(mainWheel.x, mainWheel.y);
  ctx.stroke();

  // Tires
  ctx.fillStyle = "#1E293B";
  ctx.beginPath();
  ctx.arc(noseWheel.x, noseWheel.y, drawH * 0.045, 0, Math.PI * 2);
  ctx.arc(mainWheel.x, mainWheel.y, drawH * 0.052, 0, Math.PI * 2);
  ctx.fill();

  // Wheel Pants (Spats)
  if (opts.calibration.wheelPantsInstalled) {
    const drawWheelPant = (ptsNorm: [number, number][]) => {
      ctx.save();
      ctx.beginPath();
      ptsNorm.forEach(([u, v], idx) => {
        const p = mapProfile(u, v);
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fillStyle = opts.zones.wheelPants.colorHex;
      ctx.fill();
      ctx.strokeStyle = "#1E293B";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    };

    drawWheelPant([
      [noseGearU - 0.04, 0.06],
      [noseGearU - 0.01, 0.145],
      [noseGearU + 0.04, 0.095],
      [noseGearU + 0.02, 0.015],
      [noseGearU - 0.02, 0.015],
    ]);
    drawWheelPant([
      [mainGearU - 0.046, 0.075],
      [mainGearU - 0.013, 0.14],
      [mainGearU + 0.06, 0.075],
      [mainGearU + 0.037, 0.015],
      [mainGearU - 0.023, 0.015],
    ]);
  }

  // 2. Clip to Fuselage + Fin Silhouette and render Livery Layers
  ctx.save();
  traceFuselageAndFinSilhouette();
  ctx.fillStyle = opts.zones.fuselageBase.colorHex;
  ctx.fill();
  ctx.clip();

  // Vertical Tail Zone
  ctx.fillStyle = opts.zones.verticalTail.colorHex;
  ctx.beginPath();
  const vt1 = mapProfile(0.72, 0.5);
  const vt2 = mapProfile(0.87, 0.98);
  const vt3 = mapProfile(0.98, 0.98);
  const vt4 = mapProfile(0.96, 0.45);
  ctx.moveTo(vt1.x, vt1.y);
  ctx.lineTo(vt2.x, vt2.y);
  ctx.lineTo(vt3.x, vt3.y);
  ctx.lineTo(vt4.x, vt4.y);
  ctx.closePath();
  ctx.fill();

  // Cowling Anti-Glare Panel
  if (opts.calibration.antiGlareMaskEnabled) {
    ctx.fillStyle = opts.zones.cowlingAntiGlare.colorHex;
    const ag1 = mapProfile(0.05, 0.44);
    const ag2 = mapProfile(0.24, 0.58);
    const ag3 = mapProfile(0.24, 0.68);
    const ag4 = mapProfile(0.05, 0.55);
    ctx.beginPath();
    ctx.moveTo(ag1.x, ag1.y);
    ctx.lineTo(ag2.x, ag2.y);
    ctx.lineTo(ag3.x, ag3.y);
    ctx.lineTo(ag4.x, ag4.y);
    ctx.closePath();
    ctx.fill();
  }

  // Bezier Stripes
  for (const stripe of opts.stripes) {
    if (!stripe.visible || stripe.targetZone !== "FUSELAGE_TAIL") continue;
    if (!isPort && !stripe.symmetry) continue;

    ctx.fillStyle = stripe.colorHex;
    traceTaperedBezierRibbon(ctx, stripe, mapProfile, 0);
    ctx.fill();

    if (stripe.pinstripeEnabled) {
      ctx.fillStyle = stripe.pinstripeColorHex;
      traceTaperedBezierRibbon(
        ctx,
        stripe,
        mapProfile,
        stripe.pinstripeOffset,
        {
          start: stripe.pinstripeWidth * 0.7,
          mid: stripe.pinstripeWidth,
          end: stripe.pinstripeWidth * 0.8,
        }
      );
      ctx.fill();
    }
  }

  // Registration N-Number (Un-flipped on Starboard so text reads Left->Right)
  if (opts.registration.enabled && opts.registration.text.trim()) {
    if (isPort || opts.registration.symmetry) {
      const regPt = mapProfile(
        opts.registration.positionX,
        opts.registration.positionY
      );
      const heightMeters = (opts.registration.heightInches || 12) * 0.0254;
      const fontPx = Math.max(
        16,
        Math.round(
          (heightMeters / (opts.calibration.heightM || 2.45)) * drawH * 1.15
        )
      );
      ctx.save();
      ctx.translate(regPt.x, regPt.y);
      if (!isPort) {
        ctx.scale(-1, 1);
      }
      const slantTan = Math.tan(
        (-(opts.registration.slantDeg || 0) * Math.PI) / 180
      );
      ctx.transform(1, 0, slantTan, 1, 0, 0);
      ctx.font = `900 ${fontPx}px "Arial Black", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (opts.registration.outlineEnabled) {
        ctx.strokeStyle = opts.registration.outlineColorHex;
        ctx.lineWidth = 3;
        ctx.strokeText(opts.registration.text.toUpperCase(), 0, 0);
      }
      ctx.fillStyle = opts.registration.colorHex;
      ctx.fillText(opts.registration.text.toUpperCase(), 0, 0);
      ctx.restore();
    }
  }

  // 3 Distinct Sling 4 TSi Framed Windows (POH Side Profile)
  const drawWindowPoly = (ptsNorm: [number, number][]) => {
    ctx.fillStyle = "rgba(30, 41, 59, 0.78)";
    ctx.strokeStyle = "#1E293B";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ptsNorm.forEach(([u, v], idx) => {
      const p = mapProfile(u, v);
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };
  drawWindowPoly([
    [0.195, 0.625],
    [0.295, 0.742],
    [0.295, 0.6],
    [0.195, 0.6],
  ]);
  drawWindowPoly([
    [0.305, 0.742],
    [0.425, 0.725],
    [0.425, 0.59],
    [0.305, 0.59],
  ]);
  drawWindowPoly([
    [0.44, 0.685],
    [0.515, 0.635],
    [0.515, 0.575],
    [0.44, 0.575],
  ]);

  // Panel lines
  ctx.strokeStyle = "rgba(15, 23, 42, 0.18)";
  ctx.lineWidth = 1.2;
  for (const uSt of [0.24, 0.52, 0.64, 0.74, 0.84]) {
    const p1 = mapProfile(uSt, 0.15);
    const p2 = mapProfile(uSt, 0.85);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  ctx.restore(); // End fuselage clip

  // Fuselage crisp outline
  traceFuselageAndFinSilhouette();
  ctx.strokeStyle = "#1E293B";
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Low-wing side profile (LE 1912mm, TE 3432mm)
  const wingLE_u = toU(opts.calibration.wingLEStationM || 1.912);
  const wingTE_u = toU(
    (opts.calibration.wingLEStationM || 1.912) +
      (opts.calibration.wingChordRootM || 1.52)
  );
  ctx.fillStyle = opts.zones.wingBase.colorHex;
  ctx.strokeStyle = "#1E293B";
  ctx.lineWidth = 2;
  ctx.beginPath();
  [
    [wingLE_u, 0.34],
    [wingLE_u + 0.064, 0.385],
    [wingTE_u, 0.355],
    [wingTE_u, 0.32],
    [wingLE_u + 0.044, 0.31],
  ].forEach(([u, v], idx) => {
    const p = mapProfile(u, v);
    if (idx === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Horizontal Stabilizer in side profile
  ctx.beginPath();
  [
    [0.86, 0.505],
    [0.98, 0.525],
    [0.98, 0.5],
    [0.86, 0.485],
  ].forEach(([u, v], idx) => {
    const p = mapProfile(u, v);
    if (idx === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Propeller disk blade vertical bar at u=0.032
  const propTop = mapProfile(0.032, 0.84);
  const propBot = mapProfile(0.032, 0.16);
  ctx.strokeStyle = "#1E293B";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(propTop.x, propTop.y);
  ctx.lineTo(propBot.x, propBot.y);
  ctx.stroke();

  ctx.restore(); // End Port/Starboard flip

  // Dimension Callouts & View Label Overlay (always readable Left-to-Right)
  ctx.fillStyle = "#0F172A";
  ctx.font = 'bold 20px "Inter", "Helvetica Neue", sans-serif';
  ctx.fillText(
    isPort
      ? "PORT (LEFT) ORTHOGRAPHIC PROFILE"
      : "STARBOARD (RIGHT) ORTHOGRAPHIC PROFILE",
    28,
    38
  );

  // Overall Length Dimension Line at bottom
  const dimY = height - 34;
  const xLeft = width * 0.11;
  const xRight = width * 0.89;
  ctx.strokeStyle = "#0284C7";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xLeft, dimY);
  ctx.lineTo(xRight, dimY);
  ctx.moveTo(xLeft, dimY - 8);
  ctx.lineTo(xLeft, dimY + 8);
  ctx.moveTo(xRight, dimY - 8);
  ctx.lineTo(xRight, dimY + 8);
  ctx.stroke();

  const lenM = opts.calibration.lengthM.toFixed(3);
  const lenFt = (opts.calibration.lengthM * 3.28084).toFixed(2);
  const dimLabel = `OVERALL LENGTH: ${lenM} m (${lenFt} ft)`;
  ctx.font = 'bold 16px "Inter", sans-serif';
  const textW = ctx.measureText(dimLabel).width;
  ctx.fillStyle = "#F8FAFC";
  ctx.fillRect((width - textW) * 0.5 - 12, dimY - 12, textW + 24, 24);
  ctx.fillStyle = "#0369A1";
  ctx.fillText(dimLabel, (width - textW) * 0.5, dimY + 5);

  return canvas;
}

/**
 * Renders a high-resolution 2D Top Planform Orthographic View of the Sling TSi
 */
export function renderOrthographicTopPlanformCanvas(
  opts: ExportPdfOptions,
  width = 1200,
  height = 900
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#F8FAFC";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const L = opts.calibration.lengthM || 7.2;
  const span = opts.calibration.wingspanM || 9.5;
  const pxPerM = Math.min((width * 0.84) / span, (height * 0.76) / L);
  const fusLenPx = L * pxPerM;
  const halfSpanPx = (span * 0.5) * pxPerM;
  const cx = width * 0.5;
  const noseY = (height - fusLenPx) * 0.48;

  // Draw Left & Right Wings (POH Section 1.3 Page 1-4: 1912mm LE, 1520mm chord, constant inner + tapered outer + raked wingtips)
  const wingLES = (opts.calibration.wingLEStationM || 1.912) / L;
  const wingChordRoot = (opts.calibration.wingChordRootM || 1.52) / L;
  const wingRootLE = noseY + fusLenPx * wingLES;
  const wingRootTE = noseY + fusLenPx * (wingLES + wingChordRoot);
  const wingTipLE = wingRootLE + fusLenPx * 0.025;
  const wingTipTE = wingRootTE - fusLenPx * 0.045;

  for (const side of [-1, 1]) {
    ctx.fillStyle = opts.zones.wingBase.colorHex;
    ctx.strokeStyle = "#1E293B";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx, wingRootLE);
    ctx.lineTo(cx + side * halfSpanPx * 0.28, wingRootLE);
    ctx.lineTo(cx + side * halfSpanPx * 0.94, wingTipLE);
    ctx.lineTo(cx + side * halfSpanPx, wingTipLE + 4);
    ctx.lineTo(cx + side * halfSpanPx, wingTipTE + 3);
    ctx.lineTo(cx + side * halfSpanPx * 0.94, wingTipTE);
    ctx.lineTo(cx + side * halfSpanPx * 0.28, wingRootTE);
    ctx.lineTo(cx, wingRootTE);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Colored Wingtip Zone (outer raked wingtip)
    ctx.fillStyle = opts.zones.wingtips.colorHex;
    ctx.beginPath();
    ctx.moveTo(cx + side * halfSpanPx * 0.94, wingTipLE);
    ctx.lineTo(cx + side * halfSpanPx, wingTipLE + 4);
    ctx.lineTo(cx + side * halfSpanPx, wingTipTE + 3);
    ctx.lineTo(cx + side * halfSpanPx * 0.94, wingTipTE);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Horizontal Stabilizer (POH: 3095mm span x 921mm chord)
  const hSpanPx = ((opts.calibration.hStabSpanM || 3.095) * 0.5) * pxPerM;
  const hChordPx = (opts.calibration.hStabChordM || 0.921) * pxPerM;
  const hStabTE = noseY + fusLenPx * 0.98;
  const hStabLE = hStabTE - hChordPx;
  ctx.fillStyle = opts.zones.wingBase.colorHex;
  ctx.beginPath();
  ctx.moveTo(cx - hSpanPx * 0.12, hStabLE);
  ctx.lineTo(cx + hSpanPx * 0.12, hStabLE);
  ctx.lineTo(cx + hSpanPx, hStabLE + hChordPx * 0.22);
  ctx.lineTo(cx + hSpanPx, hStabTE);
  ctx.lineTo(cx - hSpanPx, hStabTE);
  ctx.lineTo(cx - hSpanPx, hStabLE + hChordPx * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Propeller in Top View
  ctx.strokeStyle = "#1E293B";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - pxPerM * 0.86, noseY + fusLenPx * 0.025);
  ctx.lineTo(cx + pxPerM * 0.86, noseY + fusLenPx * 0.025);
  ctx.stroke();

  // Fuselage Top Contour (exact POH halfWidth in meters * pxPerM)
  ctx.fillStyle = opts.zones.fuselageBase.colorHex;
  ctx.strokeStyle = "#1E293B";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(cx, noseY);
  ctx.lineTo(cx + 0.12 * pxPerM, noseY + (0.14 / L) * fusLenPx);
  const steps = 50;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const sM = 0.42 + t * 6.46;
    const st = evaluateSlingFuselageStation(t);
    ctx.lineTo(cx + st.halfWidth * pxPerM, noseY + (sM / L) * fusLenPx);
  }
  ctx.lineTo(cx, noseY + fusLenPx);
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const sM = 0.42 + t * 6.46;
    const st = evaluateSlingFuselageStation(t);
    ctx.lineTo(cx - st.halfWidth * pxPerM, noseY + (sM / L) * fusLenPx);
  }
  ctx.lineTo(cx - 0.12 * pxPerM, noseY + (0.14 / L) * fusLenPx);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Anti-glare cowling panel on nose
  if (opts.calibration.antiGlareMaskEnabled) {
    ctx.fillStyle = opts.zones.cowlingAntiGlare.colorHex;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      noseY + fusLenPx * 0.11,
      Math.max(8, pxPerM * 0.24),
      fusLenPx * 0.085,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  // Bubble Canopy Top Glass
  ctx.fillStyle = "rgba(30, 41, 59, 0.78)";
  ctx.beginPath();
  ctx.ellipse(
    cx,
    noseY + fusLenPx * 0.37,
    Math.max(12, pxPerM * 0.42),
    fusLenPx * 0.14,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.stroke();

  // Vertical Tail Dorsal Spine
  ctx.fillStyle = opts.zones.verticalTail.colorHex;
  ctx.fillRect(cx - 5, noseY + fusLenPx * 0.75, 10, fusLenPx * 0.24);

  // Label & Wingspan Dimension Callout
  ctx.fillStyle = "#0F172A";
  ctx.font = 'bold 20px "Inter", sans-serif';
  ctx.fillText("TOP PLANFORM ORTHOGRAPHIC VIEW", 28, 38);

  const dimY = height - 34;
  ctx.strokeStyle = "#0284C7";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - halfSpanPx, dimY);
  ctx.lineTo(cx + halfSpanPx, dimY);
  ctx.moveTo(cx - halfSpanPx, dimY - 8);
  ctx.lineTo(cx - halfSpanPx, dimY + 8);
  ctx.moveTo(cx + halfSpanPx, dimY - 8);
  ctx.lineTo(cx + halfSpanPx, dimY + 8);
  ctx.stroke();

  const spanM = opts.calibration.wingspanM.toFixed(2);
  const spanFt = (opts.calibration.wingspanM * 3.28084).toFixed(2);
  const spanLabel = `WINGSPAN: ${spanM} m (${spanFt} ft)`;
  ctx.font = 'bold 16px "Inter", sans-serif';
  const tw = ctx.measureText(spanLabel).width;
  ctx.fillStyle = "#F8FAFC";
  ctx.fillRect(cx - tw * 0.5 - 12, dimY - 12, tw + 24, 24);
  ctx.fillStyle = "#0369A1";
  ctx.fillText(spanLabel, cx - tw * 0.5, dimY + 5);

  return canvas;
}

/**
 * Generates and downloads a 2-Page Landscape Engineering & Livery Proof Sheet PDF
 */
export async function generateAndDownloadLiveryPdf(
  opts: ExportPdfOptions
): Promise<void> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageW = 297;
  const pageH = 210;

  // --- PAGE 1: 3D HERO RENDER + PORT & STARBOARD ORTHOGRAPHIC PROFILES ---
  // Header Title Bar
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 20, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(
    `AEROCANVAS LIVERY SPECIFICATION — ${opts.projectName.toUpperCase()}`,
    10,
    9
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Airframe: ${opts.calibration.aircraftName}  |  Registration: ${opts.registration.text}  |  Span: ${opts.calibration.wingspanM}m  |  Length: ${opts.calibration.lengthM}m  |  Height: ${opts.calibration.heightM}m`,
    10,
    15.5
  );

  const dateStr = new Date().toISOString().slice(0, 10);
  doc.text(`Date: ${dateStr}  |  Sheet 1 of 2`, pageW - 55, 12.5);

  // Render Port & Starboard Orthographic Views
  const portCanvas = renderOrthographicSideViewCanvas(opts, true, 1600, 660);
  const starboardCanvas = renderOrthographicSideViewCanvas(
    opts,
    false,
    1600,
    660
  );

  const portDataUrl = portCanvas.toDataURL("image/png");
  const starboardDataUrl = starboardCanvas.toDataURL("image/png");

  // Left Column: Port & Starboard Side Profiles
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.addImage(portDataUrl, "PNG", 10, 25, 175, 72);
  doc.rect(10, 25, 175, 72);

  doc.addImage(starboardDataUrl, "PNG", 10, 103, 175, 72);
  doc.rect(10, 103, 175, 72);

  // Right Column Top: 3D Perspective Hero Render (from WebGL Canvas if available)
  if (opts.webglCanvas) {
    try {
      const heroDataUrl = opts.webglCanvas.toDataURL("image/png");
      doc.setFillColor(15, 23, 42);
      doc.rect(190, 25, 97, 72, "F");
      doc.addImage(heroDataUrl, "PNG", 190, 25, 97, 72);
      doc.rect(190, 25, 97, 72);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("3D PBR PERSPECTIVE RENDER", 194, 31);
    } catch {
      // Fallback if WebGL buffer unavailable
    }
  }

  // Right Column Bottom: Top Planform View
  const topCanvas = renderOrthographicTopPlanformCanvas(opts, 1200, 900);
  const topDataUrl = topCanvas.toDataURL("image/png");
  doc.addImage(topDataUrl, "PNG", 190, 103, 97, 72);
  doc.rect(190, 103, 97, 72);

  // Bottom Paint Swatch BOM Summary Bar on Page 1
  doc.setFillColor(241, 245, 249);
  doc.rect(10, 180, pageW - 20, 22, "F");
  doc.rect(10, 180, pageW - 20, 22);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text("AEROSPACE PAINT BILL OF MATERIALS (BOM) & FINISH SCHEDULE:", 14, 186);

  const bomEntries = [
    { label: "Fuselage Base", spec: opts.zones.fuselageBase },
    { label: "Vertical Tail", spec: opts.zones.verticalTail },
    { label: "Wingtips", spec: opts.zones.wingtips },
    { label: "Anti-Glare Nose", spec: opts.zones.cowlingAntiGlare },
    ...opts.stripes
      .filter((s) => s.visible)
      .slice(0, 2)
      .map((s, idx) => ({
        label: `Stripe #${idx + 1}`,
        spec: {
          colorHex: s.colorHex,
          paintCode: s.paintCode,
          colorName: s.colorName,
          finish: s.finish,
        },
      })),
  ];

  let swatchX = 14;
  for (const item of bomEntries) {
    const rgb = hexToRgb(item.spec.colorHex);
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.rect(swatchX, 189, 7, 7, "F");
    doc.setDrawColor(100, 116, 139);
    doc.rect(swatchX, 189, 7, 7);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${item.label}: ${item.spec.colorName}`, swatchX + 9, 192);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    const finishLabel =
      FINISH_PRESETS[item.spec.finish]?.label || item.spec.finish;
    doc.text(
      `Code: ${item.spec.paintCode} (${item.spec.colorHex}) • ${finishLabel}`,
      swatchX + 9,
      196
    );

    swatchX += 46;
  }

  // --- PAGE 2: DETAILED STRIPE & REGISTRATION MASKING SPECIFICATION TABLE ---
  doc.addPage("a4", "landscape");
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 20, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(
    `AEROCANVAS — STRIPE GEOMETRY & REGISTRATION SPECIFICATION`,
    10,
    9
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Project: ${opts.projectName}  |  Sling TSi Datum Reference: Spinner Tip (X=0.00m)  |  Sheet 2 of 2`,
    10,
    15.5
  );

  // Large Top Planform + Port Profile Reference on Page 2
  doc.addImage(portDataUrl, "PNG", 10, 26, 165, 68);
  doc.rect(10, 26, 165, 68);

  doc.addImage(topDataUrl, "PNG", 180, 26, 107, 68);
  doc.rect(180, 26, 107, 68);

  // Specification Table
  let tableY = 104;
  doc.setFillColor(30, 41, 59);
  doc.rect(10, tableY, pageW - 20, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("LAYER / ZONE", 14, tableY + 5.5);
  doc.text("AEROSPACE COLOR & CODE", 72, tableY + 5.5);
  doc.text("PBR FINISH TYPE", 135, tableY + 5.5);
  doc.text("DATUM GEOMETRY / MASKING CALLOUTS", 190, tableY + 5.5);

  tableY += 8;

  const allRows = [
    {
      zone: "Fuselage & Tailcone Base",
      color: `${opts.zones.fuselageBase.colorName} (${opts.zones.fuselageBase.paintCode})`,
      hex: opts.zones.fuselageBase.colorHex,
      finish: FINISH_PRESETS[opts.zones.fuselageBase.finish].label,
      notes: "Primary Alclad skin coat (~18.4 m² / 198 ft²)",
    },
    {
      zone: "Vertical Stabilizer & Rudder",
      color: `${opts.zones.verticalTail.colorName} (${opts.zones.verticalTail.paintCode})`,
      hex: opts.zones.verticalTail.colorHex,
      finish: FINISH_PRESETS[opts.zones.verticalTail.finish].label,
      notes: `Swept fin (${opts.calibration.tailSweepDeg}° LE sweep), est. area 1.65 m²`,
    },
    {
      zone: "Composite Wingtips (L/R)",
      color: `${opts.zones.wingtips.colorName} (${opts.zones.wingtips.paintCode})`,
      hex: opts.zones.wingtips.colorHex,
      finish: FINISH_PRESETS[opts.zones.wingtips.finish].label,
      notes: "Outer 10% semi-span upturned wingtips (Port & Starboard)",
    },
    {
      zone: "Cowling Anti-Glare Panel",
      color: `${opts.zones.cowlingAntiGlare.colorName} (${opts.zones.cowlingAntiGlare.paintCode})`,
      hex: opts.zones.cowlingAntiGlare.colorHex,
      finish: FINISH_PRESETS[opts.zones.cowlingAntiGlare.finish].label,
      notes: opts.calibration.antiGlareMaskEnabled
        ? "Upper nose cowl station X=0.35m to Firewall X=1.58m"
        : "Disabled",
    },
    ...opts.stripes
      .filter((s) => s.visible)
      .map((s) => {
        const startM = (s.p0.x * opts.calibration.lengthM).toFixed(2);
        const endM = (s.p3.x * opts.calibration.lengthM).toFixed(2);
        const midWidthCm = (
          s.widthMid *
          opts.calibration.heightM *
          100
        ).toFixed(1);
        return {
          zone: `Vector Ribbon: ${s.name}`,
          color: `${s.colorName} (${s.paintCode})`,
          hex: s.colorHex,
          finish: FINISH_PRESETS[s.finish].label,
          notes: `Station X=${startM}m to ${endM}m | Mid Width: ${midWidthCm} cm | Symmetric: ${s.symmetry ? "Yes" : "No"}`,
        };
      }),
    {
      zone: `Tail Registration (${opts.registration.text})`,
      color: `${opts.registration.colorHex} (${opts.registration.paintCode})`,
      hex: opts.registration.colorHex,
      finish: FINISH_PRESETS[opts.registration.finish].label,
      notes: `Height: ${opts.registration.heightInches.toFixed(1)} in (${(opts.registration.heightInches * 2.54).toFixed(1)} cm) | Slant: ${opts.registration.slantDeg}° toward tail | Port & Starboard Readable`,
    },
  ];

  allRows.forEach((row, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
    } else {
      doc.setFillColor(241, 245, 249);
    }
    doc.rect(10, tableY, pageW - 20, 9, "F");
    doc.setDrawColor(226, 232, 240);
    doc.rect(10, tableY, pageW - 20, 9);

    const rgb = hexToRgb(row.hex);
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.rect(65, tableY + 2, 5, 5, "F");
    doc.setDrawColor(100, 116, 139);
    doc.rect(65, tableY + 2, 5, 5);

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(row.zone.slice(0, 32), 14, tableY + 6);

    doc.setFont("helvetica", "normal");
    doc.text(row.color.slice(0, 34), 72, tableY + 6);
    doc.text(row.finish.slice(0, 28), 135, tableY + 6);
    doc.text(row.notes.slice(0, 62), 190, tableY + 6);

    tableY += 9;
  });

  const safeFileName = opts.projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  doc.save(`${safeFileName}-${opts.registration.text.toLowerCase()}-spec.pdf`);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16) || 0;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}
