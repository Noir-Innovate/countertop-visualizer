"use client";

import { useState, useEffect, useCallback } from "react";
import { useMaterialLine } from "@/lib/material-line";
import { getSlabsForMaterialLine } from "@/lib/slabs";
import type { Slab } from "@/lib/types";
import type { CountertopPiece, DrawDesign } from "@/lib/designer-types";
import LayoutEditor2D from "@/components/designer/LayoutEditor2D";
import DrawSidebar from "@/components/designer/DrawSidebar";
import LayoutCanvas2D, {
  type EditPreview,
} from "@/components/designer/LayoutCanvas2D";
import Scene3D from "@/components/designer/Scene3D";
import SlabSelectorDesigner from "@/components/designer/SlabSelectorDesigner";
import CabinetPresetPicker from "@/components/designer/CabinetPresetPicker";
import QuoteSummary from "@/components/designer/QuoteSummary";
import AIDesignPanel from "@/components/designer/AIDesignPanel";
import ExportDocument from "@/components/designer/ExportDocument";

const MAX_HISTORY = 50;

const DEFAULT_PIECES: CountertopPiece[] = [
  {
    id: "piece-1",
    shape: "t",
    width: 120,
    depth: 48,
    armWidth: 36,
    armDepth: 24,
    position: { x: 0, y: 0 },
    rotation: 0,
  },
];

const DEFAULT_DRAW_DESIGN: DrawDesign = {
  surfaces: [],
  cutouts: [],
  depth: 24,
};

export default function DesignerPage() {
  const materialLine = useMaterialLine();
  const [slabs, setSlabs] = useState<Slab[]>([]);
  const [slabsLoading, setSlabsLoading] = useState(true);
  const [pieces, setPieces] = useState<CountertopPiece[]>(DEFAULT_PIECES);
  const [selectedSlab, setSelectedSlab] = useState<Slab | null>(null);
  const [cabinetStyle, setCabinetStyle] = useState<"shaker" | "flat">("shaker");
  const [cabinetColor, setCabinetColor] = useState("#8b7355");
  const [showExport, setShowExport] = useState(false);
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [drawDesign, setDrawDesign] = useState<DrawDesign>(DEFAULT_DRAW_DESIGN);
  const [historyState, setHistoryState] = useState<{
    history: DrawDesign[];
    index: number;
  }>({
    history: [DEFAULT_DRAW_DESIGN],
    index: 0,
  });
  const [editPreview, setEditPreview] = useState<EditPreview | null>(null);

  const setDrawDesignWithHistory = useCallback((design: DrawDesign) => {
    setDrawDesign(design);
    setHistoryState((prev) => {
      const next = prev.history.slice(0, prev.index + 1);
      next.push(design);
      const history =
        next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
      return { history, index: history.length - 1 };
    });
  }, []);

  const handleDrawDesignChange = useCallback(
    (design: DrawDesign) => {
      setDrawDesignWithHistory(design);
    },
    [setDrawDesignWithHistory],
  );

  const undo = useCallback(() => {
    setHistoryState((prev) => {
      if (prev.index <= 0) return prev;
      const newIndex = prev.index - 1;
      setDrawDesign(prev.history[newIndex]);
      setEditPreview(null);
      return { ...prev, index: newIndex };
    });
  }, []);

  const redo = useCallback(() => {
    setHistoryState((prev) => {
      if (prev.index >= prev.history.length - 1) return prev;
      const newIndex = prev.index + 1;
      setDrawDesign(prev.history[newIndex]);
      return { ...prev, index: newIndex };
    });
  }, []);

  const canUndo = historyState.index > 0;
  const canRedo = historyState.index < historyState.history.length - 1;

  useEffect(() => {
    const loadSlabs = async () => {
      const folder = materialLine?.supabaseFolder || "accent-countertops";
      try {
        const s = await getSlabsForMaterialLine(folder);
        setSlabs(s);
        if (s.length > 0 && !selectedSlab) {
          setSelectedSlab(s[0]);
        }
      } catch (e) {
        console.error("Failed to load slabs:", e);
      } finally {
        setSlabsLoading(false);
      }
    };
    loadSlabs();
  }, [materialLine?.supabaseFolder]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">
            Countertop Designer
          </h1>
          <a href="/" className="text-sm text-slate-600 hover:text-slate-900">
            Back to Visualizer
          </a>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 flex flex-col lg:flex-row gap-6">
        <aside className="w-full lg:w-80 flex-shrink-0 space-y-6">
          {mode === "2d" ? (
            <DrawSidebar
              design={drawDesign}
              onDesignChange={handleDrawDesignChange}
            />
          ) : (
            <LayoutEditor2D
              pieces={pieces}
              onChange={setPieces}
              selectedId={selectedPieceId}
              onSelectId={setSelectedPieceId}
            />
          )}
          <SlabSelectorDesigner
            slabs={slabs}
            loading={slabsLoading}
            selected={selectedSlab}
            onSelect={setSelectedSlab}
          />
          <CabinetPresetPicker
            style={cabinetStyle}
            color={cabinetColor}
            onStyleChange={setCabinetStyle}
            onColorChange={setCabinetColor}
          />
          <AIDesignPanel onLayoutGenerated={setPieces} />
          <QuoteSummary
            pieces={pieces}
            slab={selectedSlab}
            drawDesign={mode === "2d" ? drawDesign : null}
          />
          <button
            onClick={() => setShowExport(true)}
            className="w-full py-3 px-4 bg-slate-800 text-white font-medium rounded-lg hover:bg-slate-700 transition-colors"
          >
            Export Design
          </button>
        </aside>

        <main className="flex-1 min-h-[500px] rounded-xl overflow-hidden border border-slate-300 bg-slate-100">
          <div className="flex flex-col gap-2 p-2 border-b border-slate-200 bg-white">
            <div className="flex gap-2 flex-wrap items-center">
              <button
                type="button"
                onClick={() => setMode("2d")}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  mode === "2d"
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                2D Layout
              </button>
              <button
                type="button"
                onClick={() => setMode("3d")}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  mode === "3d"
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                3D View
              </button>
              {mode === "2d" && (
                <>
                  <button
                    type="button"
                    onClick={undo}
                    disabled={!canUndo}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={redo}
                    disabled={!canRedo}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    Redo
                  </button>
                </>
              )}
            </div>
          </div>
          {mode === "2d" ? (
            <div className="p-4 overflow-auto">
              <LayoutCanvas2D
                pieces={pieces}
                onChange={setPieces}
                selectedId={selectedPieceId}
                onSelectId={setSelectedPieceId}
                drawDesign={drawDesign}
                onDrawDesignChange={handleDrawDesignChange}
                editPreview={editPreview}
                onEditPreviewChange={setEditPreview}
              />
            </div>
          ) : (
            <div className="h-[calc(100%-52px)] min-h-[450px] bg-slate-800">
              <Scene3D
                pieces={pieces}
                slab={selectedSlab}
                cabinetStyle={cabinetStyle}
                cabinetColor={cabinetColor}
              />
            </div>
          )}
        </main>
      </div>

      {showExport && (
        <ExportDocument
          pieces={pieces}
          slab={selectedSlab}
          cabinetStyle={cabinetStyle}
          cabinetColor={cabinetColor}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
