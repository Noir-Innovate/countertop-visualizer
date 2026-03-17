import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import {
  CATEGORY_PROMPTS,
  getBacksplashPrompt,
  getCabinetPromptWithColor,
  getColorOnlyPrompt,
} from "../prompts";

type BacksplashHeightId = "none" | "4in" | "mid" | "full" | "full_wall";

interface RequestBody {
  kitchenImage: string;
  materialImage?: string | null;
  materialCategory: string;
  sessionId: string;
  materialLineId?: string;
  materialId?: string;
  kitchenImagePath?: string;
  generationOrder?: number;
  colorName?: string | null;
  colorHex?: string | null;
  colorOnly?: boolean;
  backsplashHeightId?: BacksplashHeightId | null;
  backsplashMatchCountertop?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const {
      kitchenImage,
      materialImage,
      materialCategory,
      sessionId,
      materialLineId,
      materialId,
      kitchenImagePath,
      generationOrder,
      colorName,
      colorHex,
      colorOnly,
      backsplashHeightId,
      backsplashMatchCountertop,
    } = body;

    const isColorOnly = colorOnly === true && !!colorName;
    const isBacksplash =
      materialCategory === "Backsplash" && !!backsplashHeightId;
    const isNoMaterialNeeded =
      isColorOnly ||
      (isBacksplash &&
        (backsplashMatchCountertop || backsplashHeightId === "none"));

    if (!kitchenImage) {
      return NextResponse.json(
        { error: "Kitchen image is required" },
        { status: 400 },
      );
    }

    if (!isNoMaterialNeeded && !materialImage) {
      return NextResponse.json(
        { error: "Material image is required" },
        { status: 400 },
      );
    }

    if (!materialCategory) {
      return NextResponse.json(
        { error: "Material category is required" },
        { status: 400 },
      );
    }

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 },
      );
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "API key not configured" },
        { status: 500 },
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const base64KitchenImage = kitchenImage.includes(",")
      ? kitchenImage.split(",")[1]
      : kitchenImage;

    const kitchenMimeType = kitchenImage.includes(",")
      ? kitchenImage.split(",")[0].split(":")[1].split(";")[0]
      : "image/jpeg";

    let promptText: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let contents: any[];

    if (isColorOnly) {
      promptText = getColorOnlyPrompt(colorName!, colorHex);

      contents = [
        {
          inlineData: {
            mimeType: kitchenMimeType,
            data: base64KitchenImage,
          },
        },
        { text: promptText },
      ];
    } else if (isBacksplash) {
      const isMatch = !!backsplashMatchCountertop;
      const hasMat = !!materialImage;

      promptText = getBacksplashPrompt(backsplashHeightId!, isMatch, hasMat);

      if (hasMat) {
        const base64MaterialImage = materialImage!.includes(",")
          ? materialImage!.split(",")[1]
          : materialImage!;
        const materialMimeType = materialImage!.includes(",")
          ? materialImage!.split(",")[0].split(":")[1].split(";")[0]
          : "image/jpeg";

        contents = [
          {
            inlineData: {
              mimeType: materialMimeType,
              data: base64MaterialImage,
            },
          },
          {
            inlineData: { mimeType: kitchenMimeType, data: base64KitchenImage },
          },
          { text: promptText },
        ];
      } else {
        contents = [
          {
            inlineData: { mimeType: kitchenMimeType, data: base64KitchenImage },
          },
          { text: promptText },
        ];
      }
    } else {
      const base64MaterialImage = materialImage!.includes(",")
        ? materialImage!.split(",")[1]
        : materialImage!;
      const materialMimeType = materialImage!.includes(",")
        ? materialImage!.split(",")[0].split(":")[1].split(";")[0]
        : "image/jpeg";

      promptText = CATEGORY_PROMPTS[materialCategory];

      if (colorName && materialCategory === "Cabinets") {
        promptText = getCabinetPromptWithColor(promptText, colorName, colorHex);
      }

      contents = [
        {
          inlineData: {
            mimeType: materialMimeType,
            data: base64MaterialImage,
          },
        },
        {
          inlineData: {
            mimeType: kitchenMimeType,
            data: base64KitchenImage,
          },
        },
        { text: promptText },
      ];
    }

    console.log("promptText:", promptText);

    const response = await ai.models.generateContent({
      // model: "gemini-3-pro-image-preview",
      model: "gemini-3.1-flash-image-preview",
      contents,
      config: {
        responseModalities: ["Image"],
        imageConfig: {
          aspectRatio: "16:9",
        },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    let generatedImageData = "";
    for (const part of parts) {
      if (part.inlineData) {
        generatedImageData = part.inlineData.data || "";
        break;
      }
    }

    if (!generatedImageData) {
      return NextResponse.json(
        { error: "No image generated" },
        { status: 500 },
      );
    }

    // Save to Supabase storage and record in generated_images
    let storagePath = "";
    let generationId = "";
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceRoleKey) {
      try {
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const timestamp = Date.now();
        storagePath = `generated-images/${sessionId}/${timestamp}.png`;

        const imageBuffer = Buffer.from(generatedImageData, "base64");
        await supabase.storage
          .from("public-assets")
          .upload(storagePath, imageBuffer, {
            contentType: "image/png",
            upsert: false,
          });

        // Record in generated_images table
        const { data: insertData } = await supabase
          .from("generated_images")
          .insert({
            session_id: sessionId,
            material_line_id: materialLineId || null,
            material_id: materialId || null,
            material_category: materialCategory,
            kitchen_image_path: kitchenImagePath || "",
            input_image_path: kitchenImagePath || "",
            output_image_path: storagePath,
            generation_order: generationOrder || 1,
          })
          .select("id")
          .single();

        generationId = insertData?.id || "";
      } catch (storageErr) {
        console.error("Failed to save generated image to storage:", storageErr);
      }
    }

    return NextResponse.json({
      imageData: generatedImageData,
      storagePath,
      generationId,
    });
  } catch (error) {
    console.error("V2 Generate error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate image",
      },
      { status: 500 },
    );
  }
}
