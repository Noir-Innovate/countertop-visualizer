/**
 * Image utility functions for validation and processing
 */

export interface AspectRatioValidationResult {
  isValid: boolean;
  ratio: number;
  ratioString: string;
  warning?: string;
}

/**
 * Validates if an image file has approximately a 16:9 aspect ratio
 * @param file - The image file to validate
 * @param tolerance - Tolerance percentage for aspect ratio validation (default 5%)
 * @returns Promise with validation result including warnings
 */
export async function validateImageAspectRatio(
  file: File,
  tolerance: number = 5,
): Promise<AspectRatioValidationResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        const width = img.width;
        const height = img.height;
        const ratio = width / height;
        const targetRatio = 16 / 9; // 1.777...

        // Calculate percentage difference from target
        const difference = Math.abs(ratio - targetRatio);
        const percentageDiff = (difference / targetRatio) * 100;

        const isValid = percentageDiff <= tolerance;
        const ratioString = `${width}:${height}`;

        let warning: string | undefined;
        if (!isValid) {
          warning = `Image aspect ratio is ${ratio.toFixed(2)} (${ratioString}). For best results, use images with a 16:9 aspect ratio (e.g., 1920x1080, 1280x720).`;
        }

        resolve({
          isValid,
          ratio,
          ratioString,
          warning,
        });
      };

      img.onerror = () => {
        reject(new Error("Failed to load image for validation"));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error("Failed to read image file"));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Validates file type for kitchen images
 * @param file - The file to validate
 * @returns Object with validation result and error message if invalid
 */
export function validateImageFileType(file: File): {
  isValid: boolean;
  error?: string;
} {
  const validTypes = ["image/jpeg", "image/jpg", "image/png"];
  const isValid = validTypes.includes(file.type.toLowerCase());

  if (!isValid) {
    return {
      isValid: false,
      error: `Invalid file type: ${file.type}. Only PNG and JPG images are allowed.`,
    };
  }

  return { isValid: true };
}

/**
 * Validates file size
 * @param file - The file to validate
 * @param maxSizeMB - Maximum file size in megabytes (default 25MB)
 * @returns Object with validation result and error message if invalid
 */
export function validateImageFileSize(
  file: File,
  maxSizeMB: number = 25,
): {
  isValid: boolean;
  error?: string;
} {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  const isValid = file.size <= maxSizeBytes;

  if (!isValid) {
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    return {
      isValid: false,
      error: `File size (${fileSizeMB}MB) exceeds the maximum allowed size of ${maxSizeMB}MB.`,
    };
  }

  return { isValid: true };
}

/**
 * Comprehensive kitchen image validation
 * @param file - The file to validate
 * @returns Promise with validation result including all checks
 */
export async function validateKitchenImage(file: File): Promise<{
  isValid: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate file type
  const typeValidation = validateImageFileType(file);
  if (!typeValidation.isValid && typeValidation.error) {
    errors.push(typeValidation.error);
  }

  // Validate file size
  const sizeValidation = validateImageFileSize(file);
  if (!sizeValidation.isValid && sizeValidation.error) {
    errors.push(sizeValidation.error);
  }

  // If basic validations fail, don't proceed to aspect ratio check
  if (errors.length > 0) {
    return { isValid: false, errors, warnings };
  }

  // Validate aspect ratio (warning only)
  try {
    const aspectRatioValidation = await validateImageAspectRatio(file);
    if (!aspectRatioValidation.isValid && aspectRatioValidation.warning) {
      warnings.push(aspectRatioValidation.warning);
    }
  } catch (error) {
    // Aspect ratio validation is non-critical, just log the error
    console.warn("Failed to validate aspect ratio:", error);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
