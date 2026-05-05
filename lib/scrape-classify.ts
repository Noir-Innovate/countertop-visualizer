/**
 * Classify scraped images as countertop materials using Gemini.
 *
 * We send a single batched prompt containing all candidate images and ask the
 * model to return a JSON array describing each one. Cabinets are not allowed
 * (the DB rejects cabinet image rows — see migration 056) so we drop them.
 */

import { GoogleGenAI } from "@google/genai";

export type AllowedCategory = "Countertops" | "Backsplash" | "Flooring";

export interface MaterialCandidate {
  src_url: string;
  suggested_title: string;
  suggested_category: AllowedCategory;
  confidence: number;
}

const ALLOWED_CATEGORIES: AllowedCategory[] = [
  "Countertops",
  "Backsplash",
  "Flooring",
];

const MAX_IMAGES = 24;
const MIN_CONFIDENCE = 0.6;

interface ClassifierResultItem {
  index: number;
  is_material: boolean;
  category?: string;
  name?: string;
  confidence?: number;
}

/**
 * Filter candidate URLs (skipping obvious non-material images, e.g. icons,
 * sprite sheets, tracking pixels) before sending to Gemini.
 */
export function shortlistCandidateImages(urls: string[]): string[] {
  const skipPatterns = [
    /\bicon[s]?\b/i,
    /\bsprite\b/i,
    /\bavatar\b/i,
    /\bpixel\b/i,
    /\bbadge\b/i,
    /\.svg(\?|$)/i, // SVGs are usually UI chrome
    /\bcheckmark\b/i,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (seen.has(u)) continue;
    seen.add(u);
    if (skipPatterns.some((p) => p.test(u))) continue;
    out.push(u);
    if (out.length >= MAX_IMAGES) break;
  }
  return out;
}

export async function classifyImagesAsMaterials(
  imageUrls: string[],
): Promise<MaterialCandidate[]> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY is not configured");
  }

  const shortlisted = shortlistCandidateImages(imageUrls);
  if (shortlisted.length === 0) return [];

  const ai = new GoogleGenAI({ apiKey });

  // Fetch each image into memory (cap size to avoid blowing the request body).
  const images = await Promise.all(
    shortlisted.map(async (url, index) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const contentType = res.headers.get("content-type") ?? "image/jpeg";
        if (!contentType.startsWith("image/")) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.byteLength > 4 * 1024 * 1024) return null; // skip >4 MB
        return {
          index,
          url,
          mimeType: contentType,
          base64: buf.toString("base64"),
        };
      } catch {
        return null;
      }
    }),
  );

  const validImages = images.filter(
    (
      x,
    ): x is {
      index: number;
      url: string;
      mimeType: string;
      base64: string;
    } => x !== null,
  );
  if (validImages.length === 0) return [];

  const indexedList = validImages
    .map((img) => `Index ${img.index}: ${img.url}`)
    .join("\n");

  const prompt = `You are classifying images scraped from a stone/countertop fabricator website.

For each image, determine if it depicts a slab of stone or other countertop/backsplash/flooring material that could be used as a "swatch" to visualize on a kitchen.

Allowed categories: ${ALLOWED_CATEGORIES.join(", ")}.
- "Countertops" = polished slab of granite, quartz, marble, soapstone, etc. shown straight-on, suitable as a sample swatch.
- "Backsplash" = tile or stone wall covering pattern.
- "Flooring" = tile or stone floor pattern.
DO NOT classify images as "Cabinets" — cabinets are color-only on this platform.

Skip (return is_material=false) for:
- Logos, headshots, lifestyle/kitchen photos, photos with cabinets/people/full rooms.
- Generic stock photos.
- Images smaller than ~256x256 (assumed thumbnails).

For each image, propose a short human-friendly name like "Calacatta Gold", "Black Pearl Granite", "Carrara White".

Indexed list of image URLs (in order):
${indexedList}

Return a JSON array (and ONLY a JSON array, no prose) where each element has shape:
{
  "index": number,
  "is_material": boolean,
  "category": "Countertops" | "Backsplash" | "Flooring",
  "name": string,
  "confidence": number   // 0..1, your confidence this is a usable material swatch
}
Include one element per provided image, in the same order.`;

  const contents: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [{ text: prompt }];
  for (const img of validImages) {
    contents.push({
      inlineData: { mimeType: img.mimeType, data: img.base64 },
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = extractText(response);
  if (!text) return [];

  let parsed: ClassifierResultItem[];
  try {
    parsed = JSON.parse(text) as ClassifierResultItem[];
  } catch {
    console.warn("Classifier returned non-JSON response");
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const candidates: MaterialCandidate[] = [];
  for (const item of parsed) {
    if (!item.is_material) continue;
    if (typeof item.index !== "number") continue;
    const img = validImages.find((x) => x.index === item.index);
    if (!img) continue;
    if (
      !item.category ||
      !ALLOWED_CATEGORIES.includes(item.category as AllowedCategory)
    )
      continue;
    const confidence =
      typeof item.confidence === "number" ? item.confidence : 0;
    if (confidence < MIN_CONFIDENCE) continue;

    candidates.push({
      src_url: img.url,
      suggested_title: (item.name ?? "").trim() || "Untitled material",
      suggested_category: item.category as AllowedCategory,
      confidence,
    });
  }

  // Stable sort: highest confidence first.
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates;
}

interface GeminiResponseLike {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

function extractText(response: unknown): string {
  const r = response as GeminiResponseLike;
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}
