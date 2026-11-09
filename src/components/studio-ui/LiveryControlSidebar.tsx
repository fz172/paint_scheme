"use client";

import React, { useState } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Layers,
  Palette,
  Plus,
  Sparkles,
  Stamp,
  Trash2,
  Wand2,
} from "lucide-react";
import { useLiveryStore } from "@/store/useLiveryStore";
import {
  AVIATION_SWATCHES,
  FINISH_PRESETS,
  SLING_TSI_PRESETS,
} from "@/data/aviationCatalog";
import {
  AviationFinishType,
  LiverySchemePreset,
  RegistrationFont,
} from "@/types/livery";
import { synthesizeParametricAIConcepts } from "@/engine/aiLiveryGenerator";

const QUICK_AI_PROMPTS = [
  "Sling Factory sport scheme in Matterhorn White, Corsair Midnight Blue & Blaze Orange pinstripes",
  "Executive tourer in Platinum Mist Metallic with Midnight Blue sweep and Champagne Gold accents",
  "Tactical Stealth Raptor in Anthracite Gunmetal, Carbon Matte anti-glare nose, and Daytona Viper Red slash",
  "Alpine Emerald Pearl & Glacier White with Sahara Bronze metallic ribbons",
  "Polished Bare Alclad Silver heritage racer with Bordeaux Crimson and Gold striping",
];

const ZONE_LABELS: {
  key: keyof LiverySchemePreset["zones"];
  label: string;
  sub: string;
}[] = [
  {
    key: "fuselageBase",
    label: "Fuselage & Tailcone Skin",
    sub: "Primary Alclad skin coat",
  },
  {
    key: "verticalTail",
    label: "Vertical Stabilizer & Rudder",
    sub: "Swept tail fin zone",
  },
  {
    key: "wingtips",
    label: "Composite Upturned Wingtips",
    sub: "Port & Starboard outer 10% span",
  },
  {
    key: "cowlingAntiGlare",
    label: "Nose Cowling Anti-Glare Panel",
    sub: "Upper forward cowl ahead of canopy",
  },
  {
    key: "wheelPants",
    label: "Wheel Fairings (Spats)",
    sub: "Nose + Main gear teardrop fairings",
  },
  {
    key: "wingBase",
    label: "Main Wings & Horizontal Stab",
    sub: "Laminar NACA 2415 wing skins",
  },
  {
    key: "spinner",
    label: "Propeller Spinner Cone",
    sub: "Forward nose cone dome",
  },
];

