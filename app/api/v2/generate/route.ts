import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

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
  backsplashHeight?: string | null;
  backsplashMatchCountertop?: boolean;
}

const CATEGORY_PROMPTS: Record<string, string> = {
  Countertops: `The first image is a slab of rock.
Put the design on the countertops of the second image.
Use the aspect ratio of the second image.
Only edit the countertops, keep the rest of the kitchen the same.
Be sure to edit the edges of the countertops to match the colors of the slab as well (important for wood-trimmed countertops).
If there is a waterfall or a backsplash, make sure to edit them to match the colors of the slab as well.`,

  Cabinets: `The first image is a cabinet design/style reference.
Change the cabinet style in the second image to match the design pattern shown in the first image.
Use the aspect ratio of the second image.
Only edit the cabinets (doors, drawer fronts, and cabinet panels), keep everything else the same.
Make sure all cabinet surfaces consistently match the design.`,

  Backsplash: ``, // Backsplash uses dynamic prompt construction — see buildBacksplashPrompt

  Flooring: `The first image is a flooring material sample.
Change the flooring in the second image to match this material sample.
Use the aspect ratio of the second image.
Only edit the flooring, keep everything else the same.
Apply the flooring pattern and color consistently across the entire visible floor area.`,
};

function buildBacksplashPrompt(
  heightDesc: string,
  isMatchCountertop: boolean,
  hasMaterialImage: boolean,
): string {
  if (heightDesc === "REMOVE_BACKSPLASH") {
    return `Completely remove all backsplash material from this kitchen image.
The wall area directly above the countertop should be a plain, flat, painted wall — NO tile, NO stone, NO decorative material of any kind.
The countertop should meet the wall directly with no backsplash strip, no ledge, and no trim piece.
Replace any existing backsplash (whether 4-inch, mid-height, or full-height) with a clean, smooth, painted wall that matches the surrounding wall color.
Use the aspect ratio of the image.
Do not alter countertops, cabinets, flooring, appliances, or any other element — only remove the backsplash.`;
  }

  if (isMatchCountertop) {
    return `Add ${heightDesc} to this kitchen image.
Use the same material, color, and pattern as the countertop that is already visible in the image.
Use the aspect ratio of the image.
Only add/change the backsplash area. Do not alter countertops, cabinets, flooring, appliances, or any other element.
Make sure the backsplash material seamlessly matches the countertop.`;
  }

  if (hasMaterialImage) {
    return `The first image is a backsplash material sample.
Add ${heightDesc} using this material in the second kitchen image.
Use the aspect ratio of the second image.
Only add/change the backsplash area. Do not alter countertops, cabinets, flooring, appliances, or any other element.
Apply the material pattern and color consistently across the entire backsplash area.`;
  }

  return `Add ${heightDesc} to this kitchen image.
Use the aspect ratio of the image.
Only add/change the backsplash area. Do not alter countertops, cabinets, flooring, appliances, or any other element.`;
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
      backsplashHeight,
      backsplashMatchCountertop,
    } = body;

    const isColorOnly = colorOnly === true && !!colorName;
    const isBacksplash =
      materialCategory === "Backsplash" && !!backsplashHeight;
    const isNoMaterialNeeded =
      isColorOnly ||
      (isBacksplash &&
        (backsplashMatchCountertop || backsplashHeight === "none"));

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
      promptText = `Change the cabinet color in this kitchen image to "${colorName}"${colorHex ? ` (${colorHex})` : ""}.
Keep the exact same cabinet style, design, and hardware. Only change the color and finish of the cabinets.
Do not alter countertops, walls, flooring, appliances, or any other element.
Use the aspect ratio of the image.
Make sure all cabinet surfaces (doors, drawer fronts, panels) consistently show this new color.`;

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
      const heightDesc = backsplashHeight!;
      const isMatch = !!backsplashMatchCountertop;
      const hasMat = !!materialImage;

      promptText = buildBacksplashPrompt(heightDesc, isMatch, hasMat);

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
        promptText += `\nApply the design in "${colorName}" color${colorHex ? ` (${colorHex})` : ""}. The cabinets should clearly be this color.`;
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

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
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
