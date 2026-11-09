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
  let yBottom = -0.44;
  let yTop = 0.25;
  let halfWidth = 0.45;
  let superellipseTopN = 2.1;
  let superellipseBotN = 2.3;

  // 1. Upper Deck / Cabin Roof / Tailcone Spine Profile (matched to POH Side View & N532SL)
  if (t < 0.04) {
    // Nose cowling front lip behind spinner
    const u = t / 0.04;
    yTop = 0.14 + 0.08 * Math.pow(u, 0.55);
  } else if (t < 0.19) {
    // Sculpted Rotax 915iS/916iS upper cowling deck sloping up to windshield base
    const u = (t - 0.04) / 0.15;
    yTop = 0.22 + 0.09 * Math.pow(u, 0.82);
  } else if (t < 0.34) {
    // Wrap-around windshield & forward cabin roof arch rising to crown
    const u = (t - 0.19) / 0.15;
    yTop = 0.31 + 0.36 * Math.sin(u * Math.PI * 0.5);
  } else if (t < 0.56) {
    // Rear cabin roof sloping smoothly over rear passenger window into tailcone
    const u = (t - 0.34) / 0.22;
    const smoothDrop = u * u * (3 - 2 * u);
    yTop = 0.67 - 0.39 * smoothDrop;
  } else {
    // Straight/gently-sloped flush-riveted tailcone dorsal spine (t=0.56 to 1.0)
    const u = (t - 0.56) / 0.44;
    yTop = 0.28 - 0.12 * u;
  }

  // 2. Lower Belly Profile (Chin scoop -> flat cabin floor -> 14-deg tailcone upsweep)
  if (t < 0.03) {
    const u = t / 0.03;
    yBottom = -0.14 - 0.18 * Math.pow(u, 0.6);
  } else if (t < 0.14) {
    // Chin intercooler/radiator scoop under forward cowling
    const u = (t - 0.03) / 0.11;
    yBottom = -0.32 - 0.15 * Math.sin(Math.pow(u, 0.75) * Math.PI * 0.65);
  } else if (t < 0.47) {
    // Deep cabin tub & center-section wing carry-through belly
    const u = (t - 0.14) / 0.33;
    yBottom = -0.45 - 0.04 * Math.sin(u * Math.PI);
  } else {
    // POH 14-degree tailcone bottom upsweep toward tail skid
    const u = (t - 0.47) / 0.53;
    yBottom = -0.45 + 0.41 * Math.pow(u, 1.04);
  }

  // 3. Half-Width Profile (POH Cabin Width = 1188mm -> halfWidth = 0.594m at t = 0.33)
  if (t < 0.03) {
    const u = t / 0.03;
    halfWidth = 0.21 + 0.21 * Math.pow(u, 0.55);
  } else if (t < 0.19) {
    // Wide twin-lobe horizontally-opposed Rotax engine cowling
    const u = (t - 0.03) / 0.16;
    halfWidth = 0.42 + 0.15 * Math.pow(u, 0.75);
    superellipseTopN = 2.5;
    superellipseBotN = 2.4;
  } else if (t < 0.48) {
    // 4-place cabin (1.188m width)
    const u = (t - 0.19) / 0.29;
    halfWidth = 0.57 + 0.025 * Math.sin(u * Math.PI);
    superellipseTopN = 2.15;
    superellipseBotN = 2.6;
  } else {
    // Tapered aluminum tailcone (Matched to POH Page 2 Top Planform)
    const u = (t - 0.48) / 0.52;
    halfWidth = 0.57 * Math.pow(1 - u, 1.12) + 0.022;
    superellipseTopN = 2.0;
    superellipseBotN = 2.0;
  }

  // Waist beltline height where maximum width occurs
  const yMaxWidthLine =
    t < 0.2 ? 0.04 : t < 0.52 ? 0.12 - 0.04 * ((t - 0.2) / 0.32) : 0.08;

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
 * Determines whether a quad on the cabin surface at normalized fuselage station t in [0, 1]
 * and vertical/spanwise coordinates (y, z) belongs to one of the 3 distinct Sling 4 TSi windows:
 *   1. Wrap-around Front Windshield (t in [0.195, 0.305])
 *   2. Left & Right Gullwing Door Windows (t in [0.322, 0.448]) - separated by painted roof spine & A/B pillars!
 *   3. Rear Passenger Quarter Windows (t in [0.468, 0.538]) - rounded trapezoid side windows!
 */
