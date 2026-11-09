import * as THREE from "three";
import { AirframeCalibration } from "@/types/livery";

export interface SlingTsiMeshParts {
  fuselageAndTailGeo: THREE.BufferGeometry;
  canopyGlassGeo: THREE.BufferGeometry;
  wingMainGeo: THREE.BufferGeometry;
  wingtipsGeo: THREE.BufferGeometry;
  horizontalStabGeo: THREE.BufferGeometry;
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
  // Convert normalized fuselage station t in [0, 1] to meters s from spinner tip [0.42m .. 7.00m]
  const s = 0.42 + t * 6.58;

  const spinnerCenterY = 0.01;
  const spinnerRadius = 0.21;

  let yTop = 0.295;
  let yBottom = -0.55;
  let halfWidth = 0.594;
  let superellipseTopN = 2.15;
  let superellipseBotN = 2.35;

  // 1. Upper Profile yTop(s) — Measured directly from POH Side View:
  //    s=0.42m: +0.22m (behind spinner)
  //    s=1.45m: +0.30m (base of wrap-around windshield)
  //    s=2.55m: +0.623m (cabin roof crown)
  //    s=3.65m: +0.49m (rear of passenger window)
  //    s=4.50m..7.00m: +0.295m (horizontal tailcone dorsal spine!)
  if (s < 1.45) {
    const u = (s - 0.42) / (1.45 - 0.42);
    yTop = spinnerCenterY + spinnerRadius + 0.08 * Math.pow(u, 0.72);
  } else if (s < 2.55) {
    const u = (s - 1.45) / (2.55 - 1.45);
    yTop = 0.30 + 0.323 * Math.sin(u * Math.PI * 0.5);
  } else if (s < 4.50) {
    const u = (s - 2.55) / (4.50 - 2.55);
    const smooth = u * u * (3 - 2 * u);
    yTop = 0.623 - (0.623 - 0.295) * smooth;
  } else {
    const u = (s - 4.50) / (7.00 - 4.50);
    yTop = 0.295 - 0.025 * u;
  }

  // 2. Lower Belly Profile yBottom(s) — Measured directly from POH Side & Front Views:
  //    s=0.42m: -0.20m (behind spinner)
  //    s=0.95m: -0.52m (deep lower cowling & chin scoop)
  //    s=1.80m..3.50m: -0.555m (deep cabin belly & center-section wing carry-through)
  //    s=3.50m..7.00m: rises along 14-deg clearance line from -0.555m to -0.20m at s=7.00m
  //    (giving a deep, muscular tailcone: 0.72m tall at mid-tailcone, 0.47m tall under the rudder!)
  if (s < 0.95) {
    const u = (s - 0.42) / (0.95 - 0.42);
    yBottom =
      spinnerCenterY -
      spinnerRadius -
      0.32 * Math.sin(Math.pow(u, 0.68) * Math.PI * 0.5);
  } else if (s < 3.50) {
    const u = (s - 0.95) / (3.50 - 0.95);
    yBottom = -0.52 - 0.038 * Math.sin(u * Math.PI);
  } else {
    const u = (s - 3.50) / (7.00 - 3.50);
    yBottom = -0.545 + 0.345 * Math.pow(u, 0.96);
  }

  // 3. Half-Width Profile halfWidth(s) — Measured directly from POH Top View (Page 2):
  //    Cabin width = 1188mm (halfWidth = 0.594m) maintained from firewall across cabin (s=1.55m..3.55m),
  //    then tapers smoothly along the tailcone to 0.085m at the rudder post.
  if (s < 1.55) {
    const u = (s - 0.42) / (1.55 - 0.42);
    halfWidth = spinnerRadius + (0.585 - spinnerRadius) * Math.pow(u, 0.55);
    superellipseTopN = 2.0 + 0.35 * Math.sin(u * Math.PI);
    superellipseBotN = 2.0 + 0.35 * u;
  } else if (s < 3.55) {
    const u = (s - 1.55) / (3.55 - 1.55);
    halfWidth = 0.585 + 0.012 * Math.sin(u * Math.PI);
    superellipseTopN = 2.22;
    superellipseBotN = 2.45;
  } else {
    const u = (s - 3.55) / (7.00 - 3.55);
    halfWidth = 0.585 * Math.pow(1 - u, 0.85) + 0.065 * (1 - 0.5 * u);
    superellipseTopN = 2.15;
    superellipseBotN = 2.2;
  }

