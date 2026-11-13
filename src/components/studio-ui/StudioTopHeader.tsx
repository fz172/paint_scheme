"use client";

import React from "react";
import {
  Camera,
  Compass,
  FileDown,
  Paintbrush,
  PanelBottom,
  Plane,
} from "lucide-react";
import { useLiveryStore } from "@/store/useLiveryStore";
import { CameraViewPreset } from "@/types/livery";

const CAMERA_BUTTONS: { id: CameraViewPreset; label: string }[] = [
  { id: "HERO_3_4", label: "3/4 Hero" },
  { id: "LEFT_PROFILE", label: "Port (L)" },
  { id: "RIGHT_PROFILE", label: "Starboard (R)" },
  { id: "TOP_PLANFORM", label: "Top" },
  { id: "FRONT_VIEW", label: "Front" },
  { id: "TAIL_CLOSEUP", label: "Tail" },
];

export default function StudioTopHeader({
  onOpenPdfModal,
}: {
  onOpenPdfModal: () => void;
}) {
  const projectName = useLiveryStore((s) => s.projectName);
  const setProjectName = useLiveryStore((s) => s.setProjectName);

  const activeWorkspaceTab = useLiveryStore((s) => s.activeWorkspaceTab);
  const setActiveWorkspaceTab = useLiveryStore((s) => s.setActiveWorkspaceTab);

  const split2DEditorOpen = useLiveryStore((s) => s.split2DEditorOpen);
  const setSplit2DEditorOpen = useLiveryStore((s) => s.setSplit2DEditorOpen);

  const cameraPreset = useLiveryStore((s) => s.cameraPreset);
  const setCameraPreset = useLiveryStore((s) => s.setCameraPreset);

  return (
    <header className="w-full h-14 px-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3 select-none shrink-0">
      {/* Left: Brand & Project Title */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-sky-500/15 border border-sky-500/30">
          <Plane className="w-4 h-4 text-sky-400" />
          <span className="font-black text-xs tracking-wider text-white">
            AEROCANVAS
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">
            SLING TSi
          </span>
        </div>

        <input
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="hidden xl:block px-2.5 py-1 rounded bg-slate-900 border border-slate-800 focus:border-sky-500 focus:outline-none text-xs font-medium text-slate-200 w-52"
        />

        {/* Workspace Pipeline Switcher */}
        <div className="flex items-center rounded-lg bg-slate-900 p-0.5 border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveWorkspaceTab("BLUEPRINT_CALIBRATOR")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
              activeWorkspaceTab === "BLUEPRINT_CALIBRATOR"
                ? "bg-sky-500 text-slate-950 font-semibold shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>1. Blueprint & 3D Calibrator</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveWorkspaceTab("LIVERY_STUDIO")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
              activeWorkspaceTab === "LIVERY_STUDIO"
                ? "bg-sky-500 text-slate-950 font-semibold shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Paintbrush className="w-3.5 h-3.5" />
            <span>2. 3D Livery Studio</span>
          </button>
        </div>
      </div>

      {/* Center: Camera Views (when in 3D Livery Studio) */}
      {activeWorkspaceTab === "LIVERY_STUDIO" && (
        <div className="hidden lg:flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
            <Camera className="w-3.5 h-3.5 text-slate-400 mr-1" />
            {CAMERA_BUTTONS.map((cam) => (
              <button
                key={cam.id}
                type="button"
                onClick={() => setCameraPreset(cam.id)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                  cameraPreset === cam.id
                    ? "bg-sky-500/25 text-sky-300 border border-sky-500/40"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {cam.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Right: 2D Split View Toggle & 2D Multi-View PDF Export */}
      <div className="flex items-center gap-2 shrink-0">
        {activeWorkspaceTab === "LIVERY_STUDIO" && (
          <button
            type="button"
            onClick={() => setSplit2DEditorOpen(!split2DEditorOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              split2DEditorOpen
                ? "bg-slate-800 border-sky-500/50 text-sky-300"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <PanelBottom className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">2D Bezier Profile</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenPdfModal}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition"
        >
          <FileDown className="w-4 h-4" />
          <span>Export 2D PDF Proof</span>
        </button>
      </div>
    </header>
  );
}
