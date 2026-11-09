# AeroCanvas — Sling TSi 3D Reconstruction & Livery Design Studio

A web-based 3D aircraft reconstruction, blueprint calibration, and livery customization studio focused on **General Aviation (GA)** with the **Sling TSi** (`9.53m` span × `7.175m` length × `2.45m` height) as the flagship reference airframe.

## Phase 1 Features Implemented

1. **Blueprint & Photo-to-3D Parametric Lofting Calibrator**:
   - Interactive 3-View Orthographic Blueprint Schematic (`Side Elevation`, `Top Planform`) with datum rulers (`Overall Length: 7.175m`, `Wingspan: 9.53m`, `Height: 2.45m`).
   - Upload custom 3-view blueprints and walkaround aircraft photos.
   - Real-time parametric airframe geometry re-lofting across 68 longitudinal fuselage stations, NACA 2415 laminar-flow low wings, upturned composite wingtips, swept empennage, and teardrop wheel pants (spats).
2. **Real-Time 3D WebGL PBR Livery Viewport**:
   - Powered by **Three.js + React Three Fiber** with `MeshPhysicalMaterial` supporting aerospace clearcoat, metallic flake, pearlescent mica, matte anti-glare, and polished bare Alclad/chrome.
   - Protected non-paint masks for the tinted bubble canopy glass, 3-blade scimitar propeller, and landing gear tires/struts.
   - Procedural flush-riveted Alclad panel seams, inspection bulkheads, and cowling NACA louvers.
3. **WYSIWYG 3D + 2D Vector Bezier & Registration Studio**:
   - **Synchronized 2D Orthographic Bezier Profile Editor**: Drag cubic Bezier control handles (`P0–P3`) and registration marks directly on the 2D orthographic aircraft silhouette while the 3D viewport updates at 60 FPS.
   - **Symmetric Tail Number (N-Number) Generator**: Port/Starboard mirroring that automatically keeps text readable Left-to-Right on both sides while slanting italic typography toward the tail, with live **FAA 14 CFR §45.29** physical height compliance checks.
   - **Aerospace Paint Swatch Library**: Pre-loaded with Sherwin-Williams Jet Glo / Acry Glo, AkzoNobel Aerodur, Mankiewicz, and Sling Aircraft OEM paint codes.
4. **AI Livery Co-Pilot (`/api/ai-livery`)**:
   - Prompt-to-Livery synthesizer that generates 3 editable multi-layer vector livery variations from natural language descriptions.
5. **2D Multi-View Orthographic Rendering Export to PDF**:
   - One-click generation of a 2-page Landscape **Engineering & Livery Proof Sheet PDF** featuring Port Profile, Starboard Profile, Top Planform, 3D Hero Render, dimension callouts, and an Aerospace Paint Bill of Materials (BOM) schedule.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Documentation

- [**Product Requirements Document (PRD) & Technical Design Document (TDD)**](./docs/PRD_AND_DESIGN.md)
