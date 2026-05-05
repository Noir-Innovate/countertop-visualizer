import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { buildEditPrompt } from "../edit-prompts";
import type { BacksplashHeightId } from "../prompts";

interface RequestBody {
  annotatedImage: string;
  hasDrawing: boolean;
  userPrompt: string;
  mode: "freeform" | "material";
  materialImage?: string | null;
  materialCategory?: string | null;
  colorName?: string | null;
  colorHex?: string | null;
  colorOnly?: boolean;
  backsplashHeightId?: BacksplashHeightId | null;
  backsplashMatchCountertop?: boolean;
  sessionId: string;
  materialLineId?: string;
  materialId?: string;
  kitchenImagePath?: string;
  generationOrder?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const {
      annotatedImage,
      hasDrawing,
      userPrompt,
      mode,
      materialImage,
      materialCategory,
      colorName,
      colorHex,
      colorOnly,
      backsplashHeightId,
      backsplashMatchCountertop,
      sessionId,
      materialLineId,
      materialId,
      kitchenImagePath,
      generationOrder,
    } = body;

    if (!annotatedImage) {
      return NextResponse.json(
        { error: "Annotated image is required" },
        { status: 400 },
      );
    }

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 },
      );
    }

    if (mode !== "freeform" && mode !== "material") {
      return NextResponse.json(
        { error: "mode must be 'freeform' or 'material'" },
        { status: 400 },
      );
    }

    const trimmedPrompt = (userPrompt || "").trim();
    if (mode === "freeform" && !hasDrawing && !trimmedPrompt) {
      return NextResponse.json(
        { error: "Freeform edits require either a drawing or a description" },
        { status: 400 },
      );
    }
    if (mode === "material" && !hasDrawing && !trimmedPrompt) {
      return NextResponse.json(
        {
          error:
            "Material edits require either a drawing or a description to refine the existing material",
        },
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

    const splitDataUrl = (dataUrl: string) => {
      if (dataUrl.includes(",")) {
        const [header, data] = dataUrl.split(",");
        const mimeType = header.split(":")[1].split(";")[0];
        return { mimeType, data };
      }
      return { mimeType: "image/png", data: dataUrl };
    };

    const annotated = splitDataUrl(annotatedImage);

    const promptText = buildEditPrompt({
      mode,
      hasDrawing: !!hasDrawing,
      userPrompt: trimmedPrompt,
      materialCategory: materialCategory || null,
      colorName: colorName || null,
      colorHex: colorHex || null,
      colorOnly: !!colorOnly,
      backsplashHeightId: backsplashHeightId || null,
      backsplashMatchCountertop: !!backsplashMatchCountertop,
      hasMaterialImage: !!materialImage,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contents: any[] = [];

    if (mode === "material" && materialImage) {
      const mat = splitDataUrl(materialImage);
      contents.push({
        inlineData: { mimeType: mat.mimeType, data: mat.data },
      });
    }

    contents.push({
      inlineData: { mimeType: annotated.mimeType, data: annotated.data },
    });
    contents.push({ text: promptText });

    console.log("edit promptText:", promptText);

    const response = await ai.models.generateContent({
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

        const recordedCategory =
          mode === "material" && materialCategory ? materialCategory : "Edit";

        const { data: insertData } = await supabase
          .from("generated_images")
          .insert({
            session_id: sessionId,
            material_line_id: materialLineId || null,
            material_id: materialId || null,
            material_category: recordedCategory,
            kitchen_image_path: kitchenImagePath || "",
            input_image_path: kitchenImagePath || "",
            output_image_path: storagePath,
            generation_order: generationOrder || 1,
          })
          .select("id")
          .single();

        generationId = insertData?.id || "";
      } catch (storageErr) {
        console.error("Failed to save edited image to storage:", storageErr);
      }
    }

    return NextResponse.json({
      imageData: generatedImageData,
      storagePath,
      generationId,
    });
  } catch (error) {
    console.error("V2 Edit error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to edit image",
      },
      { status: 500 },
    );
  }
}
