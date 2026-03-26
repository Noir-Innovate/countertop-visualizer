"use client";

import { useState, useCallback, useEffect } from "react";
import imageCompression from "browser-image-compression";
import V2ImageDisplay from "./V2ImageDisplay";
import V2VersionHistory from "./V2VersionHistory";
import V2CategoryTabs from "./V2CategoryTabs";
import V2MaterialGrid from "./V2MaterialGrid";
import V2ColorSwatches from "./V2ColorSwatches";
import V2BacksplashSelector from "./V2BacksplashSelector";
import { useMaterialLine } from "@/lib/material-line";
import { getAllMaterialsGrouped } from "@/lib/v2/materials";
import type {
  V2Material,
  MaterialsByCategory,
  MaterialColor,
} from "@/lib/v2/materials";
import type { VersionEntry, BacksplashHeightId } from "@/lib/v2/types";
import { downloadPngFromBase64, shareImageFromDataUrl } from "@/lib/image-actions";
import { trackEvent } from "@/lib/posthog";

interface V2VisualizerProps {
  kitchenImage: string;
  sessionId: string;
  onChangePhoto: () => void;
}

export default function V2Visualizer({
  kitchenImage,
  sessionId,
  onChangePhoto,
}: V2VisualizerProps) {
  const materialLine = useMaterialLine();

  const [activeCategory, setActiveCategory] = useState("Countertops");
  const [materialsGrouped, setMaterialsGrouped] = useState<
    MaterialsByCategory[]
  >([]);
  const [materialsLoading, setMaterialsLoading] = useState(true);

  const [currentImage, setCurrentImage] = useState<string>(kitchenImage);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingMaterialId, setGeneratingMaterialId] = useState<
    string | null
  >(null);
  const [generatingCategory, setGeneratingCategory] = useState<string>("");
  const [kitchenImagePath, setKitchenImagePath] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [shareFeedbackType, setShareFeedbackType] = useState<
    "success" | "error" | null
  >(null);

  const isLocalDev =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  useEffect(() => {
    const load = async () => {
      if (!materialLine?.supabaseFolder) {
        setMaterialsLoading(false);
        return;
      }
      setMaterialsLoading(true);
      try {
        const grouped = await getAllMaterialsGrouped(
          materialLine.supabaseFolder,
        );
        setMaterialsGrouped(grouped);
        const firstWithContent = grouped.find(
          (g) => g.count > 0 || g.colors.length > 0,
        );
        if (firstWithContent) {
          setActiveCategory(firstWithContent.category);
        }
      } catch (err) {
        console.error("Failed to load materials:", err);
      }
      setMaterialsLoading(false);
    };
    load();
  }, [materialLine?.supabaseFolder]);

  useEffect(() => {
    const uploadKitchen = async () => {
      try {
        const response = await fetch("/api/v2/upload-kitchen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageData: kitchenImage,
            sessionId,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          setKitchenImagePath(data.storagePath);
        }
      } catch (err) {
        console.error("Failed to upload kitchen image:", err);
      }
    };
    uploadKitchen();
  }, [kitchenImage, sessionId]);

  const compressImage = useCallback(
    async (base64Image: string): Promise<string> => {
      try {
        const response = await fetch(base64Image);
        const blob = await response.blob();
        const compressed = await imageCompression(blob as File, {
          maxSizeMB: 25,
          maxWidthOrHeight: 2560,
          useWebWorker: true,
          fileType: "image/jpeg" as const,
          initialQuality: 0.9,
        });
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(compressed);
        });
      } catch {
        return base64Image;
      }
    },
    [],
  );

  const runGeneration = useCallback(
    async (material: V2Material, color?: MaterialColor) => {
      if (isGenerating) return;

      setIsGenerating(true);
      setGeneratingMaterialId(material.id);
      setGeneratingCategory(activeCategory);
      setError(null);

      const label = color ? `${material.name} (${color.name})` : material.name;

      trackEvent("v2_generation_started", {
        materialId: material.id,
        materialName: material.name,
        materialCategory: activeCategory,
        colorName: color?.name || null,
        colorHex: color?.hex || null,
        materialLineId: materialLine?.id,
        organizationId: materialLine?.organizationId,
      });

      try {
        const inputIsBase64 = currentImage.startsWith("data:");
        const compressedInput = inputIsBase64
          ? await compressImage(currentImage)
          : currentImage;

        const materialResponse = await fetch(material.imageUrl);
        const materialBlob = await materialResponse.blob();
        const materialBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(materialBlob);
        });
        const compressedMaterial = await compressImage(materialBase64);

        const response = await fetch("/api/v2/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kitchenImage: compressedInput,
            materialImage: compressedMaterial,
            materialCategory: activeCategory,
            sessionId,
            materialLineId: materialLine?.id || null,
            materialId: material.id,
            kitchenImagePath,
            generationOrder: versions.length + 1,
            colorName: color?.name || null,
            colorHex: color?.hex || null,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to generate image");
        }

        const data = await response.json();

        const newVersion: VersionEntry = {
          id: data.generationId || `${Date.now()}`,
          imageData: data.imageData,
          materialCategory: activeCategory,
          materialName: label,
          materialId: material.id,
          colorName: color?.name,
          colorHex: color?.hex,
          storagePath: data.storagePath,
          generationOrder: versions.length + 1,
          timestamp: Date.now(),
        };

        setVersions((prev) => [...prev, newVersion]);
        setCurrentVersionIndex(versions.length);
        setCurrentImage(`data:image/png;base64,${data.imageData}`);

        trackEvent("v2_generation_completed", {
          materialId: material.id,
          materialName: material.name,
          materialCategory: activeCategory,
          colorName: color?.name || null,
          materialLineId: materialLine?.id,
          organizationId: materialLine?.organizationId,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "An error occurred";
        setError(msg);
        trackEvent("v2_generation_error", {
          error: msg,
          materialLineId: materialLine?.id,
        });
      } finally {
        setIsGenerating(false);
        setGeneratingMaterialId(null);
        setGeneratingCategory("");
      }
    },
    [
      isGenerating,
      currentImage,
      activeCategory,
      sessionId,
      materialLine,
      kitchenImagePath,
      versions,
      compressImage,
    ],
  );

  const handleMaterialClick = useCallback(
    (material: V2Material) => {
      if (isGenerating) return;
      runGeneration(material);
    },
    [isGenerating, runGeneration],
  );

  const handleColorSwatchClick = useCallback(
    async (color: MaterialColor) => {
      if (isGenerating) return;

      setIsGenerating(true);
      setGeneratingMaterialId(null);
      setGeneratingCategory("Cabinets");
      setError(null);

      trackEvent("v2_color_only_generation_started", {
        colorName: color.name,
        colorHex: color.hex,
        materialLineId: materialLine?.id,
        organizationId: materialLine?.organizationId,
      });

      try {
        const inputIsBase64 = currentImage.startsWith("data:");
        const compressedInput = inputIsBase64
          ? await compressImage(currentImage)
          : currentImage;

        const response = await fetch("/api/v2/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kitchenImage: compressedInput,
            materialCategory: "Cabinets",
            sessionId,
            materialLineId: materialLine?.id || null,
            kitchenImagePath,
            generationOrder: versions.length + 1,
            colorName: color.name,
            colorHex: color.hex,
            colorOnly: true,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to generate image");
        }

        const data = await response.json();

        const newVersion: VersionEntry = {
          id: data.generationId || `${Date.now()}`,
          imageData: data.imageData,
          materialCategory: "Cabinets",
          materialName: color.name,
          colorName: color.name,
          colorHex: color.hex,
          storagePath: data.storagePath,
          generationOrder: versions.length + 1,
          timestamp: Date.now(),
        };

        setVersions((prev) => [...prev, newVersion]);
        setCurrentVersionIndex(versions.length);
        setCurrentImage(`data:image/png;base64,${data.imageData}`);

        trackEvent("v2_color_only_generation_completed", {
          colorName: color.name,
          materialLineId: materialLine?.id,
          organizationId: materialLine?.organizationId,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "An error occurred";
        setError(msg);
        trackEvent("v2_generation_error", {
          error: msg,
          materialLineId: materialLine?.id,
        });
      } finally {
        setIsGenerating(false);
        setGeneratingMaterialId(null);
        setGeneratingCategory("");
      }
    },
    [
      isGenerating,
      currentImage,
      sessionId,
      materialLine,
      kitchenImagePath,
      versions,
      compressImage,
    ],
  );

  const handleBacksplashGenerate = useCallback(
    async (
      heightId: BacksplashHeightId,
      materialSource: "match_countertop" | "other",
      material?: V2Material,
    ) => {
      if (isGenerating) return;

      setIsGenerating(true);
      setGeneratingMaterialId(material?.id || null);
      setGeneratingCategory("Backsplash");
      setError(null);

      const heightLabel =
        heightId === "none"
          ? "None"
          : heightId === "4in"
            ? '4" Standard'
            : "Full Height";

      const label =
        heightId === "none"
          ? "Remove Backsplash"
          : material
            ? `${heightLabel} — ${material.name}`
            : `${heightLabel} — Match Countertop`;

      trackEvent("v2_backsplash_generation_started", {
        heightId,
        materialSource,
        materialId: material?.id || null,
        materialLineId: materialLine?.id,
        organizationId: materialLine?.organizationId,
      });

      try {
        const inputIsBase64 = currentImage.startsWith("data:");
        const compressedInput = inputIsBase64
          ? await compressImage(currentImage)
          : currentImage;

        let compressedMaterial: string | null = null;
        if (material && materialSource === "other") {
          const matResponse = await fetch(material.imageUrl);
          const matBlob = await matResponse.blob();
          const matBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(matBlob);
          });
          compressedMaterial = await compressImage(matBase64);
        }

        const response = await fetch("/api/v2/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kitchenImage: compressedInput,
            materialImage: compressedMaterial,
            materialCategory: "Backsplash",
            sessionId,
            materialLineId: materialLine?.id || null,
            materialId: material?.id || null,
            kitchenImagePath,
            generationOrder: versions.length + 1,
            backsplashHeightId: heightId,
            backsplashMatchCountertop: materialSource === "match_countertop",
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to generate image");
        }

        const data = await response.json();

        const newVersion: VersionEntry = {
          id: data.generationId || `${Date.now()}`,
          imageData: data.imageData,
          materialCategory: "Backsplash",
          materialName: label,
          materialId: material?.id,
          backsplashHeight: heightId,
          storagePath: data.storagePath,
          generationOrder: versions.length + 1,
          timestamp: Date.now(),
        };

        setVersions((prev) => [...prev, newVersion]);
        setCurrentVersionIndex(versions.length);
        setCurrentImage(`data:image/png;base64,${data.imageData}`);

        trackEvent("v2_backsplash_generation_completed", {
          heightId,
          materialSource,
          materialLineId: materialLine?.id,
          organizationId: materialLine?.organizationId,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "An error occurred";
        setError(msg);
        trackEvent("v2_generation_error", {
          error: msg,
          materialLineId: materialLine?.id,
        });
      } finally {
        setIsGenerating(false);
        setGeneratingMaterialId(null);
        setGeneratingCategory("");
      }
    },
    [
      isGenerating,
      currentImage,
      sessionId,
      materialLine,
      kitchenImagePath,
      versions,
      compressImage,
    ],
  );

  const handleSelectVersion = useCallback(
    (index: number) => {
      if (index >= 0 && index < versions.length) {
        setCurrentVersionIndex(index);
        const version = versions[index];
        setCurrentImage(`data:image/png;base64,${version.imageData}`);
      }
    },
    [versions],
  );

  const handleSelectOriginal = useCallback(() => {
    setCurrentVersionIndex(-1);
    setCurrentImage(kitchenImage);
  }, [kitchenImage]);

  const activeVersion =
    currentVersionIndex >= 0 && currentVersionIndex < versions.length
      ? versions[currentVersionIndex]
      : null;

  useEffect(() => {
    setShareFeedback(null);
    setShareFeedbackType(null);
  }, [currentVersionIndex]);

  const handleV2Download = useCallback(() => {
    if (
      currentVersionIndex < 0 ||
      currentVersionIndex >= versions.length ||
      isGenerating
    ) {
      return;
    }
    const v = versions[currentVersionIndex];
    trackEvent("v2_download_clicked", {
      versionId: v.id,
      materialName: v.materialName,
      materialCategory: v.materialCategory,
      materialLineId: materialLine?.id,
      organizationId: materialLine?.organizationId,
    });
    const did = downloadPngFromBase64(v.imageData);
    if (did) {
      trackEvent("v2_image_downloaded", {
        versionId: v.id,
        materialName: v.materialName,
        materialCategory: v.materialCategory,
        materialLineId: materialLine?.id,
        organizationId: materialLine?.organizationId,
      });
    }
  }, [currentVersionIndex, versions, isGenerating, materialLine]);

  const handleV2Share = useCallback(async () => {
    if (
      currentVersionIndex < 0 ||
      currentVersionIndex >= versions.length ||
      isGenerating
    ) {
      return;
    }
    const v = versions[currentVersionIndex];
    setShareFeedback(null);
    setShareFeedbackType(null);
    trackEvent("v2_share_clicked", {
      versionId: v.id,
      materialName: v.materialName,
      materialCategory: v.materialCategory,
      materialLineId: materialLine?.id,
      organizationId: materialLine?.organizationId,
    });
    const dataUrl = `data:image/png;base64,${v.imageData}`;
    const result = await shareImageFromDataUrl(dataUrl);
    if (result.kind === "aborted") return;
    if (result.kind === "clipboard_success") {
      setShareFeedback(result.message);
      setShareFeedbackType("success");
      setTimeout(() => {
        setShareFeedback(null);
        setShareFeedbackType(null);
      }, 2500);
      trackEvent("v2_image_shared", {
        versionId: v.id,
        materialName: v.materialName,
        materialCategory: v.materialCategory,
        materialLineId: materialLine?.id,
        organizationId: materialLine?.organizationId,
        shareMethod: "clipboard",
      });
    } else if (result.kind === "error") {
      setShareFeedback(result.message);
      setShareFeedbackType("error");
    } else if (result.kind === "shared") {
      trackEvent("v2_image_shared", {
        versionId: v.id,
        materialName: v.materialName,
        materialCategory: v.materialCategory,
        materialLineId: materialLine?.id,
        organizationId: materialLine?.organizationId,
        shareMethod: "native",
      });
    }
  }, [currentVersionIndex, versions, isGenerating, materialLine]);

  const activeGroup = materialsGrouped.find(
    (g) => g.category === activeCategory,
  );
  const activeMaterials = activeGroup?.materials || [];
  const activeCategoryColors = activeGroup?.colors || [];

  return (
    <div className="animate-fade-in pb-8">
      <V2ImageDisplay
        currentImage={currentImage}
        isGenerating={isGenerating}
        generatingCategory={generatingCategory}
        onChangePhoto={onChangePhoto}
        showDownloadShare={!!activeVersion}
        onDownload={handleV2Download}
        onShare={handleV2Share}
        shareFeedback={shareFeedback}
        shareFeedbackType={shareFeedbackType}
      />

      <V2VersionHistory
        versions={versions}
        currentIndex={currentVersionIndex}
        originalImage={kitchenImage}
        onSelectVersion={handleSelectVersion}
        onSelectOriginal={handleSelectOriginal}
      />

      {error && (
        <div className="w-full max-w-4xl mx-auto mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600 text-center">{error}</p>
        </div>
      )}

      <V2CategoryTabs
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        categoryCounts={materialsGrouped}
      />

      {activeCategory === "Backsplash" ? (
        materialsLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-[var(--color-accent)] rounded-full animate-spin"></div>
          </div>
        ) : (
          <V2BacksplashSelector
            materials={activeMaterials}
            onGenerate={handleBacksplashGenerate}
            disabled={isGenerating}
            isLocalDev={isLocalDev}
          />
        )
      ) : (
        <>
          {activeCategoryColors.length > 0 && (
            <V2ColorSwatches
              colors={activeCategoryColors}
              onColorClick={handleColorSwatchClick}
              disabled={isGenerating}
            />
          )}

          {materialsLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-[var(--color-accent)] rounded-full animate-spin"></div>
            </div>
          ) : activeMaterials.length > 0 ? (
            <>
              {activeCategoryColors.length > 0 && (
                <div className="w-full max-w-4xl mx-auto mt-4">
                  <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-1">
                    Designs
                  </p>
                </div>
              )}
              <V2MaterialGrid
                materials={activeMaterials}
                generatingMaterialId={generatingMaterialId}
                onMaterialClick={handleMaterialClick}
                isLocalDev={isLocalDev}
              />
            </>
          ) : activeCategoryColors.length === 0 ? (
            <V2MaterialGrid
              materials={[]}
              generatingMaterialId={null}
              onMaterialClick={() => {}}
              isLocalDev={isLocalDev}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
