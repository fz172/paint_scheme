"use client";

import React, { useEffect, useState } from "react";
import { Download, FileText, X } from "lucide-react";
import { useLiveryStore } from "@/store/useLiveryStore";
import {
  generateAndDownloadLiveryPdf,
  renderOrthographicSideViewCanvas,
  renderOrthographicTopPlanformCanvas,
} from "@/engine/pdfExporter";

export default function MultiViewPdfModal({
  open,
  onClose,
  webglCanvas,
}: {
  open: boolean;
  onClose: () => void;
  webglCanvas: HTMLCanvasElement | null;
}) {
  const projectName = useLiveryStore((s) => s.projectName);
  const calibration = useLiveryStore((s) => s.calibration);
  const zones = useLiveryStore((s) => s.zones);
  const stripes = useLiveryStore((s) => s.stripes);
  const registration = useLiveryStore((s) => s.registration);
  const decals = useLiveryStore((s) => s.decals);

  const [portImg, setPortImg] = useState<string>("");
  const [starboardImg, setStarboardImg] = useState<string>("");
  const [topImg, setTopImg] = useState<string>("");
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const opts = {
      projectName,
      calibration,
      zones,
      stripes,
      registration,
      decals,
      webglCanvas,
    };
    const cPort = renderOrthographicSideViewCanvas(opts, true, 1400, 580);
    const cStarboard = renderOrthographicSideViewCanvas(opts, false, 1400, 580);
    const cTop = renderOrthographicTopPlanformCanvas(opts, 1100, 820);

    setPortImg(cPort.toDataURL("image/png"));
    setStarboardImg(cStarboard.toDataURL("image/png"));
    setTopImg(cTop.toDataURL("image/png"));
  }, [
    open,
    projectName,
    calibration,
    zones,
    stripes,
    registration,
    decals,
    webglCanvas,
  ]);

  if (!open) return null;

  const handleDownloadPdf = async () => {
    setIsDownloading(true);
    try {
      await generateAndDownloadLiveryPdf({
        projectName,
        calibration,
        zones,
        stripes,
        registration,
        decals,
        webglCanvas,
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-6xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-sky-400" />
            <div>
              <h3 className="text-base font-bold text-white">
                2D Multi-View Orthographic Proof & Engineering PDF Preview
              </h3>
              <p className="text-xs text-slate-400">
                Includes Port Profile, Starboard Profile, Top Planform, 3D Hero Render, Dimension Callouts & Paint BOM
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-lg shadow-sky-500/20 transition"
            >
              <Download className="w-4 h-4" />
              {isDownloading
                ? "Generating PDF..."
                : "Download 2-Page Spec Sheet (.PDF)"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-950/60">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 space-y-4">
              {portImg && (
                <div className="rounded-xl overflow-hidden border border-slate-700 bg-white shadow">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={portImg}
                    alt="Port Side Orthographic Render"
                    className="w-full h-auto"
                  />
                </div>
              )}
              {starboardImg && (
                <div className="rounded-xl overflow-hidden border border-slate-700 bg-white shadow">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={starboardImg}
                    alt="Starboard Side Orthographic Render"
                    className="w-full h-auto"
                  />
                </div>
              )}
            </div>

            <div className="lg:col-span-5 space-y-4">
              {topImg && (
                <div className="rounded-xl overflow-hidden border border-slate-700 bg-white shadow">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={topImg}
                    alt="Top Planform Orthographic Render"
                    className="w-full h-auto"
                  />
                </div>
              )}

              {/* Paint Swatch Summary Card */}
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400">
                  Aerospace Paint Bill of Materials (BOM)
                </h4>
                <div className="space-y-2 text-xs">
                  {Object.entries(zones).map(([k, spec]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between py-1 border-b border-slate-800/80 last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-4 h-4 rounded border border-slate-600"
                          style={{ backgroundColor: spec.colorHex }}
                        />
                        <span className="text-slate-300 font-medium capitalize">
                          {k.replace(/([A-Z])/g, " $1")}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-400">
                        {spec.colorName} ({spec.paintCode})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
