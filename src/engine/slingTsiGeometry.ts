import * as THREE from "three";
import { AirframeCalibration } from "@/types/livery";

export interface SlingTsiMeshParts {
  fuselageAndTailGeo: THREE.BufferGeometry;
  canopyGlassGeo: THREE.BufferGeometry;
  wingMainGeo: THREE.BufferGeometry;
  wingtipsGeo: THREE.BufferGeometry;
  horizontalStabGeo: THREE.BufferGeometry;
  wheelPantsGeo: THREE.BufferGeometry;
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

/**
 * Evaluates the Sling TSi longitudinal profile at normalized station t in [0, 1]
 * where t = 0 is the nose behind the spinner and t = 1 is the tailcone end.
 */
export function evaluateSlingFuselageStation(t: number): {
  yBottom: number;
  yTop: number;
  yBeltline: number;
  halfWidth: number;
  superellipseN: number;
  isCanopyZone: boolean;
  isCanopyFrameBow: boolean;
} {
  let yBottom = -0.35;
  let yTop = 0.25;
  let halfWidth = 0.42;
  let superellipseN = 2.1;

  // Bottom belly profile
  if (t < 0.08) {
    const u = t / 0.08;
    yBottom = -0.05 - 0.34 * Math.pow(u, 0.65);
  } else if (t < 0.52) {
    const u = (t - 0.08) / 0.44;
    yBottom = -0.39 - 0.05 * Math.sin(u * Math.PI);
  } else {
    const u = (t - 0.52) / 0.48;
    yBottom = -0.39 + 0.34 * Math.pow(u, 1.15);
  }

  // Top profile (Cowling -> Bubble Canopy -> Tailcone)
  if (t < 0.21) {
    // Aerodynamic Rotax 915iS cowling
    const u = t / 0.21;
    yTop = -0.02 + 0.26 * Math.pow(u, 0.62);
  } else if (t < 0.55) {
    // 4-place bubble canopy arch
    const u = (t - 0.21) / 0.34;
    const arch = Math.sin(u * Math.PI);
    const frontSkew = Math.sin(Math.pow(u, 0.78) * Math.PI);
    yTop = 0.24 + 0.48 * (0.65 * frontSkew + 0.35 * arch) - 0.08 * u;
  } else {
    // Flush-riveted rear tailcone with dorsal spine transition
    const u = (t - 0.55) / 0.45;
    yTop = 0.16 * (1 - 0.55 * u);
  }

  // Half-width profile (Cabin widest at 1.18m total width)
  if (t < 0.21) {
    const u = t / 0.21;
    halfWidth = 0.16 + 0.41 * Math.pow(u, 0.58);
    superellipseN = 2.2;
  } else if (t < 0.52) {
    const u = (t - 0.21) / 0.31;
    halfWidth = 0.57 + 0.03 * Math.sin(u * Math.PI);
    superellipseN = 2.35;
  } else {
    const u = (t - 0.52) / 0.48;
    halfWidth = 0.57 * Math.pow(1 - u, 1.18) + 0.03;
    superellipseN = 2.0;
  }

  // Canopy sill height (window line)
  const yBeltline =
    t >= 0.22 && t <= 0.54
      ? 0.18 - 0.06 * ((t - 0.22) / 0.32)
      : yTop + 1.0;

  const isCanopyZone = t >= 0.225 && t <= 0.535;
  // Painted composite roll-bar / gullwing frame bow in center of canopy + rear baggage pillar
  const isCanopyFrameBow =
    (t >= 0.365 && t <= 0.39) || (t >= 0.465 && t <= 0.482);

  return {
    yBottom,
    yTop,
    yBeltline,
    halfWidth,
    superellipseN,
    isCanopyZone,
    isCanopyFrameBow,
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
  z: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number
): [number, number] {
  const uNorm = Math.max(0, Math.min(1, (x - xMin) / (xMax - xMin)));
  const vNorm = Math.max(0, Math.min(1, (y - yMin) / (yMax - yMin)));
  const u = 0.02 + uNorm * 0.96;
  if (z >= 0) {
    // Port (Left) side occupies top half of UV atlas: [0.52, 0.98]
    return [u, 0.52 + vNorm * 0.46];
  } else {
    // Starboard (Right) side occupies bottom half of UV atlas: [0.02, 0.48]
    return [u, 0.02 + vNorm * 0.46];
  }
}

export function buildSlingTsiGeometry(
  cal: AirframeCalibration
): SlingTsiMeshParts {
  const lengthM = cal.lengthM || 7.175;
  const wingspanM = cal.wingspanM || 9.53;
  const heightM = cal.heightM || 2.45;

  // Longitudinal bounds (Nose at -lengthM * 0.45, Tail at +lengthM * 0.55)
  const xSpinnerTip = -lengthM * 0.48;
  const xNoseCowl = -lengthM * 0.42;
  const xTailEnd = lengthM * 0.50;
  const fusLength = xTailEnd - xNoseCowl;

  // Vertical bounds for orthographic UV projection
  const yGround = -heightM * 0.44;
  const yFinTop = heightM * 0.56;
  const xMinTotal = xSpinnerTip;
  const xMaxTotal = xTailEnd + 0.35;

  // 1. Build Lofted Fuselage + Canopy Glass Separation
  const numStations = 68;
  const numRadial = 48;

  const fusPositions: number[] = [];
  const fusUvs: number[] = [];

  const glassPositions: number[] = [];
  const glassUvs: number[] = [];

  // Precompute ring vertices
  const ringGrid: {
    pos: THREE.Vector3;
    t: number;
    theta: number;
    isGlass: boolean;
  }[][] = [];

  for (let i = 0; i <= numStations; i++) {
    const t = i / numStations;
    const x = xNoseCowl + t * fusLength;
    const st = evaluateSlingFuselageStation(t);
    const yMid = 0.5 * (st.yBottom + st.yTop);
    const halfH = 0.5 * (st.yTop - st.yBottom);

    const ring: {
      pos: THREE.Vector3;
      t: number;
      theta: number;
      isGlass: boolean;
    }[] = [];

    for (let j = 0; j <= numRadial; j++) {
      // theta from 0 (top center) -> PI (bottom center) -> 2*PI (top center)
      const theta = (j / numRadial) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Superellipse shaping for realistic aircraft fuselage cross-section
      const exp = 2 / st.superellipseN;
      const yRel = Math.sign(cosT) * Math.pow(Math.abs(cosT), exp);
      const zRel = Math.sign(sinT) * Math.pow(Math.abs(sinT), exp);

      const y = yMid + yRel * halfH;
      const z = zRel * st.halfWidth;

      const isUpperWindow =
        st.isCanopyZone &&
        !st.isCanopyFrameBow &&
        y > st.yBeltline &&
        Math.abs(z) > 0.025; // thin center longitudinal spine strip

      ring.push({
        pos: new THREE.Vector3(x, y, z),
        t,
        theta,
        isGlass: isUpperWindow,
      });
    }
    ringGrid.push(ring);
  }

  const pushTri = (
    posArr: number[],
    uvArr: number[],
    v1: THREE.Vector3,
    v2: THREE.Vector3,
    v3: THREE.Vector3,
    sideZ: number
  ) => {
    posArr.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);
    const uv1 = computeFuselageOrthographicUV(
      v1.x,
      v1.y,
      sideZ,
      xMinTotal,
      xMaxTotal,
      yGround,
      yFinTop
    );
    const uv2 = computeFuselageOrthographicUV(
      v2.x,
      v2.y,
      sideZ,
      xMinTotal,
      xMaxTotal,
      yGround,
      yFinTop
    );
    const uv3 = computeFuselageOrthographicUV(
      v3.x,
      v3.y,
      sideZ,
      xMinTotal,
      xMaxTotal,
      yGround,
      yFinTop
    );
    uvArr.push(uv1[0], uv1[1], uv2[0], uv2[1], uv3[0], uv3[1]);
  };

  for (let i = 0; i < numStations; i++) {
    for (let j = 0; j < numRadial; j++) {
      const a = ringGrid[i][j];
      const b = ringGrid[i + 1][j];
      const c = ringGrid[i + 1][j + 1];
      const d = ringGrid[i][j + 1];

      const isGlassQuad = a.isGlass && b.isGlass && c.isGlass && d.isGlass;
      const avgZ = (a.pos.z + b.pos.z + c.pos.z + d.pos.z) * 0.25;
      const sideZ = avgZ >= 0 ? 1 : -1;

      if (isGlassQuad) {
        pushTri(glassPositions, glassUvs, a.pos, b.pos, c.pos, sideZ);
        pushTri(glassPositions, glassUvs, a.pos, c.pos, d.pos, sideZ);
      } else {
        pushTri(fusPositions, fusUvs, a.pos, b.pos, c.pos, sideZ);
        pushTri(fusPositions, fusUvs, a.pos, c.pos, d.pos, sideZ);
      }
    }
  }

  // 2. Build Swept Vertical Stabilizer + Rudder + Dorsal Fillet
  // Included in fuselageAndTailGeo so swooshes flow seamlessly from fuselage onto the tail!
  const finSpan = yFinTop - 0.08;
  const finLevels = 24;
  const finChordSteps = 24;
  const sweepRad = ((cal.tailSweepDeg || 28) * Math.PI) / 180;

  const buildFinSide = (isPort: boolean) => {
    const sideSign = isPort ? 1 : -1;
    const grid: THREE.Vector3[][] = [];

    for (let i = 0; i <= finLevels; i++) {
      const v = i / finLevels;
      const y = 0.06 + v * finSpan;
      // Dorsal fillet at root (v < 0.22) blends forward along tailcone
      const dorsalForward = v < 0.25 ? Math.pow(1 - v / 0.25, 2) * 0.75 : 0;
      const leX =
        xTailEnd - 1.15 + v * finSpan * Math.tan(sweepRad) - dorsalForward;
      const teX = xTailEnd + 0.05 + v * 0.22;
      const chord = teX - leX;
      const thickness = 0.11 * (1 - 0.45 * v);

      const row: THREE.Vector3[] = [];
      for (let j = 0; j <= finChordSteps; j++) {
        const u = j / finChordSteps;
        const af = evaluateAirfoil(u, thickness, 0, 0, true);
        const x = leX + u * chord;
        // Round off the top cap of the vertical fin
        const tipPinch = v > 0.94 ? Math.sqrt(Math.max(0, 1 - (v - 0.94) / 0.06)) : 1;
        const z = sideSign * af.y * chord * tipPinch;
        row.push(new THREE.Vector3(x, y, z));
      }
      grid.push(row);
    }

    for (let i = 0; i < finLevels; i++) {
      for (let j = 0; j < finChordSteps; j++) {
        const a = grid[i][j];
        const b = grid[i + 1][j];
        const c = grid[i + 1][j + 1];
        const d = grid[i][j + 1];
        if (isPort) {
          pushTri(fusPositions, fusUvs, a, c, b, 1);
          pushTri(fusPositions, fusUvs, a, d, c, 1);
        } else {
          pushTri(fusPositions, fusUvs, a, b, c, -1);
          pushTri(fusPositions, fusUvs, a, c, d, -1);
        }
      }
    }
  };

  buildFinSide(true);
  buildFinSide(false);

  const fuselageAndTailGeo = new THREE.BufferGeometry();
  fuselageAndTailGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(fusPositions, 3)
  );
  fuselageAndTailGeo.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(fusUvs, 2)
  );
  fuselageAndTailGeo.computeVertexNormals();

  const canopyGlassGeo = new THREE.BufferGeometry();
  canopyGlassGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(glassPositions, 3)
  );
  canopyGlassGeo.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(glassUvs, 2)
  );
  canopyGlassGeo.computeVertexNormals();

  // 3. Build Low-Wing Main Airfoil + Swept Composite Wingtips
  const halfSpan = wingspanM * 0.5;
  const rootChord = cal.wingChordRootM || 1.42;
  const tipChord = cal.wingChordTipM || 1.02;
  const dihedralRad = ((cal.dihedralDeg || 4.5) * Math.PI) / 180;
  const wingRootX = -lengthM * 0.08;
  const wingRootY = -0.31;

  const wingPos: number[] = [];
  const wingUvs: number[] = [];
  const wingtipPos: number[] = [];
  const wingtipUvs: number[] = [];

  const buildWingHalf = (sideSign: 1 | -1) => {
    const spanSteps = 32;
    const profileSteps = 36;
    const grid: { pos: THREE.Vector3; uSpan: number; uChord: number }[][] = [];

    for (let i = 0; i <= spanSteps; i++) {
      const s = i / spanSteps;
      const zAbs = 0.42 + s * (halfSpan - 0.42);
      const z = sideSign * zAbs;

      // Taper begins at 48% semi-span (Sling TSi outer panel taper)
      const taperFactor = s < 0.48 ? 0 : (s - 0.48) / 0.52;
      const isWingtip = s >= 0.9;
      const tipProgress = isWingtip ? (s - 0.9) / 0.1 : 0;

      const chord =
        (rootChord * (1 - taperFactor) + tipChord * taperFactor) *
        (1 - 0.35 * Math.pow(tipProgress, 1.6));

      // Upturned composite wingtip curl
      const y =
        wingRootY +
        (zAbs - 0.42) * Math.tan(dihedralRad) +
        Math.pow(tipProgress, 2.0) * 0.18;

      const xOffset =
        wingRootX +
        taperFactor * 0.16 +
        Math.pow(tipProgress, 1.5) * 0.18;

      const row: { pos: THREE.Vector3; uSpan: number; uChord: number }[] = [];
      for (let j = 0; j <= profileSteps; j++) {
        // Wrap around airfoil: 0 -> 0.5 (upper TE to LE), 0.5 -> 1.0 (lower LE to TE)
        const p = j / profileSteps;
        const isUpper = p <= 0.5;
        const xNorm = isUpper ? 1 - p * 2 : (p - 0.5) * 2;
        const af = evaluateAirfoil(
          xNorm,
          0.14 * (1 - 0.25 * tipProgress),
          0.02,
          0.4,
          isUpper
        );
        const vx = xOffset + af.x * chord;
        const vy = y + af.y * chord;
        row.push({
          pos: new THREE.Vector3(vx, vy, z),
          uSpan: s,
          uChord: xNorm,
        });
      }
      grid.push(row);
    }

    for (let i = 0; i < spanSteps; i++) {
      const isTipSection = i / spanSteps >= 0.89;
      const targetPos = isTipSection ? wingtipPos : wingPos;
      const targetUv = isTipSection ? wingtipUvs : wingUvs;

      for (let j = 0; j < profileSteps; j++) {
        const a = grid[i][j];
        const b = grid[i + 1][j];
        const c = grid[i + 1][j + 1];
        const d = grid[i][j + 1];

        const pushWingTri = (
          p1: typeof a,
          p2: typeof a,
          p3: typeof a
        ) => {
          targetPos.push(
            p1.pos.x,
            p1.pos.y,
            p1.pos.z,
            p2.pos.x,
            p2.pos.y,
            p2.pos.z,
            p3.pos.x,
            p3.pos.y,
            p3.pos.z
          );
          targetUv.push(
            p1.uChord,
            p1.uSpan,
            p2.uChord,
            p2.uSpan,
            p3.uChord,
            p3.uSpan
          );
        };

        if (sideSign === 1) {
          pushWingTri(a, b, c);
          pushWingTri(a, c, d);
        } else {
          pushWingTri(a, c, b);
          pushWingTri(a, d, c);
        }
      }
    }
  };

  buildWingHalf(1);
  buildWingHalf(-1);

  const wingMainGeo = new THREE.BufferGeometry();
  wingMainGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(wingPos, 3)
  );
  wingMainGeo.setAttribute("uv", new THREE.Float32BufferAttribute(wingUvs, 2));
  wingMainGeo.computeVertexNormals();

  const wingtipsGeo = new THREE.BufferGeometry();
  wingtipsGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(wingtipPos, 3)
  );
  wingtipsGeo.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(wingtipUvs, 2)
  );
  wingtipsGeo.computeVertexNormals();

  // 4. Horizontal Stabilizer & Elevator
  const hStabPos: number[] = [];
  const hStabUvs: number[] = [];
  const hHalfSpan = 1.48;
  const hChordRoot = 0.78;
  const hChordTip = 0.54;
  const hStabX = xTailEnd - 0.48;
  const hStabY = 0.08;

  const buildHStabHalf = (sideSign: 1 | -1) => {
    const sSteps = 14;
    const pSteps = 24;
    const grid: THREE.Vector3[][] = [];
    for (let i = 0; i <= sSteps; i++) {
      const s = i / sSteps;
      const z = sideSign * (0.06 + s * hHalfSpan);
      const chord = hChordRoot * (1 - s) + hChordTip * s;
      const xCenter = hStabX + s * 0.14;
      const row: THREE.Vector3[] = [];
      for (let j = 0; j <= pSteps; j++) {
        const p = j / pSteps;
        const isUpper = p <= 0.5;
        const xNorm = isUpper ? 1 - p * 2 : (p - 0.5) * 2;
        const af = evaluateAirfoil(xNorm, 0.1, 0, 0, isUpper);
        row.push(
          new THREE.Vector3(xCenter + af.x * chord, hStabY + af.y * chord, z)
        );
      }
      grid.push(row);
    }

    for (let i = 0; i < sSteps; i++) {
      for (let j = 0; j < pSteps; j++) {
        const a = grid[i][j];
        const b = grid[i + 1][j];
        const c = grid[i + 1][j + 1];
        const d = grid[i][j + 1];
        if (sideSign === 1) {
          hStabPos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
          hStabPos.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
        } else {
          hStabPos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
          hStabPos.push(a.x, a.y, a.z, d.x, d.y, d.z, c.x, c.y, c.z);
        }
        hStabUvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      }
    }
  };
  buildHStabHalf(1);
  buildHStabHalf(-1);

  const horizontalStabGeo = new THREE.BufferGeometry();
  horizontalStabGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(hStabPos, 3)
  );
  horizontalStabGeo.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(hStabUvs, 2)
  );
  horizontalStabGeo.computeVertexNormals();

  // 5. Aerodynamic Teardrop Wheel Fairings (Wheel Pants / Spats)
  const spatPos: number[] = [];
  const spatUvs: number[] = [];

  const addTeardropSpat = (
    cx: number,
    cy: number,
    cz: number,
    len: number,
    height: number,
    width: number
  ) => {
    const uSteps = 22;
    const vSteps = 20;
    const grid: { pos: THREE.Vector3; u: number; v: number }[][] = [];

    for (let i = 0; i <= uSteps; i++) {
      const u = i / uSteps; // 0 (front nose of spat) -> 1 (pointed tail of spat)
      // Teardrop profile: blunt nose, tapering tail
      const rProfile = Math.sin(Math.pow(u, 0.62) * Math.PI);
      const x = cx + (u - 0.45) * len;
      const row: { pos: THREE.Vector3; u: number; v: number }[] = [];
      for (let j = 0; j <= vSteps; j++) {
        const theta = (j / vSteps) * Math.PI * 2;
        const y = cy + Math.cos(theta) * (height * 0.5) * rProfile;
        const z = cz + Math.sin(theta) * (width * 0.5) * rProfile;
        const vNorm = 0.5 + 0.5 * Math.cos(theta);
        row.push({ pos: new THREE.Vector3(x, y, z), u, v: vNorm });
      }
      grid.push(row);
    }

    for (let i = 0; i < uSteps; i++) {
      for (let j = 0; j < vSteps; j++) {
        const a = grid[i][j];
        const b = grid[i + 1][j];
        const c = grid[i + 1][j + 1];
        const d = grid[i][j + 1];
        spatPos.push(
          a.pos.x,
          a.pos.y,
          a.pos.z,
          b.pos.x,
          b.pos.y,
          b.pos.z,
          c.pos.x,
          c.pos.y,
          c.pos.z
        );
        spatUvs.push(a.u, a.v, b.u, b.v, c.u, c.v);
        spatPos.push(
          a.pos.x,
          a.pos.y,
          a.pos.z,
          c.pos.x,
          c.pos.y,
          c.pos.z,
          d.pos.x,
          d.pos.y,
          d.pos.z
        );
        spatUvs.push(a.u, a.v, c.u, c.v, d.u, d.v);
      }
    }
  };

  if (cal.wheelPantsInstalled) {
    // Nose gear fairing
    addTeardropSpat(xNoseCowl + 0.55, yGround + 0.19, 0, 0.72, 0.28, 0.22);
    // Port & Starboard main gear fairings
    addTeardropSpat(wingRootX + 0.12, yGround + 0.21, 1.02, 0.82, 0.31, 0.24);
    addTeardropSpat(wingRootX + 0.12, yGround + 0.21, -1.02, 0.82, 0.31, 0.24);
  }

  const wheelPantsGeo = new THREE.BufferGeometry();
  wheelPantsGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(spatPos, 3)
  );
  wheelPantsGeo.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(spatUvs, 2)
  );
  wheelPantsGeo.computeVertexNormals();

  // 6. Parabolic Spinner Cone
  const spinnerLen = xNoseCowl - xSpinnerTip;
  const spinnerGeo = new THREE.ConeGeometry(0.18, spinnerLen, 32, 8);
  spinnerGeo.rotateZ(Math.PI * 0.5);
  spinnerGeo.translate(xSpinnerTip + spinnerLen * 0.5, -0.03, 0);

  // 7. 3-Blade Constant Speed Propeller (Protected Non-Paint Zone)
  const numBlades = cal.propellerBlades || 3;
  const bladeGeos: THREE.BufferGeometry[] = [];
  const propRadius = 0.88;
  for (let b = 0; b < numBlades; b++) {
    const angle = (b / numBlades) * Math.PI * 2 + 0.35;
    const blade = new THREE.BoxGeometry(0.025, propRadius, 0.11, 1, 12, 1);
    blade.translate(0, propRadius * 0.5 + 0.08, 0);
    blade.rotateY(0.28); // Blade pitch twist
    blade.rotateX(angle);
    blade.translate(xNoseCowl - 0.06, -0.03, 0);
    bladeGeos.push(blade);
  }
  const propellerBladesGeo = mergeBufferGeometries(bladeGeos);

  // 8. Landing Gear Struts, Tires & Exhaust Pipe (Protected Non-Paint Zone)
  const gearGeos: THREE.BufferGeometry[] = [];

  // Nose strut
  const noseStrut = new THREE.CylinderGeometry(0.028, 0.024, 0.55, 12);
  noseStrut.rotateZ(-0.18);
  noseStrut.translate(xNoseCowl + 0.48, yGround + 0.44, 0);
  gearGeos.push(noseStrut);

  // Nose tire
  const noseTire = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 20);
  noseTire.rotateX(Math.PI * 0.5);
  noseTire.translate(xNoseCowl + 0.53, yGround + 0.15, 0);
  gearGeos.push(noseTire);

  // Main spring gear legs + main tires
  for (const side of [-1, 1]) {
    const mainLeg = new THREE.BoxGeometry(0.09, 0.62, 0.035);
    mainLeg.rotateX(side * 0.68);
    mainLeg.translate(wingRootX + 0.12, yGround + 0.44, side * 0.72);
    gearGeos.push(mainLeg);

    const mainTire = new THREE.CylinderGeometry(0.17, 0.17, 0.12, 20);
    mainTire.rotateX(Math.PI * 0.5);
    mainTire.translate(wingRootX + 0.12, yGround + 0.17, side * 1.02);
    gearGeos.push(mainTire);
  }

  const gearStrutsAndTiresGeo = mergeBufferGeometries(gearGeos);

  // 9. Cockpit Interior (Instrument Glare-shield + 4 Ergonomic Seats visible through bubble canopy)
  const interiorGeos: THREE.BufferGeometry[] = [];
  const glareshield = new THREE.BoxGeometry(0.55, 0.18, 0.98);
  glareshield.translate(xNoseCowl + fusLength * 0.26, 0.14, 0);
  interiorGeos.push(glareshield);

  // 2 Front + 2 Rear seats
  for (const rowX of [0.34, 0.46]) {
    for (const sideZ of [-0.24, 0.24]) {
      const seatBack = new THREE.BoxGeometry(0.08, 0.44, 0.36);
      seatBack.rotateZ(-0.22);
      seatBack.translate(xNoseCowl + fusLength * rowX, 0.05, sideZ);
      interiorGeos.push(seatBack);
    }
  }
  const cockpitInteriorGeo = mergeBufferGeometries(interiorGeos);

  return {
    fuselageAndTailGeo,
    canopyGlassGeo,
    wingMainGeo,
    wingtipsGeo,
    horizontalStabGeo,
    wheelPantsGeo,
    spinnerGeo,
    propellerBladesGeo,
    gearStrutsAndTiresGeo,
    cockpitInteriorGeo,
    bounds: {
      xMin: xMinTotal,
      xMax: xMaxTotal,
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
