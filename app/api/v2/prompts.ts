/**
 * Server-only prompts for the v2 generate API.
 * All prompts are complete, hand-crafted strings.
 */

export const CATEGORY_PROMPTS: Record<string, string> = {
  Countertops: `The first image is a slab of rock.
Put the design on the countertops of the second image.
Use the aspect ratio of the second image.
Only edit the countertops, keep the rest of the kitchen the same.
Be sure to edit the edges of the countertops to match the colors of the slab as well (important for wood-trimmed countertops).
If there is a waterfall or a backsplash, make sure to edit them to match the colors of the slab as well. 
Otherwise, do NOT add a backsplash to the countertop if one doesn't exist.`,

  Cabinets: `The first image is a cabinet design/style reference.
Change the cabinet style in the second image to match the design pattern shown in the first image.
Use the aspect ratio of the second image.
Only edit the cabinets (doors, drawer fronts, and cabinet panels), keep everything else the same.
Make sure all cabinet surfaces consistently match the design.`,

  Backsplash: ``,

  Flooring: `The first image is a flooring material sample.
Change the flooring in the second image to match this material sample.
Use the aspect ratio of the second image.
Only edit the flooring, keep everything else the same.
Apply the flooring pattern and color consistently across the entire visible floor area.`,
};

export type BacksplashHeightId = "none" | "4in" | "mid" | "full" | "full_wall";

interface BacksplashVariants {
  matchCountertop: string;
  withMaterial: string;
  default: string;
}

const BACKSPLASH_PROMPTS: Record<
  BacksplashHeightId,
  string | BacksplashVariants
