"use client";

import React from "react";
import {
  Copy,
  Eye,
  EyeOff,
  Plus,
  Sparkles,
  Stamp,
  Trash2,
  X,
} from "lucide-react";
import { useLiveryStore } from "@/store/useLiveryStore";
import { AVIATION_SWATCHES, FINISH_PRESETS } from "@/data/aviationCatalog";
import {
  AviationFinishType,
  LiverySchemePreset,
  RegistrationFont,
} from "@/types/livery";

const ZONE_META: {
  key: keyof LiverySchemePreset["zones"];
  label: string;
}[] = [
  { key: "fuselageBase", label: "Fuselage Skin" },
  { key: "verticalTail", label: "Vertical Tail" },
  { key: "wingBase", label: "Main Wings & H-Stab" },
  { key: "wingtips", label: "Wingtips" },
  { key: "cowlingAntiGlare", label: "Anti-Glare Cowl" },
  { key: "wheelPants", label: "Wheel Pants" },
  { key: "spinner", label: "Spinner" },
];

export default function Inline3DInspector() {
  const selected3DElement = useLiveryStore((s) => s.selected3DElement);
  const setSelected3DElement = useLiveryStore((s) => s.setSelected3DElement);

  const calibration = useLiveryStore((s) => s.calibration);
  const updateCalibration = useLiveryStore((s) => s.updateCalibration);

  const zones = useLiveryStore((s) => s.zones);
  const updateZonePaint = useLiveryStore((s) => s.updateZonePaint);

  const stripes = useLiveryStore((s) => s.stripes);
  const addStripe = useLiveryStore((s) => s.addStripe);
  const updateStripe = useLiveryStore((s) => s.updateStripe);
  const removeStripe = useLiveryStore((s) => s.removeStripe);
  const duplicateStripe = useLiveryStore((s) => s.duplicateStripe);

  const registration = useLiveryStore((s) => s.registration);
  const updateRegistration = useLiveryStore((s) => s.updateRegistration);

  if (!selected3DElement) return null;

  return (
    <div
      className="absolute bottom-3 right-3 z-20 w-80 max-h-[calc(100%-6.5rem)] flex flex-col rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700/90 shadow-2xl text-slate-100 overflow-hidden"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-950/90 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
          <span className="text-xs font-bold tracking-wide truncate">
            {selected3DElement.kind === "REGISTRATION"
              ? `N-Number: ${registration.text || "Tail Reg"}`
              : selected3DElement.kind === "STRIPE"
                ? "Stripe Curve"
                : selected3DElement.label}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSelected3DElement({ kind: "REGISTRATION" })}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition ${
              selected3DElement.kind === "REGISTRATION"
                ? "bg-sky-500/20 border-sky-500/50 text-sky-300"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
            title="Edit N-Number"
          >
            <Stamp className="w-3 h-3 inline mr-0.5" />
            Reg
          </button>
          <button
            type="button"
            onClick={() => addStripe("FUSELAGE_TAIL")}
            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:border-sky-500/50 hover:text-sky-300 transition"
            title="Add New Stripe"
          >
            <Plus className="w-3 h-3 inline" />
            Stripe
          </button>
          <button
            type="button"
            onClick={() => setSelected3DElement(null)}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Close inline config"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="p-3 space-y-3 overflow-y-auto text-xs">
        {selected3DElement.kind === "REGISTRATION" && (
          <>
            <div className="px-2.5 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-[11px] text-sky-300">
              Drag the N-Number handle directly on the 3D fuselage to reposition.
            </div>

            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={registration.enabled}
                  onChange={(e) =>
                    updateRegistration({ enabled: e.target.checked })
                  }
                  className="accent-sky-500"
                />
                <span>Show N-Number</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={registration.symmetry}
                  onChange={(e) =>
                    updateRegistration({ symmetry: e.target.checked })
                  }
                  className="accent-sky-500"
                />
                <span>Both Sides</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">
                  Tail Number
                </label>
                <input
                  type="text"
                  value={registration.text}
                  onChange={(e) =>
                    updateRegistration({ text: e.target.value.toUpperCase() })
                  }
                  className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs font-bold tracking-wider uppercase focus:border-sky-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">
                  Font Style
                </label>
                <select
                  value={registration.font}
                  onChange={(e) =>
                    updateRegistration({
                      font: e.target.value as RegistrationFont,
                    })
                  }
                  className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs focus:border-sky-500 focus:outline-none"
                >
                  <option value="AERO_ITALIC">Aero Sport Slant</option>
                  <option value="FAA_BLOCK">FAA Block</option>
                  <option value="MIL_STENCIL">Mil Stencil</option>
                  <option value="EXEC_SANS">Executive Sans</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                  <span>Height</span>
                  <span className="font-mono text-sky-300">
                    {registration.heightInches.toFixed(1)} in
                  </span>
                </div>
                <input
                  type="range"
                  min={6}
                  max={24}
                  step={0.5}
                  value={registration.heightInches}
                  onChange={(e) =>
                    updateRegistration({
                      heightInches: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-sky-500"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                  <span>Slant</span>
                  <span className="font-mono text-sky-300">
                    {registration.slantDeg}°
                  </span>
                </div>
                <input
                  type="range"
                  min={-20}
                  max={30}
                  step={1}
                  value={registration.slantDeg}
                  onChange={(e) =>
                    updateRegistration({
                      slantDeg: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full accent-sky-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-400">
                  Color & Finish
                </span>
                <input
                  type="color"
                  value={registration.colorHex}
                  onChange={(e) =>
                    updateRegistration({ colorHex: e.target.value })
                  }
                  className="w-6 h-5 rounded bg-transparent cursor-pointer"
                />
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {AVIATION_SWATCHES.slice(0, 12).map((sw) => (
                  <button
                    key={sw.id}
                    type="button"
                    onClick={() =>
                      updateRegistration({
                        colorHex: sw.hex,
                        paintCode: sw.paintCode,
                      })
                    }
                    title={sw.name}
                    className={`w-5 h-5 rounded border transition ${
                      registration.colorHex.toLowerCase() ===
                      sw.hex.toLowerCase()
                        ? "border-sky-400 scale-110"
                        : "border-slate-700"
                    }`}
                    style={{ backgroundColor: sw.hex }}
                  />
                ))}
              </div>
              <select
                value={registration.finish}
                onChange={(e) =>
                  updateRegistration({
                    finish: e.target.value as AviationFinishType,
                  })
                }
                className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs"
              >
                {Object.values(FINISH_PRESETS).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={registration.outlineEnabled}
                    onChange={(e) =>
                      updateRegistration({ outlineEnabled: e.target.checked })
                    }
                    className="accent-sky-500"
                  />
                  <span>Outline / Drop Shadow</span>
                </label>
                {registration.outlineEnabled && (
                  <input
                    type="color"
                    value={registration.outlineColorHex}
                    onChange={(e) =>
                      updateRegistration({ outlineColorHex: e.target.value })
                    }
                    className="w-6 h-5 rounded bg-transparent cursor-pointer"
                  />
                )}
              </div>
              {registration.outlineEnabled && (
                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                    <span>Outline Width</span>
                    <span className="font-mono text-sky-300">
                      {registration.outlineWidth.toFixed(1)} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={6}
                    step={0.5}
                    value={registration.outlineWidth}
                    onChange={(e) =>
                      updateRegistration({
                        outlineWidth: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-sky-500"
                  />
                </div>
              )}
            </div>
          </>
        )}

        {selected3DElement.kind === "STRIPE" && (() => {
          const activeStripe = stripes.find(
            (s) => s.id === selected3DElement.stripeId
          );
          if (!activeStripe) {
            return (
              <div className="text-slate-400 text-xs">
                Stripe not found. Click another stripe or add a new one.
              </div>
            );
          }

          return (
            <>
              <div className="px-2.5 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-[11px] text-sky-300">
                Drag P0–P3 spheres directly on the 3D fuselage to reshape curve.
              </div>

              {/* Stripe switcher pills */}
              <div className="flex flex-wrap gap-1">
                {stripes.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setSelected3DElement({ kind: "STRIPE", stripeId: s.id })
                    }
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition ${
                      s.id === activeStripe.id
                        ? "bg-sky-500/20 border-sky-500/50 text-sky-200"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: s.colorHex }}
                    />
                    <span className="truncate max-w-[90px]">{s.name}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={activeStripe.name}
                  onChange={(e) =>
                    updateStripe(activeStripe.id, { name: e.target.value })
                  }
                  className="flex-1 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs focus:border-sky-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() =>
                    updateStripe(activeStripe.id, {
                      visible: !activeStripe.visible,
                    })
                  }
                  className="p-1.5 rounded bg-slate-950 border border-slate-700 text-slate-300 hover:text-white"
                  title="Toggle Visibility"
                >
                  {activeStripe.visible ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => duplicateStripe(activeStripe.id)}
                  className="p-1.5 rounded bg-slate-950 border border-slate-700 text-slate-300 hover:text-white"
                  title="Duplicate Stripe"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeStripe(activeStripe.id)}
                  className="p-1.5 rounded bg-slate-950 border border-slate-700 text-rose-400 hover:text-rose-300"
                  title="Delete Stripe"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeStripe.symmetry}
                    onChange={(e) =>
                      updateStripe(activeStripe.id, {
                        symmetry: e.target.checked,
                      })
                    }
                    className="accent-sky-500"
                  />
                  <span>Mirror Both Sides</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(activeStripe.fillBelowCurve)}
                    onChange={(e) =>
                      updateStripe(activeStripe.id, {
                        fillBelowCurve: e.target.checked,
                      })
                    }
                    className="accent-sky-500"
                  />
                  <span>Fill Belly Below</span>
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-400">
                    Color & Finish
                  </span>
                  <input
                    type="color"
                    value={activeStripe.colorHex}
                    onChange={(e) =>
                      updateStripe(activeStripe.id, {
                        colorHex: e.target.value,
                      })
                    }
                    className="w-6 h-5 rounded bg-transparent cursor-pointer"
                  />
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {AVIATION_SWATCHES.slice(0, 12).map((sw) => (
                    <button
                      key={sw.id}
                      type="button"
                      onClick={() =>
                        updateStripe(activeStripe.id, {
                          colorHex: sw.hex,
                          paintCode: sw.paintCode,
                          colorName: sw.name,
                        })
                      }
                      title={sw.name}
                      className={`w-5 h-5 rounded border transition ${
                        activeStripe.colorHex.toLowerCase() ===
                        sw.hex.toLowerCase()
                          ? "border-sky-400 scale-110"
                          : "border-slate-700"
                      }`}
                      style={{ backgroundColor: sw.hex }}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={activeStripe.finish}
                    onChange={(e) =>
                      updateStripe(activeStripe.id, {
                        finish: e.target.value as AviationFinishType,
                      })
                    }
                    className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs"
                  >
                    {Object.values(FINISH_PRESETS).map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Opacity</span>
                      <span>{Math.round(activeStripe.opacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={activeStripe.opacity}
                      onChange={(e) =>
                        updateStripe(activeStripe.id, {
                          opacity: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-sky-500"
                    />
                  </div>
                </div>
              </div>

              {/* Widths */}
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["widthStart", "Start"],
                    ["widthMid", "Mid"],
                    ["widthEnd", "End"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>{label}</span>
                      <span>{(activeStripe[key] * 100).toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={0.004}
                      max={0.14}
                      step={0.002}
                      value={activeStripe[key]}
                      onChange={(e) =>
                        updateStripe(activeStripe.id, {
                          [key]: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-sky-500"
                    />
                  </div>
                ))}
              </div>

              {/* Pinstripe */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeStripe.pinstripeEnabled}
                      onChange={(e) =>
                        updateStripe(activeStripe.id, {
                          pinstripeEnabled: e.target.checked,
                        })
                      }
                      className="accent-sky-500"
                    />
                    <span>Accent Pinstripe</span>
                  </label>
                  {activeStripe.pinstripeEnabled && (
                    <input
                      type="color"
                      value={activeStripe.pinstripeColorHex}
                      onChange={(e) =>
                        updateStripe(activeStripe.id, {
                          pinstripeColorHex: e.target.value,
                        })
                      }
                      className="w-6 h-5 rounded bg-transparent cursor-pointer"
                    />
                  )}
                </div>
                {activeStripe.pinstripeEnabled && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Offset</span>
                        <span>{activeStripe.pinstripeOffset.toFixed(3)}</span>
                      </div>
                      <input
                        type="range"
                        min={-0.12}
                        max={0.12}
                        step={0.005}
                        value={activeStripe.pinstripeOffset}
                        onChange={(e) =>
                          updateStripe(activeStripe.id, {
                            pinstripeOffset: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-sky-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Width</span>
                        <span>{activeStripe.pinstripeWidth.toFixed(3)}</span>
                      </div>
                      <input
                        type="range"
                        min={0.002}
                        max={0.04}
                        step={0.002}
                        value={activeStripe.pinstripeWidth}
                        onChange={(e) =>
                          updateStripe(activeStripe.id, {
                            pinstripeWidth: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-sky-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          );
        })()}

        {selected3DElement.kind === "ZONE" && (() => {
          const zKey = selected3DElement.zoneKey;
          const zone = zones[zKey];
          return (
            <>
              {/* Quick Zone Switcher */}
              <div className="flex flex-wrap gap-1">
                {ZONE_META.map((zm) => (
                  <button
                    key={zm.key}
                    type="button"
                    onClick={() =>
                      setSelected3DElement({
                        kind: "ZONE",
                        zoneKey: zm.key,
                        label: zm.label,
                      })
                    }
                    className={`px-2 py-0.5 rounded text-[10px] border transition ${
                      zm.key === zKey
                        ? "bg-sky-500/20 border-sky-500/50 text-sky-200"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {zm.label}
                  </button>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-400">
                    {zone.colorName} ({zone.paintCode})
                  </span>
                  <input
                    type="color"
                    value={zone.colorHex}
                    onChange={(e) =>
                      updateZonePaint(zKey, {
                        colorHex: e.target.value,
                        colorName: "Custom Hex",
                        paintCode: "CUSTOM",
                      })
                    }
                    className="w-6 h-5 rounded bg-transparent cursor-pointer"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {AVIATION_SWATCHES.map((sw) => (
                    <button
                      key={sw.id}
                      type="button"
                      onClick={() =>
                        updateZonePaint(zKey, {
                          colorHex: sw.hex,
                          paintCode: sw.paintCode,
                          colorName: sw.name,
                        })
                      }
                      title={`${sw.name} (${sw.paintCode})`}
                      className={`w-5 h-5 rounded border transition ${
                        zone.colorHex.toLowerCase() === sw.hex.toLowerCase()
                          ? "border-sky-400 scale-110"
                          : "border-slate-700"
                      }`}
                      style={{ backgroundColor: sw.hex }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">
                  <Sparkles className="w-3 h-3 inline mr-1 text-sky-400" />
                  Surface Finish
                </label>
                <select
                  value={zone.finish}
                  onChange={(e) =>
                    updateZonePaint(zKey, {
                      finish: e.target.value as AviationFinishType,
                    })
                  }
                  className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs"
                >
                  {Object.values(FINISH_PRESETS).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              {zKey === "cowlingAntiGlare" && (
                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={calibration.antiGlareMaskEnabled}
                    onChange={(e) =>
                      updateCalibration({
                        antiGlareMaskEnabled: e.target.checked,
                      })
                    }
                    className="accent-sky-500"
                  />
                  <span>Enable Nose Anti-Glare Panel</span>
                </label>
              )}

              {zKey === "wheelPants" && (
                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={calibration.wheelPantsInstalled}
                    onChange={(e) =>
                      updateCalibration({
                        wheelPantsInstalled: e.target.checked,
                      })
                    }
                    className="accent-sky-500"
                  />
                  <span>Wheel Fairings (Spats) Installed</span>
                </label>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
