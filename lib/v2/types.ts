import type { V2Material, MaterialCategory, MaterialColor } from "./materials";

export const BACKSPLASH_HEIGHTS = [
  { id: "none", label: "None" },
  { id: "4in", label: '4" Standard' },
  { id: "full", label: "Full Height" },
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
