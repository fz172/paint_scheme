import * as THREE from "three";
import { AirframeCalibration } from "@/types/livery";

export interface SlingTsiMeshParts {
  fuselageAndTailGeo: THREE.BufferGeometry;
  rudderGeo: THREE.BufferGeometry;
  canopyGlassGeo: THREE.BufferGeometry;
  wingMainGeo: THREE.BufferGeometry;
  wingWalkGeo: THREE.BufferGeometry;
  flapsGeo: THREE.BufferGeometry;
  aileronsGeo: THREE.BufferGeometry;
  wingtipsGeo: THREE.BufferGeometry;
  horizontalStabGeo: THREE.BufferGeometry;
  elevatorsGeo: THREE.BufferGeometry;
  wheelPantsGeo: THREE.BufferGeometry;
  gearLegsPaintedGeo: THREE.BufferGeometry;
  spinnerGeo: THREE.BufferGeometry;
  propellerBladesGeo: THREE.BufferGeometry;
  gearStrutsAndTiresGeo: THREE.BufferGeometry;
  cockpitInteriorGeo: THREE.BufferGeometry;
  bounds: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    zMin: number;
    zMax: number;
  };
}

interface GridVertex {
  pos: THREE.Vector3;
  uv: [number, number];
  interiorRef: THREE.Vector3;
}

/**
 * Emits triangles with guaranteed OUTWARD-facing winding and smooth grid-averaged
 * vertex normals so there is never backface culling / see-through skin or flat-shaded bands.
 */
function appendSmoothLoftedGrid(
  grid: GridVertex[][],
  closedInJ: boolean,
  outPositions: number[],
  outNormals: number[],
  outUvs: number[],
  rowFilter?: (i: number, numI: number) => boolean,
  weldCenterlineZ = false
) {
  const numI = grid.length - 1;
  if (numI < 1) return;
  const numJ = grid[0].length - 1;
  if (numJ < 1) return;

  const vNormals: THREE.Vector3[][] = [];
  for (let i = 0; i <= numI; i++) {
    const row: THREE.Vector3[] = [];
    for (let j = 0; j <= numJ; j++) {
      row.push(new THREE.Vector3(0, 0, 0));
    }
    vNormals.push(row);
  }

  const quadFlip: boolean[][] = [];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const qNorm = new THREE.Vector3();
  const qCenter = new THREE.Vector3();
  const qRef = new THREE.Vector3();
  const outwardVec = new THREE.Vector3();

  for (let i = 0; i < numI; i++) {
    const flipRow: boolean[] = [];
    for (let j = 0; j < numJ; j++) {
      const a = grid[i][j];
      const b = grid[i + 1][j];
      const c = grid[i + 1][j + 1];
      const d = grid[i][j + 1];

      e1.subVectors(c.pos, a.pos);
      e2.subVectors(d.pos, b.pos);
      qNorm.crossVectors(e1, e2);

      qCenter
        .copy(a.pos)
        .add(b.pos)
        .add(c.pos)
        .add(d.pos)
        .multiplyScalar(0.25);
      qRef
        .copy(a.interiorRef)
        .add(b.interiorRef)
        .add(c.interiorRef)
        .add(d.interiorRef)
        .multiplyScalar(0.25);

      outwardVec.subVectors(qCenter, qRef);
      const needsFlip = qNorm.dot(outwardVec) < 0;
      if (needsFlip) {
        qNorm.negate();
      }
      qNorm.normalize();
      flipRow.push(needsFlip);

      vNormals[i][j].add(qNorm);
      vNormals[i + 1][j].add(qNorm);
      vNormals[i + 1][j + 1].add(qNorm);
      vNormals[i][j + 1].add(qNorm);
    }
    quadFlip.push(flipRow);
  }

  if (closedInJ) {
    for (let i = 0; i <= numI; i++) {
      const sum = vNormals[i][0].clone().add(vNormals[i][numJ]);
      vNormals[i][0].copy(sum);
      vNormals[i][numJ].copy(sum);
    }
  }

  if (weldCenterlineZ) {
    for (let i = 0; i <= numI; i++) {
      vNormals[i][0].z = 0;
      vNormals[i][numJ].z = 0;
    }
  }

  for (let i = 0; i <= numI; i++) {
    for (let j = 0; j <= numJ; j++) {
      if (vNormals[i][j].lengthSq() > 1e-10) {
        vNormals[i][j].normalize();
      } else {
        vNormals[i][j].set(0, 1, 0);
      }
    }
  }

  const pushVert = (
    pos: THREE.Vector3,
    norm: THREE.Vector3,
    uv: [number, number]
  ) => {
    outPositions.push(pos.x, pos.y, pos.z);
    outNormals.push(norm.x, norm.y, norm.z);
    outUvs.push(uv[0], uv[1]);
  };

  for (let i = 0; i < numI; i++) {
    if (rowFilter && !rowFilter(i, numI)) continue;
    for (let j = 0; j < numJ; j++) {
      const a = grid[i][j];
      const b = grid[i + 1][j];
      const c = grid[i + 1][j + 1];
      const d = grid[i][j + 1];

      const na = vNormals[i][j];
      const nb = vNormals[i + 1][j];
      const nc = vNormals[i + 1][j + 1];
      const nd = vNormals[i][j + 1];

      if (!quadFlip[i][j]) {
        pushVert(a.pos, na, a.uv);
        pushVert(b.pos, nb, b.uv);
        pushVert(c.pos, nc, c.uv);

        pushVert(a.pos, na, a.uv);
        pushVert(c.pos, nc, c.uv);
        pushVert(d.pos, nd, d.uv);
      } else {
        pushVert(a.pos, na, a.uv);
        pushVert(c.pos, nc, c.uv);
        pushVert(b.pos, nb, b.uv);

        pushVert(a.pos, na, a.uv);
        pushVert(d.pos, nd, d.uv);
        pushVert(c.pos, nc, c.uv);
      }
    }
  }
}

/**
 * Evaluates the authentic Sling 4 TSi longitudinal fuselage cross-section at normalized
 * fuselage station t in [0, 1], where t=0 is the forward cowling nose behind the spinner
 * (s = 0.42m from spinner tip) and t=1 is the tailcone tip under the rudder (s = 7.00m).
 *
 * Calibrated directly to pixel measurements of the official POH Section 1.3 3-View Drawing
 * (Side View 1109x498, Front View 774x270, Top View 730x583) and N916TS / N532SL reference photos.
 *
 * Vertical coordinates y are in meters relative to the Propeller Thrustline (y = 0.00m).
 * Ground level is at y = -1.180m (POH 1180mm), Fin Tip is at y = +1.170m (POH 2350mm total height).
 */
