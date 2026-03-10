import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageData, sessionId, filename } = body;

    if (!imageData || !sessionId) {
      return NextResponse.json(
        { error: "imageData and sessionId are required" },
        { status: 400 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const base64Data = imageData.includes(",")
      ? imageData.split(",")[1]
      : imageData;

    const mimeType = imageData.includes(",")
      ? imageData.split(",")[0].split(":")[1].split(";")[0]
      : "image/jpeg";

    const ext = mimeType.includes("png") ? "png" : "jpg";
    const storagePath = `kitchen-uploads/${sessionId}/${filename || `kitchen-${Date.now()}.${ext}`}`;

    const imageBuffer = Buffer.from(base64Data, "base64");
    const { error: uploadError } = await supabase.storage
      .from("public-assets")
      .upload(storagePath, imageBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error("Kitchen upload error:", uploadError);
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 },
      );
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("public-assets").getPublicUrl(storagePath);

    return NextResponse.json({
      storagePath,
      publicUrl,
    });
  } catch (error) {
    console.error("Kitchen upload error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to upload kitchen",
      },
      { status: 500 },
    );
  }
}
