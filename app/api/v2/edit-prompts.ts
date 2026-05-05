/**
 * Server-only prompt builder for /api/v2/edit.
 * Composes prompts for "draw + describe" edits, in either freeform or
 * material-augment mode.
 */

import {
  CATEGORY_PROMPTS,
  getBacksplashPrompt,
  getCabinetPromptWithColor,
  getColorOnlyPrompt,
  type BacksplashHeightId,
} from "./prompts";

const MARK_GUIDE_INSTRUCTION = `The user has marked the region they want changed with bright red brush strokes on the image. Apply the change ONLY to the marked region. Treat the red strokes as a guide only — do NOT include the red marks in the output image. Keep everything outside the marked region pixel-identical to the input.`;

export interface BuildEditPromptArgs {
  mode: "freeform" | "material";
  hasDrawing: boolean;
  userPrompt: string;
  materialCategory?: string | null;
  colorName?: string | null;
  colorHex?: string | null;
  colorOnly?: boolean;
  backsplashHeightId?: BacksplashHeightId | null;
  backsplashMatchCountertop?: boolean;
  hasMaterialImage?: boolean;
}

export function buildEditPrompt(args: BuildEditPromptArgs): string {
  const { mode, hasDrawing, userPrompt } = args;
  const trimmed = userPrompt.trim();

  if (mode === "freeform") {
    if (hasDrawing) {
      return `The user marked a region of this kitchen image with bright red brush strokes. Apply this edit to the marked region: "${trimmed}". Treat the red strokes as a guide only — do NOT include them in the output image. Keep everything outside the marked region pixel-identical to the input.`;
    }
    return `Edit this kitchen image based on the following instruction: "${trimmed}". Preserve the overall composition, lighting, and camera angle. Keep aspects of the image not mentioned in the instruction unchanged.`;
  }

  let basePrompt = "";
  const category = args.materialCategory || "";

  if (args.colorOnly && args.colorName) {
    basePrompt = getColorOnlyPrompt(args.colorName, args.colorHex);
  } else if (category === "Backsplash" && args.backsplashHeightId) {
    basePrompt = getBacksplashPrompt(
      args.backsplashHeightId,
      !!args.backsplashMatchCountertop,
      !!args.hasMaterialImage,
    );
  } else if (category in CATEGORY_PROMPTS) {
    basePrompt = CATEGORY_PROMPTS[category];
    if (category === "Cabinets" && args.colorName) {
      basePrompt = getCabinetPromptWithColor(
        basePrompt,
        args.colorName,
        args.colorHex,
      );
    }
  }

  const sections: string[] = [];
  if (basePrompt) sections.push(basePrompt);
  if (hasDrawing) sections.push(MARK_GUIDE_INSTRUCTION);
  if (trimmed) sections.push(`Additional user instruction: "${trimmed}".`);
  return sections.join("\n\n");
}