  const yMaxWidthLine =
    s < 1.45
      ? spinnerCenterY + (0.04 - spinnerCenterY) * ((s - 0.42) / (1.45 - 0.42))
      : 0.04;

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
  const xFuselageEnd = (-3.6 + 7.0) * lengthScale;
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

  // 2. Build Slender Swept Vertical Stabilizer + Rudder (Exact POH Page 1 Pixel Measurements!)
  //    At base (y = +0.26m): LE at s = 6.02m (with subtle dorsal fillet to s = 5.75m), TE at s = 7.01m (chord = 0.99m)
  //    At tip  (y = +1.17m): LE at s = 6.63m, TE at s = 7.20m (tip chord = 0.57m)
  //    Notice how the rudder trailing edge slants forward as it goes down (7.20m at top -> 7.01m at bottom),
  //    and the airfoil is a slender 6.5% section!
  const finBaseY = 0.24 * heightScale;
  const finSpan = yFinTop - finBaseY;
  const finLevels = 30;
  const finChordSteps = 28;

  const buildFinSide = (sideSign: 1 | -1) => {
    const grid: GridVertex[][] = [];

    for (let i = 0; i <= finLevels; i++) {
      const v = i / finLevels;
      const y = finBaseY + v * finSpan;

      // Subtle dorsal fin fillet only in the lowest 14% where fin blends into tailcone spine
      const dorsalExt =
        v < 0.14 ? Math.pow(1 - v / 0.14, 2.2) * 0.28 * lengthScale : 0;

      // Exact POH leading edge: s=6.02m at base -> s=6.63m at tip
      const leX = (-3.6 + 6.02 + v * 0.61) * lengthScale - dorsalExt;
      // Exact POH rudder trailing edge: s=7.01m at base -> s=7.20m at tip (slants aft toward top!)
      const teX = (-3.6 + 7.01 + v * 0.19) * lengthScale;
      const chord = Math.max(0.25, teX - leX);
      // Slender 6.5% tail section (tapers to 5.0% at tip)
      const thickness = 0.065 * (1 - 0.25 * v);

      const row: GridVertex[] = [];
      for (let j = 0; j <= finChordSteps; j++) {
        const u = j / finChordSteps;
        const af = evaluateAirfoil(u, thickness, 0, 0, true);
        const x = leX + u * chord;
        const tipPinch =
          v > 0.96 ? Math.sqrt(Math.max(0.02, 1 - (v - 0.96) / 0.04)) : 1;
        const z = sideSign * Math.max(0.002, af.y * chord * tipPinch);
        const pos = new THREE.Vector3(x, y, z);
        const uv = computeFuselageOrthographicUV(
          pos.x,
          pos.y,
          sideSign,
          xUvMin,
          xUvMax,
          yUvMin,
          yUvMax
        );
        row.push({
          pos,
          uv,
          interiorRef: new THREE.Vector3(leX + chord * 0.45, y - 0.02, 0),
        });
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
      false
    );
  };

  buildFinSide(1);
  buildFinSide(-1);

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

  const canopyGlassGeo = new THREE.BufferGeometry();

  // 3. Build Low-Wing Main Airfoil + Signature Sling TSi Blended Curved Winglets
  //    Positioned at y = -0.46m (bottom of wing at y = -0.56m, matching POH Front & Side View!)
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

  const wingtipPos: number[] = [];
  const wingtipNorm: number[] = [];
  const wingtipUvs: number[] = [];

  const buildWingHalf = (sideSign: 1 | -1) => {
    const spanSteps = 46;
    const profileSteps = 40;
    const grid: GridVertex[][] = [];

    for (let i = 0; i <= spanSteps; i++) {
      const s = i / spanSteps;
      const isWingletZone = s >= 0.84;
      const wProg = isWingletZone ? (s - 0.84) / 0.16 : 0;

      const rootZ = 0.35 * widthScale;
      const linearSpan = rootZ + (s / 0.84) * (halfSpan * 0.94 - rootZ);
      const zAbs = isWingletZone
        ? halfSpan * 0.94 + Math.sin(wProg * Math.PI * 0.5) * (halfSpan * 0.06)
        : linearSpan;
      const z = sideSign * zAbs;

      const rootFillet =
        s < 0.08 ? Math.pow(1 - s / 0.08, 2) * 0.16 * lengthScale : 0;

      const outerTaper = s < 0.46 ? 0 : Math.min(1, (s - 0.46) / 0.38);
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
        outerTaper * 0.11 * lengthScale +
        Math.pow(wProg, 1.45) * 0.38 * lengthScale;

      const cantAngle = wProg * 1.18;
      const cosCant = Math.cos(cantAngle);
      const sinCant = Math.sin(cantAngle);

      const interiorCenter = new THREE.Vector3(xCenter, yCenter, z);

      const row: GridVertex[] = [];
      for (let j = 0; j <= profileSteps; j++) {
        const p = j / profileSteps;
        const isUpper = p <= 0.5;
        const xNorm = isUpper ? 1 - p * 2 : (p - 0.5) * 2;
        const af = evaluateAirfoil(
          xNorm,
          0.145 * (1 - 0.28 * wProg) +
            (s < 0.08 ? 0.025 * (1 - s / 0.08) : 0),
          0.022 * (1 - wProg),
          0.4,
          isUpper
        );
        const localX = af.x * chord;
        const localY = af.y * chord;

        const vx = xCenter + localX;
        const vy = yCenter + localY * cosCant;
        const vz = z - sideSign * localY * sinCant;

        row.push({
          pos: new THREE.Vector3(vx, vy, vz),
          uv: [xNorm, s],
          interiorRef: interiorCenter,
        });
      }
      grid.push(row);
    }

    appendSmoothLoftedGrid(
      grid,
      true,
      wingPos,
      wingNorm,
      wingUvs,
      (i, numI) => i / numI < 0.78
    );
    appendSmoothLoftedGrid(
      grid,
      true,
      wingtipPos,
      wingtipNorm,
      wingtipUvs,
      (i, numI) => i / numI >= 0.78
    );
  };

  buildWingHalf(1);
  buildWingHalf(-1);

  // 4. Horizontal Stabilizer & Elevator (POH Page 2: 3095mm span, 921mm chord + raked tips)
  const hStabPos: number[] = [];
  const hStabNorm: number[] = [];
  const hStabUvs: number[] = [];
  const hHalfSpan = ((cal.hStabSpanM || 3.095) * 0.5) * (wingspanM / 9.5);
  const hChordRoot = (cal.hStabChordM || 0.921) * lengthScale;
  const hChordTip = hChordRoot * 0.74;
  const hStabX = (-3.6 + 6.45) * lengthScale;
  const hStabY = 0.06 * heightScale;

  const buildHStabHalf = (sideSign: 1 | -1) => {
    const sSteps = 20;
    const pSteps = 28;
    const grid: GridVertex[][] = [];
    for (let i = 0; i <= sSteps; i++) {
      const s = i / sSteps;
      const isTipFin = s >= 0.88;
      const tipU = isTipFin ? (s - 0.88) / 0.12 : 0;

      const z = sideSign * (0.03 + s * hHalfSpan);
      const chord =
        (hChordRoot * (1 - s) + hChordTip * s) * (1 - 0.35 * tipU);
      const xCenter = hStabX + s * 0.12 * lengthScale + tipU * 0.07;
      const yLift = hStabY + Math.pow(tipU, 1.5) * 0.06 * heightScale;
      const interiorCenter = new THREE.Vector3(xCenter, yLift, z);

      const row: GridVertex[] = [];
      for (let j = 0; j <= pSteps; j++) {
        const p = j / pSteps;
        const isUpper = p <= 0.5;
        const xNorm = isUpper ? 1 - p * 2 : (p - 0.5) * 2;
        const af = evaluateAirfoil(xNorm, 0.095, 0, 0, isUpper);
        row.push({
          pos: new THREE.Vector3(
            xCenter + af.x * chord,
            yLift + af.y * chord,
            z
          ),
          uv: [xNorm, s],
          interiorRef: interiorCenter,
        });
      }
      grid.push(row);
    }

    appendSmoothLoftedGrid(
      grid,
      true,
      hStabPos,
      hStabNorm,
      hStabUvs,
      (i, numI) => i / numI < 0.85
    );
    appendSmoothLoftedGrid(
      grid,
      true,
      wingtipPos,
      wingtipNorm,
      wingtipUvs,
      (i, numI) => i / numI >= 0.85
    );
  };
  buildHStabHalf(1);
  buildHStabHalf(-1);

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

  const gearStrutsAndTiresGeo = mergeBufferGeometries(darkDetailGeos);
  const cockpitInteriorGeo = new THREE.BufferGeometry();

  return {
    fuselageAndTailGeo,
    canopyGlassGeo,
    wingMainGeo,
    wingtipsGeo,
    horizontalStabGeo,
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
