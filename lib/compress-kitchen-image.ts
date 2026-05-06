import imageCompression from "browser-image-compression";

const MAX_UNCOMPRESSED_BYTES = 6 * 1024 * 1024;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const timer = setTimeout(
      () => reject(new Error("FileReader timed out")),
      20_000,
    );
    reader.onloadend = () => {
      clearTimeout(timer);
      resolve(reader.result as string);
    };
    reader.onerror = () => {
      clearTimeout(timer);
      reject(reader.error ?? new Error("FileReader failed"));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Compress a kitchen photo client-side before upload/generation.
 * Same settings on mobile and desktop so output is identical.
 */
export async function compressKitchenImage(
  base64Image: string,
): Promise<string> {
  const response = await fetch(base64Image);
  const blob = await response.blob();

  try {
    const compressedBlob = await imageCompression(blob as File, {
      maxSizeMB: 6,
      maxWidthOrHeight: 2560,
      useWebWorker: true,
      fileType: "image/jpeg",
      initialQuality: 0.9,
    });
    return await blobToDataUrl(compressedBlob);
  } catch (error) {
    console.error("Kitchen compression error:", error);
    if (blob.size > MAX_UNCOMPRESSED_BYTES) {
      throw new Error(
        "This photo is too large for your device. Please retake or pick a smaller one.",
      );
    }
    return base64Image;
  }
}
