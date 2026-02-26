import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { getTakeoffPrompt } from "@/lib/get-takeoff-prompt";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "POST with { image: base64DataURL } to generate takeoff",
  });
}

function extractSvgFromResponse(text: string): string | null {
  // Try markdown code block first (```xml or ```svg)
  const codeBlockMatch = text.match(/```(?:xml|svg)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch?.[1]) {
    const trimmed = codeBlockMatch[1].trim();
    if (trimmed.startsWith("<svg")) return trimmed;
  }
  // Fallback: first <svg>...</svg> in text
  const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
  return svgMatch ? svgMatch[0] : null;
}

function extractFabricationNotes(text: string): string | undefined {
  const markers = [
    /(\*\*Step 4: Fabrication Notes\*\*[\s\S]*)/i,
    /(\*\*Fabrication Notes\*\*[\s\S]*)/i,
    /(Fabrication Notes:?\s*[\s\S]*)/i,
  ];
  for (const re of markers) {
    const match = text.match(re);
    if (match?.[1]) {
      return match[1]
        .replace(/^\*\*[^*]+\*\*\s*/, "")
        .trim()
        .slice(0, 2000);
    }
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const image = body?.image as string | undefined;
    if (!image || typeof image !== "string") {
      return NextResponse.json(
        { error: "Image is required (base64 data URL or raw base64)" },
        { status: 400 },
      );
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI not configured" }, { status: 500 });
    }

    const promptResult = await getTakeoffPrompt();
    const prompt = promptResult.content;

    const base64Data = image.includes(",") ? image.split(",")[1] : image;
    const mimeType = image.includes(",")
      ? image.split(",")[0].replace(/^data:([^;]+).*$/, "$1") || "image/jpeg"
      : "image/jpeg";

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      // model: "gemini-3.1-pro-preview",
      model: "gemini-3-pro-preview",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: mimeType.startsWith("image/")
                  ? mimeType
                  : "image/jpeg",
                data: base64Data,
              },
            },
            { text: prompt },
          ],
        },
      ],
    });

    const rawText =
      response.candidates?.[0]?.content?.parts
        ?.find((p) => p.text)
        ?.text?.trim() ?? "";

    if (!rawText) {
      return NextResponse.json(
        { error: "AI did not return a response" },
        { status: 500 },
      );
    }

    const svg = extractSvgFromResponse(rawText);
    if (!svg) {
      return NextResponse.json(
        { error: "AI response did not contain valid SVG" },
        { status: 500 },
      );
    }

    const fabricationNotes = extractFabricationNotes(rawText);

    if (promptResult.versionId) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (url && serviceRoleKey) {
        const supabase = createClient(url, serviceRoleKey);
        await supabase.from("takeoff_generations").insert({
          app_prompt_version_id: promptResult.versionId,
        });
      }
    }

    return NextResponse.json({ svg, fabricationNotes });
  } catch (error) {
    console.error("[takeoff]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate takeoff",
      },
      { status: 500 },
    );
  }
}