function isSlingCabinWindowQuad(
  t: number,
  y: number,
  z: number,
  yTop: number,
  halfWidth: number
): boolean {
  const zAbs = Math.abs(z);

  // 1. Wrap-around one-piece Front Windshield (no center bar, curves down to cowl deck)
  if (t >= 0.195 && t <= 0.302) {
    const u = (t - 0.195) / 0.107;
    const sillY = 0.29 - 0.11 * Math.pow(u, 0.65);
    return y > sillY;
  }

  // Painted composite A-Pillar Roll Bar Arch between t = 0.302 and t = 0.322 -> NOT glass!

  // 2. Front Gullwing Door Side Windows (t in [0.322, 0.445])
  // Has a solid painted composite center roof spine (|z| < 0.15m) and lower door beltline sill
  if (t >= 0.322 && t <= 0.445) {
    const u = (t - 0.322) / 0.123;
    const sillY = 0.175 + 0.015 * u;
    const roofMarginZ = 0.145 + 0.03 * u; // painted roof center strip
    return y > sillY && zAbs > roofMarginZ && y < yTop - 0.015;
  }

  // Painted composite B-Pillar Cabin Bulkhead Frame between t = 0.445 and t = 0.468 -> NOT glass!

  // 3. Rear Passenger Quarter Window (smaller rounded window behind B-pillar, t in [0.468, 0.535])
  if (t >= 0.468 && t <= 0.535) {
    const u = (t - 0.468) / 0.067;
    const sillY = 0.195 + 0.025 * u;
    const topWindowArch = 0.46 - 0.075 * u;
    return y > sillY && y < topWindowArch && zAbs > halfWidth * 0.48;
  }

  return false;
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
    return [u, 0.52 + vNorm * 0.46];
  } else {
    return [u, 0.02 + vNorm * 0.46];
  }
}

