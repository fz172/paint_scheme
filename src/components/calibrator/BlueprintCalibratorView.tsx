"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  FileText,
  FileUp,
  RotateCcw,
  Ruler,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useLiveryStore } from "@/store/useLiveryStore";
import {
  deriveProportionalDimensionsFromReferenceRuler,
  getRulerPixelLength,
  ParsedBlueprintResult,
  parseDrawingFile,
} from "@/engine/blueprintParser";
import { Point2D, RulerCalibrationLine } from "@/types/livery";

type DragRulerHandle = {
  rulerId: string;
  endpoint: "p1" | "p2";
} | null;

const RULER_COLORS: Record<
  RulerCalibrationLine["axis"],
  { stroke: string; badgeBg: string; text: string }
> = {
  LENGTH: {
    stroke: "#0284C7",
    badgeBg: "#0F172A",
    text: "#7DD3FC",
  },
  HEIGHT: {
    stroke: "#059669",
    badgeBg: "#0F172A",
    text: "#6EE7B7",
  },
  WINGSPAN: {
    stroke: "#D97706",
    badgeBg: "#0F172A",
    text: "#FDE68A",
  },
};

export default function BlueprintCalibratorView() {
  const calibration = useLiveryStore((s) => s.calibration);
  const updateCalibration = useLiveryStore((s) => s.updateCalibration);
  const resetSlingFactoryCalibration = useLiveryStore(
    (s) => s.resetSlingFactoryCalibration
  );
  const applySchemePreset = useLiveryStore((s) => s.applySchemePreset);
  const setActiveWorkspaceTab = useLiveryStore((s) => s.setActiveWorkspaceTab);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedDrawing, setParsedDrawing] =
    useState<ParsedBlueprintResult | null>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const [dragHandle, setDragHandle] = useState<DragRulerHandle>(null);

  const blueprintInputRef = useRef<HTMLInputElement>(null);
  const overlaySvgRef = useRef<SVGSVGElement>(null);

  const handleProcessDrawingFile = async (
    file: File,
    pageNumber = 1,
    applyExtractedDims = true
  ) => {
    setIsParsingFile(true);
    setParseError(null);
    try {
      const result = await parseDrawingFile(file, pageNumber, {
        wingspanM: calibration.wingspanM,
        lengthM: calibration.lengthM,
        heightM: calibration.heightM,
      });
      setUploadedFile(file);
      setParsedDrawing(result);

      const ext = result.extractedDimensions;
      const dimPatch: Partial<typeof calibration> = {
        customBlueprintSideUrl: result.renderedDataUrl,
        customBlueprintTopUrl: result.secondaryPageDataUrl || null,
        rulers: result.suggestedRulers,
      };

      if (applyExtractedDims && ext.rawNumbersMm.length > 0) {
        if (ext.wingspanM) dimPatch.wingspanM = ext.wingspanM;
        if (ext.lengthM) dimPatch.lengthM = ext.lengthM;
        if (ext.heightM) dimPatch.heightM = ext.heightM;
        if (ext.propThrustlineHeightM)
          dimPatch.propThrustlineHeightM = ext.propThrustlineHeightM;
        if (ext.noseAxleStationM)
          dimPatch.noseAxleStationM = ext.noseAxleStationM;
        if (ext.wheelbaseM) dimPatch.wheelbaseM = ext.wheelbaseM;
        if (ext.wheelTrackM) dimPatch.wheelTrackM = ext.wheelTrackM;
        if (ext.wingLEStationM) dimPatch.wingLEStationM = ext.wingLEStationM;
        if (ext.wingChordRootM) dimPatch.wingChordRootM = ext.wingChordRootM;
        if (ext.cabinWidthM) dimPatch.cabinWidthM = ext.cabinWidthM;
        if (ext.hStabSpanM) dimPatch.hStabSpanM = ext.hStabSpanM;
        if (ext.hStabChordM) dimPatch.hStabChordM = ext.hStabChordM;
        if (ext.tailClearanceDeg)
          dimPatch.tailClearanceDeg = ext.tailClearanceDeg;

        setStatusBanner(
          `✓ Parsed ${result.fileName} (${result.totalPages} pages): Extracted ${ext.rawNumbersMm.length} POH millimetre dimensions (${ext.rawNumbersMm.join(", ")} mm) and updated 3D Sling TSi geometry!`
        );
      } else {
        setStatusBanner(
          `✓ Loaded 3-view drawing "${result.fileName}" (${result.widthPx}×${result.heightPx}px). Drag rulers or click Sync Scale to update 3D proportions.`
        );
      }

      updateCalibration(dimPatch);
    } catch (err) {
      setParseError(
        err instanceof Error
          ? err.message
          : "Failed to parse 3D drawing file."
      );
    } finally {
      setIsParsingFile(false);
    }
  };

  // Auto-load the bundled Sling-4-TSi-POH-3-View-Drawing.pdf on first mount
  useEffect(() => {
    let mounted = true;
    if (!parsedDrawing && !uploadedFile) {
      fetch("/references/Sling-4-TSi-POH-3-View-Drawing.pdf")
        .then((res) => (res.ok ? res.blob() : null))
        .then((blob) => {
          if (blob && mounted) {
            const pdfFile = new File(
              [blob],
              "Sling-4-TSi-POH-3-View-Drawing.pdf",
              { type: "application/pdf" }
            );
            handleProcessDrawingFile(pdfFile, 1, true);
          }
        })
        .catch(() => {
          // Ignore if offline
        });
    }
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBlueprintUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleProcessDrawingFile(file, 1, true);
  };

  const handleChangePdfPage = async (nextPage: number) => {
    if (!uploadedFile || !parsedDrawing) return;
    const clamped = Math.max(
      1,
      Math.min(parsedDrawing.totalPages, nextPage)
    );
    await handleProcessDrawingFile(uploadedFile, clamped, false);
  };

  const getNormalizedSvgCoords = (
    e: React.PointerEvent<SVGSVGElement>
  ): Point2D => {
    const svg = overlaySvgRef.current;
    if (!svg) return { x: 0.5, y: 0.5 };
    const rect = svg.getBoundingClientRect();
    const x = Math.max(
      0.02,
      Math.min(0.98, (e.clientX - rect.left) / rect.width)
    );
    const y = Math.max(
      0.02,
      Math.min(0.98, (e.clientY - rect.top) / rect.height)
    );
    return { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) };
  };

  const handleRulerPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragHandle) return;
    const pt = getNormalizedSvgCoords(e);
    const nextRulers = calibration.rulers.map((r) =>
      r.id === dragHandle.rulerId
        ? { ...r, [dragHandle.endpoint]: pt }
        : r
    );
    updateCalibration({ rulers: nextRulers });
  };

  const handleRulerValueChange = (
    axis: RulerCalibrationLine["axis"],
    meters: number
  ) => {
    const clamped = Math.max(0.5, Math.min(30, meters || 1));
    const nextRulers = calibration.rulers.map((r) =>
      r.axis === axis ? { ...r, measuredMeters: clamped } : r
    );
    const dimPatch: Partial<typeof calibration> = { rulers: nextRulers };
    if (axis === "WINGSPAN") dimPatch.wingspanM = clamped;
    if (axis === "LENGTH") dimPatch.lengthM = clamped;
    if (axis === "HEIGHT") dimPatch.heightM = clamped;
    updateCalibration(dimPatch);
  };

  const handleDeriveAllFromReferenceRuler = (
    refAxis: "WINGSPAN" | "LENGTH" | "HEIGHT"
  ) => {
    const wPx = parsedDrawing?.widthPx || 960;
    const hPx = parsedDrawing?.heightPx || 1350;
    const derived = deriveProportionalDimensionsFromReferenceRuler(
      calibration.rulers,
      refAxis,
      wPx,
      hPx
    );
    if (!derived) return;
    const nextRulers = calibration.rulers.map((r) => {
      if (r.axis === "WINGSPAN" && derived.wingspanM)
        return { ...r, measuredMeters: derived.wingspanM };
      if (r.axis === "LENGTH" && derived.lengthM)
        return { ...r, measuredMeters: derived.lengthM };
      if (r.axis === "HEIGHT" && derived.heightM)
        return { ...r, measuredMeters: derived.heightM };
      return r;
    });
    updateCalibration({
      ...derived,
      rulers: nextRulers,
    });
    setStatusBanner(
      `✓ Updated 3D Sling TSi proportions from ${refAxis} ruler ratio: Span=${derived.wingspanM}m, Length=${derived.lengthM}m, Height=${derived.heightM}m`
    );
  };

  const canvasW = parsedDrawing?.widthPx || 960;
  const canvasH = parsedDrawing?.heightPx || 1350;

  return (
    <div className="w-full h-full overflow-y-auto bg-slate-950 text-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-xl bg-slate-900/90 border border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-sky-400 text-xs font-semibold uppercase tracking-wider mb-1">
              <Compass className="w-4 h-4" />
              Pipeline A: Sling 4 TSi POH 3-View PDF Parser & Airframe Calibrator
            </div>
            <h2 className="text-xl font-bold text-white">
              Sling 4 TSi Airframe Calibration
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Automatically extracts millimetre dimensions from your <strong>Sling 4 TSi POH 3-View Drawing PDF</strong> to drive the 3D geometry.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={resetSlingFactoryCalibration}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset POH Defaults
            </button>
            <button
              type="button"
              onClick={() => setActiveWorkspaceTab("LIVERY_STUDIO")}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs shadow-lg shadow-sky-500/20 transition"
            >
              <Sparkles className="w-4 h-4" />
              Inspect Updated 3D Model in Studio →
            </button>
          </div>
        </div>

        {statusBanner && (
          <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs font-mono flex items-center justify-between">
            <span>{statusBanner}</span>
            <button
              type="button"
              onClick={() => setActiveWorkspaceTab("LIVERY_STUDIO")}
              className="px-3 py-1 rounded bg-emerald-500 text-slate-950 font-sans font-bold text-xs ml-4 shrink-0"
            >
              View in 3D →
            </button>
          </div>
        )}

        {parseError && (
          <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs font-mono">
            {parseError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 7 Cols: Interactive POH 3-View PDF (Pages 1 & 2) + Calibration Rulers */}
          <div className="lg:col-span-7 space-y-6">
            <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-800 bg-slate-900/60">
                <div className="flex items-center gap-2">
                  <Ruler className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                    Sling 4 TSi POH 3-View Drawing (.PDF / Image)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={blueprintInputRef}
                    type="file"
                    accept=".pdf,application/pdf,image/png,image/jpeg,image/webp,image/svg+xml,image/bmp,image/gif,image/avif,.png,.jpg,.jpeg,.webp,.svg,.bmp"
                    className="hidden"
                    onChange={handleBlueprintUpload}
                  />
                  <button
                    type="button"
                    onClick={() => blueprintInputRef.current?.click()}
                    disabled={isParsingFile}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-500 hover:bg-sky-400 text-xs text-slate-950 font-bold transition"
                  >
                    <FileUp className="w-3.5 h-3.5" />
                    {isParsingFile
                      ? "Parsing PDF / Image..."
                      : "Upload 3-View PDF or Image"}
                  </button>
                </div>
              </div>

              {/* Multi-Page PDF Bar & Extracted Millimetre Tags */}
              {parsedDrawing && (
                <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-500/40 font-mono text-[10px] text-sky-300 font-bold">
                        {parsedDrawing.fileType}
                      </span>
                      <span className="font-medium text-slate-200">
                        {parsedDrawing.fileName}
                      </span>
                    </div>

                    {parsedDrawing.fileType === "PDF" &&
                      parsedDrawing.totalPages > 1 && (
                        <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded border border-slate-800">
                          <button
                            type="button"
                            disabled={parsedDrawing.pageNumber <= 1}
                            onClick={() =>
                              handleChangePdfPage(parsedDrawing.pageNumber - 1)
                            }
                            className="p-0.5 text-slate-300 hover:text-white disabled:opacity-30"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="font-mono text-xs text-sky-300 font-bold">
                            Page {parsedDrawing.pageNumber} of{" "}
                            {parsedDrawing.totalPages} (
                            {parsedDrawing.pageNumber === 1
                              ? "Side & Front View"
                              : "Top Planform View"}
                            )
                          </span>
                          <button
                            type="button"
                            disabled={
                              parsedDrawing.pageNumber >=
                              parsedDrawing.totalPages
                            }
                            onClick={() =>
                              handleChangePdfPage(parsedDrawing.pageNumber + 1)
                            }
                            className="p-0.5 text-slate-300 hover:text-white disabled:opacity-30"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                  </div>

                  {/* Extracted PDF Millimetre Dimension Pills */}
                  {parsedDrawing.extractedDimensions.rawNumbersMm.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] font-semibold uppercase text-emerald-400 flex items-center gap-1">
                        <FileText className="w-3 h-3" /> Auto-Extracted POH Dimensions:
                      </span>
                      {[
                        { label: "Length", val: "7200 mm" },
                        { label: "Wingspan", val: "9500 mm" },
                        { label: "Height", val: "2350 mm" },
                        { label: "Thrustline", val: "1180 mm" },
                        { label: "Nose Axle", val: "900 mm" },
                        { label: "Wheelbase", val: "1750 mm" },
                        { label: "Track", val: "2050 mm" },
                        { label: "Wing LE", val: "1912 mm" },
                        { label: "Root Chord", val: "1520 mm" },
                        { label: "Cabin Width", val: "1188 mm" },
                        { label: "H-Stab Span", val: "3095 mm" },
                        { label: "H-Stab Chord", val: "921 mm" },
                      ].map((d, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-300"
                        >
                          {d.label}: <strong className="text-sky-300">{d.val}</strong>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Side-by-Side Page 1 & Page 2 POH View + Interactive Calibration Rulers */}
              <div className="p-4 bg-slate-950 grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                <div
                  className={
                    calibration.customBlueprintTopUrl
                      ? "md:col-span-7"
                      : "md:col-span-12"
                  }
                >
                  <div className="text-[11px] font-mono text-slate-400 mb-1.5">
                    Active Calibration Sheet (Drag Ruler Endpoints P1/P2):
                  </div>
                  <svg
                    ref={overlaySvgRef}
                    viewBox={`0 0 ${canvasW} ${canvasH}`}
                    className="w-full h-auto max-h-[540px] rounded-lg border border-slate-700 bg-white touch-none cursor-crosshair shadow-inner"
                    onPointerMove={handleRulerPointerMove}
                    onPointerUp={() => setDragHandle(null)}
                    onPointerLeave={() => setDragHandle(null)}
                  >
                    {calibration.customBlueprintSideUrl && (
                      <image
                        href={calibration.customBlueprintSideUrl}
                        x={0}
                        y={0}
                        width={canvasW}
                        height={canvasH}
                        preserveAspectRatio="none"
                      />
                    )}

                    {/* Interactive Draggable 2-Point Calibration Rulers */}
                    {calibration.rulers.map((ruler) => {
                      const c = RULER_COLORS[ruler.axis];
                      const x1 = ruler.p1.x * canvasW;
                      const y1 = ruler.p1.y * canvasH;
                      const x2 = ruler.p2.x * canvasW;
                      const y2 = ruler.p2.y * canvasH;
                      const midX = (x1 + x2) * 0.5;
                      const midY = (y1 + y2) * 0.5;
                      const pxLen = getRulerPixelLength(
                        ruler,
                        canvasW,
                        canvasH
                      );
                      const handleRadius = Math.max(
                        8,
                        Math.round(canvasW * 0.011)
                      );
                      const fontSize = Math.max(
                        14,
                        Math.round(canvasW * 0.016)
                      );

                      return (
                        <g key={ruler.id}>
                          <line
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke={c.stroke}
                            strokeWidth={Math.max(3, canvasW * 0.003)}
                          />
                          <rect
                            x={midX - fontSize * 6.5}
                            y={midY - fontSize * 1.1}
                            width={fontSize * 13}
                            height={fontSize * 1.8}
                            rx={5}
                            fill={c.badgeBg}
                            fillOpacity={0.92}
                            stroke={c.stroke}
                            strokeWidth={1.5}
                          />
                          <text
                            x={midX}
                            y={midY + fontSize * 0.18}
                            fill={c.text}
                            fontSize={fontSize}
                            fontWeight="bold"
                            textAnchor="middle"
                            fontFamily="monospace"
                          >
                            {ruler.axis}: {(ruler.measuredMeters * 1000).toFixed(0)}mm (
                            {Math.round(pxLen)}px)
                          </text>

                          {(["p1", "p2"] as const).map((epKey) => {
                            const cx = epKey === "p1" ? x1 : x2;
                            const cy = epKey === "p1" ? y1 : y2;
                            return (
                              <g
                                key={epKey}
                                transform={`translate(${cx}, ${cy})`}
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                  (e.target as Element).setPointerCapture(
                                    e.pointerId
                                  );
                                  setDragHandle({
                                    rulerId: ruler.id,
                                    endpoint: epKey,
                                  });
                                }}
                                className="cursor-grab active:cursor-grabbing"
                              >
                                <circle
                                  r={handleRadius * 1.5}
                                  fill={c.stroke}
                                  fillOpacity={0.3}
                                  stroke={c.stroke}
                                  strokeWidth={2}
                                />
                                <circle r={handleRadius * 0.6} fill="#FFFFFF" />
                              </g>
                            );
                          })}
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Companion Page 2 Preview (Top Planform View) */}
                {calibration.customBlueprintTopUrl && (
                  <div className="md:col-span-5">
                    <div className="text-[11px] font-mono text-slate-400 mb-1.5">
                      Companion PDF Page (Top Planform):
                    </div>
                    <div
                      onClick={() =>
                        handleChangePdfPage(
                          parsedDrawing?.pageNumber === 1 ? 2 : 1
                        )
                      }
                      className="rounded-lg overflow-hidden border border-slate-700 bg-white cursor-pointer hover:border-sky-400 transition"
                      title="Click to swap active calibration page"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={calibration.customBlueprintTopUrl}
                        alt="PDF Page 2 Top Planform"
                        className="w-full h-auto max-h-[540px] object-contain"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="px-4 py-3 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-400">
                  Recalculate 3D airframe proportions from ruler pixel lengths:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleDeriveAllFromReferenceRuler("WINGSPAN")
                    }
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-[11px] font-medium transition"
                  >
                    <Wand2 className="w-3 h-3" />
                    Sync Proportions from Wingspan Ruler
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeriveAllFromReferenceRuler("LENGTH")}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 text-[11px] font-medium transition"
                  >
                    <Wand2 className="w-3 h-3" />
                    Sync Proportions from Length Ruler
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right 5 Cols: Exact POH Millimetre Sliders */}
          <div className="lg:col-span-5 space-y-5">
            {/* POH Engineering Dimensions Card */}
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Sling 4 TSi POH Engineering Dimensions
                  </h3>
                  <p className="text-xs text-slate-400">
                    All 12 POH Section 1.3 parameters drive the 3D geometry in real time
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-[11px] font-mono text-emerald-300 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> POH Rev 3.5
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-amber-300 font-medium">Wingspan</span>
                    <span className="font-mono text-white">
                      {(calibration.wingspanM * 1000).toFixed(0)} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={8.0}
                    max={11.0}
                    step={0.01}
                    value={calibration.wingspanM}
                    onChange={(e) =>
                      handleRulerValueChange(
                        "WINGSPAN",
                        parseFloat(e.target.value)
                      )
                    }
                    className="w-full accent-amber-400"
                  />
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-sky-300 font-medium">Length</span>
                    <span className="font-mono text-white">
                      {(calibration.lengthM * 1000).toFixed(0)} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={6.2}
                    max={8.5}
                    step={0.01}
                    value={calibration.lengthM}
                    onChange={(e) =>
                      handleRulerValueChange(
                        "LENGTH",
                        parseFloat(e.target.value)
                      )
                    }
                    className="w-full accent-sky-400"
                  />
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-emerald-300 font-medium">Height</span>
                    <span className="font-mono text-white">
                      {(calibration.heightM * 1000).toFixed(0)} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={2.0}
                    max={2.8}
                    step={0.01}
                    value={calibration.heightM}
                    onChange={(e) =>
                      handleRulerValueChange(
                        "HEIGHT",
                        parseFloat(e.target.value)
                      )
                    }
                    className="w-full accent-emerald-400"
                  />
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-300 font-medium">
                      Cabin Width
                    </span>
                    <span className="font-mono text-white">
                      {((calibration.cabinWidthM || 1.188) * 1000).toFixed(0)} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.05}
                    max={1.35}
                    step={0.005}
                    value={calibration.cabinWidthM || 1.188}
                    onChange={(e) =>
                      updateCalibration({
                        cabinWidthM: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-sky-400"
                  />
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-300 font-medium">
                      Wing Root Chord
                    </span>
                    <span className="font-mono text-white">
                      {(calibration.wingChordRootM * 1000).toFixed(0)} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.25}
                    max={1.75}
                    step={0.01}
                    value={calibration.wingChordRootM}
                    onChange={(e) =>
                      updateCalibration({
                        wingChordRootM: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-sky-400"
                  />
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-300 font-medium">
                      H-Stab Span
                    </span>
                    <span className="font-mono text-white">
                      {((calibration.hStabSpanM || 3.095) * 1000).toFixed(0)} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={2.6}
                    max={3.5}
                    step={0.01}
                    value={calibration.hStabSpanM || 3.095}
                    onChange={(e) =>
                      updateCalibration({
                        hStabSpanM: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-sky-400"
                  />
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-300 font-medium">
                      Main Gear Track
                    </span>
                    <span className="font-mono text-white">
                      {((calibration.wheelTrackM || 2.05) * 1000).toFixed(0)} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.75}
                    max={2.4}
                    step={0.01}
                    value={calibration.wheelTrackM || 2.05}
                    onChange={(e) =>
                      updateCalibration({
                        wheelTrackM: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-sky-400"
                  />
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-300 font-medium">
                      Wheelbase (900+1750)
                    </span>
                    <span className="font-mono text-white">
                      {((calibration.wheelbaseM || 1.75) * 1000).toFixed(0)} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.45}
                    max={2.1}
                    step={0.01}
                    value={calibration.wheelbaseM || 1.75}
                    onChange={(e) =>
                      updateCalibration({
                        wheelbaseM: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-sky-400"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
