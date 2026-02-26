import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(request: NextRequest) {
  try {
    const { imageBase64 } = await request.json();
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json({ error: "Image is required" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI not configured" }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageBase64,
              },
            },
            {
              text: `This is a photo of a kitchen. Estimate the countertop layout from what you see. Return a JSON object with this exact structure:
{
  "layout": {
    "points": [{"x": number, "y": number}, ...],
    "depth": 24
  }
}
All measurements in inches. x = horizontal along wall, y = depth. Estimate proportions based on typical kitchen dimensions. The polygon should form the countertop perimeter as seen from above.
Return ONLY the JSON object, no other text.`,
            },
          ],
        },
      ],
    });

    const text =
      response.candidates?.[0]?.content?.parts
        ?.find((p) => p.text)
        ?.text?.trim() || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text;
    const parsed = JSON.parse(jsonStr);

    if (!parsed?.layout?.points || !Array.isArray(parsed.layout.points)) {
      return NextResponse.json(
        { error: "AI could not extract layout from image" },
        { status: 500 },
      );
    }

    const layout = {
      points: parsed.layout.points,
      depth: parsed.layout.depth ?? 24,
    };

    return NextResponse.json({ layout });
  } catch (error) {
    console.error("[designer generate-from-image]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to analyze image",
      },
      { status: 500 },
    );
  }
}
