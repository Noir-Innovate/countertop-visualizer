"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { MATERIAL_TYPE_FILTER_OPTIONS } from "@/lib/materials/types";
import imageCompression from "browser-image-compression";
import V2ImageDisplay from "./V2ImageDisplay";
import V2VersionHistory from "./V2VersionHistory";
import V2CategoryTabs from "./V2CategoryTabs";
import V2MaterialGrid from "./V2MaterialGrid";
import V2ColorSwatches from "./V2ColorSwatches";
import V2BacksplashSelector from "./V2BacksplashSelector";
import V2EditOverlay, { type EditGeneratePayload } from "./V2EditOverlay";
import { useMaterialLine } from "@/lib/material-line";
import { getAllMaterialsGrouped } from "@/lib/v2/materials";
import type {
  V2Material,
  MaterialsByCategory,
  MaterialColor,
} from "@/lib/v2/materials";
import type { VersionEntry, BacksplashHeightId } from "@/lib/v2/types";
import { downloadPngFromBase64, shareImageFromDataUrl } from "@/lib/image-actions";
import { trackEvent } from "@/lib/track";

interface V2VisualizerProps {
  kitchenImage: string;
  sessionId: string;
  onChangePhoto: () => void;
  // Force-enable the search + type filter above the grid. Useful for the
  // /internal route where the material line may not have resolved through
  // middleware (e.g. dev hostnames like *.nip.io) but the route itself
  // unambiguously means "internal sales tool". When unset, the toolbar
  // still auto-appears whenever the resolved material line is internal.
  enableMaterialSearch?: boolean;
  // Versions hydrated from the DB so the user sees their prior renders the
  // moment they re-enter a workspace. Entries may have an imageUrl instead of
  // imageData; the visualizer fetches & converts lazily when one is selected.
  initialVersions?: VersionEntry[];
}

