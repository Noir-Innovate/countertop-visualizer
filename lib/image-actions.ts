/**
 * Client-only helpers for downloading and sharing PNG images (data URLs / base64).
 */

let downloadInProgress = false;

function normalizeDisplayName(displayName?: string | null): string | undefined {
  const t = displayName?.trim();
  return t ? t : undefined;
}

/** @returns true if download was triggered, false if a duplicate click was ignored */
export function downloadPngFromBase64(
  imageData: string,
  displayName?: string | null,
): boolean {
  if (typeof document === "undefined") return false;
  if (downloadInProgress) return false;
  downloadInProgress = true;

  const name = normalizeDisplayName(displayName) ?? "kitchen";
  const link = document.createElement("a");
  link.href = `data:image/png;base64,${imageData}`;
  link.download = `countertop-${name
    .toLowerCase()
    .replace(/\s+/g, "-")}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => {
    downloadInProgress = false;
  }, 500);
  return true;
}

export type ShareImageResult =
  | { kind: "shared" }
  | { kind: "aborted" }
  | { kind: "clipboard_success"; message: string }
  | { kind: "error"; message: string };

export async function shareImageFromDataUrl(
  imageUrl: string,
  displayName?: string | null,
): Promise<ShareImageResult> {
  const name = normalizeDisplayName(displayName);
  const shareText = name
    ? `Check out this ${name} countertop in our kitchen!`
    : "Check out this kitchen countertop";
  const fileStem = name ? name.replace(/\s+/g, "-") : "kitchen";

  try {
    let file: File | null = null;

    if (imageUrl.startsWith("data:")) {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      file = new File([blob], `${fileStem}.png`, {
        type: "image/png",
      });
    } else {
      try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        file = new File([blob], `${fileStem}.png`, {
          type: blob.type || "image/png",
        });
      } catch {
        console.warn("Could not fetch image for sharing");
      }
    }

    if (
      file &&
      typeof navigator !== "undefined" &&
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({
        text: shareText,
        files: [file],
      });
      return { kind: "shared" };
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({
        text: shareText,
        url: imageUrl,
      });
      return { kind: "shared" };
    }

    try {
      await navigator.clipboard.writeText(shareText);
      return { kind: "clipboard_success", message: "Link copied to clipboard!" };
    } catch {
      return {
        kind: "error",
        message: "Share not available. Try downloading the image instead.",
      };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { kind: "aborted" };
    }
    console.error("Error sharing:", error);
    try {
      await navigator.clipboard.writeText(shareText);
      return { kind: "clipboard_success", message: "Link copied to clipboard!" };
    } catch {
      return {
        kind: "error",
        message: "Share failed. Try downloading the image instead.",
      };
    }
  }
}