> = {
  none: `Identify every wall with a backsplash in this image.
Then, remove that backsplash completely from every wall you identified.
Once removed, it should just be a painted wall with nothing on it.
Use the aspect ratio of the image.
Do not alter countertops, cabinets, flooring, appliances, or any other element — only remove the backsplash.
Make no mistakes.`,

  "4in": {
    matchCountertop: `Identify every wall above a countertop in this image.
Then, add a 4-inch standard backsplash — a strip of material sitting between the countertop surface and the wall, 6 inches tall to every wall you identified.
Use the same material, color, and pattern as the countertop that is already visible in the image.
If there is already a backsplash (like a 6-inch, full height, or full wall backsplash), it should be completely removed and replaced with a 4-inch standard backsplash.
Use the aspect ratio of the image.
Do not alter countertops, walls, cabinets, flooring, appliances, or any other element.
Make sure the backsplash material seamlessly matches the countertop.
Make no mistakes.`,
    withMaterial: `The first image is a backsplash material sample.
Add a 4-inch standard backsplash — a thin strip of material sitting between the countertop surface and the wall, about 4 inches tall — using this material in the second kitchen image.
Use the aspect ratio of the second image.
Only add/change the backsplash area. Do not alter countertops, cabinets, flooring, appliances, or any other element.
Apply the material pattern and color consistently across the entire backsplash area.`,
    default: `Add a 4-inch standard backsplash — a thin strip of material sitting between the countertop surface and the wall, about 4 inches tall — to this kitchen image.
Use the aspect ratio of the image.
Only add/change the backsplash area. Do not alter countertops, cabinets, flooring, appliances, or any other element.`,
  },

  mid: {
    matchCountertop: `Identify every wall above a countertop in this image.
Then, add a 6-inch standard backsplash — a strip of material sitting between the countertop surface and the wall, 6 inches tall to every wall you identified.
Use the same material, color, and pattern as the countertop that is already visible in the image.
If there is already a backsplash (like a 6-inch, full height, or full wall backsplash), it should be completely removed and replaced with a 4-inch standard backsplash.
Use the aspect ratio of the image.
Do not alter countertops, walls, cabinets, flooring, appliances, or any other element.
Make sure the backsplash material seamlessly matches the countertop.
Make no mistakes.`,
    withMaterial: `The first image is a backsplash material sample.
Add a mid-height backsplash (roughly 18–24 inches tall) extending from the countertop partway up the wall, ending below the upper cabinets, using this material in the second kitchen image.
Use the aspect ratio of the second image.
Only add/change the backsplash area. Do not alter countertops, cabinets, flooring, appliances, or any other element.
Apply the material pattern and color consistently across the entire backsplash area.`,
    default: `Add a mid-height backsplash (roughly 18–24 inches tall) extending from the countertop partway up the wall, ending below the upper cabinets, to this kitchen image.
Use the aspect ratio of the image.
Only add/change the backsplash area. Do not alter countertops, cabinets, flooring, appliances, or any other element.`,
  },

  full: {
    matchCountertop: `Identify every wall above a countertop in this image.
Add a full-height backsplash extending from the countertop all the way up to the bottom of the upper cabinets to every wall you identified.
Use the same material, color, and pattern as the countertop that is already visible in the image.
Replace any backsplash that already exists with a full-wall backsplash of the material from the image.
Use the aspect ratio of the image.
Only add/change the backsplash area. Do not alter countertops, cabinets, flooring, appliances, or any other element.
Make sure the backsplash material seamlessly matches the countertop.
Make no mistakes.`,
    withMaterial: `The first image is a backsplash material sample.
Add a full-height backsplash extending from the countertop all the way up to the bottom of the upper cabinets using this material in the second kitchen image.
Use the aspect ratio of the second image.
Only add/change the backsplash area. Do not alter countertops, cabinets, flooring, appliances, or any other element.
Apply the material pattern and color consistently across the entire backsplash area.`,
    default: `Add a full-height backsplash extending from the countertop all the way up to the bottom of the upper cabinets to this kitchen image.
Use the aspect ratio of the image.
Only add/change the backsplash area. Do not alter countertops, cabinets, flooring, appliances, or any other element.`,
  },

  full_wall: {
    matchCountertop: `Add a full-wall backsplash extending from the countertop all the way up to the ceiling, covering the entire wall surface above the counter, to this kitchen image.
Use the same material, color, and pattern as the countertop that is already visible in the image.
Replace any backsplash that already exists with a full-wall backsplash.
Use the aspect ratio of the image.
Only add/change the backsplash area. Do not alter countertops, cabinets, flooring, appliances, or any other element.
Make sure the backsplash material seamlessly matches the countertop.`,
    withMaterial: `The first image is a backsplash material sample.
Add a full-wall backsplash extending from the countertop all the way up to the ceiling, covering the entire wall surface above the counter, using this material in the second kitchen image.
Replace any backsplash that already exists with a full-wall backsplash of the material from the image.
Use the aspect ratio of the second image.
Only add/change the backsplash area. Do not alter countertops, cabinets, flooring, appliances, or any other element.
Apply the material pattern and color consistently across the entire backsplash area.`,
    default: `Add a full-wall backsplash extending from the countertop all the way up to the ceiling, covering the entire wall surface above the counter, to this kitchen image.
Use the aspect ratio of the image.
Only add/change the backsplash area. Do not alter countertops, cabinets, flooring, appliances, or any other element.`,
  },
};

export function getBacksplashPrompt(
  heightId: BacksplashHeightId,
  isMatchCountertop: boolean,
  hasMaterialImage: boolean,
): string {
  const entry = BACKSPLASH_PROMPTS[heightId];
  if (typeof entry === "string") {
    return entry;
  }
  if (isMatchCountertop) return entry.matchCountertop;
  if (hasMaterialImage) return entry.withMaterial;
  return entry.default;
}

export function getColorOnlyPrompt(
  colorName: string,
  colorHex?: string | null,
): string {
  const colorSpec = colorHex ? `(${colorHex})` : "";
  return `Change the cabinet color in this kitchen image to "${colorName}" ${colorSpec}.
Keep the exact same cabinet style, design, and hardware. Only change the color and finish of the cabinets.
Do not alter countertops, walls, flooring, appliances, or any other element.
Use the aspect ratio of the image.
Make sure all cabinet surfaces (doors, drawer fronts, panels) consistently show this new color.`;
}

export function getCabinetPromptWithColor(
  basePrompt: string,
  colorName: string,
  colorHex?: string | null,
): string {
  const colorSpec = colorHex ? `(${colorHex})` : "";
  return `${basePrompt}
Apply the design in "${colorName}" color ${colorSpec}. The cabinets should clearly be this color.`;
}
