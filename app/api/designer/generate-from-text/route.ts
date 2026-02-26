import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 },
      );
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
              text: `You are a countertop layout assistant. Given a description of a kitchen layout, return a JSON object with this exact structure:
{
  "layout": {
    "points": [{"x": number, "y": number}, ...],
    "depth": 24
  }
}
All measurements are in inches. x is horizontal (along wall), y is depth. The polygon should be closed (first and last point can be same or the array forms a closed loop). Common layouts:
- L-shape: wall run + perpendicular leg
- Rectangle: 4 points
- U-shape: 3 walls
- Island: freestanding rectangle

User description: "${prompt}"

Return ONLY the JSON object, no other text.`,
            },
          ],
        },
      ],
    });

    const text =
      response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text;
    const parsed = JSON.parse(jsonStr);

    if (!parsed?.layout?.points || !Array.isArray(parsed.layout.points)) {
      return NextResponse.json(
        { error: "AI returned invalid layout format" },
        { status: 500 },
      );
    }

    const layout = {
      points: parsed.layout.points,
      depth: parsed.layout.depth ?? 24,
    };

    return NextResponse.json({ layout });
  } catch (error) {
    console.error("[designer generate-from-text]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate layout",
      },
      { status: 500 },
    );
  }
}
