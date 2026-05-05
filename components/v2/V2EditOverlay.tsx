"use client";

import { useCallback, useRef, useState } from "react";
import V2DrawableCanvas, {
  type V2DrawableCanvasHandle,
} from "./V2DrawableCanvas";

export type EditMode = "freeform" | "material";

export interface EditGeneratePayload {
  mode: EditMode;
  hasDrawing: boolean;
  userText: string;
  annotatedImage: string;
}

interface V2EditOverlayProps {
  imageSrc: string;
  canUseMaterialMode: boolean;
  materialContextLabel?: string | null;
  isGenerating: boolean;
  generatingCategory?: string;
  onCancel: () => void;
  onGenerate: (payload: EditGeneratePayload) => Promise<void> | void;
}

const MIN_BRUSH = 8;
const MAX_BRUSH = 60;
const DEFAULT_BRUSH = 24;

export default function V2EditOverlay({
  imageSrc,
  canUseMaterialMode,
  materialContextLabel,
  isGenerating,
  generatingCategory,
  onCancel,
  onGenerate,
}: V2EditOverlayProps) {
  const canvasRef = useRef<V2DrawableCanvasHandle>(null);
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH);
  const [strokeCount, setStrokeCount] = useState(0);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<EditMode>(
    canUseMaterialMode ? "material" : "freeform",
  );
  const [submitting, setSubmitting] = useState(false);

  const hasStrokes = strokeCount > 0;
  const hasText = text.trim().length > 0;
  const canSubmit = !isGenerating && !submitting && (hasStrokes || hasText);

  const handleGenerate = useCallback(async () => {
    if (!canSubmit) return;
    const handle = canvasRef.current;
    if (!handle) return;
    setSubmitting(true);
    try {
      const annotatedImage = await handle.exportComposited();
      await onGenerate({
        mode,
        hasDrawing: hasStrokes,
        userText: text.trim(),
        annotatedImage,
      });
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, hasStrokes, mode, onGenerate, text]);

  const showLoading = isGenerating || submitting;

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="relative aspect-video rounded-xl overflow-hidden bg-[var(--color-bg-secondary)] shadow-lg">
        <V2DrawableCanvas
          ref={canvasRef}
          imageSrc={imageSrc}
          brushSize={brushSize}
          onStrokesChange={setStrokeCount}
        />

        {showLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 backdrop-blur-[2px] z-10">
            <div className="w-16 h-16 mb-3 relative">
              <div className="absolute inset-0 rounded-full border-4 border-white/20"></div>
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-white animate-spin"></div>
            </div>
            <p className="text-white font-medium text-lg drop-shadow-md">
              {generatingCategory
                ? `Applying ${generatingCategory}...`
                : "Applying your edit..."}
            </p>
            <p className="text-white/80 text-sm mt-1 drop-shadow-md">
              This usually takes 15-30 seconds
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/40">
        {canUseMaterialMode && (
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              onClick={() => setMode("material")}
              disabled={showLoading}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                mode === "material"
                  ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                  : "bg-white text-[var(--color-text)] border-[var(--color-border)] hover:border-[var(--color-accent)]/50"
              }`}
            >
              Refine material
              {materialContextLabel ? (
                <span className="ml-1 opacity-80 font-normal">
                  ({materialContextLabel})
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setMode("freeform")}
              disabled={showLoading}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                mode === "freeform"
                  ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                  : "bg-white text-[var(--color-text)] border-[var(--color-border)] hover:border-[var(--color-accent)]/50"
              }`}
            >
              Freeform edit
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mb-3">
          <label className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-secondary)]">
            Brush
            <input
              type="range"
              min={MIN_BRUSH}
              max={MAX_BRUSH}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              disabled={showLoading}
              className="w-32"
            />
            <span className="tabular-nums w-6 text-right">{brushSize}</span>
          </label>
          <button
            type="button"
            onClick={() => canvasRef.current?.undo()}
            disabled={showLoading || !hasStrokes}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--color-border)] bg-white hover:border-[var(--color-accent)]/50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => canvasRef.current?.clear()}
            disabled={showLoading || !hasStrokes}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--color-border)] bg-white hover:border-[var(--color-accent)]/50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear
          </button>
          <p className="text-xs text-[var(--color-text-muted)]">
            Brush over the area you want to change
          </p>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={showLoading}
          placeholder={
            mode === "freeform"
              ? "Describe the edit (e.g. 'change this floor to dark hardwood')"
              : "Add an optional refinement (e.g. 'only apply to the island, not the perimeter')"
          }
          rows={2}
          className="w-full p-3 text-sm rounded-lg border border-[var(--color-border)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] resize-y"
        />

        <div className="flex items-center justify-end gap-2 mt-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={showLoading}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-[var(--color-border)] bg-white hover:border-[var(--color-accent)]/50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {showLoading ? "Generating..." : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
