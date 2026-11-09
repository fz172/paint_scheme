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

  // 1. Accumulate smooth outward normals at each grid vertex (i, j)
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

      // Diagonal cross product of quad (a, b, c, d): (c - a) x (d - b)
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

  // Weld seam normals when closed around J (360-degree tubes like wheel pants, struts)
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

  const pushVert = (pos: THREE.Vector3, norm: THREE.Vector3, uv: [number, number]) => {
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
        // Standard winding: (a, b, c) and (a, c, d)
        pushVert(a.pos, na, a.uv);
        pushVert(b.pos, nb, b.uv);
        pushVert(c.pos, nc, c.uv);

        pushVert(a.pos, na, a.uv);
        pushVert(c.pos, nc, c.uv);
        pushVert(d.pos, nd, d.uv);
      } else {
        // Flipped outward winding: (a, c, b) and (a, d, c)
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
 * (s = 0.44m from spinner tip) and t=1 is the tailcone tip (s = 6.95m from spinner tip).
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
  // At t=0 (spinner backplate junction), match the circular spinner radius (0.205m centered at y = +0.03m)
  const spinnerCenterY = 0.03;
  const spinnerRadius = 0.205;

  let yBottom = -0.44;
  let yTop = 0.25;
  let halfWidth = 0.45;
  let superellipseTopN = 2.05;
  let superellipseBotN = 2.15;

  // 1. Upper Deck / Cabin Roof / Tailcone Spine Profile (matched to POH Side View & N532SL)
  if (t < 0.19) {
    // Smooth Rotax 916iS upper cowling deck sloping from spinner backplate (y=0.235) to windshield base (y=0.31)
    const u = t / 0.19;
    yTop = spinnerCenterY + spinnerRadius + 0.075 * Math.pow(u, 0.72);
  } else if (t < 0.34) {
    // Wrap-around windshield & forward cabin roof arch rising to crown (y=0.67m)
    const u = (t - 0.19) / 0.15;
    yTop = 0.31 + 0.36 * Math.sin(u * Math.PI * 0.5);
  } else if (t < 0.56) {
    // Rear cabin roof sloping smoothly over rear passenger window into tailcone
    const u = (t - 0.34) / 0.22;
    const smoothDrop = u * u * (3 - 2 * u);
    yTop = 0.67 - 0.39 * smoothDrop;
  } else {
    // Flush-riveted tailcone dorsal spine (t=0.56 to 1.0)
    const u = (t - 0.56) / 0.44;
    yTop = 0.28 - 0.12 * u;
  }

  // 2. Lower Belly Profile (Spinner junction -> Chin scoop -> flat cabin floor -> 14-deg tailcone upsweep)
  if (t < 0.14) {
    // Smooth curve from spinner bottom (-0.175m) down to chin radiator scoop & lower cowling (-0.45m)
    const u = t / 0.14;
    yBottom =
      spinnerCenterY -
      spinnerRadius -
      0.275 * Math.sin(Math.pow(u, 0.7) * Math.PI * 0.5);
  } else if (t < 0.47) {
    // Deep cabin tub & center-section wing carry-through belly
    const u = (t - 0.14) / 0.33;
    yBottom = -0.45 - 0.035 * Math.sin(u * Math.PI);
  } else {
    // POH 14-degree tailcone bottom upsweep toward tail tie-down
    const u = (t - 0.47) / 0.53;
    yBottom = -0.45 + 0.41 * Math.pow(u, 1.04);
  }

  // 3. Half-Width Profile (POH Cabin Width = 1188mm -> halfWidth = 0.594m at t = 0.33)
  if (t < 0.19) {
    // Widens smoothly from spinner radius (0.205m) across twin-cheek Rotax cowling to cabin width (0.575m)
    const u = t / 0.19;
    halfWidth = spinnerRadius + (0.575 - spinnerRadius) * Math.pow(u, 0.58);
    superellipseTopN = 2.0 + 0.35 * Math.sin(u * Math.PI);
    superellipseBotN = 2.0 + 0.3 * u;
  } else if (t < 0.48) {
    // 4-place cabin (1.188m width -> 0.594m half-width)
    const u = (t - 0.19) / 0.29;
    halfWidth = 0.575 + 0.02 * Math.sin(u * Math.PI);
    superellipseTopN = 2.12;
    superellipseBotN = 2.35;
  } else {
    // Tapered aluminum tailcone (Matched to POH Page 2 Top Planform)
    const u = (t - 0.48) / 0.52;
    halfWidth = 0.575 * Math.pow(1 - u, 1.1) + 0.02;
    superellipseTopN = 2.0;
    superellipseBotN = 2.0;
  }

  // Waist beltline height where maximum width occurs (starts at spinnerCenterY = 0.03 at t=0)
  const yMaxWidthLine =
    t < 0.19
      ? spinnerCenterY + (0.08 - spinnerCenterY) * (t / 0.19)
      : t < 0.52
        ? 0.08
        : 0.08;

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
  // Exact Sling 4 TSi POH dimensions
  const lengthM = cal.lengthM || 7.2;
  const wingspanM = cal.wingspanM || 9.5;
  const heightM = cal.heightM || 2.35;

  const lengthScale = lengthM / 7.2;
  const heightScale = heightM / 2.35;
  const widthScale = (cal.cabinWidthM || 1.188) / 1.188;

  // Center aircraft around X = 0 (Spinner tip at -3.60m * lengthScale, Rudder TE at +3.60m * lengthScale)
  const xSpinnerTip = -3.6 * lengthScale;
  const xNoseCowl = (-3.6 + 0.44) * lengthScale; // Spinner is 440mm long
  const xFuselageEnd = (-3.6 + 6.95) * lengthScale;
  const xRudderTE = (-3.6 + 7.2) * lengthScale;
  const fusLength = xFuselageEnd - xNoseCowl;

  // Vertical bounds anchored to Propeller Thrustline (y = 0)
  // POH: Thrustline is 1180mm above ground, Fin Tip is 2350mm above ground (+1170mm above thrustline)
  const yGround = -(cal.propThrustlineHeightM || 1.18) * heightScale;
  const yFinTop = yGround + heightM;

  // Fuselage UV Vertical Projection Bounds (from lowest belly y=-0.52m to fin top y=+1.17m)
  const yUvMin = -0.52 * heightScale;
  const yUvMax = yFinTop;
  const xUvMin = xSpinnerTip;
  const xUvMax = xRudderTE;

  const fusPositions: number[] = [];
  const fusNormals: number[] = [];
  const fusUvs: number[] = [];

  // 1. Build Watertight, Smooth-Shaded Lofted Fuselage (Port and Starboard halves share welded centerline normals)
  const numStations = 88;
  const halfRadial = 32; // 32 steps per side = 64 radial steps total

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
        // theta from 0 (top spine) to PI (bottom centerline)
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
        // Subtle twin-cheek Rotax cowling swell near nose (t in [0.02, 0.16])
        if (t > 0.01 && t < 0.16 && isUpperHalf && sinT > 0.35) {
          const swell =
            Math.sin(((t - 0.01) / 0.15) * Math.PI) *
            0.024 *
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

  // 2. Build Swept Vertical Stabilizer + Dorsal Fin Fillet + Rudder (POH Page 1 exact profile)
  const finBaseY = 0.12 * heightScale;
  const finSpan = yFinTop - finBaseY;
  const finLevels = 30;
  const finChordSteps = 28;

  const buildFinSide = (sideSign: 1 | -1) => {
    const grid: GridVertex[][] = [];

    for (let i = 0; i <= finLevels; i++) {
      const v = i / finLevels;
      const y = finBaseY + v * finSpan;

      // Dorsal fillet sweeps forward along the tailcone spine for v < 0.26
      const dorsalExt =
        v < 0.26 ? Math.pow(1 - v / 0.26, 2.1) * 0.78 * lengthScale : 0;

      // Main fin leading edge sweeps from s=5.82m at base to s=6.55m at tip
      const leX = (-3.6 + 5.82 + v * 0.73) * lengthScale - dorsalExt;
      // Rudder trailing edge sweeps from s=7.20m at base to s=7.06m at tip
      const teX = (-3.6 + 7.2 - v * 0.14) * lengthScale;
      const chord = Math.max(0.25, teX - leX);
      const thickness = 0.11 * (1 - 0.35 * v);

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

  // Canopy glass is rendered flush in the 2048x2048 multi-channel PBR fuselage texture
  // so there are no jagged polygon holes or floating interior blocks.
  const canopyGlassGeo = new THREE.BufferGeometry();

  // 3. Build Low-Wing Main Airfoil + Signature Sling TSi Blended Curved Winglets
  // Starts at z = 0.34m inside the lower fuselage with a smooth wing-root fillet flare
  const wingLES = (cal.wingLEStationM || 1.912) * lengthScale;
  const rootChord = (cal.wingChordRootM || 1.52) * lengthScale;
  const wingRootXCenter = xSpinnerTip + wingLES + rootChord * 0.5;
  const wingRootY = -0.34 * heightScale;

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

      // Spanwise Z coordinate: starts at 0.35m (inside fuselage wall) with smooth wing-root fillet
      const rootZ = 0.35 * widthScale;
      const linearSpan =
        rootZ + (s / 0.84) * (halfSpan * 0.94 - rootZ);
      const zAbs = isWingletZone
        ? halfSpan * 0.94 + Math.sin(wProg * Math.PI * 0.5) * (halfSpan * 0.06)
        : linearSpan;
      const z = sideSign * zAbs;

      // Wing-root aerodynamic fillet flare near fuselage wall (s < 0.08)
      const rootFillet = s < 0.08 ? Math.pow(1 - s / 0.08, 2) * 0.16 * lengthScale : 0;

      // Constant chord (1.52m) out to s=0.46 (POH Page 2), then linear taper to tipChord, then winglet taper
      const outerTaper = s < 0.46 ? 0 : Math.min(1, (s - 0.46) / 0.38);
      const baseChord = rootChord * (1 - outerTaper) + tipChord * outerTaper + rootFillet;
      const chord = Math.max(0.18, baseChord * (1 - 0.62 * Math.pow(wProg, 1.35)));

      // Vertical Y coordinate: dihedral + curved upward winglet rise (+0.36m at winglet tip)
      const yDihedral =
        wingRootY + Math.max(0, zAbs - 0.52 * widthScale) * Math.tan(dihedralRad);
      const yWingletRise = Math.pow(wProg, 1.75) * 0.36 * heightScale;
      const yCenter = yDihedral + yWingletRise;

      // Longitudinal X coordinate
      const xCenter =
        wingRootXCenter +
        outerTaper * 0.11 * lengthScale +
        Math.pow(wProg, 1.45) * 0.38 * lengthScale;

      // Cant angle: airfoil rotates smoothly into the upturned winglet
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
          0.145 * (1 - 0.28 * wProg) + (s < 0.08 ? 0.025 * (1 - s / 0.08) : 0),
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

    // Inner main wing (s < 0.78)
    appendSmoothLoftedGrid(
      grid,
      true,
      wingPos,
      wingNorm,
      wingUvs,
      (i, numI) => i / numI < 0.78
    );
    // Outer wingtip & upturned winglet (s >= 0.78)
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
  const hChordTip = hChordRoot * 0.72;
  const hStabX = (-3.6 + 6.42) * lengthScale;
  const hStabY = 0.08 * heightScale;

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
      const xCenter = hStabX + s * 0.14 * lengthScale + tipU * 0.08;
      const yLift = hStabY + Math.pow(tipU, 1.5) * 0.065 * heightScale;
      const interiorCenter = new THREE.Vector3(xCenter, yLift, z);

      const row: GridVertex[] = [];
      for (let j = 0; j <= pSteps; j++) {
        const p = j / pSteps;
        const isUpper = p <= 0.5;
        const xNorm = isUpper ? 1 - p * 2 : (p - 0.5) * 2;
        const af = evaluateAirfoil(xNorm, 0.105, 0, 0, isUpper);
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
  // Nose Axle: 900mm from Spinner Tip; Main Axle: 900 + 1750 = 2650mm from Spinner Tip; Track: 2050mm (+/-1.025m)
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
        // Flat bottom cut-out so tire protrudes cleanly below wheel pant
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
    // Nose wheel pant
    addSculptedWheelPant(noseAxleX, yGround + 0.22, 0, 0.78, 0.33, 0.25);
    // Port & Starboard main wheel pants
    addSculptedWheelPant(
      mainAxleX,
      yGround + 0.23,
      halfTrackZ,
      0.86,
      0.35,
      0.27
    );
    addSculptedWheelPant(
      mainAxleX,
      yGround + 0.23,
      -halfTrackZ,
      0.86,
      0.35,
      0.27
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

  // 6. Painted Aerodynamic Landing Gear Legs — Lofted directly from Fuselage Belly to Wheel Hubs!
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
    const sSteps = 18;
    const rSteps = 20;
    const grid: GridVertex[][] = [];

    for (let i = 0; i <= sSteps; i++) {
      const t = i / sSteps;
      const mt = 1 - t;
      // Quadratic Bezier path from fuselage belly root to wheel pant top/hub
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

  // Nose Gear Leg: from forward lower cowling belly (y=-0.30) straight down into nose wheel pant hub (yGround + 0.20)
  addLoftedGearLeg(
    new THREE.Vector3(noseAxleX - 0.04 * lengthScale, -0.28 * heightScale, 0),
    new THREE.Vector3(
      noseAxleX - 0.015 * lengthScale,
      0.5 * (-0.28 * heightScale + (yGround + 0.2)),
      0
    ),
    new THREE.Vector3(noseAxleX, yGround + 0.2, 0),
    0.095,
    0.048,
    0.075,
    0.042
  );

  // Port & Starboard Main Gear Composite Bow Struts:
  // Emerge from inboard fuselage belly (z = +/- 0.34m, y = -0.37m) and sweep OUTWARD & DOWNWARD
  // directly into the top of the main wheel pants / wheel hubs (z = +/- halfTrackZ, y = yGround + 0.23m)!
  for (const side of [-1, 1] as const) {
    const zRoot = side * 0.34 * widthScale;
    const zWheel = side * halfTrackZ;
    const yRoot = -0.36 * heightScale;
    const yWheel = yGround + 0.22;

    addLoftedGearLeg(
      new THREE.Vector3(mainAxleX - 0.06 * lengthScale, yRoot, zRoot),
      new THREE.Vector3(
        mainAxleX - 0.02 * lengthScale,
        yRoot * 0.45 + yWheel * 0.55 + 0.06,
        zRoot * 0.35 + zWheel * 0.65
      ),
      new THREE.Vector3(mainAxleX, yWheel, zWheel),
      0.075,
      0.032,
      0.058,
      0.028
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

  // 7. Smooth Ogive Bullet Spinner Cone (440mm long, radius 0.205m matching cowling front ring)
  const spinnerLen = xNoseCowl - xSpinnerTip;
  const spinnerPoints: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    const r = 0.205 * Math.pow(u, 0.62) * heightScale;
    spinnerPoints.push(new THREE.Vector2(r, (0.5 - u) * spinnerLen));
  }
  const spinnerGeo = new THREE.LatheGeometry(spinnerPoints, 48);
  spinnerGeo.rotateZ(Math.PI * 0.5);
  spinnerGeo.translate(xSpinnerTip + spinnerLen * 0.5, 0.03 * heightScale, 0);
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
    blade.translate(xNoseCowl - 0.07, 0.03 * heightScale, 0);
    bladeGeos.push(blade);
  }
  const propellerBladesGeo = mergeBufferGeometries(bladeGeos);

  // 9. Dark Tires & Roof Whip VHF Antenna (no black blocks on cowling or cockpit!)
  const darkDetailGeos: THREE.BufferGeometry[] = [];

  // Nose Tire (touching ground at yGround)
  const noseTire = new THREE.CylinderGeometry(0.165, 0.165, 0.105, 28);
  noseTire.rotateX(Math.PI * 0.5);
  noseTire.translate(noseAxleX, yGround + 0.165, 0);
  darkDetailGeos.push(noseTire);

  // Main Tires (touching ground at yGround, track = 2050mm)
  for (const side of [-1, 1]) {
    const mainTire = new THREE.CylinderGeometry(0.185, 0.185, 0.125, 28);
    mainTire.rotateX(Math.PI * 0.5);
    mainTire.translate(mainAxleX, yGround + 0.185, side * halfTrackZ);
    darkDetailGeos.push(mainTire);
  }

  // Whip VHF Antenna on upper rear cabin spine
  const antenna = new THREE.CylinderGeometry(0.004, 0.007, 0.44, 8);
  antenna.rotateZ(-0.62);
  antenna.translate(xNoseCowl + fusLength * 0.55, 0.46 * heightScale, 0);
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
