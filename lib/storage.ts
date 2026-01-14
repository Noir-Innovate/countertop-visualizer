import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Get service role client for storage operations
function getStorageClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase storage not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Upload a lead image to the leads bucket
 * @param orgSlug Organization slug
 * @param materialLineSlug Material line slug
 * @param imageData Base64 image data or Buffer
 * @param mimeType MIME type (e.g., 'image/jpeg', 'image/png')
 * @returns Storage path and public URL
 */
export async function uploadLeadImage(
  orgSlug: string,
  materialLineSlug: string,
  imageData: string | Buffer,
  mimeType: string = "image/jpeg"
): Promise<{ path: string; url: string; error?: string }> {
  try {
    const client = getStorageClient();

    // Generate unique filename
    const extension = mimeType.split("/")[1] || "jpg";
    const filename = `${randomUUID()}.${extension}`;
    const storagePath = `${orgSlug}/${materialLineSlug}/${filename}`;

    // Convert base64 to buffer if needed
    let buffer: Buffer;
    if (typeof imageData === "string") {
      // Remove data URL prefix if present
      const base64Data = imageData.includes(",")
        ? imageData.split(",")[1]
        : imageData;
      buffer = Buffer.from(base64Data, "base64");
    } else {
      buffer = imageData;
    }

    // Upload to storage
    const { data, error } = await client.storage
      .from("leads")
      .upload(storagePath, buffer, {
        contentType: mimeType,
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("Error uploading lead image:", error);
      return {
        path: "",
        url: "",
        error: error.message || "Failed to upload image",
      };
    }

    // Generate signed URL (expires in 1 year for notifications)
    const { data: urlData } = await client.storage
      .from("leads")
      .createSignedUrl(storagePath, 31536000); // 1 year expiration

    return {
      path: storagePath,
      url: urlData?.signedUrl || "",
    };
  } catch (error) {
    console.error("Unexpected error uploading lead image:", error);
    return {
      path: "",
      url: "",
      error: error instanceof Error ? error.message : "Failed to upload image",
    };
  }
}

/**
 * Get a signed URL for a lead image
 * @param imagePath Storage path (e.g., "org-slug/material-line-slug/uuid.jpg")
 * @param expiresIn Expiration time in seconds (default: 3600 = 1 hour)
 * @returns Signed URL
 */
export async function getLeadImageUrl(
  imagePath: string,
  expiresIn: number = 3600
): Promise<{ url: string; error?: string }> {
  try {
    const client = getStorageClient();

    const { data, error } = await client.storage
      .from("leads")
      .createSignedUrl(imagePath, expiresIn);

    if (error) {
      console.error("Error creating signed URL:", error);
      return {
        url: "",
        error: error.message || "Failed to create signed URL",
      };
    }

    return {
      url: data?.signedUrl || "",
    };
  } catch (error) {
    console.error("Unexpected error creating signed URL:", error);
    return {
      url: "",
      error:
        error instanceof Error ? error.message : "Failed to create signed URL",
    };
  }
}

/**
 * Delete a lead image from storage
 * @param imagePath Storage path
 */
export async function deleteLeadImage(
  imagePath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getStorageClient();

    const { error } = await client.storage.from("leads").remove([imagePath]);

    if (error) {
      console.error("Error deleting lead image:", error);
      return {
        success: false,
        error: error.message || "Failed to delete image",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Unexpected error deleting lead image:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete image",
    };
  }
}