export default function LiveryControlSidebar() {
  const activeSidePanel = useLiveryStore((s) => s.activeSidePanel);
  const setActiveSidePanel = useLiveryStore((s) => s.setActiveSidePanel);

  const zones = useLiveryStore((s) => s.zones);
  const updateZonePaint = useLiveryStore((s) => s.updateZonePaint);

  const stripes = useLiveryStore((s) => s.stripes);
  const selectedStripeId = useLiveryStore((s) => s.selectedStripeId);
  const setSelectedStripeId = useLiveryStore((s) => s.setSelectedStripeId);
  const addStripe = useLiveryStore((s) => s.addStripe);
  const updateStripe = useLiveryStore((s) => s.updateStripe);
  const removeStripe = useLiveryStore((s) => s.removeStripe);
  const duplicateStripe = useLiveryStore((s) => s.duplicateStripe);

  const registration = useLiveryStore((s) => s.registration);
  const updateRegistration = useLiveryStore((s) => s.updateRegistration);

  const decals = useLiveryStore((s) => s.decals);
  const updateDecal = useLiveryStore((s) => s.updateDecal);

  const applySchemePreset = useLiveryStore((s) => s.applySchemePreset);
  const aiConcepts = useLiveryStore((s) => s.aiConcepts);
  const addAIConcepts = useLiveryStore((s) => s.addAIConcepts);

  const [selectedZoneKey, setSelectedZoneKey] =
    useState<keyof LiverySchemePreset["zones"]>("fuselageBase");
  const [aiPrompt, setAiPrompt] = useState(QUICK_AI_PROMPTS[0]);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  const activeStripe = stripes.find((s) => s.id === selectedStripeId) || null;
  const activeZone = zones[selectedZoneKey];

  const handleGenerateAILivery = async () => {
    if (!aiPrompt.trim()) return;
    setIsGeneratingAI(true);
    try {
      const res = await fetch("/api/ai-livery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          tailNumber: registration.text,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.concepts?.length) {
          addAIConcepts(data.concepts);
          applySchemePreset(data.concepts[0].presetData);
        }
      } else {
        const fallback = synthesizeParametricAIConcepts(
          aiPrompt,
          registration.text
        );
        addAIConcepts(fallback);
        applySchemePreset(fallback[0].presetData);
      }
    } catch {
      const fallback = synthesizeParametricAIConcepts(
        aiPrompt,
        registration.text
      );
      addAIConcepts(fallback);
      applySchemePreset(fallback[0].presetData);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  return (
    <aside className="w-full lg:w-[410px] h-full flex flex-col bg-slate-900 border-l border-slate-800 text-slate-100 select-none shrink-0">
      {/* 5-Tab Navigation Bar */}
      <div className="grid grid-cols-5 border-b border-slate-800 bg-slate-950/60 p-1 gap-1">
        {[
          { id: "AI_COPILOT", label: "AI Prompt", icon: Sparkles },
          { id: "ZONES", label: "Zones", icon: Palette },
          { id: "STRIPES", label: "Stripes", icon: Layers },
          { id: "REGISTRATION", label: "N-Number", icon: Stamp },
          { id: "PRESETS", label: "Presets", icon: Wand2 },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeSidePanel === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                setActiveSidePanel(
                  tab.id as Parameters<typeof setActiveSidePanel>[0]
                )
              }
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-[11px] font-medium transition ${
                active
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Icon className="w-4 h-4 mb-1" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Scrollable Panel Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* TAB 1: AI LIVERY CO-PILOT */}
        {activeSidePanel === "AI_COPILOT" && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-gradient-to-br from-sky-500/15 via-slate-900 to-indigo-500/10 border border-sky-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI Parametric Livery Synthesizer
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-200">
                  Sling TSi UV-Aware
                </span>
              </div>

              <textarea
                rows={3}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe your desired Sling TSi paint scheme, colors, finishes (gloss, metallic, matte), and swoosh style..."
                className="w-full rounded-lg bg-slate-950/90 border border-slate-700/80 focus:border-sky-400 focus:outline-none p-2.5 text-xs text-slate-100 placeholder-slate-500 resize-none"
              />

              <button
                type="button"
                onClick={handleGenerateAILivery}
                disabled={isGeneratingAI}
                className="w-full py-2.5 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 transition"
              >
                <Wand2 className="w-4 h-4" />
                {isGeneratingAI
                  ? "Synthesizing 3 Vector Livery Concepts..."
                  : "Generate 3 Editable AI Livery Concepts"}
              </button>
            </div>

            {/* Quick Prompt Inspiration Pills */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Sample Aviation Prompts
              </span>
              <div className="space-y-1.5">
                {QUICK_AI_PROMPTS.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAiPrompt(q)}
                    className="w-full text-left p-2 rounded-lg bg-slate-950/70 hover:bg-slate-800/80 border border-slate-800 text-[11px] text-slate-300 transition line-clamp-2"
                  >
                    &ldquo;{q}&rdquo;
                  </button>
                ))}
              </div>
            </div>

            {/* Generated Concepts List */}
            {aiConcepts.length > 0 && (
              <div className="space-y-2.5 pt-2 border-t border-slate-800">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                  Generated Concepts (Click to Apply & Edit in WYSIWYG)
                </span>
                <div className="space-y-2.5">
                  {aiConcepts.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => applySchemePreset(c.presetData)}
                      className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-sky-500/50 cursor-pointer transition space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">
                          {c.title}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {c.createdAt}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {c.rationale}
                      </p>
                      <div className="flex items-center gap-1.5 pt-1">
                        {[
                          c.presetData.zones.fuselageBase.colorHex,
                          c.presetData.zones.verticalTail.colorHex,
                          c.presetData.zones.wingtips.colorHex,
                          ...(c.presetData.stripes.map((s) => s.colorHex) || []),
                        ]
                          .slice(0, 5)
                          .map((hex, i) => (
                            <span
                              key={i}
                              className="w-5 h-5 rounded-full border border-slate-600 shadow-sm"
                              style={{ backgroundColor: hex }}
                            />
                          ))}
                        <span className="ml-auto text-[11px] font-semibold text-sky-400">
                          Apply →
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: AIRFRAME PAINT ZONES */}
        {activeSidePanel === "ZONES" && (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                1. Select Airframe Zone
              </label>
              <div className="space-y-1.5">
                {ZONE_LABELS.map((z) => {
                  const spec = zones[z.key];
                  const isSel = selectedZoneKey === z.key;
                  return (
                    <button
                      key={z.key}
                      type="button"
                      onClick={() => setSelectedZoneKey(z.key)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition ${
                        isSel
                          ? "bg-sky-500/15 border-sky-500/60"
                          : "bg-slate-950/70 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-6 h-6 rounded-md border border-slate-600 shrink-0 shadow-inner"
                          style={{ backgroundColor: spec.colorHex }}
                        />
                        <div>
                          <div className="text-xs font-semibold text-slate-100">
                            {z.label}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {spec.colorName} ({spec.paintCode}) •{" "}
                            {FINISH_PRESETS[spec.finish]?.label}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Finish Selector for Active Zone */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                2. Aviation Coating Finish ({activeZone.finish})
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.values(FINISH_PRESETS).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() =>
                      updateZonePaint(selectedZoneKey, { finish: f.id })
                    }
                    className={`p-2 rounded-lg border text-left transition ${
                      activeZone.finish === f.id
                        ? "bg-sky-500/20 border-sky-400 text-sky-200"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <div className="text-[11px] font-semibold">{f.label}</div>
                    <div className="text-[9px] text-slate-400 truncate">
                      {f.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Aerospace Swatch Picker */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  3. Aerospace Paint Swatch Catalog
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">Custom:</span>
                  <input
                    type="color"
                    value={activeZone.colorHex}
                    onChange={(e) =>
                      updateZonePaint(selectedZoneKey, {
                        colorHex: e.target.value.toUpperCase(),
                        colorName: "Custom Spec",
                        paintCode: `CS-${e.target.value.slice(1).toUpperCase()}`,
                      })
                    }
                    className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {AVIATION_SWATCHES.map((sw) => {
                  const isCurrent =
                    activeZone.colorHex.toLowerCase() === sw.hex.toLowerCase();
                  return (
                    <button
                      key={sw.id}
                      type="button"
                      onClick={() =>
                        updateZonePaint(selectedZoneKey, {
                          colorHex: sw.hex,
                          paintCode: sw.paintCode,
                          colorName: sw.name,
                          finish: sw.defaultFinish,
                        })
                      }
                      className={`group relative flex flex-col items-center p-1.5 rounded-lg border transition ${
                        isCurrent
                          ? "border-sky-400 bg-sky-500/15"
                          : "border-slate-800 bg-slate-950 hover:border-slate-700"
                      }`}
                    >
                      <div
                        className="w-full h-7 rounded border border-slate-700/80 flex items-center justify-center"
                        style={{ backgroundColor: sw.hex }}
                      >
                        {isCurrent && (
                          <Check className="w-3.5 h-3.5 text-sky-400 drop-shadow" />
                        )}
                      </div>
                      <span className="text-[10px] font-medium text-slate-200 mt-1 truncate w-full text-center">
                        {sw.name}
                      </span>
                      <span className="text-[9px] font-mono text-slate-500">
                        {sw.paintCode}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: VECTOR BEZIER STRIPES & SWOOSHES */}
        {activeSidePanel === "STRIPES" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Vector Stripe Layers ({stripes.length})
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => addStripe("FUSELAGE_TAIL")}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Fuselage Stripe
                </button>
                <button
                  type="button"
                  onClick={() => addStripe("WHEEL_PANTS")}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Spat Stripe
                </button>
              </div>
            </div>

            {/* Stripe Layer Stack */}
            <div className="space-y-1.5">
              {stripes.map((s) => {
                const isSel = s.id === selectedStripeId;
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedStripeId(s.id)}
                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition ${
                      isSel
                        ? "bg-sky-500/15 border-sky-500/60"
                        : "bg-slate-950/70 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-5 h-5 rounded border border-slate-600 shrink-0"
                        style={{ backgroundColor: s.colorHex }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-100 truncate">
                          {s.name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {s.targetZone === "WHEEL_PANTS"
                            ? "Wheel Fairings"
                            : "Fuselage & Tail"}{" "}
                          • {s.paintCode}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateStripe(s.id, { visible: !s.visible });
                        }}
                        className="p-1 text-slate-400 hover:text-slate-100"
                        title="Toggle visibility"
                      >
                        {s.visible ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateStripe(s.id);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-100"
                        title="Duplicate stripe"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeStripe(s.id);
                        }}
                        className="p-1 text-slate-400 hover:text-rose-400"
                        title="Delete stripe"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Active Stripe Inspector */}
            {activeStripe && (
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase text-slate-400">
                    Layer Name
                  </label>
                  <input
                    type="text"
                    value={activeStripe.name}
                    onChange={(e) =>
                      updateStripe(activeStripe.id, { name: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white"
                  />
                </div>

                {/* Color & Finish Row */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase text-slate-400">
                      Stripe Swatch & Coating
                    </span>
                    <input
                      type="color"
                      value={activeStripe.colorHex}
                      onChange={(e) =>
                        updateStripe(activeStripe.id, {
                          colorHex: e.target.value.toUpperCase(),
                          paintCode: `CS-${e.target.value.slice(1).toUpperCase()}`,
                          colorName: "Custom Stripe",
                        })
                      }
                      className="w-5 h-5 rounded cursor-pointer bg-transparent"
                    />
                  </div>
                  <div className="grid grid-cols-8 gap-1.5">
                    {AVIATION_SWATCHES.map((sw) => (
                      <button
                        key={sw.id}
                        type="button"
                        onClick={() =>
                          updateStripe(activeStripe.id, {
                            colorHex: sw.hex,
                            paintCode: sw.paintCode,
                            colorName: sw.name,
                            finish: sw.defaultFinish,
                          })
                        }
                        title={`${sw.name} (${sw.paintCode})`}
                        className={`h-6 rounded border ${
                          activeStripe.colorHex.toLowerCase() ===
                          sw.hex.toLowerCase()
                            ? "border-sky-400 scale-110"
                            : "border-slate-700"
                        }`}
                        style={{ backgroundColor: sw.hex }}
                      />
                    ))}
                  </div>

                  <select
                    value={activeStripe.finish}
                    onChange={(e) =>
                      updateStripe(activeStripe.id, {
                        finish: e.target.value as AviationFinishType,
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200"
                  >
                    {Object.values(FINISH_PRESETS).map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Taper Width Sliders */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <span className="text-[10px] font-semibold uppercase text-slate-400">
                    Aerodynamic Taper Widths (Start / Mid / Tail)
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1">
                        Nose: {(activeStripe.widthStart * 245).toFixed(0)}cm
                      </div>
                      <input
                        type="range"
                        min={0.004}
                        max={0.12}
                        step={0.002}
                        value={activeStripe.widthStart}
                        onChange={(e) =>
                          updateStripe(activeStripe.id, {
                            widthStart: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-sky-400"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1">
                        Waist: {(activeStripe.widthMid * 245).toFixed(0)}cm
                      </div>
                      <input
                        type="range"
                        min={0.006}
                        max={0.18}
                        step={0.002}
                        value={activeStripe.widthMid}
                        onChange={(e) =>
                          updateStripe(activeStripe.id, {
                            widthMid: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-sky-400"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1">
                        Tail: {(activeStripe.widthEnd * 245).toFixed(0)}cm
                      </div>
                      <input
                        type="range"
                        min={0.004}
                        max={0.22}
                        step={0.002}
                        value={activeStripe.widthEnd}
                        onChange={(e) =>
                          updateStripe(activeStripe.id, {
                            widthEnd: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-sky-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Secondary Pinstripe Controls */}
                <div className="space-y-2.5 pt-2 border-t border-slate-800">
                  <label className="flex items-center justify-between text-xs cursor-pointer">
                    <span className="font-semibold text-slate-300">
                      Secondary Offset Pinstripe
                    </span>
                    <input
                      type="checkbox"
                      checked={activeStripe.pinstripeEnabled}
                      onChange={(e) =>
                        updateStripe(activeStripe.id, {
                          pinstripeEnabled: e.target.checked,
                        })
                      }
                      className="rounded accent-sky-500 w-4 h-4"
                    />
                  </label>

                  {activeStripe.pinstripeEnabled && (
                    <div className="grid grid-cols-3 gap-2 items-center">
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-1">
                          Pin Color
                        </span>
                        <input
                          type="color"
                          value={activeStripe.pinstripeColorHex}
                          onChange={(e) =>
                            updateStripe(activeStripe.id, {
                              pinstripeColorHex: e.target.value.toUpperCase(),
                            })
                          }
                          className="w-full h-7 rounded cursor-pointer bg-transparent"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-1">
                          Gap Offset
                        </span>
                        <input
                          type="range"
                          min={-0.1}
                          max={0.1}
                          step={0.004}
                          value={activeStripe.pinstripeOffset}
                          onChange={(e) =>
                            updateStripe(activeStripe.id, {
                              pinstripeOffset: parseFloat(e.target.value),
                            })
                          }
                          className="w-full accent-sky-400"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-1">
                          Pin Width
                        </span>
                        <input
                          type="range"
                          min={0.004}
                          max={0.05}
                          step={0.002}
                          value={activeStripe.pinstripeWidth}
                          onChange={(e) =>
                            updateStripe(activeStripe.id, {
                              pinstripeWidth: parseFloat(e.target.value),
                            })
                          }
                          className="w-full accent-sky-400"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Bilateral Symmetry Toggle */}
                <label className="flex items-center justify-between text-xs pt-2 border-t border-slate-800 cursor-pointer">
                  <span className="text-slate-300">
                    Mirror Port ↔ Starboard Symmetry
                  </span>
                  <input
                    type="checkbox"
                    checked={activeStripe.symmetry}
                    onChange={(e) =>
                      updateStripe(activeStripe.id, {
                        symmetry: e.target.checked,
                      })
                    }
                    className="rounded accent-sky-500 w-4 h-4"
                  />
                </label>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: TAIL REGISTRATION (N-NUMBER) & EMBLEMS */}
        {activeSidePanel === "REGISTRATION" && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white">
                  Tail Registration (N-Number)
                </label>
                <input
                  type="checkbox"
                  checked={registration.enabled}
                  onChange={(e) =>
                    updateRegistration({ enabled: e.target.checked })
                  }
                  className="rounded accent-sky-500 w-4 h-4"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-semibold uppercase text-slate-400 block mb-1">
                    Registration Marks
                  </label>
                  <input
                    type="text"
                    maxLength={8}
                    value={registration.text}
                    onChange={(e) =>
                      updateRegistration({
                        text: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-700 font-mono font-bold text-sm text-sky-300 uppercase"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold uppercase text-slate-400 block mb-1">
                    Typography Style
                  </label>
                  <select
                    value={registration.font}
                    onChange={(e) =>
                      updateRegistration({
                        font: e.target.value as RegistrationFont,
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200"
                  >
                    <option value="AERO_ITALIC">Aero Sport Slant</option>
                    <option value="FAA_BLOCK">FAA Regulation Block</option>
                    <option value="MIL_STENCIL">Tactical Stencil</option>
                    <option value="EXEC_SANS">Executive Sans</option>
                  </select>
                </div>
              </div>

              {/* Physical Height & FAA Compliance Badge */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Physical Letter Height</span>
                  <span className="font-mono text-sky-400">
                    {registration.heightInches.toFixed(1)} in (
                    {(registration.heightInches * 2.54).toFixed(1)} cm)
                  </span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={18}
                  step={0.5}
                  value={registration.heightInches}
                  onChange={(e) =>
                    updateRegistration({
                      heightInches: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-sky-400"
                />
                <div
                  className={`text-[10px] px-2.5 py-1 rounded border font-mono ${
                    registration.heightInches >= 12
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "bg-amber-500/15 border-amber-500/40 text-amber-300"
                  }`}
                >
                  {registration.heightInches >= 12
                    ? "✓ Complies with 14 CFR §45.29 Standard 12-inch Fuselage Marks"
                    : "✓ Complies with 14 CFR §45.29(b)(1)(iii) 3-inch Experimental Marks (<180 kt)"}
                </div>
              </div>

              {/* Slant Angle & Position */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[10px] text-slate-400 block mb-1">
                    Slant ({registration.slantDeg}°)
                  </span>
                  <input
                    type="range"
                    min={-20}
                    max={25}
                    step={1}
                    value={registration.slantDeg}
                    onChange={(e) =>
                      updateRegistration({
                        slantDeg: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-sky-400"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-1">
                    Station X
                  </span>
                  <input
                    type="range"
                    min={0.35}
                    max={0.92}
                    step={0.01}
                    value={registration.positionX}
                    onChange={(e) =>
                      updateRegistration({
                        positionX: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-sky-400"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-1">
                    Waterline Y
                  </span>
                  <input
                    type="range"
                    min={0.3}
                    max={0.88}
                    step={0.01}
                    value={registration.positionY}
                    onChange={(e) =>
                      updateRegistration({
                        positionY: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-sky-400"
                  />
                </div>
              </div>

              {/* Fill & Outline Colors */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-400 block mb-1">
                    Fill Color
                  </span>
                  <input
                    type="color"
                    value={registration.colorHex}
                    onChange={(e) =>
                      updateRegistration({
                        colorHex: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-full h-8 rounded cursor-pointer bg-transparent"
                  />
                </div>
                <div>
                  <label className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span>Outline Stroke</span>
                    <input
                      type="checkbox"
                      checked={registration.outlineEnabled}
                      onChange={(e) =>
                        updateRegistration({
                          outlineEnabled: e.target.checked,
                        })
                      }
                      className="rounded accent-sky-500"
                    />
                  </label>
                  <input
                    type="color"
                    value={registration.outlineColorHex}
                    disabled={!registration.outlineEnabled}
                    onChange={(e) =>
                      updateRegistration({
                        outlineColorHex: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-full h-8 rounded cursor-pointer bg-transparent disabled:opacity-40"
                  />
                </div>
              </div>
            </div>

            {/* Sling Tail Emblem Card */}
            {decals.map((d) => (
              <div
                key={d.id}
                className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">
                    {d.name}
                  </span>
                  <input
                    type="checkbox"
                    checked={d.visible}
                    onChange={(e) =>
                      updateDecal(d.id, { visible: e.target.checked })
                    }
                    className="rounded accent-sky-500 w-4 h-4"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">
                      Emblem Color
                    </span>
                    <input
                      type="color"
                      value={d.colorHex}
                      onChange={(e) =>
                        updateDecal(d.id, {
                          colorHex: e.target.value.toUpperCase(),
                        })
                      }
                      className="w-full h-7 rounded cursor-pointer bg-transparent"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">
                      Badge Scale ({d.scale.toFixed(1)}x)
                    </span>
                    <input
                      type="range"
                      min={0.4}
                      max={2.0}
                      step={0.1}
                      value={d.scale}
                      onChange={(e) =>
                        updateDecal(d.id, {
                          scale: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-sky-400"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 5: CURATED SLING TSi FACTORY & CUSTOM PRESETS */}
        {activeSidePanel === "PRESETS" && (
          <div className="space-y-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Signature Sling TSi Livery Schemes
            </span>
            {SLING_TSI_PRESETS.map((preset) => (
              <div
                key={preset.id}
                onClick={() => applySchemePreset(preset)}
                className="p-3.5 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-sky-500/50 cursor-pointer transition space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    {preset.name}
                  </span>
                  <span className="text-[11px] font-semibold text-sky-400">
                    Load Scheme →
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {preset.tagline}
                </p>
                <div className="flex items-center gap-2 pt-1">
                  {[
                    preset.zones.fuselageBase,
                    preset.zones.verticalTail,
                    preset.zones.wingtips,
                    preset.zones.cowlingAntiGlare,
                  ].map((z, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: z.colorHex }}
                      />
                      <span className="truncate max-w-[65px]">{z.colorName}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
