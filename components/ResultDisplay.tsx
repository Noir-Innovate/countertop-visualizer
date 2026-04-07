"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import ImageModal from "./ImageModal";
import ImageCarousel from "./ImageCarousel";
import ImageComparison from "./ImageComparison";
import QuoteModal from "./QuoteModal";
import PhoneVerificationModal from "./PhoneVerificationModal";
import { trackEvent } from "@/lib/posthog";
import { trackToSupabase } from "@/lib/analytics";
import { getVerifiedLeadName } from "@/lib/ab-testing";
import { useMaterialLine } from "@/lib/material-line";
import { getStoredAttribution } from "@/lib/attribution";
import { downloadPngFromBase64, shareImageFromDataUrl } from "@/lib/image-actions";
import { upload } from "@vercel/blob/client";
import type { GenerationResult } from "@/lib/types";
import type { Slab } from "@/lib/types";

const SUBMITTED_LEADS_KEY = "download_share_submitted_leads";

function getSubmittedLeadImageIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(SUBMITTED_LEADS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function markLeadSubmitted(imageId: string) {
  if (typeof window === "undefined") return;
  try {
    const set = getSubmittedLeadImageIds();
    set.add(imageId);
    sessionStorage.setItem(SUBMITTED_LEADS_KEY, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

type PendingAction = {
  type: "download" | "share";
  imageId: string;
  imageName: string;
  imageUrl: string;
  imageData: string;
  uiSource: "carousel" | "compare" | "modal";
};

interface ResultDisplayProps {
  generationResults: GenerationResult[];
  allPersistedResults: GenerationResult[];
  selectedSlabs: Slab[];
  originalImage: string | null;
  onReset: () => void;
  verifiedPhone: string | null;
  abVariant: string;
  prefillEmail?: string;
  onVerificationUpdate?: (phone: string) => void;
  v2SessionId?: string | null;
}

type ViewMode = "carousel" | "compare";

export default function ResultDisplay({
  generationResults,
  allPersistedResults,
  selectedSlabs,
  originalImage,
  onReset,
  verifiedPhone,
  abVariant,
  prefillEmail,
  onVerificationUpdate,
  v2SessionId,
}: ResultDisplayProps) {
  const materialLine = useMaterialLine();
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(
    null,
  );
  const [viewMode, setViewMode] = useState<ViewMode>("compare");
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [compareLeftIndex, setCompareLeftIndex] = useState(0);
  const [compareRightIndex, setCompareRightIndex] = useState(1);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [selectedForQuote, setSelectedForQuote] = useState<{
    slabId: string | null;
    slabName: string | null;
    imageUrl: string | null;
  }>({ slabId: null, slabName: null, imageUrl: null });
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [downloadShareError, setDownloadShareError] = useState<string | null>(
    null,
  );
  const [downloadShareFeedbackType, setDownloadShareFeedbackType] = useState<
    "error" | "success" | null
  >(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [preparingMessage, setPreparingMessage] = useState("");
  const submittedLeadIdsRef = useRef<Set<string>>(new Set());
  const sawItTrackedRef = useRef(false);

  useEffect(() => {
    submittedLeadIdsRef.current = getSubmittedLeadImageIds();
  }, []);

  // Merge all results including loading states
  const allResults = useMemo(() => {
    const merged: GenerationResult[] = [];

    // Add all persisted results (completed)
    allPersistedResults.forEach((result) => {
      merged.push(result);
    });

    // Add loading states for selected slabs that aren't in persisted results yet
    selectedSlabs.forEach((slab) => {
      const existing = merged.find((r) => r.slabId === slab.id);
      if (!existing) {
        merged.push({
          slabId: slab.id,
          slabName: slab.name,
          imageData: null,
          isLoading: true,
          error: null,
        });
      }
    });

    // Update with current generation results (may include loading or completed)
    generationResults.forEach((result) => {
      const index = merged.findIndex((r) => r.slabId === result.slabId);
      if (index >= 0) {
        merged[index] = result; // Update existing
      } else {
        merged.push(result); // Add new
      }
    });

    return merged;
  }, [allPersistedResults, selectedSlabs, generationResults]);

  // Build images array: original first, then all results (including loading)
  const allImages = useMemo(() => {
    const images: Array<{
      id: string;
      name: string;
      imageUrl: string;
      isOriginal?: boolean;
      isLoading?: boolean;
    }> = [];

    // Add original as first image
    if (originalImage) {
      images.push({
        id: "original",
        name: "Original Kitchen",
        imageUrl: originalImage,
        isOriginal: true,
      });
    }

    // Add all results (completed and loading)
    allResults.forEach((result) => {
      if (result.isLoading) {
        // Add loading placeholder
        images.push({
          id: result.slabId,
          name: result.slabName,
          imageUrl: "", // Empty for loading state
          isLoading: true,
        });
      } else if (result.imageData && !result.error) {
        // Add completed result
        images.push({
          id: result.slabId,
          name: result.slabName,
          imageUrl: `data:image/png;base64,${result.imageData}`,
        });
      }
    });

    return images;
  }, [originalImage, allResults]);

  // Initialize compare indices when switching to compare mode
  const handleSwitchToCompare = () => {
    setViewMode("compare");
    trackEvent("view_mode_changed", {
      viewMode: "compare",
      materialLineId: materialLine?.id,
      organizationId: materialLine?.organizationId,
    });
    if (allImages.length > 1) {
      setCompareLeftIndex(0);
      setCompareRightIndex(Math.min(1, allImages.length - 1));
    }
  };

  const handleSwitchToCarousel = () => {
    setViewMode("carousel");
    trackEvent("view_mode_changed", {
      viewMode: "carousel",
      materialLineId: materialLine?.id,
      organizationId: materialLine?.organizationId,
    });
  };

  const trackDownload = (
    imageId: string,
    imageName: string,
    source: "carousel" | "compare" | "modal",
    verificationKind?: "download" | "share",
  ) => {
    trackEvent("countertop_downloaded", {
      slabId: imageId,
      slabName: imageName,
      source,
      verificationKind,
      materialLineId: materialLine?.id,
      materialLineName: materialLine?.name,
      materialLineSlug: materialLine?.slug,
      organizationId: materialLine?.organizationId,
    });
  };

  const executeShare = useCallback(async (imageUrl: string, imageName: string) => {
    const result = await shareImageFromDataUrl(imageUrl, imageName);
    if (result.kind === "aborted") return;
    if (result.kind === "clipboard_success") {
      setDownloadShareError(result.message);
      setDownloadShareFeedbackType("success");
      setTimeout(() => {
        setDownloadShareError(null);
        setDownloadShareFeedbackType(null);
      }, 2500);
    } else if (result.kind === "error") {
      setDownloadShareError(result.message);
      setDownloadShareFeedbackType("error");
    }
  }, []);

  const submitLeadAndExecute = useCallback(
    async (phone: string, action: PendingAction, leadName?: string) => {
      setDownloadShareError(null);
      setDownloadShareFeedbackType(null);
      setIsPreparing(true);
      setPreparingMessage(
        action.type === "download"
          ? "Preparing your download..."
          : "Preparing the image to be shared...",
      );
      try {
        const attribution = getStoredAttribution();

        // Same image upload flow as QuoteModal: compress and upload to Vercel Blob first,
        // then send blob URLs to API (avoids 10MB request body limit from base64)
        const compressImage = async (dataUrl: string): Promise<Blob> => {
          return new Promise((resolve, reject) => {
            const img = document.createElement("img");
            img.onload = () => {
              if (img.width <= 1920) {
                fetch(dataUrl)
                  .then((res) => res.blob())
                  .then(resolve)
                  .catch(reject);
                return;
              }
              const canvas = document.createElement("canvas");
              const ctx = canvas.getContext("2d");
              if (!ctx) {
                reject(new Error("Failed to get canvas context"));
                return;
              }
              const newWidth = 1920;
              const newHeight = (img.height * newWidth) / img.width;
              canvas.width = newWidth;
              canvas.height = newHeight;
              ctx.drawImage(img, 0, 0, newWidth, newHeight);
              canvas.toBlob(
                (blob) =>
                  blob
                    ? resolve(blob)
                    : reject(new Error("Failed to compress image")),
                "image/jpeg",
                0.8,
              );
            };
            img.onerror = () => reject(new Error("Failed to load image"));
            img.src = dataUrl;
          });
        };

        const uploadImageToBlob = async (dataUrl: string): Promise<string> => {
          const blob = await compressImage(dataUrl);
          const file = new File([blob], "image.jpg", { type: "image/jpeg" });
          const result = await upload(file.name, file, {
            access: "public",
            handleUploadUrl: "/api/blob-upload",
          });
          return result.url;
        };

        let selectedImageBlobUrl: string | null = null;
        let originalImageBlobUrl: string | null = null;

        if (action.imageUrl.startsWith("data:image")) {
          selectedImageBlobUrl = await uploadImageToBlob(action.imageUrl);
        }

        if (originalImage?.startsWith("data:image")) {
          originalImageBlobUrl = await uploadImageToBlob(originalImage);
        } else if (originalImage?.startsWith("http")) {
          originalImageBlobUrl = originalImage;
        }

        const effectiveName =
          leadName?.trim() || getVerifiedLeadName()?.trim() || "";

        const response = await fetch("/api/submit-download-lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone,
            ...(effectiveName && { name: effectiveName }),
            source: action.type,
            selectedSlabId: action.imageId,
            selectedSlabName: action.imageName,
            selectedImageBlobUrl,
            originalImageBlobUrl,
            materialLineId: materialLine?.id || null,
            organizationId: materialLine?.organizationId || null,
            v2SessionId: v2SessionId || null,
            ...(attribution && {
              utm_source: attribution.utm_source,
              utm_medium: attribution.utm_medium,
              utm_campaign: attribution.utm_campaign,
              utm_term: attribution.utm_term,
              utm_content: attribution.utm_content,
              referrer: attribution.referrer,
              tags:
                Object.keys(attribution.tags ?? {}).length > 0
                  ? attribution.tags
                  : undefined,
            }),
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          setDownloadShareError(
            data.error || "Failed to submit. Please try again.",
          );
          return;
        }

        if (action.type === "download") {
          const did = downloadPngFromBase64(action.imageData, action.imageName);
          if (did) {
            trackDownload(
              action.imageId,
              action.imageName,
              action.uiSource,
              "download",
            );
          }
        } else {
          trackEvent("countertop_shared", {
            slabId: action.imageId,
            slabName: action.imageName,
            isOriginal: false,
            verificationKind: "share",
            materialLineId: materialLine?.id,
            materialLineName: materialLine?.name,
            materialLineSlug: materialLine?.slug,
            organizationId: materialLine?.organizationId,
          });
          await executeShare(action.imageUrl, action.imageName);
        }

        markLeadSubmitted(action.imageId);
        submittedLeadIdsRef.current.add(action.imageId);
        setPendingAction(null);
        onVerificationUpdate?.(phone);
      } catch (err) {
        setDownloadShareError(
          err instanceof Error
            ? err.message
            : "Failed to save. Please try again.",
        );
        setDownloadShareFeedbackType("error");
      } finally {
        setIsPreparing(false);
        setPreparingMessage("");
      }
    },
    [
      originalImage,
      materialLine,
      v2SessionId,
      executeShare,
      onVerificationUpdate,
    ],
  );

  const handleVerifiedForPendingAction = useCallback(
    (phone: string, name?: string) => {
      if (pendingAction) {
        submitLeadAndExecute(phone, pendingAction, name);
      }
    },
    [pendingAction, submitLeadAndExecute],
  );

  const doImmediateDownload = useCallback(
    (
      imageData: string,
      imageName: string,
      imageId: string,
      uiSource: "carousel" | "compare" | "modal",
    ) => {
      const did = downloadPngFromBase64(imageData, imageName);
      if (did) {
        trackDownload(imageId, imageName, uiSource, "download");
      }
    },
    [],
  );

  const gateAndExecute = useCallback(
    (
      type: "download" | "share",
      imageId: string,
      imageName: string,
      imageUrl: string,
      imageData: string,
      uiSource: "carousel" | "compare" | "modal",
    ) => {
      const alreadySubmitted = submittedLeadIdsRef.current.has(imageId);
      const verifiedAlready = !!verifiedPhone;

      const funnelBase = {
        slabId: imageId,
        slabName: imageName,
        source: uiSource,
        verifiedAlready,
        alreadySubmitted,
        materialLineId: materialLine?.id,
        materialLineName: materialLine?.name,
        materialLineSlug: materialLine?.slug,
        organizationId: materialLine?.organizationId,
      };

      if (type === "download") {
        trackToSupabase("download_clicked", funnelBase);
      } else {
        trackToSupabase("share_clicked", funnelBase);
      }

      if (alreadySubmitted) {
        if (type === "download") {
          trackToSupabase("download_same_image_repeat", funnelBase);
          doImmediateDownload(imageData, imageName, imageId, uiSource);
        } else {
          trackToSupabase("share_same_image_repeat", funnelBase);
          trackEvent("countertop_shared", {
            slabId: imageId,
            slabName: imageName,
            isOriginal: false,
            verificationKind: "share",
            materialLineId: materialLine?.id,
            materialLineName: materialLine?.name,
            materialLineSlug: materialLine?.slug,
            organizationId: materialLine?.organizationId,
          });
          executeShare(imageUrl, imageName);
        }
        return;
      }

      const action: PendingAction = {
        type,
        imageId,
        imageName,
        imageUrl,
        imageData,
        uiSource,
      };

      if (verifiedPhone) {
        trackEvent("verification_applied", {
          verificationKind: type,
          slabId: imageId,
          slabName: imageName,
          materialLineId: materialLine?.id,
          organizationId: materialLine?.organizationId,
        });
        submitLeadAndExecute(verifiedPhone, action);
      } else {
        setPendingAction(action);
      }
    },
    [verifiedPhone, submitLeadAndExecute, doImmediateDownload, executeShare],
  );

  const handleDownload = (
    imageId: string,
    imageData: string,
    slabName: string,
    source: "carousel" | "compare" | "modal",
  ) => {
    const imageUrl = `data:image/png;base64,${imageData}`;
    gateAndExecute("download", imageId, slabName, imageUrl, imageData, source);
  };

  const handleShare = (
    imageId: string,
    imageName: string,
    imageUrl: string,
    source: "carousel" | "compare" | "modal",
  ) => {
    const result = allResults.find((r) => r.slabId === imageId);
    let imageData = result?.imageData;
    if (!imageData && imageUrl.startsWith("data:image")) {
      const base64 = imageUrl.split(",")[1];
      if (base64) imageData = base64;
    }
    if (!imageData) {
      setDownloadShareError("Image not ready. Please wait for it to load.");
      setDownloadShareFeedbackType("error");
      return;
    }
    const dataUrl = imageUrl.startsWith("data:")
      ? imageUrl
      : `data:image/png;base64,${imageData}`;
    gateAndExecute("share", imageId, imageName, dataUrl, imageData, source);
  };

  const openModal = (imageUrl: string, alt: string, imageIndex: number) => {
    setSelectedImageIndex(imageIndex);
  };

  const closeModal = () => {
    setSelectedImageIndex(null);
  };

  const handleGetQuote = (
    imageId: string,
    imageName: string,
    imageUrl: string,
  ) => {
    // Find the result to get the slab ID
    const result = allResults.find((r) => r.slabId === imageId);
    setSelectedForQuote({
      slabId: result?.slabId || imageId,
      slabName: imageName,
      imageUrl: imageUrl,
    });
    setShowLeadForm(true);
  };

  const allComplete = allResults.every((r) => !r.isLoading);
  const hasCompletedImages = allResults.some(
    (r) => r.imageData && !r.isLoading && !r.error,
  );
  const hasAnyResults = allResults.length > 0;

  // Track "saw_it" event when all images finish loading and user is still on page
  useEffect(() => {
    if (allComplete && hasCompletedImages && !sawItTrackedRef.current) {
      const completedCount = allResults.filter(
        (r) => r.imageData && !r.isLoading && !r.error,
      ).length;

      sawItTrackedRef.current = true;
      trackEvent("saw_it", {
        slabCount: completedCount,
        allImagesLoaded: true,
        materialLineId: materialLine?.id,
        organizationId: materialLine?.organizationId,
      });
    }
  }, [allComplete, hasCompletedImages, allResults, materialLine]);

  return (
    <>
      <div className="card p-6 mb-8 animate-slide-up">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[var(--color-text)]">
              Your New Kitchens
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-1">
              {
                allResults.filter(
                  (r) => r.imageData && !r.isLoading && !r.error,
                ).length
              }{" "}
              {allResults.filter((r) => r.imageData && !r.isLoading && !r.error)
                .length === 1
                ? "variation"
                : "variations"}{" "}
              generated
            </p>
          </div>
          <button
            onClick={onReset}
            className="px-4 py-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] font-medium transition-colors flex items-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Try Another
          </button>
        </div>

        {/* View Mode Toggle */}
        {hasAnyResults && (
          <div className="flex gap-2 justify-center mb-6">
            <button
              onClick={handleSwitchToCarousel}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === "carousel"
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
              }`}
            >
              Carousel
            </button>
            <button
              onClick={handleSwitchToCompare}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === "compare"
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
              }`}
            >
              Compare
            </button>
          </div>
        )}

        {/* Carousel View */}
        {viewMode === "carousel" && hasAnyResults && (
          <div className="mb-6 -mx-6 md:mx-0 overflow-hidden">
            <ImageCarousel
              images={allImages}
              allResults={allResults}
              selectedSlabs={selectedSlabs}
              currentIndex={carouselIndex}
              onIndexChange={setCarouselIndex}
              onImageClick={openModal}
              onGetQuote={(imageId, imageName, imageUrl) => {
                if (imageId !== "original") {
                  handleGetQuote(imageId, imageName, imageUrl);
                }
              }}
              onDownload={(imageId, imageName, imageUrl) => {
                if (imageId !== "original") {
                  const result = allResults.find((r) => r.slabId === imageId);
                  if (result?.imageData) {
                    handleDownload(
                      imageId,
                      result.imageData,
                      imageName,
                      "carousel",
                    );
                  }
                }
              }}
              onShare={(imageId, imageName, imageUrl) => {
                if (imageId !== "original") {
                  handleShare(imageId, imageName, imageUrl, "carousel");
                }
              }}
            />
          </div>
        )}

        {/* Comparison View */}
        {viewMode === "compare" && hasAnyResults && allImages.length >= 2 && (
          <div className="mb-6 -mx-6 md:mx-0 overflow-hidden">
            <ImageComparison
              images={allImages}
              allResults={allResults}
              selectedSlabs={selectedSlabs}
              leftIndex={compareLeftIndex}
              rightIndex={compareRightIndex}
              onLeftIndexChange={setCompareLeftIndex}
              onRightIndexChange={setCompareRightIndex}
              onImageClick={openModal}
              onGetQuote={(imageId, imageName, imageUrl) => {
                if (imageId !== "original") {
                  handleGetQuote(imageId, imageName, imageUrl);
                }
              }}
              onDownload={(imageId, imageName, imageUrl) => {
                if (imageId !== "original") {
                  const result = allResults.find((r) => r.slabId === imageId);
                  if (result?.imageData) {
                    handleDownload(
                      imageId,
                      result.imageData,
                      imageName,
                      "compare",
                    );
                  }
                }
              }}
              onShare={(imageId, imageName, imageUrl) => {
                if (imageId !== "original") {
                  handleShare(imageId, imageName, imageUrl, "compare");
                }
              }}
            />
          </div>
        )}
      </div>

      {/* Phone verification for download/share */}
      {pendingAction && (
        <PhoneVerificationModal
          isOpen={true}
          onClose={() => {
            trackEvent("verification_modal_closed", {
              verificationKind: pendingAction.type,
              slabId: pendingAction.imageId,
              slabName: pendingAction.imageName,
              materialLineId: materialLine?.id,
              organizationId: materialLine?.organizationId,
            });
            setPendingAction(null);
            setDownloadShareError(null);
          }}
          onVerified={handleVerifiedForPendingAction}
          autoClose={false}
          context={pendingAction.type}
        />
      )}

      {/* Preparing modal */}
      {isPreparing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center animate-scale-in">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-accent)]/10 flex items-center justify-center">
              <svg
                className="animate-spin h-8 w-8 text-[var(--color-accent)]"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
            <p className="text-lg font-semibold text-[var(--color-text)]">
              {preparingMessage}
            </p>
          </div>
        </div>
      )}

      {downloadShareError && (
        <div
          className={`fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm p-4 rounded-lg shadow-lg z-50 animate-fade-in ${
            downloadShareFeedbackType === "success"
              ? "bg-green-50 border border-green-200"
              : "bg-red-50 border border-red-200"
          }`}
        >
          <p
            className={`text-sm ${
              downloadShareFeedbackType === "success"
                ? "text-green-700"
                : "text-red-700"
            }`}
          >
            {downloadShareError}
          </p>
          <button
            onClick={() => {
              setDownloadShareError(null);
              setDownloadShareFeedbackType(null);
            }}
            className={`mt-2 text-sm font-medium hover:underline ${
              downloadShareFeedbackType === "success"
                ? "text-green-600"
                : "text-red-600"
            }`}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Quote Modal */}
      {showLeadForm && (
        <QuoteModal
          isOpen={showLeadForm}
          onClose={() => setShowLeadForm(false)}
          selectedSlabId={selectedForQuote.slabId}
          selectedSlabName={selectedForQuote.slabName}
          selectedImageUrl={selectedForQuote.imageUrl}
          originalImageUrl={originalImage}
          verifiedPhone={verifiedPhone}
          abVariant={abVariant}
          prefillEmail={prefillEmail}
          onSubmitSuccess={() => setShowLeadForm(false)}
          onVerificationUpdate={onVerificationUpdate}
          v2SessionId={v2SessionId}
        />
      )}

      {/* Image Modal */}
      {selectedImageIndex !== null && (
        <ImageModal
          images={allImages}
          currentIndex={selectedImageIndex}
          onIndexChange={setSelectedImageIndex}
          onClose={closeModal}
          onGetQuote={(imageId, imageName, imageUrl) => {
            if (imageId !== "original") {
              closeModal();
              handleGetQuote(imageId, imageName, imageUrl);
            }
          }}
          onDownload={(imageId, imageName, imageUrl) => {
            if (imageId !== "original") {
              const result = allResults.find((r) => r.slabId === imageId);
              if (result?.imageData) {
                handleDownload(imageId, result.imageData, imageName, "modal");
              }
            }
          }}
          onShare={(imageId, imageName, imageUrl) => {
            if (imageId !== "original") {
              handleShare(imageId, imageName, imageUrl, "modal");
            }
          }}
        />
      )}
    </>
  );
}
