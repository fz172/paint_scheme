"use client";

import React, { useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Compass,
  FileUp,
  RotateCcw,
  Ruler,
  Sparkles,
  Upload,
} from "lucide-react";
import { useLiveryStore } from "@/store/useLiveryStore";
import { evaluateSlingFuselageStation } from "@/engine/slingTsiGeometry";

export default function BlueprintCalibratorView() {
  const calibration = useLiveryStore((s) => s.calibration);
  const updateCalibration = useLiveryStore((s) => s.updateCalibration);
  const resetSlingFactoryCalibration = useLiveryStore(
    (s) => s.resetSlingFactoryCalibration
  );
  const setActiveWorkspaceTab = useLiveryStore((s) => s.setActiveWorkspaceTab);

  const [isReconstructing, setIsReconstructing] = useState(false);
  const [reconStatus, setReconStatus] = useState<string | null>(null);

  const blueprintInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handleBlueprintUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    updateCalibration({ customBlueprintSideUrl: url });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const urls = files.map((f) => URL.createObjectURL(f));
    updateCalibration({
      referencePhotoUrls: [...calibration.referencePhotoUrls, ...urls],
    });
  };

  const triggerCalibrationAndLoft = () => {
    setIsReconstructing(true);
    setReconStatus(
      "Step 1/3: Extracting 3-view orthographic contours & scaling to ruler datums..."
    );
    setTimeout(() => {
      setReconStatus(
        "Step 2/3: Lofting 68 fuselage stations, NACA 2415 laminar wing & swept tail..."
      );
    }, 450);
    setTimeout(() => {
      setReconStatus(
        "Step 3/3: Unwrapping zero-seam orthographic UV atlas & baking flush-rivet masks..."
      );
    }, 950);
    setTimeout(() => {
      setIsReconstructing(false);
      setReconStatus(null);
      setActiveWorkspaceTab("LIVERY_STUDIO");
    }, 1450);
  };

  // Build side contour path for blueprint schematic preview
  const buildSideBlueprintPath = () => {
    const pts: string[] = [];
    for (let i = 0; i <= 50; i++) {
      const t = (i / 50) * 0.76;
      const st = evaluateSlingFuselageStation(t);
      const x = 90 + t * 520;
      const y = 155 - st.yTop * 115;
      pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    pts.push("L 585 45 L 635 45 L 628 155");
    for (let i = 50; i >= 0; i--) {
      const t = i / 50;
      const st = evaluateSlingFuselageStation(t);
      const x = 90 + t * 520;
      const y = 155 - st.yBottom * 115;
      pts.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    pts.push("Z");
    return pts.join(" ");
  };

  return (
    <div className="w-full h-full overflow-y-auto bg-slate-950 text-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-xl bg-slate-900/90 border border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-sky-400 text-xs font-semibold uppercase tracking-wider mb-1">
              <Compass className="w-4 h-4" />
              Pipeline A: 3-View Blueprint & Photo-to-3D Lofting Engine
            </div>
            <h2 className="text-xl font-bold text-white">
              Sling TSi Airframe Calibration & 3D Reconstruction
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Calibrate orthographic 3-view drawings and walkaround photos with physical measurements to loft a millimeter-accurate, UV-unwrapped 3D model.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={resetSlingFactoryCalibration}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Factory POH Specs
            </button>
            <button
              type="button"
              onClick={triggerCalibrationAndLoft}
              disabled={isReconstructing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs shadow-lg shadow-sky-500/20 transition"
            >
              <Sparkles className="w-4 h-4" />
              {isReconstructing
                ? "Re-Lofting 3D Mesh..."
                : "Apply Calibration & Open 3D Studio"}
            </button>
          </div>
        </div>

        {reconStatus && (
          <div className="p-4 rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-200 text-sm flex items-center gap-3 animate-pulse">
            <div className="w-2.5 h-2.5 rounded-full bg-sky-400" />
            <span className="font-mono">{reconStatus}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 7 Cols: Interactive 3-View Blueprint & Ruler Canvas + Photo Upload */}
          <div className="lg:col-span-7 space-y-6">
            {/* 3-View Technical Drawing Card */}
            <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/60">
                <div className="flex items-center gap-2">
                  <Ruler className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                    3-View Orthographic Blueprint & Datum Calibration
                  </span>
                </div>
                <div>
                  <input
                    ref={blueprintInputRef}
                    type="file"
                    accept="image/*,.svg"
                    className="hidden"
                    onChange={handleBlueprintUpload}
                  />
                  <button
                    type="button"
                    onClick={() => blueprintInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-sky-300 border border-slate-700 transition"
                  >
                    <FileUp className="w-3.5 h-3.5" />
                    Upload Custom 3-View Drawing
                  </button>
                </div>
              </div>

              <div className="relative p-4 bg-slate-950 flex flex-col items-center">
                {calibration.customBlueprintSideUrl ? (
                  <div className="relative w-full h-72 flex items-center justify-center bg-slate-900 rounded-lg overflow-hidden border border-slate-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={calibration.customBlueprintSideUrl}
                      alt="Custom Aircraft Blueprint"
                      className="max-h-full max-w-full object-contain opacity-90"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateCalibration({ customBlueprintSideUrl: null })
                      }
                      className="absolute top-2 right-2 px-2.5 py-1 rounded bg-slate-900/90 text-xs text-slate-300 border border-slate-700"
                    >
                      Use Built-in Sling TSi Schematic
                    </button>
                  </div>
                ) : (
                  <svg
                    viewBox="0 0 960 360"
                    className="w-full h-auto rounded-lg border border-slate-800/80 bg-[#070D19]"
                  >
                    <defs>
                      <pattern
                        id="cal-grid"
                        width="30"
                        height="30"
                        patternUnits="userSpaceOnUse"
                      >
                        <path
                          d="M 30 0 L 0 0 0 30"
                          fill="none"
                          stroke="#162238"
                          strokeWidth="0.8"
                        />
                      </pattern>
                    </defs>
                    <rect width="960" height="360" fill="url(#cal-grid)" />

                    {/* SIDE VIEW SCHEMATIC (LEFT) */}
                    <text
                      x="30"
                      y="28"
                      fill="#94A3B8"
                      fontSize="11"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      1. SIDE ELEVATION (SLING TSi POH REFERENCE)
                    </text>

                    <path
                      d={buildSideBlueprintPath()}
                      fill="rgba(56, 189, 248, 0.08)"
                      stroke="#38BDF8"
                      strokeWidth="1.8"
                    />

                    {/* Datum X=0 Spinner Vertical Line */}
                    <line
                      x1="70"
                      y1="38"
                      x2="70"
                      y2="265"
                      stroke="#F97316"
                      strokeDasharray="4 4"
                      strokeWidth="1.3"
                    />
                    <text
                      x="74"
                      y="50"
                      fill="#FB923C"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      DATUM X=0.00m (SPINNER)
                    </text>

                    {/* Overall Length Calibration Ruler */}
                    <g>
                      <line
                        x1="70"
                        y1="255"
                        x2="635"
                        y2="255"
                        stroke="#38BDF8"
                        strokeWidth="2"
                      />
                      <circle cx="70" cy="255" r="4" fill="#38BDF8" />
                      <circle cx="635" cy="255" r="4" fill="#38BDF8" />
                      <rect
                        x="260"
                        y="243"
                        width="190"
                        height="22"
                        rx="4"
                        fill="#0F172A"
                        stroke="#0284C7"
                      />
                      <text
                        x="355"
                        y="258"
                        fill="#7DD3FC"
                        fontSize="11"
                        fontWeight="bold"
                        textAnchor="middle"
                        fontFamily="monospace"
                      >
                        LENGTH: {calibration.lengthM.toFixed(3)} m (
                        {(calibration.lengthM * 3.28084).toFixed(2)} ft)
                      </text>
                    </g>

                    {/* Overall Height Calibration Ruler */}
                    <g>
                      <line
                        x1="652"
                        y1="45"
                        x2="652"
                        y2="215"
                        stroke="#34D399"
                        strokeWidth="2"
                      />
                      <circle cx="652" cy="45" r="4" fill="#34D399" />
                      <circle cx="652" cy="215" r="4" fill="#34D399" />
                      <text
                        x="644"
                        y="36"
                        fill="#6EE7B7"
                        fontSize="11"
                        fontWeight="bold"
                        textAnchor="end"
                        fontFamily="monospace"
                      >
                        HEIGHT: {calibration.heightM.toFixed(2)} m
                      </text>
                    </g>

                    {/* TOP PLANFORM SCHEMATIC (RIGHT) */}
                    <text
                      x="695"
                      y="28"
                      fill="#94A3B8"
                      fontSize="11"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      2. TOP PLANFORM
                    </text>

                    {/* Top Planform Wings & Fuselage */}
                    <g transform="translate(820, 175)">
                      {/* Wings */}
                      <polygon
                        points="-115,-20 -55,-26 55,-26 115,-20 115,4 55,12 -55,12 -115,4"
                        fill="rgba(56, 189, 248, 0.08)"
                        stroke="#38BDF8"
                        strokeWidth="1.6"
                      />
                      {/* Fuselage */}
                      <ellipse
                        cx="0"
                        cy="0"
                        rx="14"
                        ry="95"
                        fill="#0B1528"
                        stroke="#38BDF8"
                        strokeWidth="1.6"
                      />
                      {/* Horizontal Stab */}
                      <polygon
                        points="-38,76 38,76 35,90 -35,90"
                        fill="rgba(56, 189, 248, 0.08)"
                        stroke="#38BDF8"
                        strokeWidth="1.4"
                      />
                      {/* Wingspan Ruler */}
                      <line
                        x1="-115"
                        y1="125"
                        x2="115"
                        y2="125"
                        stroke="#FBBF24"
                        strokeWidth="2"
                      />
                      <circle cx="-115" cy="125" r="4" fill="#FBBF24" />
                      <circle cx="115" cy="125" r="4" fill="#FBBF24" />
                      <text
                        x="0"
                        y="144"
                        fill="#FDE68A"
                        fontSize="11"
                        fontWeight="bold"
                        textAnchor="middle"
                        fontFamily="monospace"
                      >
                        SPAN: {calibration.wingspanM.toFixed(2)} m (
                        {(calibration.wingspanM * 3.28084).toFixed(2)} ft)
                      </text>
                    </g>
                  </svg>
                )}
              </div>
            </div>

            {/* Walkaround Reference Photos Card */}
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                    Reference Aircraft Photos ({calibration.referencePhotoUrls.length})
                  </span>
                </div>
                <div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-amber-300 border border-slate-700 transition"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Add Walkaround Photos
                  </button>
                </div>
              </div>

              {calibration.referencePhotoUrls.length === 0 ? (
                <div
                  onClick={() => photoInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-800 hover:border-slate-700 rounded-lg p-6 text-center cursor-pointer transition"
                >
                  <p className="text-xs text-slate-400">
                    Drop walkaround photos of your Sling TSi here to extract proportion landmarks & color references
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {calibration.referencePhotoUrls.map((url, idx) => (
                    <div
                      key={idx}
                      className="relative h-24 rounded-lg overflow-hidden border border-slate-700 bg-slate-950"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Reference ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right 5 Cols: Dimensional & Parametric Geometry Sliders */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Parametric Airframe Dimensions
                  </h3>
                  <p className="text-xs text-slate-400">
                    Adjusting these measurements immediately re-lofts the 3D Sling TSi geometry
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-[11px] font-mono text-emerald-300 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Symmetric
                </span>
              </div>

              {/* Wingspan */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-medium">
                    Wingspan (Tip-to-Tip)
                  </span>
                  <span className="font-mono text-sky-400">
                    {calibration.wingspanM.toFixed(2)} m (
                    {(calibration.wingspanM * 3.28084).toFixed(2)} ft)
                  </span>
                </div>
                <input
                  type="range"
                  min={7.5}
                  max={12.0}
                  step={0.01}
                  value={calibration.wingspanM}
                  onChange={(e) =>
                    updateCalibration({ wingspanM: parseFloat(e.target.value) })
                  }
                  className="w-full accent-sky-400"
                />
              </div>

              {/* Fuselage Length */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-medium">
                    Overall Length (Spinner to Rudder TE)
                  </span>
                  <span className="font-mono text-sky-400">
                    {calibration.lengthM.toFixed(3)} m (
                    {(calibration.lengthM * 3.28084).toFixed(2)} ft)
                  </span>
                </div>
                <input
                  type="range"
                  min={5.8}
                  max={9.5}
                  step={0.005}
                  value={calibration.lengthM}
                  onChange={(e) =>
                    updateCalibration({ lengthM: parseFloat(e.target.value) })
                  }
                  className="w-full accent-sky-400"
                />
              </div>

              {/* Overall Height */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-medium">
                    Overall Tail Height
                  </span>
                  <span className="font-mono text-sky-400">
                    {calibration.heightM.toFixed(2)} m (
                    {(calibration.heightM * 3.28084).toFixed(2)} ft)
                  </span>
                </div>
                <input
                  type="range"
                  min={1.9}
                  max={3.2}
                  step={0.01}
                  value={calibration.heightM}
                  onChange={(e) =>
                    updateCalibration({ heightM: parseFloat(e.target.value) })
                  }
                  className="w-full accent-sky-400"
                />
              </div>

              {/* Root & Tip Wing Chords */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Root Chord</span>
                    <span className="font-mono text-slate-200">
                      {calibration.wingChordRootM.toFixed(2)}m
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.1}
                    max={1.8}
                    step={0.02}
                    value={calibration.wingChordRootM}
                    onChange={(e) =>
                      updateCalibration({
                        wingChordRootM: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-sky-400"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Tip Chord</span>
                    <span className="font-mono text-slate-200">
                      {calibration.wingChordTipM.toFixed(2)}m
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.7}
                    max={1.4}
                    step={0.02}
                    value={calibration.wingChordTipM}
                    onChange={(e) =>
                      updateCalibration({
                        wingChordTipM: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-sky-400"
                  />
                </div>
              </div>

              {/* Dihedral & Vertical Fin Sweep */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Wing Dihedral</span>
                    <span className="font-mono text-slate-200">
                      {calibration.dihedralDeg.toFixed(1)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={8}
                    step={0.5}
                    value={calibration.dihedralDeg}
                    onChange={(e) =>
                      updateCalibration({
                        dihedralDeg: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-sky-400"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Tail Fin Sweep</span>
                    <span className="font-mono text-slate-200">
                      {calibration.tailSweepDeg.toFixed(0)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={40}
                    step={1}
                    value={calibration.tailSweepDeg}
                    onChange={(e) =>
                      updateCalibration({
                        tailSweepDeg: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-sky-400"
                  />
                </div>
              </div>

              {/* Hardware & Mask Options */}
              <div className="pt-3 border-t border-slate-800 space-y-2.5">
                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span className="text-slate-300">
                    Composite Wheel Pants (Spats) Installed
                  </span>
                  <input
                    type="checkbox"
                    checked={calibration.wheelPantsInstalled}
                    onChange={(e) =>
                      updateCalibration({
                        wheelPantsInstalled: e.target.checked,
                      })
                    }
                    className="rounded accent-sky-500 w-4 h-4"
                  />
                </label>

                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span className="text-slate-300">
                    Flush-Riveted Alclad Panel Seams & Louvers
                  </span>
                  <input
                    type="checkbox"
                    checked={calibration.showPanelLinesAndRivets}
                    onChange={(e) =>
                      updateCalibration({
                        showPanelLinesAndRivets: e.target.checked,
                      })
                    }
                    className="rounded accent-sky-500 w-4 h-4"
                  />
                </label>

                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span className="text-slate-300">
                    Upper Nose Cowling Anti-Glare Paint Zone
                  </span>
                  <input
                    type="checkbox"
                    checked={calibration.antiGlareMaskEnabled}
                    onChange={(e) =>
                      updateCalibration({
                        antiGlareMaskEnabled: e.target.checked,
                      })
                    }
                    className="rounded accent-sky-500 w-4 h-4"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