export function evaluateSlingFuselageStation(t: number): {
  yBottom: number;
  yTop: number;
  halfWidth: number;
  superellipseTopN: number;
  superellipseBotN: number;
  yMaxWidthLine: number;
} {
  // Convert normalized fuselage station t in [0, 1] to meters s from spinner tip [0.42m .. 6.88m]
  const s = 0.42 + t * 6.46;

  const spinnerCenterY = 0.01;
  const spinnerRadius = 0.21;

  let yTop = 0.295;
  let yBottom = -0.55;
  let halfWidth = 0.594;
  let superellipseTopN = 2.15;
  let superellipseBotN = 2.35;

  // 1. Upper Profile yTop(s) — Matched to POH Side View, N916TS (ref_side.jpg), and bare-metal N532SL (ref_tail.jpg):
  //    s=0.42m: +0.22m (behind spinner)
  //    s=1.45m: +0.30m (base of wrap-around windshield)
  //    s=2.50m: +0.605m (cabin roof crown)
  //    s=3.60m: +0.36m (rear apex of teardrop passenger window)
  //    s=3.60m..5.60m: slopes smoothly down along the tailcone spine to +0.065m just ahead of the dorsal fin
  //    s=5.60m..6.88m: tapers from +0.065m to +0.02m at the tailcone tip right at the base of the rudder
  if (s < 1.45) {
    const u = (s - 0.42) / (1.45 - 0.42);
    yTop = spinnerCenterY + spinnerRadius + 0.08 * Math.pow(u, 0.72);
  } else if (s < 2.5) {
    const u = (s - 1.45) / (2.5 - 1.45);
    yTop = 0.3 + 0.305 * Math.sin(u * Math.PI * 0.5);
  } else if (s < 3.6) {
    const u = (s - 2.5) / (3.6 - 2.5);
    yTop = 0.605 - (0.605 - 0.36) * Math.pow(u, 1.35);
  } else if (s < 5.6) {
    const u = (s - 3.6) / (5.6 - 3.6);
    const smooth = u * (2 - u);
    yTop = 0.36 - (0.36 - 0.065) * smooth;
  } else {
    const u = (s - 5.6) / (6.88 - 5.6);
    yTop = 0.065 - 0.045 * u;
  }

  // 2. Lower Belly Profile yBottom(s) — Slanted tailcone bottom with ZERO vertical drop at the tail tip:
  //    s=0.42m: -0.20m (behind spinner)
  //    s=0.95m: -0.52m (deep lower cowling & chin scoop)
  //    s=1.80m..3.30m: -0.55m (cabin belly & center-section wing carry-through)
  //    s=3.30m..6.00m: slants steadily upward along the lower tailcone from -0.54m to -0.21m
  //    s=6.00m..6.88m: slants upward under the horizontal stabilizer from -0.21m to +0.015m
  //    meeting the slanted rudder trailing edge at s=6.88m with a pointed tip!
  if (s < 0.95) {
    const u = (s - 0.42) / (0.95 - 0.42);
    yBottom =
      spinnerCenterY -
      spinnerRadius -
      0.32 * Math.sin(Math.pow(u, 0.68) * Math.PI * 0.5);
  } else if (s < 3.3) {
    const u = (s - 0.95) / (3.3 - 0.95);
    yBottom = -0.52 - 0.035 * Math.sin(u * Math.PI);
  } else if (s < 6.0) {
    const u = (s - 3.3) / (6.0 - 3.3);
    yBottom = -0.535 + (0.535 - 0.21) * Math.pow(u, 1.04);
  } else {
    const u = (s - 6.0) / (6.88 - 6.0);
    yBottom = -0.21 + 0.225 * Math.pow(u, 1.1);
  }

  // 3. Half-Width Profile halfWidth(s) — Tapers to a sleek knife-edge at s = 6.88m:
  if (s < 1.55) {
    const u = (s - 0.42) / (1.55 - 0.42);
    halfWidth = spinnerRadius + (0.585 - spinnerRadius) * Math.pow(u, 0.55);
    superellipseTopN = 2.0 + 0.35 * Math.sin(u * Math.PI);
    superellipseBotN = 2.0 + 0.35 * u;
  } else if (s < 3.45) {
    const u = (s - 1.55) / (3.45 - 1.55);
    halfWidth = 0.585 + 0.012 * Math.sin(u * Math.PI);
    superellipseTopN = 2.2;
    superellipseBotN = 2.4;
  } else {
    const u = (s - 3.45) / (6.88 - 3.45);
    halfWidth = 0.585 * Math.pow(1 - u, 1.08) + 0.012 * (1 - u) + 0.006;
    superellipseTopN = 2.05;
    superellipseBotN = 2.05;
  }

  const yMaxWidthLine =
    s < 1.45
      ? spinnerCenterY + (0.04 - spinnerCenterY) * ((s - 0.42) / (1.45 - 0.42))
      : s < 3.45
        ? 0.04
        : 0.5 * (yTop + yBottom);

  return {
    yBottom,
    yTop,
    halfWidth,
    superellipseTopN,
    superellipseBotN,
    yMaxWidthLine,
  };
}

/**
 * Generates a NACA 4-digit airfoil point (x in [0,1] from leading to trailing edge)
 */
function evaluateAirfoil(
  xNorm: number,
  thicknessRatio: number,
  camber: number,
  camberPos: number,
  isUpper: boolean
): { x: number; y: number } {
  const x = Math.max(0, Math.min(1, xNorm));
  const yt =
    5 *
    thicknessRatio *
    (0.2969 * Math.sqrt(x) -
      0.126 * x -
      0.3516 * x * x +
      0.2843 * x * x * x -
      0.1015 * x * x * x * x);

  let yc = 0;
  if (camber > 0 && camberPos > 0) {
    if (x < camberPos) {
      yc = (camber / (camberPos * camberPos)) * (2 * camberPos * x - x * x);
    } else {
      yc =
        (camber / ((1 - camberPos) * (1 - camberPos))) *
        (1 - 2 * camberPos + 2 * camberPos * x - x * x);
    }
  }
  return {
    x: x - 0.5,
    y: isUpper ? yc + yt : yc - yt,
  };
}

/**
 * Assigns orthographic side-projected UV coordinates for the Fuselage + Vertical Tail.
 * Port side (z >= 0) -> V in [0.52, 0.98]
 * Starboard side (z < 0) -> V in [0.02, 0.48]
 * U in [0.02, 0.98] from nose to tail.
 */
function computeFuselageOrthographicUV(
  x: number,
  y: number,
  sideSign: 1 | -1,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number
): [number, number] {
  const uNorm = Math.max(0, Math.min(1, (x - xMin) / (xMax - xMin)));
  const vNorm = Math.max(0, Math.min(1, (y - yMin) / (yMax - yMin)));
  const u = 0.02 + uNorm * 0.96;
  if (sideSign >= 0) {
    return [u, 0.52 + vNorm * 0.46];
  } else {
    return [u, 0.02 + vNorm * 0.46];
  }
}

