"use client";

interface CabinetPresetPickerProps {
  style: "shaker" | "flat";
  color: string;
  onStyleChange: (s: "shaker" | "flat") => void;
  onColorChange: (c: string) => void;
}

const PRESET_COLORS = [
  "#8b7355",
  "#c4a77d",
  "#4a3728",
  "#f5f5dc",
  "#2c1810",
  "#6b5344",
];

export default function CabinetPresetPicker({
  style,
  color,
  onStyleChange,
  onColorChange,
}: CabinetPresetPickerProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="font-semibold text-slate-900 mb-2">Cabinets</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">Style</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onStyleChange("shaker")}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                style === "shaker"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Shaker
            </button>
            <button
              type="button"
              onClick={() => onStyleChange("flat")}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                style === "flat"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Flat-panel
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Color</label>
          <div className="flex gap-2 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onColorChange(c)}
                className={`w-8 h-8 rounded-lg border-2 transition-transform hover:scale-110 ${
                  color === c
                    ? "border-slate-900 ring-2 ring-slate-300"
                    : "border-slate-300"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
            <label className="flex items-center gap-1">
              <input
                type="color"
                value={color}
                onChange={(e) => onColorChange(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border-0 p-0"
              />
              <span className="text-xs text-slate-500">Custom</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