export function buildSlingTsiGeometry(
  cal: AirframeCalibration
): SlingTsiMeshParts {
  // Exact Sling 4 TSi POH dimensions (with proportional scaling when user adjusts sliders/rulers)
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

  // 1. Build Lofted Fuselage + 3-Window Cabin Glass Separation
  const numStations = 84;
  const numRadial = 56;

  const fusPositions: number[] = [];
  const fusUvs: number[] = [];
  const glassPositions: number[] = [];
  const glassUvs: number[] = [];

  const ringGrid: {
    pos: THREE.Vector3;
    t: number;
    yUnscaled: number;
    zUnscaled: number;
    yTopUnscaled: number;
    halfWidthUnscaled: number;
  }[][] = [];

  for (let i = 0; i <= numStations; i++) {
    const t = i / numStations;
    const x = xNoseCowl + t * fusLength;
    const st = evaluateSlingFuselageStation(t);

    const row: (typeof ringGrid)[number] = [];
    for (let j = 0; j <= numRadial; j++) {
      // theta: 0 (top center) -> PI/2 (waist max width) -> PI (bottom center) -> 2*PI
      const theta = (j / numRadial) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const isUpperHalf = cosT >= 0;
      const exp = 2 / (isUpperHalf ? st.superellipseTopN : st.superellipseBotN);

      const yNorm = Math.sign(cosT) * Math.pow(Math.abs(cosT), exp);
      const zNorm = Math.sign(sinT) * Math.pow(Math.abs(sinT), exp);

      const yUnscaled = isUpperHalf
        ? st.yMaxWidthLine + yNorm * (st.yTop - st.yMaxWidthLine)
        : st.yMaxWidthLine + yNorm * (st.yMaxWidthLine - st.yBottom);

      let zUnscaled = zNorm * st.halfWidth;

      // Sculpt twin cheek engine air intake lobes on forward cowling (t < 0.14)
      if (t < 0.14 && isUpperHalf && Math.abs(sinT) > 0.35) {
        const cowlLobe = (1 - t / 0.14) * 0.032 * Math.sin(Math.abs(sinT) * Math.PI);
        zUnscaled += Math.sign(zUnscaled) * cowlLobe;
      }

      row.push({
        pos: new THREE.Vector3(
          x,
          yUnscaled * heightScale,
          zUnscaled * widthScale
        ),
        t,
        yUnscaled,
        zUnscaled,
        yTopUnscaled: st.yTop,
        halfWidthUnscaled: st.halfWidth,
      });
    }
    ringGrid.push(row);
  }

  const pushFusTri = (
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
      xUvMin,
      xUvMax,
      yUvMin,
      yUvMax
    );
    const uv2 = computeFuselageOrthographicUV(
      v2.x,
      v2.y,
      sideZ,
      xUvMin,
      xUvMax,
      yUvMin,
      yUvMax
    );
    const uv3 = computeFuselageOrthographicUV(
      v3.x,
      v3.y,
      sideZ,
      xUvMin,
      xUvMax,
      yUvMin,
      yUvMax
    );
    uvArr.push(uv1[0], uv1[1], uv2[0], uv2[1], uv3[0], uv3[1]);
  };

  for (let i = 0; i < numStations; i++) {
    for (let j = 0; j < numRadial; j++) {
      const a = ringGrid[i][j];
      const b = ringGrid[i + 1][j];
      const c = ringGrid[i + 1][j + 1];
      const d = ringGrid[i][j + 1];

      const midT = 0.5 * (a.t + b.t);
      const midY = 0.25 * (a.yUnscaled + b.yUnscaled + c.yUnscaled + d.yUnscaled);
      const midZ = 0.25 * (a.zUnscaled + b.zUnscaled + c.zUnscaled + d.zUnscaled);
      const sideZ = midZ >= 0 ? 1 : -1;

      const isWindow = isSlingCabinWindowQuad(
        midT,
        midY,
        midZ,
        a.yTopUnscaled,
        a.halfWidthUnscaled
      );

      if (isWindow) {
        pushFusTri(glassPositions, glassUvs, a.pos, b.pos, c.pos, sideZ);
        pushFusTri(glassPositions, glassUvs, a.pos, c.pos, d.pos, sideZ);
      } else {
        pushFusTri(fusPositions, fusUvs, a.pos, b.pos, c.pos, sideZ);
        pushFusTri(fusPositions, fusUvs, a.pos, c.pos, d.pos, sideZ);
      }
    }
  }

  // 2. Build Swept Vertical Stabilizer + Dorsal Fin Fillet + Rudder (POH Page 1 exact profile)
  const finBaseY = 0.14 * heightScale;
  const finSpan = yFinTop - finBaseY;
  const finLevels = 28;
  const finChordSteps = 26;

  const buildFinSide = (isPort: boolean) => {
    const sideSign = isPort ? 1 : -1;
    const grid: THREE.Vector3[][] = [];

    for (let i = 0; i <= finLevels; i++) {
      const v = i / finLevels;
      const y = finBaseY + v * finSpan;

      // Dorsal fillet sweeps forward along the tailcone spine for v < 0.26
      const dorsalExt =
        v < 0.26 ? Math.pow(1 - v / 0.26, 2.1) * 0.82 * lengthScale : 0;

      // Main fin leading edge sweeps from s=5.82m at base to s=6.55m at tip
      const leX =
        (-3.6 + 5.82 + v * 0.73) * lengthScale - dorsalExt;
      // Rudder trailing edge sweeps from s=7.20m at base to s=7.06m at tip (slight forward rake like POH)
      const teX = (-3.6 + 7.2 - v * 0.14) * lengthScale;
      const chord = Math.max(0.25, teX - leX);
      const thickness = 0.105 * (1 - 0.35 * v);

      const row: THREE.Vector3[] = [];
      for (let j = 0; j <= finChordSteps; j++) {
        const u = j / finChordSteps;
        const af = evaluateAirfoil(u, thickness, 0, 0, true);
        const x = leX + u * chord;
        const tipPinch =
          v > 0.96 ? Math.sqrt(Math.max(0, 1 - (v - 0.96) / 0.04)) : 1;
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
          pushFusTri(fusPositions, fusUvs, a, c, b, 1);
          pushFusTri(fusPositions, fusUvs, a, d, c, 1);
        } else {
          pushFusTri(fusPositions, fusUvs, a, b, c, -1);
          pushFusTri(fusPositions, fusUvs, a, c, d, -1);
        }
      }
    }
  };

  buildFinSide(true);
  buildFinSide(false);

  // 2b. Add Wing Root Aerodynamic Belly Fairings into Fuselage Mesh (blends wing root into lower cabin)
  const wingLES = (cal.wingLEStationM || 1.912) * lengthScale;
  const rootChord = (cal.wingChordRootM || 1.52) * lengthScale;
  const wingRootXCenter = xSpinnerTip + wingLES + rootChord * 0.5;
  const wingRootY = -0.35 * heightScale;

  for (const side of [-1, 1]) {
    const filletGeo = new THREE.CylinderGeometry(
      0.13 * heightScale,
      0.16 * heightScale,
      rootChord * 1.08,
      14,
      1
    );
    filletGeo.rotateZ(Math.PI * 0.5);
    filletGeo.scale(1, 0.55, 1.2);
    filletGeo.translate(
      wingRootXCenter,
      wingRootY + 0.02,
      side * 0.54 * widthScale
    );
    const nonIdx = filletGeo.toNonIndexed();
    const posAttr = nonIdx.getAttribute("position");
    for (let k = 0; k < posAttr.count; k += 3) {
      const v1 = new THREE.Vector3(
        posAttr.getX(k),
        posAttr.getY(k),
        posAttr.getZ(k)
      );
      const v2 = new THREE.Vector3(
        posAttr.getX(k + 1),
        posAttr.getY(k + 1),
        posAttr.getZ(k + 1)
      );
      const v3 = new THREE.Vector3(
        posAttr.getX(k + 2),
        posAttr.getY(k + 2),
        posAttr.getZ(k + 2)
      );
      pushFusTri(fusPositions, fusUvs, v1, v2, v3, side);
    }
  }

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

  // 3. Build Low-Wing Main Airfoil + Signature Sling TSi Blended Curved Winglets
  // POH Page 2: Constant chord (1520mm) inner section across flaps, tapered outer section across ailerons,
  // plus swept-up curved winglets at the outer tips (visible in N532SL photo & POH Front View)
  const halfSpan = wingspanM * 0.5;
  const tipChord = (cal.wingChordTipM || 1.02) * lengthScale;
  const dihedralRad = ((cal.dihedralDeg || 4.5) * Math.PI) / 180;

  const wingPos: number[] = [];
  const wingUvs: number[] = [];
  const wingtipPos: number[] = [];
  const wingtipUvs: number[] = [];

  const buildWingHalf = (sideSign: 1 | -1) => {
    const spanSteps = 44;
    const profileSteps = 36;
    const grid: { pos: THREE.Vector3; uSpan: number; uChord: number }[][] = [];

    for (let i = 0; i <= spanSteps; i++) {
      const s = i / spanSteps;
      // Inner 88% of steps cover the main wing out to 93% semi-span;
      // Outer 12% of steps curl smoothly upward into the 0.36m tall blended winglet!
      const isWingletZone = s >= 0.84;
      const wProg = isWingletZone ? (s - 0.84) / 0.16 : 0;

      // Spanwise Z coordinate: curls upward at tip
      const linearSpan = 0.52 * widthScale + (s / 0.84) * (halfSpan * 0.94 - 0.52 * widthScale);
      const zAbs = isWingletZone
        ? halfSpan * 0.94 + Math.sin(wProg * Math.PI * 0.5) * (halfSpan * 0.06)
        : linearSpan;
      const z = sideSign * zAbs;

      // Constant chord (1.52m) out to s=0.46 (POH Page 2), then linear taper to tipChord, then winglet taper
      const outerTaper = s < 0.46 ? 0 : Math.min(1, (s - 0.46) / 0.38);
      const baseChord = rootChord * (1 - outerTaper) + tipChord * outerTaper;
      const chord = baseChord * (1 - 0.62 * Math.pow(wProg, 1.35));

      // Vertical Y coordinate: dihedral + curved upward winglet rise (+0.36m at winglet tip!)
      const yDihedral =
        wingRootY + (zAbs - 0.52 * widthScale) * Math.tan(dihedralRad);
      const yWingletRise = Math.pow(wProg, 1.75) * 0.36 * heightScale;
      const yCenter = yDihedral + yWingletRise;

      // Longitudinal X coordinate: straight leading edge on inner wing, slight sweep on outer panel, strong aft sweep on winglet
      const xCenter =
        wingRootXCenter +
        outerTaper * 0.11 * lengthScale +
        Math.pow(wProg, 1.45) * 0.38 * lengthScale;

      // Cant angle: airfoil rotates from horizontal (0 deg) to ~68 deg vertical in the curved winglet!
      const cantAngle = wProg * 1.18;
      const cosCant = Math.cos(cantAngle);
      const sinCant = Math.sin(cantAngle);

      const row: { pos: THREE.Vector3; uSpan: number; uChord: number }[] = [];
      for (let j = 0; j <= profileSteps; j++) {
        const p = j / profileSteps;
        const isUpper = p <= 0.5;
        const xNorm = isUpper ? 1 - p * 2 : (p - 0.5) * 2;
        const af = evaluateAirfoil(
          xNorm,
          0.145 * (1 - 0.3 * wProg),
          0.022 * (1 - wProg),
          0.4,
          isUpper
        );
        const localX = af.x * chord;
        const localY = af.y * chord;

        // Rotate airfoil cross-section upward along winglet cant curve
        const vx = xCenter + localX;
        const vy = yCenter + localY * cosCant;
        const vz = z - sideSign * localY * sinCant;

        row.push({
          pos: new THREE.Vector3(vx, vy, vz),
          uSpan: s,
          uChord: xNorm,
        });
      }
      grid.push(row);
    }

    for (let i = 0; i < spanSteps; i++) {
      // Paint outer tapered tip + curved winglet in the Wingtips accent color (just like N532SL!)
      const isTipAccentZone = i / spanSteps >= 0.78;
      const targetPos = isTipAccentZone ? wingtipPos : wingPos;
      const targetUv = isTipAccentZone ? wingtipUvs : wingUvs;

      for (let j = 0; j < profileSteps; j++) {
        const a = grid[i][j];
        const b = grid[i + 1][j];
        const c = grid[i + 1][j + 1];
        const d = grid[i][j + 1];

        const pushWingTri = (p1: typeof a, p2: typeof a, p3: typeof a) => {
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

  // 4. Horizontal Stabilizer & Elevator (POH Page 2: 3095mm span, 921mm chord + raked orange tips like N532SL)
  const hStabPos: number[] = [];
  const hStabUvs: number[] = [];
  const hHalfSpan = ((cal.hStabSpanM || 3.095) * 0.5) * (wingspanM / 9.5);
  const hChordRoot = (cal.hStabChordM || 0.921) * lengthScale;
  const hChordTip = hChordRoot * 0.72;
  const hStabX = (-3.6 + 6.42) * lengthScale;
  const hStabY = 0.08 * heightScale;

  const buildHStabHalf = (sideSign: 1 | -1) => {
    const sSteps = 18;
    const pSteps = 24;
    const grid: THREE.Vector3[][] = [];
    for (let i = 0; i <= sSteps; i++) {
      const s = i / sSteps;
      const isTipFin = s >= 0.88;
      const tipU = isTipFin ? (s - 0.88) / 0.12 : 0;

      const z = sideSign * (0.04 + s * hHalfSpan);
      const chord =
        (hChordRoot * (1 - s) + hChordTip * s) * (1 - 0.35 * tipU);
      const xCenter = hStabX + s * 0.14 * lengthScale + tipU * 0.08;
      const yLift = hStabY + Math.pow(tipU, 1.5) * 0.07 * heightScale;

      const row: THREE.Vector3[] = [];
      for (let j = 0; j <= pSteps; j++) {
        const p = j / pSteps;
        const isUpper = p <= 0.5;
        const xNorm = isUpper ? 1 - p * 2 : (p - 0.5) * 2;
        const af = evaluateAirfoil(xNorm, 0.1, 0, 0, isUpper);
        row.push(
          new THREE.Vector3(xCenter + af.x * chord, yLift + af.y * chord, z)
        );
      }
      grid.push(row);
    }

    for (let i = 0; i < sSteps; i++) {
      // Outer raked tip of horizontal stabilizer gets wingtip accent color (like N532SL!)
      const isTipAccent = i / sSteps >= 0.86;
      const targetPos = isTipAccent ? wingtipPos : hStabPos;
      const targetUv = isTipAccent ? wingtipUvs : hStabUvs;

      for (let j = 0; j < pSteps; j++) {
        const a = grid[i][j];
        const b = grid[i + 1][j];
        const c = grid[i + 1][j + 1];
        const d = grid[i][j + 1];
        if (sideSign === 1) {
          targetPos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
          targetPos.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
        } else {
          targetPos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
          targetPos.push(a.x, a.y, a.z, d.x, d.y, d.z, c.x, c.y, c.z);
        }
        targetUv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      }
    }
  };
  buildHStabHalf(1);
  buildHStabHalf(-1);

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

  // 5. Aerodynamic Teardrop Wheel Fairings (Spats) at Exact POH Axle Coordinates:
  // Nose Axle: 900mm from Spinner Tip; Main Axle: 900 + 1750 = 2650mm from Spinner Tip; Track: 2050mm (+/-1.025m)
  const noseAxleX = xSpinnerTip + (cal.noseAxleStationM || 0.9) * lengthScale;
  const mainAxleX =
    noseAxleX + (cal.wheelbaseM || 1.75) * lengthScale;
  const halfTrackZ = ((cal.wheelTrackM || 2.05) * 0.5) * (wingspanM / 9.5);

  const spatPos: number[] = [];
  const spatUvs: number[] = [];

  const addSculptedWheelPant = (
    cx: number,
    cy: number,
    cz: number,
    len: number,
    height: number,
    width: number
  ) => {
    const uSteps = 26;
    const vSteps = 24;
    const grid: { pos: THREE.Vector3; u: number; v: number }[][] = [];

    for (let i = 0; i <= uSteps; i++) {
      const u = i / uSteps;
      const rProfile = Math.sin(Math.pow(u, 0.58) * Math.PI);
      const x = cx + (u - 0.42) * len;
      // Droop tail slightly like N532SL spats
      const yDroop = -0.025 * Math.pow(u, 1.5);
      const row: { pos: THREE.Vector3; u: number; v: number }[] = [];
      for (let j = 0; j <= vSteps; j++) {
        const theta = (j / vSteps) * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        // Flat bottom cut-out so tire protrudes cleanly below wheel pant
        const yFactor = cosT < -0.65 ? -0.65 : cosT;
        const y = cy + yDroop + yFactor * (height * 0.52) * rProfile;
        const z = cz + sinT * (width * 0.5) * rProfile;
        const vNorm = Math.max(0, Math.min(1, 0.5 + 0.5 * yFactor));
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
    "uv",
    new THREE.Float32BufferAttribute(spatUvs, 2)
  );
  wheelPantsGeo.computeVertexNormals();

  // 6. Painted Aerodynamic Landing Gear Legs (in N532SL, the nose leg fairing & main spring gear legs are painted Blaze Orange!)
  const paintedLegGeos: THREE.BufferGeometry[] = [];
  // Nose gear vertical aerodynamic cuff fairing
  const noseLegCuff = new THREE.CylinderGeometry(0.065, 0.085, 0.56, 16);
  noseLegCuff.scale(1.6, 1, 0.7);
  noseLegCuff.translate(noseAxleX - 0.02, yGround + 0.52, 0);
  paintedLegGeos.push(noseLegCuff);

  // Swept composite main gear legs + left boarding step + tail tie-down skid
  for (const side of [-1, 1]) {
    const legLen = Math.hypot(halfTrackZ - 0.42, 0.56);
    const angleX = Math.atan2(halfTrackZ - 0.42, 0.56);
    const mainLeg = new THREE.CylinderGeometry(0.042, 0.034, legLen, 14);
    mainLeg.scale(1.65, 1, 0.55);
    mainLeg.rotateX(side * angleX);
    mainLeg.rotateZ(-0.12); // slight aft sweep
    mainLeg.translate(
      mainAxleX - 0.04,
      yGround + 0.54,
      side * (0.42 + (halfTrackZ - 0.42) * 0.5)
    );
    paintedLegGeos.push(mainLeg);
  }
  const gearLegsPaintedGeo = mergeBufferGeometries(paintedLegGeos);

  // 7. Smooth Ogive Bullet Spinner Cone (440mm long, radius 0.20m)
  const spinnerLen = xNoseCowl - xSpinnerTip;
  const spinnerPoints: THREE.Vector2[] = [];
  for (let i = 0; i <= 20; i++) {
    const u = i / 20;
    // Ogive bullet profile
    const r = 0.205 * Math.pow(u, 0.62) * heightScale;
    spinnerPoints.push(new THREE.Vector2(r, (0.5 - u) * spinnerLen));
  }
  const spinnerGeo = new THREE.LatheGeometry(spinnerPoints, 36);
  spinnerGeo.rotateZ(Math.PI * 0.5);
  spinnerGeo.translate(xSpinnerTip + spinnerLen * 0.5, 0.03 * heightScale, 0);

  // 8. 3-Blade Constant-Speed Scimitar Propeller (1.82m diameter)
  const numBlades = cal.propellerBlades || 3;
  const bladeGeos: THREE.BufferGeometry[] = [];
  const propRadius = 0.89 * heightScale;
  for (let b = 0; b < numBlades; b++) {
    const angle = (b / numBlades) * Math.PI * 2 + 0.48;
    const blade = new THREE.BoxGeometry(0.022, propRadius, 0.115, 1, 14, 1);
    blade.translate(0, propRadius * 0.5 + 0.09, 0);
    blade.rotateY(0.32); // Blade pitch
    blade.rotateX(angle);
    blade.translate(xNoseCowl - 0.07, 0.03 * heightScale, 0);
    bladeGeos.push(blade);
  }
  const propellerBladesGeo = mergeBufferGeometries(bladeGeos);

  // 9. Dark Tires, Cowling Air Intake Recesses, Exhaust Stack & Roof Whip Antenna
  const darkDetailGeos: THREE.BufferGeometry[] = [];

  // Nose Tire (touching ground at yGround)
  const noseTire = new THREE.CylinderGeometry(0.165, 0.165, 0.11, 24);
  noseTire.rotateX(Math.PI * 0.5);
  noseTire.translate(noseAxleX, yGround + 0.165, 0);
  darkDetailGeos.push(noseTire);

  // Main Tires (touching ground at yGround, track = 2050mm)
  for (const side of [-1, 1]) {
    const mainTire = new THREE.CylinderGeometry(0.185, 0.185, 0.13, 24);
    mainTire.rotateX(Math.PI * 0.5);
    mainTire.translate(mainAxleX, yGround + 0.185, side * halfTrackZ);
    darkDetailGeos.push(mainTire);

    // Twin round Rotax cowling air intake openings on either side of spinner (visible in N532SL photo!)
    const intakeHole = new THREE.CylinderGeometry(0.055, 0.055, 0.06, 16);
    intakeHole.rotateZ(Math.PI * 0.5);
    intakeHole.scale(1, 0.85, 1.25);
    intakeHole.translate(
      xNoseCowl + 0.02,
      0.01 * heightScale,
      side * 0.24 * widthScale
    );
    darkDetailGeos.push(intakeHole);
  }

  // Lower chin intercooler intake opening
  const chinOpening = new THREE.BoxGeometry(0.05, 0.09, 0.24);
  chinOpening.translate(xNoseCowl + 0.12, -0.24 * heightScale, 0);
  darkDetailGeos.push(chinOpening);

  // Whip VHF Antenna on upper rear cabin spine (visible in POH Side View & N532SL photo!)
  const antenna = new THREE.CylinderGeometry(0.004, 0.007, 0.46, 8);
  antenna.rotateZ(-0.62); // angled aft
  antenna.translate(
    xNoseCowl + fusLength * 0.55,
    0.48 * heightScale,
    0
  );
  darkDetailGeos.push(antenna);

  const gearStrutsAndTiresGeo = mergeBufferGeometries(darkDetailGeos);

  // 10. Cockpit Glare-shield, Center Console & 4 Seats visible through the 3 Windows
  const interiorGeos: THREE.BufferGeometry[] = [];
  const glareshield = new THREE.BoxGeometry(
    0.58 * lengthScale,
    0.18 * heightScale,
    0.96 * widthScale
  );
  glareshield.translate(
    xNoseCowl + fusLength * 0.24,
    0.15 * heightScale,
    0
  );
  interiorGeos.push(glareshield);

  for (const rowT of [0.33, 0.45]) {
    for (const sideZ of [-0.24, 0.24]) {
      const seatBack = new THREE.BoxGeometry(
        0.09,
        0.46 * heightScale,
        0.38 * widthScale
      );
      seatBack.rotateZ(-0.2);
      seatBack.translate(
        xNoseCowl + fusLength * rowT,
        0.08 * heightScale,
        sideZ * widthScale
      );
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
