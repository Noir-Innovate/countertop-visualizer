"use client";

interface Props {
  dominant: string[];
  primary: string;
  onChange: (next: { primary: string }) => void;
}

export function StepColors({ dominant, primary, onChange }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-xl font-semibold text-slate-900 mb-1">Brand color</h2>
      <p className="text-sm text-slate-600 mb-5">
        We picked this from your homepage. Adjust if it looks off.
      </p>

      {dominant.length > 0 && (
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
            From your site
          </p>
          <div className="flex gap-2 flex-wrap">
            {dominant.map((hex) => (
              <button
                type="button"
                key={hex}
                onClick={() => onChange({ primary: hex })}
                className={`px-3 py-1 rounded-md border text-xs font-mono flex items-center gap-2 ${
                  hex.toLowerCase() === primary.toLowerCase()
                    ? "border-slate-900 ring-2 ring-slate-900/10"
                    : "border-slate-200 hover:border-slate-400"
                }`}
              >
                <span
                  className="w-4 h-4 rounded-sm border border-slate-300"
                  style={{ background: hex }}
                />
                {hex}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-6 max-w-sm">
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">
            Brand color
          </span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={primary}
              onChange={(e) => onChange({ primary: e.target.value })}
              className="w-12 h-12 border border-slate-300 rounded cursor-pointer"
            />
            <input
              type="text"
              value={primary}
              onChange={(e) => onChange({ primary: e.target.value })}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
            />
          </div>
        </label>
      </div>

      <div className="rounded-lg p-4 bg-white border border-slate-200">
        <div className="flex items-center gap-3">
          <span
            className="px-3 py-1 rounded-full text-sm font-semibold"
            style={{ background: primary, color: contrastText(primary) }}
          >
            Primary action
          </span>
        </div>
      </div>
    </div>
  );
}

function contrastText(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return "#000000";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 160 ? "#000000" : "#FFFFFF";
}
