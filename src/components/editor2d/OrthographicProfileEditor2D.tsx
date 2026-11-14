"use client";

import React, { useRef, useState } from "react";
import { useLiveryStore } from "@/store/useLiveryStore";
import { evaluateSlingFuselageStation } from "@/engine/slingTsiGeometry";
import { evalBezierNormal, evalBezierPoint } from "@/engine/liveryCompositor";
import { Point2D } from "@/types/livery";

type DragTarget =
  | { kind: "STRIPE_POINT"; stripeId: string; pointKey: "p0" | "p1" | "p2" | "p3" }
  | { kind: "REGISTRATION" }
  | { kind: "DECAL"; decalId: string }
  | null;

export default function OrthographicProfileEditor2D() {
  const calibration = useLiveryStore((s) => s.calibration);
  const zones = useLiveryStore((s) => s.zones);
  const stripes = useLiveryStore((s) => s.stripes);
  const selectedStripeId = useLiveryStore((s) => s.selectedStripeId);
  const registration = useLiveryStore((s) => s.registration);

  const setSelectedStripeId = useLiveryStore((s) => s.setSelectedStripeId);
  const updateStripe = useLiveryStore((s) => s.updateStripe);
  const updateRegistration = useLiveryStore((s) => s.updateRegistration);
  const updateDecal = useLiveryStore((s) => s.updateDecal);

  const svgRef = useRef<SVGSVGElement>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [viewSide, setViewSide] = useState<"PORT" | "STARBOARD" | "TOP">("PORT");

  const W = 1000;
  const H = 310;
  const padX = 98;
  const drawW = W - padX * 2;
  const padY = 24;
  const drawH = H - padY * 2;

  const isStarboard = viewSide === "STARBOARD";

  const toSvg = (uNorm: number, vNorm: number) => ({
    x: padX + (isStarboard ? 1 - uNorm : uNorm) * drawW,
    y: padY + (1 - vNorm) * drawH,
  });

  const fromSvgEvent = (e: React.PointerEvent<SVGSVGElement>): Point2D => {
    const svg = svgRef.current;
    if (!svg) return { x: 0.5, y: 0.5 };
    const rect = svg.getBoundingClientRect();
    const rawX = ((e.clientX - rect.left) / rect.width) * W;
    const rawY = ((e.clientY - rect.top) / rect.height) * H;
    const uNormRaw = Math.max(0.01, Math.min(0.99, (rawX - padX) / drawW));
    const uNorm = isStarboard ? 1 - uNormRaw : uNormRaw;
    const vNorm = Math.max(0.02, Math.min(0.98, 1 - (rawY - padY) / drawH));
    return { x: Number(uNorm.toFixed(3)), y: Number(vNorm.toFixed(3)) };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragTarget) return;
    const pt = fromSvgEvent(e);
    if (dragTarget.kind === "STRIPE_POINT") {
      updateStripe(dragTarget.stripeId, {
        [dragTarget.pointKey]: pt,
      });
    } else if (dragTarget.kind === "REGISTRATION") {
      updateRegistration({
        positionX: pt.x,
        positionY: pt.y,
      });
    } else if (dragTarget.kind === "DECAL") {
      updateDecal(dragTarget.decalId, {
        positionX: pt.x,
        positionY: pt.y,
      });
    }
  };

  // Authentic Sling 4 TSi POH Section 1.3 Side Silhouette (7200mm x 2350mm, ground v=0 -> fin tip v=1)
  const buildAirframeSilhouettePath = () => {
    const L = calibration.lengthM || 7.2;
    const H_m = calibration.heightM || 2.35;
    const thrustY = calibration.propThrustlineHeightM || 1.18;
    const toU = (xM: number) => Math.max(0, Math.min(1, xM / L));
    const toV = (yGroundM: number) => Math.max(0, Math.min(1, yGroundM / H_m));

    const pts: { x: number; y: number }[] = [];
    // Spinner tip -> upper cowling join
    pts.push(toSvg(0.0, toV(thrustY)));
    pts.push(toSvg(toU(0.14), toV(thrustY + 0.14)));
    pts.push(toSvg(toU(0.42), toV(thrustY + 0.22)));

    // Upper fuselage & cabin crown from s=0.42m to s=5.30m (dorsal fin start)
    const steps = 56;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 0.76; // s up to ~5.33m
      const sM = 0.42 + t * 6.46;
      const st = evaluateSlingFuselageStation(t);
      pts.push(toSvg(toU(sM), toV(thrustY + st.yTop)));
    }

    // Swept vertical stabilizer dorsal fillet -> fin tip -> rudder trailing edge -> tailcone
    pts.push(toSvg(toU(5.65), toV(thrustY + 0.16)));
    pts.push(toSvg(toU(5.85), toV(thrustY + 0.24)));
    pts.push(toSvg(toU(6.38), toV(H_m * 0.99))); // Fin LE top
    pts.push(toSvg(toU(7.16), toV(H_m * 0.99))); // Fin TE top
    pts.push(toSvg(toU(6.92), toV(thrustY + 0.04))); // Rudder base
    pts.push(toSvg(toU(7.05), toV(thrustY + 0.015))); // Tailcone tip

    // Lower fuselage belly back to spinner
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const sM = 0.42 + t * 6.46;
      const st = evaluateSlingFuselageStation(t);
      pts.push(toSvg(toU(sM), toV(thrustY + st.yBottom)));
    }
    pts.push(toSvg(toU(0.42), toV(thrustY - 0.20)));
    pts.push(toSvg(toU(0.14), toV(thrustY - 0.13)));

    return (
      pts
        .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(" ") + " Z"
    );
  };

  const buildRibbonSvgPath = (
    s: (typeof stripes)[number],
    offsetNorm = 0,
    overrideW?: number,
    forceRibbonOnly = false
  ) => {
    const steps = 48;

    if (s.fillBelowCurve && !forceRibbonOnly && offsetNorm === 0) {
      const pts: { x: number; y: number }[] = [];
      pts.push(toSvg(0, s.p0.y));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const pt = evalBezierPoint(s.p0, s.p1, s.p2, s.p3, t);
        pts.push(toSvg(pt.x, pt.y));
      }
      pts.push(toSvg(1.0, s.p3.y));
      pts.push(toSvg(1.0, 0.0));
      pts.push(toSvg(0.0, 0.0));
      return (
        pts
          .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(" ") + " Z"
      );
    }

    const upper: { x: number; y: number }[] = [];
    const lower: { x: number; y: number }[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const pt = evalBezierPoint(s.p0, s.p1, s.p2, s.p3, t);
      const norm = evalBezierNormal(s.p0, s.p1, s.p2, s.p3, t);
      const w =
        overrideW !== undefined
          ? overrideW
          : (1 - t) * (1 - t) * s.widthStart +
            2 * (1 - t) * t * s.widthMid +
            t * t * s.widthEnd;
      const hw = w * 0.5;
      upper.push(
        toSvg(pt.x + norm.nx * (offsetNorm + hw), pt.y + norm.ny * (offsetNorm + hw))
      );
      lower.push(
        toSvg(pt.x + norm.nx * (offsetNorm - hw), pt.y + norm.ny * (offsetNorm - hw))
      );
    }

    const all = [...upper, ...lower.reverse()];
    return (
      all
        .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(" ") + " Z"
    );
  };

  const silhouetteD = buildAirframeSilhouettePath();
  const activeStripe = stripes.find((s) => s.id === selectedStripeId) || null;
  const regPos = toSvg(registration.positionX, registration.positionY);

  // Top Planform Geometry (POH Section 1.3 Page 1-4: 7200mm len x 9500mm span)
  const buildTopPlanform = () => {
    const cx = W * 0.5;
    const cy = H * 0.5;
    const L = calibration.lengthM || 7.2;
    const span = calibration.wingspanM || 9.5;
    const pxPerM = (H - 46) / Math.max(4, span);
    const fusLenPx = L * pxPerM;
    const noseX = cx - fusLenPx * 0.5;
    const halfSpanPx = (span * 0.5) * pxPerM;

    // POH: wingLEStationM = 1.912m, wingChordRootM = 1.520m
    const wingLES = (calibration.wingLEStationM || 1.912) / L;
    const wingChordRoot = (calibration.wingChordRootM || 1.52) / L;
    const wingRootLE = noseX + fusLenPx * wingLES;
    const wingRootTE = noseX + fusLenPx * (wingLES + wingChordRoot);
    const wingMidLE = wingRootLE;
    const wingMidTE = wingRootTE;
    const wingTipLE = wingRootLE + fusLenPx * 0.025;
    const wingTipTE = wingRootTE - fusLenPx * 0.045;

    const wingPath = (side: -1 | 1) =>
      `M ${wingRootLE.toFixed(1)} ${cy.toFixed(1)} ` +
      `L ${wingMidLE.toFixed(1)} ${(cy + side * halfSpanPx * 0.28).toFixed(1)} ` +
      `L ${wingTipLE.toFixed(1)} ${(cy + side * halfSpanPx * 0.94).toFixed(1)} ` +
      `L ${(wingTipLE + 3).toFixed(1)} ${(cy + side * halfSpanPx).toFixed(1)} ` +
      `L ${(wingTipTE + 2).toFixed(1)} ${(cy + side * halfSpanPx).toFixed(1)} ` +
      `L ${wingTipTE.toFixed(1)} ${(cy + side * halfSpanPx * 0.94).toFixed(1)} ` +
      `L ${wingMidTE.toFixed(1)} ${(cy + side * halfSpanPx * 0.28).toFixed(1)} ` +
      `L ${wingRootTE.toFixed(1)} ${cy.toFixed(1)} Z`;

    const wingtipPath = (side: -1 | 1) =>
      `M ${wingTipLE.toFixed(1)} ${(cy + side * halfSpanPx * 0.94).toFixed(1)} ` +
      `L ${(wingTipLE + 3).toFixed(1)} ${(cy + side * halfSpanPx).toFixed(1)} ` +
      `L ${(wingTipTE + 2).toFixed(1)} ${(cy + side * halfSpanPx).toFixed(1)} ` +
      `L ${wingTipTE.toFixed(1)} ${(cy + side * halfSpanPx * 0.94).toFixed(1)} Z`;

    // POH: hStabSpanM = 3.095m, hStabChordM = 0.921m
    const hSpanPx = ((calibration.hStabSpanM || 3.095) * 0.5) * pxPerM;
    const hChordPx = (calibration.hStabChordM || 0.921) * pxPerM;
    const hStabTE = noseX + fusLenPx * 0.98;
    const hStabLE = hStabTE - hChordPx;
    const hStabD =
      `M ${hStabLE.toFixed(1)} ${(cy - hSpanPx * 0.12).toFixed(1)} ` +
      `L ${(hStabLE + hChordPx * 0.22).toFixed(1)} ${(cy - hSpanPx).toFixed(1)} ` +
      `L ${hStabTE.toFixed(1)} ${(cy - hSpanPx).toFixed(1)} ` +
      `L ${hStabTE.toFixed(1)} ${(cy + hSpanPx).toFixed(1)} ` +
      `L ${(hStabLE + hChordPx * 0.22).toFixed(1)} ${(cy + hSpanPx).toFixed(1)} ` +
      `L ${hStabLE.toFixed(1)} ${(cy + hSpanPx * 0.12).toFixed(1)} Z`;

    const fusPts: { x: number; y: number }[] = [];
    fusPts.push({ x: noseX, y: cy });
    fusPts.push({ x: noseX + (0.14 / L) * fusLenPx, y: cy - 0.12 * pxPerM });
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const sM = 0.42 + t * 6.46;
      const st = evaluateSlingFuselageStation(t);
      fusPts.push({ x: noseX + (sM / L) * fusLenPx, y: cy - st.halfWidth * pxPerM });
    }
    fusPts.push({ x: noseX + fusLenPx, y: cy });
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const sM = 0.42 + t * 6.46;
      const st = evaluateSlingFuselageStation(t);
      fusPts.push({ x: noseX + (sM / L) * fusLenPx, y: cy + st.halfWidth * pxPerM });
    }
    fusPts.push({ x: noseX + (0.14 / L) * fusLenPx, y: cy + 0.12 * pxPerM });

    const fuselageD =
      fusPts
        .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(" ") + " Z";

    return {
      cx,
      cy,
      noseX,
      tailX: noseX + fusLenPx,
      fusLenPx,
      halfSpanPx,
      pxPerM,
      wingPath,
      wingtipPath,
      hStabD,
      fuselageD,
    };
  };

  const topPlanform = viewSide === "TOP" ? buildTopPlanform() : null;

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 border-t border-slate-800 select-none">
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-900/90 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-200 tracking-wide">
            2D ORTHOGRAPHIC POH PREVIEW (SLING 4 TSi)
          </span>
          <span className="text-slate-500 hidden md:inline">
            {viewSide === "TOP"
              ? "Top planform orthographic view (Wingspan & Fuselage)"
              : "Live 2D POH side projection — drag & edit components directly on the 3D model"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-md bg-slate-950 p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={() => setViewSide("PORT")}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition ${
                viewSide === "PORT"
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Port (Left)
            </button>
            <button
              type="button"
              onClick={() => setViewSide("STARBOARD")}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition ${
                viewSide === "STARBOARD"
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Starboard (Right)
            </button>
            <button
              type="button"
              onClick={() => setViewSide("TOP")}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition ${
                viewSide === "TOP"
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Top
            </button>
          </div>
        </div>
      </div>

      <div className="relative flex-1 w-full overflow-hidden flex items-center justify-center bg-slate-950">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-full max-h-[255px] touch-none cursor-default"
        >
          <defs>
            <clipPath id="sling-fuselage-clip">
              <path d={silhouetteD} />
            </clipPath>
            <pattern
              id="blueprint-grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="#1E293B"
                strokeWidth="0.8"
              />
            </pattern>
          </defs>

          <rect width={W} height={H} fill="url(#blueprint-grid)" />

          {viewSide === "TOP" && topPlanform ? (
            <g>
              {/* Centerline Datum */}
              <line
                x1={padX}
                y1={topPlanform.cy}
                x2={W - padX}
                y2={topPlanform.cy}
                stroke="#1E293B"
                strokeDasharray="4 4"
                strokeWidth="1"
              />

              {/* Port (-1) & Starboard (+1) Wings & Wingtips */}
              {([-1, 1] as const).map((side) => (
                <g key={side}>
                  <path
                    d={topPlanform.wingPath(side)}
                    fill={zones.wingBase.colorHex}
                    stroke="#475569"
                    strokeWidth="1.5"
                  />
                  <path
                    d={topPlanform.wingtipPath(side)}
                    fill={zones.wingtips.colorHex}
                    stroke="#475569"
                    strokeWidth="1.2"
                  />
                </g>
              ))}

              {/* Horizontal Stabilizer */}
              <path
                d={topPlanform.hStabD}
                fill={zones.wingBase.colorHex}
                stroke="#475569"
                strokeWidth="1.5"
              />

              {/* Propeller in Top View */}
              <line
                x1={topPlanform.noseX + topPlanform.fusLenPx * 0.025}
                y1={topPlanform.cy - topPlanform.pxPerM * 0.86}
                x2={topPlanform.noseX + topPlanform.fusLenPx * 0.025}
                y2={topPlanform.cy + topPlanform.pxPerM * 0.86}
                stroke="#94A3B8"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* Fuselage Top Contour */}
              <path
                d={topPlanform.fuselageD}
                fill={zones.fuselageBase.colorHex}
                stroke="#475569"
                strokeWidth="1.8"
              />

              {/* Anti-Glare Cowling Mask */}
              {calibration.antiGlareMaskEnabled && (
                <ellipse
                  cx={topPlanform.noseX + topPlanform.fusLenPx * 0.11}
                  cy={topPlanform.cy}
                  rx={topPlanform.fusLenPx * 0.085}
                  ry={Math.max(4, topPlanform.pxPerM * 0.24)}
                  fill={zones.cowlingAntiGlare.colorHex}
                />
              )}

              {/* Bubble Canopy Top Glass */}
              <ellipse
                cx={topPlanform.noseX + topPlanform.fusLenPx * 0.37}
                cy={topPlanform.cy}
                rx={topPlanform.fusLenPx * 0.14}
                ry={Math.max(6, topPlanform.pxPerM * 0.42)}
                fill="rgba(15, 23, 42, 0.85)"
                stroke="#334155"
                strokeWidth="1.2"
              />

              {/* Vertical Tail Dorsal Spine */}
              <rect
                x={topPlanform.noseX + topPlanform.fusLenPx * 0.75}
                y={topPlanform.cy - 2.5}
                width={topPlanform.fusLenPx * 0.24}
                height={5}
                rx={2}
                fill={zones.verticalTail.colorHex}
                stroke="#475569"
                strokeWidth="0.8"
              />

              {/* Port / Starboard Labels */}
              <text
                x={topPlanform.cx}
                y={topPlanform.cy - topPlanform.halfSpanPx - 8}
                fill="#7DD3FC"
                fontSize="10"
                fontFamily="monospace"
                textAnchor="middle"
              >
                PORT (LEFT) WINGTIP
              </text>
              <text
                x={topPlanform.cx}
                y={topPlanform.cy + topPlanform.halfSpanPx + 15}
                fill="#7DD3FC"
                fontSize="10"
                fontFamily="monospace"
                textAnchor="middle"
              >
                STARBOARD (RIGHT) WINGTIP
              </text>

              {/* Wingspan Dimension Bar */}
              <g>
                <line
                  x1={topPlanform.cx + 185}
                  y1={topPlanform.cy - topPlanform.halfSpanPx}
                  x2={topPlanform.cx + 185}
                  y2={topPlanform.cy + topPlanform.halfSpanPx}
                  stroke="#38BDF8"
                  strokeWidth="1.2"
                />
                <line
                  x1={topPlanform.cx + 179}
                  y1={topPlanform.cy - topPlanform.halfSpanPx}
                  x2={topPlanform.cx + 191}
                  y2={topPlanform.cy - topPlanform.halfSpanPx}
                  stroke="#38BDF8"
                  strokeWidth="1.2"
                />
                <line
                  x1={topPlanform.cx + 179}
                  y1={topPlanform.cy + topPlanform.halfSpanPx}
                  x2={topPlanform.cx + 191}
                  y2={topPlanform.cy + topPlanform.halfSpanPx}
                  stroke="#38BDF8"
                  strokeWidth="1.2"
                />
                <text
                  x={topPlanform.cx + 200}
                  y={topPlanform.cy + 4}
                  fill="#38BDF8"
                  fontSize="11"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  SPAN: {(calibration.wingspanM * 1000).toFixed(0)} mm
                </text>
              </g>

              {/* Length Dimension Bar */}
              <g>
                <line
                  x1={topPlanform.noseX}
                  y1={topPlanform.cy + 42}
                  x2={topPlanform.tailX}
                  y2={topPlanform.cy + 42}
                  stroke="#F59E0B"
                  strokeWidth="1.2"
                />
                <text
                  x={topPlanform.cx}
                  y={topPlanform.cy + 56}
                  fill="#F59E0B"
                  fontSize="10"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  LEN: {(calibration.lengthM * 1000).toFixed(0)} mm
                </text>
              </g>
            </g>
          ) : (
            <>
              {/* Datum Station Tick Marks in Millimetres along bottom */}
              {[0, 1000, 2000, 3000, 4000, 5000, 6000, 7200].map((mm) => {
                const uNorm = 0.02 + (mm / (calibration.lengthM * 1000)) * 0.94;
                if (uNorm > 0.98) return null;
                const pt = toSvg(uNorm, 0.02);
                return (
                  <g key={mm}>
                    <line
                      x1={pt.x}
                      y1={padY}
                      x2={pt.x}
                      y2={H - 18}
                      stroke="#1E293B"
                      strokeDasharray="3 3"
                      strokeWidth="1"
                    />
                    <text
                      x={pt.x}
                      y={H - 5}
                      fill="#64748B"
                      fontSize="9.5"
                      textAnchor="middle"
                      fontFamily="monospace"
                    >
                      {mm}mm
                    </text>
                  </g>
                );
              })}

              <g clipPath="url(#sling-fuselage-clip)">
                <path d={silhouetteD} fill={zones.fuselageBase.colorHex} />

                {/* Bezier Stripes & Belly/Tail Fills */}
                {stripes
                  .filter(
                    (s) =>
                      s.visible &&
                      s.targetZone === "FUSELAGE_TAIL" &&
                      (!isStarboard || s.symmetry)
                  )
                  .map((s) => (
                    <g key={s.id}>
                      <path
                        d={buildRibbonSvgPath(s, 0)}
                        fill={s.colorHex}
                        opacity={s.opacity}
                      />
                      {s.pinstripeEnabled && (
                        <path
                          d={buildRibbonSvgPath(
                            s,
                            s.pinstripeOffset,
                            s.pinstripeWidth,
                            true
                          )}
                          fill={s.pinstripeColorHex}
                          opacity={s.opacity}
                        />
                      )}
                    </g>
                  ))}

              {/* 3 Distinct Sling 4 TSi Framed Windows (POH Side Profile) */}
                {/* 1. Wrap-around Windshield */}
                <polygon
                  points={[
                    toSvg(0.195, 0.625),
                    toSvg(0.295, 0.742),
                    toSvg(0.295, 0.60),
                    toSvg(0.195, 0.60),
                  ]
                    .map((p) => `${p.x},${p.y}`)
                    .join(" ")}
                  fill="rgba(15, 23, 42, 0.82)"
                  stroke="#1E293B"
                  strokeWidth="1.5"
                />
                {/* 2. Gullwing Front Door Window */}
                <polygon
                  points={[
                    toSvg(0.305, 0.742),
                    toSvg(0.425, 0.725),
                    toSvg(0.425, 0.59),
                    toSvg(0.305, 0.59),
                  ]
                    .map((p) => `${p.x},${p.y}`)
                    .join(" ")}
                  fill="rgba(15, 23, 42, 0.82)"
                  stroke="#1E293B"
                  strokeWidth="1.5"
                />
                {/* 3. Rear Passenger Quarter Window */}
                <polygon
                  points={[
                    toSvg(0.440, 0.685),
                    toSvg(0.515, 0.635),
                    toSvg(0.515, 0.575),
                    toSvg(0.440, 0.575),
                  ]
                    .map((p) => `${p.x},${p.y}`)
                    .join(" ")}
                  fill="rgba(15, 23, 42, 0.82)"
                  stroke="#1E293B"
                  strokeWidth="1.5"
                />

                {/* Registration N-Number */}
                {registration.enabled && (!isStarboard || registration.symmetry) && (
                  <g
                    transform={`translate(${regPos.x}, ${regPos.y}) skewX(${-registration.slantDeg})`}
                  >
                    <text
                      x={0}
                      y={0}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={registration.colorHex}
                      stroke={
                        registration.outlineEnabled
                          ? registration.outlineColorHex
                          : "none"
                      }
                      strokeWidth={registration.outlineEnabled ? 2.5 : 0}
                      fontSize={Math.max(14, registration.heightInches * 1.45)}
                      fontWeight="900"
                      fontFamily="Arial Black, sans-serif"
                    >
                      {registration.text}
                    </text>
                  </g>
                )}
              </g>

              <path
                d={silhouetteD}
                fill="none"
                stroke="#475569"
                strokeWidth="2"
              />

              {/* POH Side View Mechanical Details: Ground Line, Propeller, Landing Gear & Wheel Pants, Low Wing, H-Stab */}
              <g pointerEvents="none">
                {/* Ground Line */}
                <line
                  x1={toSvg(0.05, 0).x}
                  y1={toSvg(0.05, 0).y}
                  x2={toSvg(0.95, 0).x}
                  y2={toSvg(0.95, 0).y}
                  stroke="#334155"
                  strokeWidth="1"
                  strokeDasharray="6 4"
                />
                {/* Propeller Blades at u=0.032 */}
                <line
                  x1={toSvg(0.032, 0.16).x}
                  y1={toSvg(0.032, 0.16).y}
                  x2={toSvg(0.032, 0.84).x}
                  y2={toSvg(0.032, 0.84).y}
                  stroke="#94A3B8"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                {/* Nose Gear Strut & Wheel Pant (900mm = u 0.125) */}
                <line
                  x1={toSvg(0.142, 0.28).x}
                  y1={toSvg(0.142, 0.28).y}
                  x2={toSvg(0.125, 0.08).x}
                  y2={toSvg(0.125, 0.08).y}
                  stroke="#64748B"
                  strokeWidth="2.5"
                />
                <polygon
                  points={[
                    toSvg(0.085, 0.06),
                    toSvg(0.115, 0.145),
                    toSvg(0.165, 0.095),
                    toSvg(0.145, 0.015),
                    toSvg(0.105, 0.015),
                  ]
                    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
                    .join(" ")}
                  fill={zones.wheelPants.colorHex}
                  stroke="#475569"
                  strokeWidth="1.4"
                />
                {/* Main Gear Strut & Wheel Pant (900+1750 = 2650mm = u 0.368) */}
                <line
                  x1={toSvg(0.368, 0.28).x}
                  y1={toSvg(0.368, 0.28).y}
                  x2={toSvg(0.368, 0.08).x}
                  y2={toSvg(0.368, 0.08).y}
                  stroke="#64748B"
                  strokeWidth="3"
                />
                <polygon
                  points={[
                    toSvg(0.322, 0.075),
                    toSvg(0.355, 0.14),
                    toSvg(0.428, 0.075),
                    toSvg(0.405, 0.015),
                    toSvg(0.345, 0.015),
                  ]
                    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
                    .join(" ")}
                  fill={zones.wheelPants.colorHex}
                  stroke="#475569"
                  strokeWidth="1.4"
                />
                {/* Low Wing Profile (LE 1912mm = u 0.266, TE 3432mm = u 0.477) */}
                <polygon
                  points={[
                    toSvg(0.266, 0.34),
                    toSvg(0.33, 0.385),
                    toSvg(0.477, 0.355),
                    toSvg(0.477, 0.32),
                    toSvg(0.31, 0.31),
                  ]
                    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
                    .join(" ")}
                  fill={zones.wingBase.colorHex}
                  stroke="#475569"
                  strokeWidth="1.3"
                />
                {/* Horizontal Stabilizer in Side Profile */}
                <polygon
                  points={[
                    toSvg(0.86, 0.505),
                    toSvg(0.98, 0.525),
                    toSvg(0.98, 0.50),
                    toSvg(0.86, 0.485),
                  ]
                    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
                    .join(" ")}
                  fill={zones.wingBase.colorHex}
                  stroke="#475569"
                  strokeWidth="1.2"
                />
              </g>
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
