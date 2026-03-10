import type { V2Material, MaterialCategory, MaterialColor } from "./materials";

export const BACKSPLASH_HEIGHTS = [
  {
    id: "none",
    label: "None",
    promptDesc: "REMOVE_BACKSPLASH",
  },
  {
    id: "4in",
    label: '4" Standard',
    promptDesc:
      "a 4-inch standard backsplash — a thin strip of material sitting between the countertop surface and the wall, about 4 inches tall.",
  },
  {
    id: "mid",
    label: "Mid-Height",
    promptDesc:
      "a mid-height backsplash (roughly 18–24 inches tall) extending from the countertop partway up the wall, ending below the upper cabinets.",
  },
  {
    id: "full",
    label: "Full Height",
    promptDesc:
      "a full-height backsplash extending from the countertop all the way up to the bottom of the upper cabinets.",
  },
  {
    id: "full_wall",
    label: "Full Wall",
    promptDesc:
      "a full-wall backsplash extending from the countertop all the way up to the ceiling, covering the entire wall surface above the counter.",
  },
] as const;

export type BacksplashHeightId = (typeof BACKSPLASH_HEIGHTS)[number]["id"];

export interface VersionEntry {
  id: string;
  imageData: string;
  materialCategory: string;
  materialName: string;
  materialId?: string;
  colorName?: string;
  colorHex?: string;
  backsplashHeight?: string;
  storagePath?: string;
  generationOrder: number;
  timestamp: number;
}

export interface V2GenerationResult {
  imageData: string;
  storagePath: string;
  generationId: string;
}

export interface V2SessionState {
  sessionId: string;
  kitchenImage: string | null;
  kitchenImagePath: string | null;
  currentImage: string | null;
  versions: VersionEntry[];
  currentVersionIndex: number;
  isGenerating: boolean;
  generatingMaterialId: string | null;
  error: string | null;
}

export type { V2Material, MaterialCategory, MaterialColor };
