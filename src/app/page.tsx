"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { useLiveryStore } from "@/store/useLiveryStore";
import StudioTopHeader from "@/components/studio-ui/StudioTopHeader";
import LiveryControlSidebar from "@/components/studio-ui/LiveryControlSidebar";
import OrthographicProfileEditor2D from "@/components/editor2d/OrthographicProfileEditor2D";
import BlueprintCalibratorView from "@/components/calibrator/BlueprintCalibratorView";
import MultiViewPdfModal from "@/components/studio-ui/MultiViewPdfModal";

const SlingTsiViewport3D = dynamic(
  () => import("@/components/canvas3d/SlingTsiViewport3D"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-slate-950 text-slate-400 text-xs font-mono">
        Initializing Sling TSi 3D PBR Viewport...
      </div>
    ),
  }
);

export default function AeroCanvasStudioPage() {
  const activeWorkspaceTab = useLiveryStore((s) => s.activeWorkspaceTab);
  const split2DEditorOpen = useLiveryStore((s) => s.split2DEditorOpen);

  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [webglCanvas, setWebglCanvas] = useState<HTMLCanvasElement | null>(
    null
  );

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-950 overflow-hidden">
      {/* Top Studio Header */}
      <StudioTopHeader onOpenPdfModal={() => setPdfModalOpen(true)} />

      {/* Main Content Area */}
      {activeWorkspaceTab === "BLUEPRINT_CALIBRATOR" ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <BlueprintCalibratorView />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* Left / Center: 3D PBR Viewport + Docked 2D Orthographic Bezier Profile Editor */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0 relative">
              <SlingTsiViewport3D onCanvasReady={setWebglCanvas} />
            </div>

            {split2DEditorOpen && (
              <div className="h-[265px] shrink-0">
                <OrthographicProfileEditor2D />
              </div>
            )}
          </div>

          {/* Right: WYSIWYG & AI Livery Customization Sidebar */}
          <LiveryControlSidebar />
        </div>
      )}

      {/* 2D Multi-View Orthographic Rendering & PDF Proof Export Modal */}
      <MultiViewPdfModal
        open={pdfModalOpen}
        onClose={() => setPdfModalOpen(false)}
        webglCanvas={webglCanvas}
      />
    </div>
  );
}
