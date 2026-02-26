"use client";

import { useState } from "react";
import type { CountertopPiece } from "@/lib/designer-types";

let nextId = 1;
function generateId() {
  return `piece-${nextId++}`;
}

interface AIDesignPanelProps {
  onLayoutGenerated: (pieces: CountertopPiece[]) => void;
}

export default function AIDesignPanel({
  onLayoutGenerated,
}: AIDesignPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTextSubmit = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/designer/generate-from-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate");
      if (data.layout?.points) {
        const piece: CountertopPiece = {
          id: generateId(),
          shape: "polygon",
          width: 0,
          depth: 0,
          points: data.layout.points,
          position: { x: 0, y: 0 },
          rotation: 0,
        };
        onLayoutGenerated([piece]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve((r.result as string).split(",")[1] || "");
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await fetch("/api/designer/generate-from-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate");
      if (data.layout?.points) {
        const piece: CountertopPiece = {
          id: generateId(),
          shape: "polygon",
          width: 0,
          depth: 0,
          points: data.layout.points,
          position: { x: 0, y: 0 },
          rotation: 0,
        };
        onLayoutGenerated([piece]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="font-semibold text-slate-900 mb-2">AI Design</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">
            Describe your layout
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. L-shaped kitchen, 10 ft along wall, 6 ft island"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none"
            rows={2}
          />
          <button
            type="button"
            onClick={handleTextSubmit}
            disabled={loading || !prompt.trim()}
            className="mt-2 w-full py-2 px-3 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300 disabled:opacity-50"
          >
            {loading ? "Generating..." : "Generate from text"}
          </button>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">
            Or upload kitchen photo
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            disabled={loading}
            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
