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
  const decals = useLiveryStore((s) => s.decals);

  const setSelectedStripeId = useLiveryStore((s) => s.setSelectedStripeId);
  const updateStripe = useLiveryStore((s) => s.updateStripe);
  const updateRegistration = useLiveryStore((s) => s.updateRegistration);
  const updateDecal = useLiveryStore((s) => s.updateDecal);

  const svgRef = useRef<SVGSVGElement>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [viewSide, setViewSide] = useState<"PORT" | "STARBOARD">("PORT");

  const W = 1000;
  const H = 320;
  const padX = 70;
  const drawW = W - padX * 2;
  const padY = 28;
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

  // Build SVG path for the Sling TSi fuselage + swept vertical tail silhouette
  const buildAirframeSilhouettePath = () => {
    const pts: { x: number; y: number }[] = [];
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 0.76;
      const st = evaluateSlingFuselageStation(t);
      pts.push(toSvg(0.05 + t * 0.88, 0.44 + st.yTop * 0.52));
    }
    pts.push(toSvg(0.88, 0.96));
    pts.push(toSvg(0.96, 0.96));
    pts.push(toSvg(0.95, 0.44));
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const st = evaluateSlingFuselageStation(t);
      pts.push(toSvg(0.05 + t * 0.88, 0.44 + st.yBottom * 0.52));
    }
    return (
      pts
        .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(" ") + " Z"
    );
  };

  const buildCanopyGlassPath = () => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= 32; i++) {
      const t = 0.225 + (i / 32) * 0.31;
      const st = evaluateSlingFuselageStation(t);
      pts.push(toSvg(0.05 + t * 0.88, 0.44 + st.yTop * 0.52 - 0.01));
    }
    pts.push(toSvg(0.05 + 0.535 * 0.88, 0.5));
    pts.push(toSvg(0.05 + 0.38 * 0.88, 0.52));
    pts.push(toSvg(0.05 + 0.225 * 0.88, 0.54));
    return (
      pts
        .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(" ") + " Z"
    );
  };

  const buildRibbonSvgPath = (
    s: (typeof stripes)[number],
    offsetNorm = 0,
    overrideW?: number
  ) => {
    const steps = 48;
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
  const canopyD = buildCanopyGlassPath();
  const activeStripe = stripes.find((s) => s.id === selectedStripeId) || null;
  const regPos = toSvg(registration.positionX, registration.positionY);

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 border-t border-slate-800 select-none">
      {/* Header Toolbar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-900/90 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-200 tracking-wide">
            2D ORTHOGRAPHIC BEZIER & DATUM PROFILE EDITOR
          </span>
          <span className="text-slate-500 hidden md:inline">
            Drag control points (P0–P3) or Registration badge to sculpt livery in real time
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

      {/* Interactive SVG Canvas */}
      <div className="relative flex-1 w-full overflow-hidden flex items-center justify-center bg-slate-950">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-full max-h-[260px] touch-none cursor-crosshair"
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

          {/* Engineering Grid */}
          <rect width={W} height={H} fill="url(#blueprint-grid)" />

          {/* Datum Station Tick Marks along bottom */}
          {[0, 1, 2, 3, 4, 5, 6, 7].map((meter) => {
            const uNorm = 0.05 + (meter / calibration.lengthM) * 0.88;
            if (uNorm > 0.96) return null;
            const pt = toSvg(uNorm, 0.02);
            return (
              <g key={meter}>
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
                  y={H - 6}
                  fill="#64748B"
                  fontSize="10"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  STA {meter}.0m
                </text>
              </g>
            );
          })}

          {/* Clipped Airframe Interior Layers */}
          <g clipPath="url(#sling-fuselage-clip)">
            {/* Base Fuselage Coat */}
            <path d={silhouetteD} fill={zones.fuselageBase.colorHex} />

            {/* Vertical Tail Fin Coat */}
            <polygon
              points={[
                toSvg(0.72, 0.5),
                toSvg(0.87, 0.98),
                toSvg(0.98, 0.98),
                toSvg(0.96, 0.45),
              ]
                .map((p) => `${p.x},${p.y}`)
                .join(" ")}
              fill={zones.verticalTail.colorHex}
            />

            {/* Cowling Anti-Glare Panel */}
            {calibration.antiGlareMaskEnabled && (
              <polygon
                points={[
                  toSvg(0.05, 0.44),
                  toSvg(0.24, 0.58),
                  toSvg(0.24, 0.68),
                  toSvg(0.05, 0.55),
                ]
                  .map((p) => `${p.x},${p.y}`)
                  .join(" ")}
                fill={zones.cowlingAntiGlare.colorHex}
              />
            )}

            {/* Bezier Stripes */}
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
                        s.pinstripeWidth
                      )}
                      fill={s.pinstripeColorHex}
                      opacity={s.opacity}
                    />
                  )}
                </g>
              ))}

            {/* Protected Bubble Canopy Glass */}
            <path d={canopyD} fill="rgba(15, 23, 42, 0.76)" />

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

          {/* Crisp Silhouette Outline */}
          <path
            d={silhouetteD}
            fill="none"
            stroke="#475569"
            strokeWidth="2"
          />

          {/* Interactive Bezier Handle Overlay for Active Stripe */}
          {activeStripe && activeStripe.targetZone === "FUSELAGE_TAIL" && (
            <g>
              {/* Control polygon dashed guide lines */}
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
                const stationM = (pt.x * calibration.lengthM).toFixed(2);
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
                      P{idx} ({stationM}m)
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