export function buildSlingTsiGeometry(
  cal: AirframeCalibration
): SlingTsiMeshParts {
  const lengthM = cal.lengthM || 7.2;
  const wingspanM = cal.wingspanM || 9.5;
  const heightM = cal.heightM || 2.35;

  const lengthScale = lengthM / 7.2;
  const heightScale = heightM / 2.35;
  const widthScale = (cal.cabinWidthM || 1.188) / 1.188;

  // Center aircraft around X = 0 (Spinner tip at -3.60m * lengthScale, Rudder TE tip at +3.60m * lengthScale)
  const xSpinnerTip = -3.6 * lengthScale;
  const xNoseCowl = (-3.6 + 0.42) * lengthScale;
  const xFuselageEnd = (-3.6 + 6.88) * lengthScale;
  const xRudderTE = (-3.6 + 7.2) * lengthScale;
  const fusLength = xFuselageEnd - xNoseCowl;

  // Vertical bounds anchored to Propeller Thrustline (y = 0)
  // POH: Thrustline is 1180mm above ground, Fin Tip is 2350mm above ground (+1170mm above thrustline)
  const yGround = -(cal.propThrustlineHeightM || 1.18) * heightScale;
  const yFinTop = yGround + heightM;

  // Fuselage UV Vertical Projection Bounds (from lowest belly y=-0.58m to fin top y=+1.17m -> span 1.75m)
  const yUvMin = -0.58 * heightScale;
  const yUvMax = yFinTop;
  const xUvMin = xSpinnerTip;
  const xUvMax = xRudderTE;

  const fusPositions: number[] = [];
  const fusNormals: number[] = [];
  const fusUvs: number[] = [];

  // 1. Build Watertight, Smooth-Shaded Lofted Fuselage (Deep Cabin & Muscular Tailcone)
  const numStations = 92;
  const halfRadial = 32;

  const buildFuselageHalf = (sideSign: 1 | -1) => {
    const grid: GridVertex[][] = [];
    for (let i = 0; i <= numStations; i++) {
      const t = i / numStations;
      const x = xNoseCowl + t * fusLength;
      const st = evaluateSlingFuselageStation(t);
      const interiorCenter = new THREE.Vector3(
        x,
        st.yMaxWidthLine * heightScale,
        0
      );

      const row: GridVertex[] = [];
      for (let j = 0; j <= halfRadial; j++) {
        const theta = (j / halfRadial) * Math.PI;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        const isUpperHalf = cosT >= 0;
        const exp = 2 / (isUpperHalf ? st.superellipseTopN : st.superellipseBotN);

        const yNorm = Math.sign(cosT) * Math.pow(Math.abs(cosT), exp);
        const zNorm = Math.pow(Math.abs(sinT), exp);

        const yUnscaled = isUpperHalf
          ? st.yMaxWidthLine + yNorm * (st.yTop - st.yMaxWidthLine)
          : st.yMaxWidthLine + yNorm * (st.yMaxWidthLine - st.yBottom);

        let zAbs = zNorm * st.halfWidth;
        if (t > 0.01 && t < 0.15 && isUpperHalf && sinT > 0.35) {
          const swell =
            Math.sin(((t - 0.01) / 0.14) * Math.PI) *
            0.022 *
            Math.sin(sinT * Math.PI);
          zAbs += swell;
        }

        const pos = new THREE.Vector3(
          x,
          yUnscaled * heightScale,
          sideSign * zAbs * widthScale
        );
        const uv = computeFuselageOrthographicUV(
          pos.x,
          pos.y,
          sideSign,
          xUvMin,
          xUvMax,
          yUvMin,
          yUvMax
        );
        row.push({ pos, uv, interiorRef: interiorCenter });
      }
      grid.push(row);
    }

    appendSmoothLoftedGrid(
      grid,
      false,
      fusPositions,
      fusNormals,
      fusUvs,
      undefined,
      true
    );
  };

  buildFuselageHalf(1);
  buildFuselageHalf(-1);

  // 2. Build Slender Swept Vertical Stabilizer (Fixed) + Separate Rudder (with Top Horn Balance & Lower Rudder Horn)
  //    Matched directly to photo_11.jpg ("Tail"), photo_12.jpg ("Left HS"), ref_tail.jpg, and POH Page 1 & 2:
  //    - Fixed Vertical Stabilizer sits forward of the slanted rudder hinge line (u in [0.00, 0.485]) for v in [0.00, 0.885],
  //      including the curved riveted dorsal fairing (v < 0.22) blending forward along the tailcone spine.
  //    - Rudder sits aft of the slanted rudder hinge line (u in [0.505, 1.00]) with a rolled D-nose and crisp hinge gap,
  //      wraps forward to the leading edge (u in [0.00, 1.00]) at the top (v in [0.898, 1.00]) to form the aerodynamic
  //      horn balance cap, and extends down between the left & right elevators (v in [-0.14, 0.00]) to the bottom of the tailcone!
  const finBaseY = 0.02 * heightScale;
  const finSpan = yFinTop - finBaseY;
  const rudderPos: number[] = [];
  const rudderNorm: number[] = [];
  const rudderUvs: number[] = [];

  const evaluateFinStation = (v: number) => {
    const y = finBaseY + v * finSpan;
    const dorsalExt =
      v >= 0 && v < 0.22 ? Math.pow(1 - v / 0.22, 2.3) * 0.36 * lengthScale : 0;
    const leX = (-3.6 + 6.0 + Math.max(0, v) * 0.75) * lengthScale - dorsalExt;
    const teX = (-3.6 + 6.88 + v * 0.32) * lengthScale;
    const chord = Math.max(0.22, teX - leX);
    // Slanted rudder hinge line: runs from s = 6.46m at base (v=0) up to s = 6.95m at v=0.885
    const hingeX = (-3.6 + 6.46 + v * 0.55) * lengthScale;
    const uHinge = Math.max(0.32, Math.min(0.68, (hingeX - leX) / chord));
    const thickness = 0.056 * (1 - 0.25 * Math.max(0, v));
    const tipPinch =
      v > 0.96 ? Math.sqrt(Math.max(0.02, 1 - (v - 0.96) / 0.04)) : 1;
    return { y, leX, teX, chord, hingeX, uHinge, thickness, tipPinch };
  };

  // 2A. Fixed Vertical Stabilizer (v in [0.00, 0.885], u in [0.00, uHinge - 0.012], closed at rear spar cove)
  const buildFixedVerticalStab = () => {
    const vSteps = 26;
    const pSteps = 32;
    const vMaxFixed = 0.885;
    const grid: GridVertex[][] = [];

    for (let i = 0; i <= vSteps; i++) {
      const v = (i / vSteps) * vMaxFixed;
      const st = evaluateFinStation(v);
      const uSpar = st.uHinge - 0.012;
      const row: GridVertex[] = [];
      const interiorCenter = new THREE.Vector3(
        st.leX + st.chord * uSpar * 0.5,
        st.y - 0.01,
        0
      );

      for (let j = 0; j <= pSteps; j++) {
        const p = j / pSteps;
        let u: number;
        let sideSign: 1 | -1;
        let zScale = 1.0;

        if (p <= 0.44) {
          // Right side skin from rear spar lip (uSpar) forward to leading edge (0)
          const t = p / 0.44;
          u = uSpar * (1 - t);
          sideSign = 1;
        } else if (p <= 0.88) {
          // Left side skin from leading edge (0) back to rear spar lip (uSpar)
          const t = (p - 0.44) / 0.44;
          u = uSpar * t;
          sideSign = -1;
        } else {
          // Recessed rear-spar cove wall closing from left lip (-1) across to right lip (+1)
          const t = (p - 0.88) / 0.12;
          const coveIndent = Math.sin(t * Math.PI) * 0.016;
          u = uSpar - coveIndent;
          sideSign = t < 0.5 ? -1 : 1;
          zScale = Math.abs(1 - 2 * t);
        }

        const af = evaluateAirfoil(Math.max(0, u), st.thickness, 0, 0, true);
        const x = st.leX + u * st.chord;
        const z = sideSign * Math.max(0.0015, af.y * st.chord * st.tipPinch * zScale);
        const pos = new THREE.Vector3(x, st.y, z);
        const uv = computeFuselageOrthographicUV(
          pos.x,
          pos.y,
          sideSign,
          xUvMin,
          xUvMax,
          yUvMin,
          yUvMax
        );
        row.push({ pos, uv, interiorRef: interiorCenter });
      }
      grid.push(row);
    }

    appendSmoothLoftedGrid(grid, true, fusPositions, fusNormals, fusUvs);
  };

  // 2B. Separate Rudder Mesh:
  //     - Lower & Main Rudder blade (v in [-0.135, 0.885]): behind slanted hinge line (u in [uHinge + 0.008, 1.00]) with rolled D-nose
  //     - Top Aerodynamic Horn Balance Cap (v in [0.896, 1.00]): wraps forward to leading edge (u in [0.00, 1.00])
  const buildRudderBlade = (
    vStart: number,
    vEnd: number,
    vSteps: number,
    isHornCap: boolean
  ) => {
    const pSteps = 30;
    const grid: GridVertex[][] = [];

    for (let i = 0; i <= vSteps; i++) {
      const tV = i / vSteps;
      const v = vStart + tV * (vEnd - vStart);
      const st = evaluateFinStation(v);
      const uStart = isHornCap ? 0.0 : st.uHinge + 0.008;
      const segLen = Math.max(0.08, 1.0 - uStart);
      // Pinch top & bottom edges slightly for watertight cap closing
      const edgePinch =
        (i === 0 ? 0.18 : 1.0) * (i === vSteps && isHornCap ? 0.15 : 1.0);
      const interiorCenter = new THREE.Vector3(
        st.leX + st.chord * (uStart + segLen * 0.45),
        st.y,
        0
      );

      const row: GridVertex[] = [];
      for (let j = 0; j <= pSteps; j++) {
        const p = j / pSteps;
        const isRight = p <= 0.5;
        const sideSign: 1 | -1 = isRight ? 1 : -1;
        const uLocal = isRight ? 1 - p * 2 : (p - 0.5) * 2;
        const u = uStart + uLocal * segLen;

        const af = evaluateAirfoil(Math.min(1, Math.max(0, u)), st.thickness, 0, 0, true);
        // Smooth rolled D-nose at the rudder hinge line (uLocal -> 0) when not at leading edge
        const noseRoll = isHornCap
          ? 1.0
          : uLocal < 0.22
          ? Math.sin((uLocal / 0.22) * Math.PI * 0.5)
          : 1.0;

        const x = st.leX + u * st.chord;
        const z =
          sideSign *
          Math.max(0.0012, af.y * st.chord * st.tipPinch * noseRoll * edgePinch);
        const pos = new THREE.Vector3(x, st.y, z);
        const uv = computeFuselageOrthographicUV(
          pos.x,
          pos.y,
          sideSign,
          xUvMin,
          xUvMax,
          yUvMin,
          yUvMax
        );
        row.push({ pos, uv, interiorRef: interiorCenter });
      }
      grid.push(row);
    }

    appendSmoothLoftedGrid(grid, true, rudderPos, rudderNorm, rudderUvs);
  };

  buildFixedVerticalStab();
  // Main & lower rudder blade (extends down to y = -0.135m below HStab as shown in photo_11.jpg "Tail")
  buildRudderBlade(-0.135, 0.888, 28, false);
  // Top rudder aerodynamic horn balance cap (wraps forward to leading edge at top of tail)
  buildRudderBlade(0.896, 1.0, 8, true);

  const fuselageAndTailGeo = new THREE.BufferGeometry();
  fuselageAndTailGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(fusPositions, 3)
  );
  fuselageAndTailGeo.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(fusNormals, 3)
  );
  fuselageAndTailGeo.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(fusUvs, 2)
  );

  const rudderGeo = new THREE.BufferGeometry();
  rudderGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(rudderPos, 3)
  );
  rudderGeo.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(rudderNorm, 3)
  );
  rudderGeo.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(rudderUvs, 2)
  );

  const canopyGlassGeo = new THREE.BufferGeometry();

  // Helper to build a closed 3D airfoil sub-segment (either a full-chord segment, a forward fixed box with
  // rear-spar cove, or a trailing-edge control surface with rolled D-nose and closed end-ribs).
  const appendAirfoilSubSegment = (
    evalStation: (s: number) => {
      xCenter: number;
      yCenter: number;
      z: number;
      chord: number;
      thickness: number;
      camber: number;
      camberPos: number;
      cosCant: number;
      sinCant: number;
      sideSign: 1 | -1;
    },
    sStart: number,
    sEnd: number,
    sSteps: number,
    uStartFn: (s: number) => number,
    uEndFn: (s: number) => number,
    mode: "FULL" | "FORWARD_BOX" | "CONTROL_SURFACE",
    outPos: number[],
    outNorm: number[],
    outUvs: number[],
    yOffset = 0
  ) => {
    const pSteps = 32;
    const grid: GridVertex[][] = [];

    for (let i = 0; i <= sSteps; i++) {
      const tS = i / sSteps;
      const s = sStart + tS * (sEnd - sStart);
      const st = evalStation(s);
      const uStart = uStartFn(s);
      const uEnd = uEndFn(s);
      const uSpan = Math.max(0.04, uEnd - uStart);

      // Slight end-rib pinch on first/last slices for clean solid appearance at spanwise gaps
      const endPinch = i === 0 || i === sSteps ? 0.92 : 1.0;

      const midU = uStart + uSpan * 0.48;
      const interiorCenter = new THREE.Vector3(
        st.xCenter + (midU - 0.5) * st.chord,
        st.yCenter + yOffset,
        st.z
      );

      const row: GridVertex[] = [];
      for (let j = 0; j <= pSteps; j++) {
        const p = j / pSteps;
        let xNorm: number;
        let isUpper: boolean;
        let thicknessScale = endPinch;

        if (mode === "FORWARD_BOX") {
          if (p <= 0.44) {
            const t = p / 0.44;
            xNorm = uEnd * (1 - t) + uStart * t;
            isUpper = true;
          } else if (p <= 0.88) {
            const t = (p - 0.44) / 0.44;
            xNorm = uStart * (1 - t) + uEnd * t;
            isUpper = false;
          } else {
            // Recessed rear-spar cove wall closing from lower lip to upper lip
            const t = (p - 0.88) / 0.12;
            const coveIndent = Math.sin(t * Math.PI) * 0.018;
            xNorm = uEnd - coveIndent;
            isUpper = t >= 0.5;
            thicknessScale = endPinch * Math.abs(1 - 2 * t);
          }
        } else {
          isUpper = p <= 0.5;
          const uLocal = isUpper ? 1 - p * 2 : (p - 0.5) * 2;
          xNorm = uStart + uLocal * uSpan;
          if (mode === "CONTROL_SURFACE") {
            // Smooth rolled sheet-metal D-nose at the leading edge of flap/aileron/elevator (photo_06 & photo_08)
            const noseRoll =
              uLocal < 0.22
                ? Math.sin((uLocal / 0.22) * Math.PI * 0.5)
                : 1.0;
            thicknessScale = endPinch * noseRoll;
          }
        }

        const af = evaluateAirfoil(
          Math.max(0, Math.min(1, xNorm)),
          st.thickness,
          st.camber,
          st.camberPos,
          isUpper
        );
        const localX = af.x * st.chord;
        const localY = af.y * st.chord * thicknessScale + yOffset;

        const vx = st.xCenter + localX;
        const vy = st.yCenter + localY * st.cosCant;
        const vz = st.z - st.sideSign * localY * st.sinCant;

        row.push({
          pos: new THREE.Vector3(vx, vy, vz),
          uv: [xNorm, s],
          interiorRef: interiorCenter,
        });
      }
      grid.push(row);
    }

    appendSmoothLoftedGrid(grid, true, outPos, outNorm, outUvs);

    // Add flat watertight end-rib caps at i = 0 and i = sSteps so gaps between flap/aileron/wingtip look solid!
    for (const endIdx of [0, sSteps]) {
      const ring = grid[endIdx];
      const st = evalStation(endIdx === 0 ? sStart : sEnd);
      const nSign = endIdx === 0 ? -st.sideSign : st.sideSign;
      const ribNorm = new THREE.Vector3(0, 0, nSign);
      const centerPos = new THREE.Vector3(0, 0, 0);
      for (let j = 0; j < ring.length; j++) {
        centerPos.add(ring[j].pos);
      }
      centerPos.divideScalar(ring.length);
      const centerUv: [number, number] = [0.5, endIdx === 0 ? sStart : sEnd];

      for (let j = 0; j < pSteps; j++) {
        const a = ring[j];
        const b = ring[j + 1];
        const e1 = new THREE.Vector3().subVectors(a.pos, centerPos);
        const e2 = new THREE.Vector3().subVectors(b.pos, centerPos);
        const triN = new THREE.Vector3().crossVectors(e1, e2);
        if (triN.dot(ribNorm) >= 0) {
          outPos.push(
            centerPos.x,
            centerPos.y,
            centerPos.z,
            a.pos.x,
            a.pos.y,
            a.pos.z,
            b.pos.x,
            b.pos.y,
            b.pos.z
          );
          outUvs.push(
            centerUv[0],
            centerUv[1],
            a.uv[0],
            a.uv[1],
            b.uv[0],
            b.uv[1]
          );
        } else {
          outPos.push(
            centerPos.x,
            centerPos.y,
            centerPos.z,
            b.pos.x,
            b.pos.y,
            b.pos.z,
            a.pos.x,
            a.pos.y,
            a.pos.z
          );
          outUvs.push(
            centerUv[0],
            centerUv[1],
            b.uv[0],
            b.uv[1],
            a.uv[0],
            a.uv[1]
          );
        }
        outNorm.push(
          ribNorm.x,
          ribNorm.y,
          ribNorm.z,
          ribNorm.x,
          ribNorm.y,
          ribNorm.z,
          ribNorm.x,
          ribNorm.y,
          ribNorm.z
        );
      }
    }
  };

  // 3. Build Low-Wing Fixed Structure + Non-Skid Wing Walk + Individual Flaps + Individual Ailerons + Winglets
  //    Calibrated to exact pixel coordinates of POH Page 2 Top View (img_730x583.ppm) and photo_06..08, photo_13..16:
  //    - s in [0.00, 0.165] (z = 0.35m..1.065m): Fixed Inboard Wing Walk Section (full chord xNorm in [0.00, 1.00])
  //      with two black Non-Skid Wing Walk Pads (z = 0.60m..0.80m and z = 0.83m..1.03m, separated by silver rivet strip per photo_16.jpg)
  //    - s in [0.165, 0.840] (z = 1.065m..4.575m): Fixed Main Wing Box & D-Nose (xNorm in [0.00, 0.752]) with rear-spar cove
  //    - Flap (flapsGeo): s in [0.170, 0.625] (z = 1.085m..3.335m), xNorm in [0.764, 1.000] (photo_08, photo_14, photo_15, photo_16)
  //    - Aileron (aileronsGeo): s in [0.630, 0.836] (z = 3.360m..4.555m), xNorm in [0.764, 1.000] (photo_06, photo_13, photo_14)
  //    - Swept Winglet (wingtipsGeo): s in [0.840, 1.000] (z = 4.575m..4.775m), full chord xNorm in [0.00, 1.00] (photo_13)
  const wingLES = (cal.wingLEStationM || 1.912) * lengthScale;
  const rootChord = (cal.wingChordRootM || 1.52) * lengthScale;
  const wingRootXCenter = xSpinnerTip + wingLES + rootChord * 0.5;
  const wingRootY = -0.45 * heightScale;

  const halfSpan = wingspanM * 0.5;
  const tipChord = (cal.wingChordTipM || 1.02) * lengthScale;
  const dihedralRad = ((cal.dihedralDeg || 4.5) * Math.PI) / 180;

  const wingPos: number[] = [];
  const wingNorm: number[] = [];
  const wingUvs: number[] = [];

  const wingWalkPos: number[] = [];
  const wingWalkNorm: number[] = [];
  const wingWalkUvs: number[] = [];

  const flapsPos: number[] = [];
  const flapsNorm: number[] = [];
  const flapsUvs: number[] = [];

  const aileronsPos: number[] = [];
  const aileronsNorm: number[] = [];
  const aileronsUvs: number[] = [];

  const wingtipPos: number[] = [];
  const wingtipNorm: number[] = [];
  const wingtipUvs: number[] = [];

  const makeWingStationEvaluator = (sideSign: 1 | -1) => (s: number) => {
    const isWingletZone = s >= 0.84;
    const wProg = isWingletZone ? (s - 0.84) / 0.16 : 0;

    const rootZ = 0.35 * widthScale;
    const linearSpan = rootZ + (s / 0.84) * (halfSpan * 0.955 - rootZ);
    const zAbs = isWingletZone
      ? halfSpan * 0.955 + Math.sin(wProg * Math.PI * 0.5) * (halfSpan * 0.045)
      : linearSpan;
    const z = sideSign * zAbs;

    const rootFillet =
      s < 0.08 ? Math.pow(1 - s / 0.08, 2) * 0.16 * lengthScale : 0;

    // Continuous taper from outer flap/mid-wing (s=0.42) to winglet joint (s=0.84) matching POH Top View
    const outerTaper = s < 0.42 ? 0 : Math.min(1, (s - 0.42) / 0.42);
    const baseChord =
      rootChord * (1 - outerTaper) + tipChord * outerTaper + rootFillet;
    const chord = Math.max(
      0.18,
      baseChord * (1 - 0.62 * Math.pow(wProg, 1.35))
    );

    const yDihedral =
      wingRootY +
      Math.max(0, zAbs - 0.52 * widthScale) * Math.tan(dihedralRad);
    const yWingletRise = Math.pow(wProg, 1.75) * 0.36 * heightScale;
    const yCenter = yDihedral + yWingletRise;

    const xCenter =
      wingRootXCenter +
      outerTaper * 0.09 * lengthScale +
      Math.pow(wProg, 1.45) * 0.38 * lengthScale;

    const cantAngle = wProg * 1.18;
    const cosCant = Math.cos(cantAngle);
    const sinCant = Math.sin(cantAngle);

    const thickness =
      0.145 * (1 - 0.28 * wProg) + (s < 0.08 ? 0.025 * (1 - s / 0.08) : 0);
    const camber = 0.022 * (1 - wProg);

    return {
      xCenter,
      yCenter,
      z,
      chord,
      thickness,
      camber,
      camberPos: 0.4,
      cosCant,
      sinCant,
      sideSign,
    };
  };

  for (const sideSign of [1, -1] as const) {
    const evalWing = makeWingStationEvaluator(sideSign);

    // 3A. Inboard Fixed Wing-Walk Root Section (s in [0.00, 0.165], full chord xNorm in [0.00, 1.00])
    appendAirfoilSubSegment(
      evalWing,
      0.0,
      0.165,
      10,
      () => 0.0,
      () => 1.0,
      "FULL",
      wingPos,
      wingNorm,
      wingUvs
    );

    // 3B. Black Non-Skid Wing Walk Step Pads (photo_16.jpg: two textured strips separated by a silver rivet strip!)
    appendAirfoilSubSegment(
      evalWing,
      0.06,
      0.108,
      4,
      () => 0.28,
      () => 0.985,
      "FULL",
      wingWalkPos,
      wingWalkNorm,
      wingWalkUvs,
      0.0022
    );
    appendAirfoilSubSegment(
      evalWing,
      0.115,
      0.16,
      4,
      () => 0.28,
      () => 0.985,
      "FULL",
      wingWalkPos,
      wingWalkNorm,
      wingWalkUvs,
      0.0022
    );

    // 3C. Fixed Forward Wing Box & Rear-Spar Cove across Flap & Aileron Span (s in [0.165, 0.840], xNorm in [0.00, 0.752])
    appendAirfoilSubSegment(
      evalWing,
      0.165,
      0.84,
      28,
      () => 0.0,
      () => 0.752,
      "FORWARD_BOX",
      wingPos,
      wingNorm,
      wingUvs
    );

    // 3D. Individual Slotted/Hinged Flap (s in [0.170, 0.625], xNorm in [0.764, 1.000] with rolled D-nose, photo_08 & photo_15)
    appendAirfoilSubSegment(
      evalWing,
      0.17,
      0.625,
      18,
      () => 0.764,
      () => 1.0,
      "CONTROL_SURFACE",
      flapsPos,
      flapsNorm,
      flapsUvs
    );

    // 3E. Individual Aileron (s in [0.631, 0.835], xNorm in [0.764, 1.000] with rolled D-nose, photo_06, photo_13 & photo_14)
    appendAirfoilSubSegment(
      evalWing,
      0.631,
      0.835,
      14,
      () => 0.764,
      () => 1.0,
      "CONTROL_SURFACE",
      aileronsPos,
      aileronsNorm,
      aileronsUvs
    );

    // 3F. Swept Curved Fiberglass Winglet (s in [0.840, 1.000], full chord xNorm in [0.00, 1.00], photo_13)
    appendAirfoilSubSegment(
      evalWing,
      0.84,
      1.0,
      14,
      () => 0.0,
      () => 1.0,
      "FULL",
      wingtipPos,
      wingtipNorm,
      wingtipUvs
    );
  }

  // 4. Horizontal Stabilizer (Fixed) + Individual Elevators (with Horn Balance, Center V-Notch & Trim Tab) + Tip Caps
  //    Matched directly to photo_11.jpg ("Tail"), photo_12.jpg ("Left HS"), ref_tail.jpg, and POH Page 2 Top View:
  //    - Metal Horizontal Stabilizer + Elevator has constant rectangular chord from tailcone root (s=0.05) to tip cap (s=0.89).
  //    - Fixed Horizontal Stabilizer (horizontalStabGeo):
  //      * Main span (s in [0.05, 0.80]): forward 47.5% of chord (xNorm in [0.00, 0.475]) with rear-spar cove
  //      * Horn-balance notch (s in [0.80, 0.89]): forward 20% of chord (xNorm in [0.00, 0.200]) making room for elevator horn!
  //    - Individual Elevators (elevatorsGeo):
  //      * Main span (s in [0.06, 0.80]): rear 51% of chord (xNorm in [0.490, 1.000]) with angled inner V-notch for rudder travel
  //      * Outer Aerodynamic Horn Balance (s in [0.80, 0.888]): extends forward across hinge line to xNorm = 0.215!
  //      * Left Elevator Trim Tab (sideSign = -1, s in [0.18, 0.50], xNorm in [0.815, 1.000])
  //    - Outer Fiberglass Tip Cap (wingtipsGeo): s in [0.892, 1.000], full chord xNorm in [0.00, 1.00]
  const hStabPos: number[] = [];
  const hStabNorm: number[] = [];
  const hStabUvs: number[] = [];

  const elevatorsPos: number[] = [];
  const elevatorsNorm: number[] = [];
  const elevatorsUvs: number[] = [];

  const hHalfSpan = ((cal.hStabSpanM || 3.095) * 0.5) * (wingspanM / 9.5);
  const hChordMetal = (cal.hStabChordM || 0.78) * lengthScale;
  const hStabX = (-3.6 + 6.32) * lengthScale;
  const hStabY = 0.01 * heightScale;

  const makeHStabStationEvaluator = (sideSign: 1 | -1) => (s: number) => {
    const isTipCap = s >= 0.89;
    const tipU = isTipCap ? (s - 0.89) / 0.11 : 0;

    const z = sideSign * (0.02 + s * hHalfSpan);
    // Rectangular constant-chord metal section (s < 0.89), swept fiberglass tip cap (s >= 0.89) per photo_12.jpg
    const chord = hChordMetal * (1 - 0.42 * Math.pow(tipU, 1.45));
    const xCenter = hStabX + tipU * 0.14 * lengthScale;

    return {
      xCenter,
      yCenter: hStabY,
      z,
      chord,
      thickness: 0.092 * (1 - 0.2 * tipU),
      camber: 0,
      camberPos: 0,
      cosCant: 1,
      sinCant: 0,
      sideSign,
    };
  };

  for (const sideSign of [1, -1] as const) {
    const evalHStab = makeHStabStationEvaluator(sideSign);

    // 4A. Fixed Horizontal Stabilizer — Main Inboard Span (s in [0.04, 0.80], forward 47.5% of chord)
    appendAirfoilSubSegment(
      evalHStab,
      0.04,
      0.8,
      16,
      () => 0.0,
      () => 0.475,
      "FORWARD_BOX",
      hStabPos,
      hStabNorm,
      hStabUvs
    );

    // 4B. Fixed Horizontal Stabilizer — Outer Notch Ahead of Elevator Horn Balance (s in [0.80, 0.89], forward 20% of chord)
    appendAirfoilSubSegment(
      evalHStab,
      0.8,
      0.89,
      6,
      () => 0.0,
      () => 0.2,
      "FORWARD_BOX",
      hStabPos,
      hStabNorm,
      hStabUvs
    );

    // 4C. Individual Elevator — Inboard Rudder-Clearance Tapered Section (s in [0.06, 0.175], photo_11.jpg "Tail")
    appendAirfoilSubSegment(
      evalHStab,
      0.06,
      0.175,
      6,
      () => 0.49,
      (s) => 0.56 + ((s - 0.06) / (0.175 - 0.06)) * 0.44,
      "CONTROL_SURFACE",
      elevatorsPos,
      elevatorsNorm,
      elevatorsUvs
    );

    if (sideSign === -1) {
      // Left Elevator has an articulated Trim Tab on its inboard trailing edge (s in [0.175, 0.50], photo_12.jpg "Left HS")
      appendAirfoilSubSegment(
        evalHStab,
        0.175,
        0.5,
        8,
        () => 0.49,
        () => 0.805,
        "FORWARD_BOX",
        elevatorsPos,
        elevatorsNorm,
        elevatorsUvs
      );
      // Left Elevator Trim Tab (s in [0.18, 0.495], xNorm in [0.818, 1.000])
      appendAirfoilSubSegment(
        evalHStab,
        0.18,
        0.495,
        8,
        () => 0.818,
        () => 1.0,
        "CONTROL_SURFACE",
        elevatorsPos,
        elevatorsNorm,
        elevatorsUvs
      );
      // Left Elevator Mid-Outboard Span (s in [0.50, 0.80], full elevator chord xNorm in [0.49, 1.00])
      appendAirfoilSubSegment(
        evalHStab,
        0.5,
        0.8,
        8,
        () => 0.49,
        () => 1.0,
        "CONTROL_SURFACE",
        elevatorsPos,
        elevatorsNorm,
        elevatorsUvs
      );
    } else {
      // Right Elevator Main Span (s in [0.175, 0.80], xNorm in [0.49, 1.00])
      appendAirfoilSubSegment(
        evalHStab,
        0.175,
        0.8,
        14,
        () => 0.49,
        () => 1.0,
        "CONTROL_SURFACE",
        elevatorsPos,
        elevatorsNorm,
        elevatorsUvs
      );
    }

    // 4D. Elevator Outer Aerodynamic Horn Balance (s in [0.802, 0.888], extends forward to xNorm = 0.215 per photo_12.jpg!)
    appendAirfoilSubSegment(
      evalHStab,
      0.802,
      0.888,
      6,
      () => 0.215,
      () => 1.0,
      "CONTROL_SURFACE",
      elevatorsPos,
      elevatorsNorm,
      elevatorsUvs
    );

    // 4E. Horizontal Stabilizer Outer Fiberglass Tip Cap (s in [0.892, 1.000], full chord xNorm in [0.00, 1.00], photo_12.jpg)
    appendAirfoilSubSegment(
      evalHStab,
      0.892,
      1.0,
      8,
      () => 0.0,
      () => 1.0,
      "FULL",
      wingtipPos,
      wingtipNorm,
      wingtipUvs
    );
  }

  const wingMainGeo = new THREE.BufferGeometry();
  wingMainGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(wingPos, 3)
  );
  wingMainGeo.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(wingNorm, 3)
  );
  wingMainGeo.setAttribute("uv", new THREE.Float32BufferAttribute(wingUvs, 2));

  const wingWalkGeo = new THREE.BufferGeometry();
  wingWalkGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(wingWalkPos, 3)
  );
  wingWalkGeo.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(wingWalkNorm, 3)
  );
  wingWalkGeo.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(wingWalkUvs, 2)
  );

  const flapsGeo = new THREE.BufferGeometry();
  flapsGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(flapsPos, 3)
  );
  flapsGeo.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(flapsNorm, 3)
  );
  flapsGeo.setAttribute("uv", new THREE.Float32BufferAttribute(flapsUvs, 2));

  const aileronsGeo = new THREE.BufferGeometry();
  aileronsGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(aileronsPos, 3)
  );
  aileronsGeo.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(aileronsNorm, 3)
  );
  aileronsGeo.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(aileronsUvs, 2)
  );

  const wingtipsGeo = new THREE.BufferGeometry();
  wingtipsGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(wingtipPos, 3)
  );
  wingtipsGeo.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(wingtipNorm, 3)
  );
  wingtipsGeo.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(wingtipUvs, 2)
  );

  const horizontalStabGeo = new THREE.BufferGeometry();
  horizontalStabGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(hStabPos, 3)
  );
  horizontalStabGeo.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(hStabNorm, 3)
  );
  horizontalStabGeo.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(hStabUvs, 2)
  );

  const elevatorsGeo = new THREE.BufferGeometry();
  elevatorsGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(elevatorsPos, 3)
  );
  elevatorsGeo.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(elevatorsNorm, 3)
  );
  elevatorsGeo.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(elevatorsUvs, 2)
  );

  // 5. Aerodynamic Teardrop Wheel Fairings (Spats) at Exact POH Axle Coordinates:
  //    Nose Axle: 900mm from Spinner Tip; Main Axle: 900 + 1750 = 2650mm from Spinner Tip; Track: 2050mm (+/-1.025m)
  const noseAxleX = xSpinnerTip + (cal.noseAxleStationM || 0.9) * lengthScale;
  const mainAxleX = noseAxleX + (cal.wheelbaseM || 1.75) * lengthScale;
  const halfTrackZ = ((cal.wheelTrackM || 2.05) * 0.5) * (wingspanM / 9.5);

  const spatPos: number[] = [];
  const spatNorm: number[] = [];
  const spatUvs: number[] = [];

  const addSculptedWheelPant = (
    cx: number,
    cy: number,
    cz: number,
    len: number,
    height: number,
    width: number
  ) => {
    const uSteps = 28;
    const vSteps = 28;
    const grid: GridVertex[][] = [];

    for (let i = 0; i <= uSteps; i++) {
      const u = i / uSteps;
      const rProfile = Math.max(0.02, Math.sin(Math.pow(u, 0.58) * Math.PI));
      const x = cx + (u - 0.42) * len;
      const yDroop = -0.025 * Math.pow(u, 1.5);
      const interiorCenter = new THREE.Vector3(x, cy + yDroop, cz);

      const row: GridVertex[] = [];
      for (let j = 0; j <= vSteps; j++) {
        const theta = (j / vSteps) * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const yFactor = cosT < -0.68 ? -0.68 : cosT;
        const y = cy + yDroop + yFactor * (height * 0.52) * rProfile;
        const z = cz + sinT * (width * 0.5) * rProfile;
        const vNorm = Math.max(0, Math.min(1, 0.5 + 0.5 * yFactor));
        row.push({
          pos: new THREE.Vector3(x, y, z),
          uv: [u, vNorm],
          interiorRef: interiorCenter,
        });
      }
      grid.push(row);
    }

    appendSmoothLoftedGrid(grid, true, spatPos, spatNorm, spatUvs);
  };

  if (cal.wheelPantsInstalled) {
    // Nose wheel pant (POH Side View: py=352..392 -> y = -0.82m..-1.12m, centered at yGround + 0.21m)
    addSculptedWheelPant(noseAxleX, yGround + 0.21, 0, 0.74, 0.31, 0.24);
    // Port & Starboard main wheel pants (POH Side View: py=356..392, centered at yGround + 0.22m)
    addSculptedWheelPant(
      mainAxleX,
      yGround + 0.22,
      halfTrackZ,
      0.8,
      0.33,
      0.26
    );
    addSculptedWheelPant(
      mainAxleX,
      yGround + 0.22,
      -halfTrackZ,
      0.8,
      0.33,
      0.26
    );
  }

  const wheelPantsGeo = new THREE.BufferGeometry();
  wheelPantsGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(spatPos, 3)
  );
  wheelPantsGeo.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(spatNorm, 3)
  );
  wheelPantsGeo.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(spatUvs, 2)
  );

  // 6. Short, Correctly-Angled Aerodynamic Landing Gear Struts (Exact POH Front & Side View Measurements!)
  //    In the POH Front View (py=181..201) and N916TS photo:
  //    - Bottom of the cabin/wing belly is at y = -0.55m, and top of the wheel pants is at y = -0.82m
  //      (only ~260mm of exposed strut height!).
  //    - Nose Gear Strut: slants FORWARD from the lower cowling (s = 1.00m, y = -0.50m) down into
  //      the nose wheel pant top (s = 0.90m, y = yGround + 0.24m).
  //    - Main Gear Struts: emerge under the inboard wing/belly fairing at |z| = 0.56m, y = -0.50m
  //      and angle outward at ~42 deg into the main wheel pants at |z| = 0.99m, y = yGround + 0.25m.
  const legPos: number[] = [];
  const legNorm: number[] = [];
  const legUvs: number[] = [];

  const addLoftedGearLeg = (
    pRoot: THREE.Vector3,
    pMid: THREE.Vector3,
    pWheel: THREE.Vector3,
    rxRoot: number,
    rzRoot: number,
    rxWheel: number,
    rzWheel: number
  ) => {
    const sSteps = 16;
    const rSteps = 20;
    const grid: GridVertex[][] = [];

    for (let i = 0; i <= sSteps; i++) {
      const t = i / sSteps;
      const mt = 1 - t;
      const cx = mt * mt * pRoot.x + 2 * mt * t * pMid.x + t * t * pWheel.x;
      const cy = mt * mt * pRoot.y + 2 * mt * t * pMid.y + t * t * pWheel.y;
      const cz = mt * mt * pRoot.z + 2 * mt * t * pMid.z + t * t * pWheel.z;

      const rx = rxRoot * (1 - t) + rxWheel * t;
      const rz = rzRoot * (1 - t) + rzWheel * t;
      const interiorCenter = new THREE.Vector3(cx, cy, cz);

      const row: GridVertex[] = [];
      for (let j = 0; j <= rSteps; j++) {
        const theta = (j / rSteps) * Math.PI * 2;
        const vx = cx + Math.cos(theta) * rx;
        const vz = cz + Math.sin(theta) * rz;
        row.push({
          pos: new THREE.Vector3(vx, cy, vz),
          uv: [j / rSteps, t],
          interiorRef: interiorCenter,
        });
      }
      grid.push(row);
    }

    appendSmoothLoftedGrid(grid, true, legPos, legNorm, legUvs);
  };

  // Nose Gear Strut: raked forward from s=1.00m under cowling down to s=0.90m at nose wheel pant
  const yNoseRoot = -0.49 * heightScale;
  const yNoseWheel = yGround + 0.23;
  addLoftedGearLeg(
    new THREE.Vector3(noseAxleX + 0.1 * lengthScale, yNoseRoot, 0),
    new THREE.Vector3(
      noseAxleX + 0.045 * lengthScale,
      0.5 * (yNoseRoot + yNoseWheel),
      0
    ),
    new THREE.Vector3(noseAxleX - 0.01 * lengthScale, yNoseWheel, 0),
    0.088,
    0.044,
    0.072,
    0.038
  );

  // Port & Starboard Main Gear Struts: short stout composite bow from |z|=0.56m under wing root to |z|=0.99m at wheel pant
  for (const side of [-1, 1] as const) {
    const zRoot = side * 0.55 * widthScale;
    const zWheel = side * (halfTrackZ - 0.03);
    const yRoot = -0.49 * heightScale;
    const yWheel = yGround + 0.25;

    addLoftedGearLeg(
      new THREE.Vector3(mainAxleX - 0.05 * lengthScale, yRoot, zRoot),
      new THREE.Vector3(
        mainAxleX - 0.02 * lengthScale,
        yRoot * 0.48 + yWheel * 0.52 + 0.02,
        zRoot * 0.45 + zWheel * 0.55
      ),
      new THREE.Vector3(mainAxleX, yWheel, zWheel),
      0.072,
      0.03,
      0.055,
      0.026
    );
  }

  const gearLegsPaintedGeo = new THREE.BufferGeometry();
  gearLegsPaintedGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(legPos, 3)
  );
  gearLegsPaintedGeo.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(legNorm, 3)
  );
  gearLegsPaintedGeo.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(legUvs, 2)
  );

  // 7. Smooth Ogive Bullet Spinner Cone (420mm long, radius 0.21m matching cowling front ring)
  const spinnerLen = xNoseCowl - xSpinnerTip;
  const spinnerPoints: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    const r = 0.21 * Math.pow(u, 0.62) * heightScale;
    spinnerPoints.push(new THREE.Vector2(r, (0.5 - u) * spinnerLen));
  }
  const spinnerGeo = new THREE.LatheGeometry(spinnerPoints, 48);
  spinnerGeo.rotateZ(Math.PI * 0.5);
  spinnerGeo.translate(xSpinnerTip + spinnerLen * 0.5, 0.01 * heightScale, 0);
  spinnerGeo.computeVertexNormals();

  // 8. 3-Blade Constant-Speed Scimitar Propeller (1.82m diameter)
  const numBlades = cal.propellerBlades || 3;
  const bladeGeos: THREE.BufferGeometry[] = [];
  const propRadius = 0.89 * heightScale;
  for (let b = 0; b < numBlades; b++) {
    const angle = (b / numBlades) * Math.PI * 2 + 0.48;
    const blade = new THREE.BoxGeometry(0.02, propRadius, 0.11, 1, 12, 1);
    blade.translate(0, propRadius * 0.5 + 0.09, 0);
    blade.rotateY(0.32);
    blade.rotateX(angle);
    blade.translate(xNoseCowl - 0.07, 0.01 * heightScale, 0);
    bladeGeos.push(blade);
  }
  const propellerBladesGeo = mergeBufferGeometries(bladeGeos);

  // 9. Dark Tires & Roof Whip VHF Antenna
  const darkDetailGeos: THREE.BufferGeometry[] = [];

  const noseTire = new THREE.CylinderGeometry(0.16, 0.16, 0.105, 28);
  noseTire.rotateX(Math.PI * 0.5);
  noseTire.translate(noseAxleX, yGround + 0.16, 0);
  darkDetailGeos.push(noseTire);

  for (const side of [-1, 1]) {
    const mainTire = new THREE.CylinderGeometry(0.175, 0.175, 0.12, 28);
    mainTire.rotateX(Math.PI * 0.5);
    mainTire.translate(mainAxleX, yGround + 0.175, side * halfTrackZ);
    darkDetailGeos.push(mainTire);
  }

  // Whip VHF Antenna on upper rear cabin spine (at s = 3.85m, y = +0.46m per POH Side View)
  const antenna = new THREE.CylinderGeometry(0.004, 0.007, 0.44, 8);
  antenna.rotateZ(-0.62);
  antenna.translate((-3.6 + 3.85) * lengthScale, 0.52 * heightScale, 0);
  darkDetailGeos.push(antenna);

  // Twin lower rudder cable horn arms & cables (visible at bottom of rudder in photo_11.jpg "Tail")
  for (const side of [-1, 1] as const) {
    const hornArm = new THREE.BoxGeometry(0.032, 0.006, 0.055);
    hornArm.translate(
      (-3.6 + 6.56) * lengthScale,
      -0.1 * heightScale,
      side * 0.032
    );
    darkDetailGeos.push(hornArm);
  }

  const gearStrutsAndTiresGeo = mergeBufferGeometries(darkDetailGeos);
  const cockpitInteriorGeo = new THREE.BufferGeometry();

  return {
    fuselageAndTailGeo,
    rudderGeo,
    canopyGlassGeo,
    wingMainGeo,
    wingWalkGeo,
    flapsGeo,
    aileronsGeo,
    wingtipsGeo,
    horizontalStabGeo,
    elevatorsGeo,
    wheelPantsGeo,
    gearLegsPaintedGeo,
    spinnerGeo,
    propellerBladesGeo,
    gearStrutsAndTiresGeo,
    cockpitInteriorGeo,
    bounds: {
      xMin: xSpinnerTip,
      xMax: xRudderTE,
      yMin: yGround,
      yMax: yFinTop,
      zMin: -halfSpan,
      zMax: halfSpan,
    },
  };
}

function mergeBufferGeometries(
  geos: THREE.BufferGeometry[]
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];

  for (const g of geos) {
    const nonIndexed = g.index ? g.toNonIndexed() : g;
    nonIndexed.computeVertexNormals();
    const posAttr = nonIndexed.getAttribute("position");
    const normAttr = nonIndexed.getAttribute("normal");
    for (let i = 0; i < posAttr.count; i++) {
      positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      if (normAttr) {
        normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
      }
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  if (normals.length === positions.length) {
    merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  } else {
    merged.computeVertexNormals();
  }
  return merged;
}