export default function V2Visualizer({
  kitchenImage,
  sessionId,
  onChangePhoto,
  enableMaterialSearch: enableMaterialSearchProp,
  initialVersions,
}: V2VisualizerProps) {
  const materialLine = useMaterialLine();
  // Internal lines (showroom / sales tool) get the search + type filter
  // above the grid; external customer-facing lines stay clean. This covers
  // /demo (which points at an internal line) and any other surface that
  // renders an internal material line. The /internal route forces it on
  // via the prop above for the nip.io / non-resolving-hostname case.
  const enableMaterialSearch =
    enableMaterialSearchProp || materialLine?.lineKind === "internal";

  const [activeCategory, setActiveCategory] = useState("Countertops");
  const [materialsGrouped, setMaterialsGrouped] = useState<
    MaterialsByCategory[]
  >([]);
  const [materialsLoading, setMaterialsLoading] = useState(true);

  const [currentImage, setCurrentImage] = useState<string>(kitchenImage);
  const [versions, setVersions] = useState<VersionEntry[]>(
    initialVersions ?? [],
  );
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
  const [isEditing, setIsEditing] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialTypeFilter, setMaterialTypeFilter] = useState("");

  // Reset the search/filter when the user switches category so a stale
  // "Granite" filter doesn't silently empty out the Cabinets grid.
  useEffect(() => {
    setMaterialSearch("");
    setMaterialTypeFilter("");
  }, [activeCategory]);

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
        const hasContent = (g: MaterialsByCategory) =>
          g.count > 0 || g.colors.length > 0;
        // Always prefer Countertops on load if it has content; fall back to
        // the first category that does. Applies to every surface (/internal,
        // /demo, /v2) so the page opens on the same tab every time.
        const countertopsEntry = grouped.find(
          (g) => g.category === "Countertops",
        );
        const chosen =
          countertopsEntry && hasContent(countertopsEntry)
            ? countertopsEntry
            : grouped.find(hasContent);
        if (chosen) {
          setActiveCategory(chosen.category);
        }
      } catch (err) {
        console.error("Failed to load materials:", err);
      }
      setMaterialsLoading(false);
    };
    load();
  }, [materialLine?.supabaseFolder, materialLine?.lineKind]);

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

  const runEdit = useCallback(
    async (payload: EditGeneratePayload) => {
      if (isGenerating) return;

      const activeVersion =
        currentVersionIndex >= 0 && currentVersionIndex < versions.length
          ? versions[currentVersionIndex]
          : null;

      let materialContextCategory: string | null = null;
      let materialImageUrl: string | null = null;
      let colorName: string | null = null;
      let colorHex: string | null = null;
      let backsplashHeightId: BacksplashHeightId | null = null;
      const backsplashMatchCountertop = false;
      let materialId: string | null = null;
      let isColorOnly = false;

      if (payload.mode === "material" && activeVersion) {
        materialContextCategory = activeVersion.materialCategory;
        materialId = activeVersion.materialId || null;
        colorName = activeVersion.colorName || null;
        colorHex = activeVersion.colorHex || null;

        if (activeVersion.backsplashHeight) {
          backsplashHeightId =
            activeVersion.backsplashHeight as BacksplashHeightId;
        }

        if (materialId) {
          for (const group of materialsGrouped) {
            const found = group.materials.find((m) => m.id === materialId);
            if (found) {
              materialImageUrl = found.imageUrl;
              break;
            }
          }
        }

        if (
          activeVersion.materialCategory === "Cabinets" &&
          !materialId &&
          colorName
        ) {
          isColorOnly = true;
        }
      }

      setIsGenerating(true);
      setGeneratingCategory(
        payload.mode === "material" && materialContextCategory
          ? materialContextCategory
          : "Edit",
      );
      setError(null);

      trackEvent("v2_edit_started", {
        mode: payload.mode,
        hasDrawing: payload.hasDrawing,
        textLength: payload.userText.length,
        sourceVersionId: activeVersion?.id || "original",
        materialLineId: materialLine?.id,
        organizationId: materialLine?.organizationId,
      });

      try {
        const compressedAnnotated = await compressImage(payload.annotatedImage);

        let compressedMaterial: string | null = null;
        if (materialImageUrl) {
          const matResponse = await fetch(materialImageUrl);
          const matBlob = await matResponse.blob();
          const matBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(matBlob);
          });
          compressedMaterial = await compressImage(matBase64);
        }

        const response = await fetch("/api/v2/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            annotatedImage: compressedAnnotated,
            hasDrawing: payload.hasDrawing,
            userPrompt: payload.userText,
            mode: payload.mode,
            materialImage: compressedMaterial,
            materialCategory: materialContextCategory,
            colorName,
            colorHex,
            colorOnly: isColorOnly,
            backsplashHeightId,
            backsplashMatchCountertop,
            sessionId,
            materialLineId: materialLine?.id || null,
            materialId,
            kitchenImagePath,
            generationOrder: versions.length + 1,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to edit image");
        }

        const data = await response.json();

        const labelBase = payload.userText.trim()
          ? `"${payload.userText.trim().slice(0, 40)}${payload.userText.trim().length > 40 ? "…" : ""}"`
          : "Region edit";
        const versionLabel =
          payload.mode === "material" && materialContextCategory
            ? `Refined ${materialContextCategory} — ${labelBase}`
            : `Edit — ${labelBase}`;

        const newVersion: VersionEntry = {
          id: data.generationId || `${Date.now()}`,
          imageData: data.imageData,
          materialCategory:
            payload.mode === "material" && materialContextCategory
              ? materialContextCategory
              : "Edit",
          materialName: versionLabel,
          materialId: materialId || undefined,
          colorName: colorName || undefined,
          colorHex: colorHex || undefined,
          backsplashHeight: backsplashHeightId || undefined,
          storagePath: data.storagePath,
          generationOrder: versions.length + 1,
          timestamp: Date.now(),
        };

        setVersions((prev) => [...prev, newVersion]);
        setCurrentVersionIndex(versions.length);
        setCurrentImage(`data:image/png;base64,${data.imageData}`);
        setIsEditing(false);

        trackEvent("v2_edit_completed", {
          mode: payload.mode,
          hasDrawing: payload.hasDrawing,
          materialLineId: materialLine?.id,
          organizationId: materialLine?.organizationId,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "An error occurred";
        setError(msg);
        trackEvent("v2_edit_error", {
          error: msg,
          materialLineId: materialLine?.id,
        });
      } finally {
        setIsGenerating(false);
        setGeneratingCategory("");
      }
    },
    [
      isGenerating,
      currentVersionIndex,
      versions,
      materialsGrouped,
      sessionId,
      materialLine,
      kitchenImagePath,
      compressImage,
    ],
  );

  const handleSelectVersion = useCallback(
    async (index: number) => {
      if (index < 0 || index >= versions.length) return;
      setCurrentVersionIndex(index);
      const version = versions[index];
      if (version.imageData) {
        setCurrentImage(`data:image/png;base64,${version.imageData}`);
        return;
      }
      if (version.imageUrl) {
        try {
          const res = await fetch(version.imageUrl);
          const blob = await res.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error ?? new Error("read"));
            reader.readAsDataURL(blob);
          });
          setCurrentImage(dataUrl);
          // Cache the resolved imageData so the next select is instant and
          // generate() can use it as base64 input without refetching.
          const base64 = dataUrl.includes(",")
            ? dataUrl.split(",")[1]
            : dataUrl;
          setVersions((prev) =>
            prev.map((v, i) => (i === index ? { ...v, imageData: base64 } : v)),
          );
        } catch (err) {
          console.error("Failed to load prior version image:", err);
        }
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

  const trimmedMaterialSearch = materialSearch.trim();
  const isMaterialFiltered =
    enableMaterialSearch &&
    (trimmedMaterialSearch.length > 0 || materialTypeFilter.length > 0);

  // Only surface type-filter options for types that actually exist in the
  // current category — no point offering "Marble" when nobody uploaded any.
  const availableTypeOptions = useMemo(() => {
    const present = new Set<string>();
    for (const m of activeMaterials) {
      const t = (m.material_type ?? "").trim();
      if (t && t !== "none") present.add(t);
    }
    return MATERIAL_TYPE_FILTER_OPTIONS.filter((o) => present.has(o.value));
  }, [activeMaterials]);

  const filteredActiveMaterials = useMemo(() => {
    if (!isMaterialFiltered) return activeMaterials;
    const q = trimmedMaterialSearch.toLowerCase();
    return activeMaterials.filter((m) => {
      if (
        materialTypeFilter &&
        (m.material_type ?? "") !== materialTypeFilter
      ) {
        return false;
      }
      if (!q) return true;
      const name = (m.name ?? "").toLowerCase();
      const filename = (m.filename ?? "").toLowerCase();
      return name.includes(q) || filename.includes(q);
    });
  }, [
    activeMaterials,
    trimmedMaterialSearch,
    materialTypeFilter,
    isMaterialFiltered,
  ]);

  const editMaterialContextLabel = activeVersion
    ? activeVersion.materialName
    : null;
  const canUseMaterialMode = !!activeVersion;

  return (
    <div className="animate-fade-in pb-8">
      {isEditing ? (
        <V2EditOverlay
          imageSrc={currentImage}
          canUseMaterialMode={canUseMaterialMode}
          materialContextLabel={editMaterialContextLabel}
          isGenerating={isGenerating}
          generatingCategory={generatingCategory}
          onCancel={() => setIsEditing(false)}
          onGenerate={runEdit}
        />
      ) : (
        <>
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
            onEnterEdit={() => setIsEditing(true)}
            showEditButton={!!currentImage}
          />

          <V2VersionHistory
            versions={versions}
            currentIndex={currentVersionIndex}
            originalImage={kitchenImage}
            onSelectVersion={handleSelectVersion}
            onSelectOriginal={handleSelectOriginal}
          />
        </>
      )}

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

      {enableMaterialSearch && !materialsLoading && activeMaterials.length > 0 && (
        <V2MaterialSearchToolbar
          search={materialSearch}
          onSearchChange={setMaterialSearch}
          typeFilter={materialTypeFilter}
          onTypeFilterChange={setMaterialTypeFilter}
          typeOptions={availableTypeOptions}
          isFiltered={isMaterialFiltered}
          onClear={() => {
            setMaterialSearch("");
            setMaterialTypeFilter("");
          }}
          visibleCount={filteredActiveMaterials.length}
          totalCount={activeMaterials.length}
        />
      )}

      {activeCategory === "Backsplash" ? (
        materialsLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-[var(--color-accent)] rounded-full animate-spin"></div>
          </div>
        ) : (
          <V2BacksplashSelector
            materials={filteredActiveMaterials}
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
                materials={filteredActiveMaterials}
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

function V2MaterialSearchToolbar({
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  typeOptions,
  isFiltered,
  onClear,
  visibleCount,
  totalCount,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  typeFilter: string;
  onTypeFilterChange: (v: string) => void;
  typeOptions: ReadonlyArray<{ value: string; label: string }>;
  isFiltered: boolean;
  onClear: () => void;
  visibleCount: number;
  totalCount: number;
}) {
  return (
    <div className="w-full max-w-4xl mx-auto mt-4 px-1">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search slabs…"
          className="flex-1 min-w-[160px] px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
        {typeOptions.length > 0 && (
          <select
            value={typeFilter}
            onChange={(e) => onTypeFilterChange(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]"
            aria-label="Filter by material type"
          >
            <option value="">All types</option>
            {typeOptions.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        )}
        {isFiltered && (
          <button
            type="button"
            onClick={onClear}
            className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)]"
          >
            Clear
          </button>
        )}
      </div>
      {isFiltered && (
        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
          Showing {visibleCount.toLocaleString()} of{" "}
          {totalCount.toLocaleString()} slabs in this category.
        </p>
      )}
    </div>
  );
}
