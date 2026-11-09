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
  const [viewSide, setViewSide] = useState<"PORT" | "STARBOARD">("PORT");

  const W = 1000;
  const H = 310;
  const padX = 70;
  const drawW = W - padX * 2;
  const padY = 24;
  const drawH = H - padY * 2;

  const toSvg = (uNorm: number, vNorm: number) => ({
    x: padX + uNorm * drawW,
    y: padY + (1 - vNorm) * drawH,
  });

  const fromSvgEvent = (e: React.PointerEvent<SVGSVGElement>): Point2D => {
    const svg = svgRef.current;
    if (!svg) return { x: 0.5, y: 0.5 };
    const rect = svg.getBoundingClientRect();
    const rawX = ((e.clientX - rect.left) / rect.width) * W;
    const rawY = ((e.clientY - rect.top) / rect.height) * H;
    const uNorm = Math.max(0.01, Math.min(0.99, (rawX - padX) / drawW));
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

  // Authentic Sling 4 TSi POH Side Silhouette
  const buildAirframeSilhouettePath = () => {
    const pts: { x: number; y: number }[] = [];
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 0.78;
      const st = evaluateSlingFuselageStation(t);
      pts.push(toSvg(0.06 + t * 0.88, 0.31 + st.yTop * 0.58));
    }
    // Swept vertical stabilizer leading edge -> squared tip -> rudder TE
    pts.push(toSvg(0.89, 0.98));
    pts.push(toSvg(0.96, 0.98));
    pts.push(toSvg(0.98, 0.28));
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const st = evaluateSlingFuselageStation(t);
      pts.push(toSvg(0.06 + t * 0.88, 0.31 + st.yBottom * 0.58));
    }
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

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 border-t border-slate-800 select-none">
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-900/90 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-200 tracking-wide">
            2D ORTHOGRAPHIC BEZIER & DATUM PROFILE EDITOR (SLING 4 TSi POH)
          </span>
          <span className="text-slate-500 hidden md:inline">
            Drag control points (P0–P3) or N-Number (`{registration.text}`) to sculpt livery in real time
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
          </div>
        </div>
      </div>

      <div className="relative flex-1 w-full overflow-hidden flex items-center justify-center bg-slate-950">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-full max-h-[255px] touch-none cursor-crosshair"
          onPointerMove={handlePointerMove}
          onPointerUp={() => setDragTarget(null)}
          onPointerLeave={() => setDragTarget(null)}
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
              .filter((s) => s.visible && s.targetZone === "FUSELAGE_TAIL")
              .map((s) => (
                <g
                  key={s.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedStripeId(s.id);
                  }}
                  className="cursor-pointer"
                >
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

            {/* 3 Distinct Sling 4 TSi Framed Windows (Windshield, Gullwing Door, Rear Quarter Window) */}
            {/* 1. Wrap-around Windshield */}
            <polygon
              points={[
                toSvg(0.23, 0.49),
                toSvg(0.32, 0.67),
                toSvg(0.33, 0.42),
                toSvg(0.23, 0.44),
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
                toSvg(0.345, 0.66),
                toSvg(0.445, 0.63),
                toSvg(0.445, 0.42),
                toSvg(0.345, 0.42),
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
                toSvg(0.465, 0.59),
                toSvg(0.525, 0.53),
                toSvg(0.525, 0.43),
                toSvg(0.465, 0.43),
              ]
                .map((p) => `${p.x},${p.y}`)
                .join(" ")}
              fill="rgba(15, 23, 42, 0.82)"
              stroke="#1E293B"
              strokeWidth="1.5"
            />

            {/* Registration N-Number */}
            {registration.enabled && (
              <g
                transform={`translate(${regPos.x}, ${regPos.y}) skewX(${-registration.slantDeg})`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.target as Element).setPointerCapture(e.pointerId);
                  setDragTarget({ kind: "REGISTRATION" });
                }}
                className="cursor-move"
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

          {/* Interactive Bezier Handle Overlay for Active Stripe */}
          {activeStripe && activeStripe.targetZone === "FUSELAGE_TAIL" && (
            <g>
              {(() => {
                const p0 = toSvg(activeStripe.p0.x, activeStripe.p0.y);
                const p1 = toSvg(activeStripe.p1.x, activeStripe.p1.y);
                const p2 = toSvg(activeStripe.p2.x, activeStripe.p2.y);
                const p3 = toSvg(activeStripe.p3.x, activeStripe.p3.y);
                return (
                  <>
                    <line
                      x1={p0.x}
                      y1={p0.y}
                      x2={p1.x}
                      y2={p1.y}
                      stroke="#38BDF8"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                    <line
                      x1={p2.x}
                      y1={p2.y}
                      x2={p3.x}
                      y2={p3.y}
                      stroke="#38BDF8"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                  </>
                );
              })()}

              {(["p0", "p1", "p2", "p3"] as const).map((ptKey, idx) => {
                const pt = activeStripe[ptKey];
                const svgPt = toSvg(pt.x, pt.y);
                const stationMm = Math.round(
                  pt.x * calibration.lengthM * 1000
                );
                return (
                  <g
                    key={ptKey}
                    transform={`translate(${svgPt.x}, ${svgPt.y})`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (e.target as Element).setPointerCapture(e.pointerId);
                      setDragTarget({
                        kind: "STRIPE_POINT",
                        stripeId: activeStripe.id,
                        pointKey: ptKey,
                      });
                    }}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <circle
                      r={10}
                      fill="#0284C7"
                      fillOpacity={0.25}
                      stroke="#38BDF8"
                      strokeWidth="2"
                    />
                    <circle r={4.5} fill="#F8FAFC" />
                    <text
                      y={-14}
                      fill="#7DD3FC"
                      fontSize="10"
                      fontWeight="bold"
                      textAnchor="middle"
                      fontFamily="monospace"
                    >
                      P{idx} ({stationMm}mm)
                    </text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
