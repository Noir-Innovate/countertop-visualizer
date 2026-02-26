/**
 * Local takeoff testbed: run the same takeoff logic as the API with a local image
 * and a prompt you can edit. Supports Google (Gemini) and Anthropic (Claude).
 * Outputs go under: {out-dir}/{image-name}/{company}/{model}/{prompt-name}/{temp}/{prompt-name}-{x}.svg
 * so nothing is overwritten and you can compare runs.
 *
 * Run from project root:
 *   npx tsx scripts/takeoff-testbed.ts <image-path> [options]
 *
 * Options:
 *   --out-dir <dir>     Output root (default: ./takeoff-test-output)
 *   --prompt <path>     Prompt file (default: scripts/takeoff-testbed-prompt.md)
 *   --provider <name>   google | claude (default: google)
 *   --model <id>        Model id (defaults: gemini-3-pro-preview | claude-3-5-sonnet-20241022)
 *   --temp <number>     Temperature 0..1 (default: 0.2)
 *   --runs <n>          Number of generations per run, 1..20 (default: 4)
 *
 * Examples:
 *   npx tsx scripts/takeoff-testbed.ts ./Kitchen.jpg
 *   npx tsx scripts/takeoff-testbed.ts ./Kitchen.jpg --provider claude --runs 4
 *   npx tsx scripts/takeoff-testbed.ts ./Kitchen.jpg --prompt scripts/prompts/takeoff-v5.md --temp 0.3
 *
 * Requires GOOGLE_AI_API_KEY for --provider google, ANTHROPIC_API_KEY for --provider claude.
 */

import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_TAKEOFF_PROMPT } from "../lib/get-takeoff-prompt";

type Provider = "google" | "claude";

const DEFAULT_MODEL: Record<Provider, string> = {
  google: "gemini-3-pro-preview",
  claude: "claude-opus-4-6",
};

const COMPANY_NAME: Record<Provider, string> = {
  google: "Google",
  claude: "Anthropic",
};

// ---------- Env ----------
function loadEnvLocal(): void {
  const p = path.resolve(process.cwd(), ".env.local");
  try {
    const content = fs.readFileSync(p, "utf8");
    content.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eq = trimmed.indexOf("=");
        if (eq > 0) {
          const key = trimmed.slice(0, eq).trim();
          let val = trimmed.slice(eq + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          )
            val = val.slice(1, -1);
          process.env[key] = val;
        }
      }
    });
  } catch {
    // .env.local optional
  }
}

// ---------- Copy of API extraction helpers (no dependency on Next) ----------
function extractSvgFromResponse(text: string): string | null {
  const codeBlockMatch = text.match(/```(?:xml|svg)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch?.[1]) {
    const trimmed = codeBlockMatch[1].trim();
    if (trimmed.startsWith("<svg")) return trimmed;
  }
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

// ---------- CLI ----------
function parseArgs(): {
  imagePath: string;
  outDir: string;
  promptPath: string | null;
  provider: Provider;
  model: string;
  temp: number;
  runs: number;
} {
  const args = process.argv.slice(2);
  let imagePath: string | null = null;
  let outDir = path.resolve(process.cwd(), "takeoff-test-output");
  let promptPath: string | null = path.resolve(
    process.cwd(),
    "scripts/takeoff-testbed-prompt.md",
  );
  let provider: Provider = "google";
  let model = DEFAULT_MODEL.google;
  let temp = 0.2;
  let runs = 4;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out-dir") {
      outDir = path.resolve(process.cwd(), args[++i] ?? "");
      continue;
    }
    if (args[i] === "--prompt") {
      promptPath = path.resolve(process.cwd(), args[++i] ?? "");
      continue;
    }
    if (args[i] === "--provider") {
      const v = (args[++i] ?? "").toLowerCase();
      if (v === "claude" || v === "google") provider = v;
      continue;
    }
    if (args[i] === "--model") {
      model = args[++i] ?? model;
      continue;
    }
    if (args[i] === "--temp") {
      const t = Number(args[++i]);
      if (!Number.isNaN(t) && t >= 0 && t <= 1) temp = t;
      continue;
    }
    if (args[i] === "--runs") {
      const r = Number(args[++i]);
      if (!Number.isNaN(r) && r >= 1 && r <= 20) runs = Math.floor(r);
      continue;
    }
    if (!args[i].startsWith("-")) {
      imagePath = path.resolve(process.cwd(), args[i]);
    }
  }

  if (provider === "claude" && model === DEFAULT_MODEL.google) {
    model = DEFAULT_MODEL.claude;
  } else if (provider === "google" && model === DEFAULT_MODEL.claude) {
    model = DEFAULT_MODEL.google;
  }

  if (!imagePath) {
    console.error(
      "Usage: npx tsx scripts/takeoff-testbed.ts <image-path> [--out-dir <dir>] [--prompt <path>] [--provider google|claude] [--model <id>] [--temp <0-1>] [--runs <n>]",
    );
    process.exit(1);
  }

  return { imagePath, outDir, promptPath, provider, model, temp, runs };
}

function readPrompt(promptPath: string | null): string {
  if (promptPath && fs.existsSync(promptPath)) {
    return fs.readFileSync(promptPath, "utf8").trim();
  }
  if (promptPath) {
    console.warn(
      `Prompt file not found: ${promptPath}, using built-in default.`,
    );
  }
  return DEFAULT_TAKEOFF_PROMPT;
}

/** Sanitize for folder name: no slashes, no leading dots. */
function sanitizeFolderName(s: string): string {
  return s.replace(/[/\\]/g, "-").replace(/^\.+/, "");
}

/** List existing run indices for a prompt in a dir (e.g. takeoff-v5-1.svg -> 1). */
function getNextRunIndices(
  dir: string,
  promptName: string,
  count: number,
): number[] {
  if (!fs.existsSync(dir))
    return Array.from({ length: count }, (_, i) => i + 1);
  const re = new RegExp(`^${escapeRe(promptName)}-(\\d+)\\.svg$`);
  let max = 0;
  for (const name of fs.readdirSync(dir)) {
    const m = name.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return Array.from({ length: count }, (_, i) => max + i + 1);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Anthropic allows max 5 MB base64 payload. Resize/compress image to stay under that. */
const CLAUDE_MAX_BASE64_BYTES = 5 * 1024 * 1024;
const CLAUDE_MAX_DECODED_BYTES =
  Math.floor((CLAUDE_MAX_BASE64_BYTES * 3) / 4) - 1024;

async function prepareImageForClaude(
  imageBuf: Buffer,
  mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const base64Len = imageBuf.length * (4 / 3);
  if (base64Len <= CLAUDE_MAX_BASE64_BYTES) {
    return { buffer: imageBuf, mimeType };
  }
  let buf = imageBuf;
  let quality = 90;
  let maxDim = 1920;
  for (;;) {
    buf = await sharp(imageBuf)
      .resize(maxDim, maxDim, { fit: "inside" })
      .jpeg({ quality })
      .toBuffer();
    if (buf.length <= CLAUDE_MAX_DECODED_BYTES) break;
    quality = Math.max(20, quality - 15);
    maxDim = Math.max(400, maxDim - 320);
    if (maxDim <= 400 && quality <= 20) break;
  }
  return { buffer: buf, mimeType: "image/jpeg" };
}

// ---------- Providers ----------
async function runGoogle(
  prompt: string,
  base64Data: string,
  mimeType: string,
  model: string,
  temp: number,
): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_AI_API_KEY");
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: prompt },
        ],
      },
    ],
    config: { temperature: temp },
  });
  const rawText =
    response.candidates?.[0]?.content?.parts
      ?.find((p) => p.text)
      ?.text?.trim() ?? "";
  return rawText;
}

async function runClaude(
  prompt: string,
  base64Data: string,
  mimeType: string,
  model: string,
  temp: number,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  const client = new Anthropic({ apiKey });
  const mediaType =
    mimeType === "image/png"
      ? "image/png"
      : mimeType === "image/webp"
        ? "image/webp"
        : mimeType === "image/gif"
          ? "image/gif"
          : "image/jpeg";
  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    temperature: temp,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64Data,
            },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  });
  const block = response.content.find((b) => b.type === "text");
  const rawText = block && "text" in block ? block.text.trim() : "";
  return rawText;
}

async function main(): Promise<void> {
  loadEnvLocal();

  const { imagePath, outDir, promptPath, provider, model, temp, runs } =
    parseArgs();

  if (!fs.existsSync(imagePath)) {
    console.error("Image not found:", imagePath);
    process.exit(1);
  }

  if (provider === "google" && !process.env.GOOGLE_AI_API_KEY) {
    console.error(
      "Missing GOOGLE_AI_API_KEY. Set it in .env.local or the environment.",
    );
    process.exit(1);
  }
  if (provider === "claude" && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Missing ANTHROPIC_API_KEY. Set it in .env.local or the environment.",
    );
    process.exit(1);
  }

  const prompt = readPrompt(promptPath);
  const imageStem = path.basename(imagePath, path.extname(imagePath));
  const promptName =
    promptPath && fs.existsSync(promptPath)
      ? path.basename(promptPath, path.extname(promptPath))
      : "default";

  const company = COMPANY_NAME[provider];
  const modelFolder = sanitizeFolderName(model);
  const tempFolder = String(temp);
  const runDir = path.join(
    outDir,
    imageStem,
    company,
    modelFolder,
    promptName,
    tempFolder,
  );
  const indices = getNextRunIndices(runDir, promptName, runs);

  console.log(
    "Prompt:",
    promptPath && fs.existsSync(promptPath) ? promptPath : "(built-in default)",
  );
  console.log("Provider:", provider);
  console.log("Model:", model);
  console.log("Temperature:", temp);
  console.log("Runs:", runs);
  console.log("Output dir:", runDir);
  console.log("Indices:", indices.join(", "));

  const imageBuf = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  let mimeType =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : "image/jpeg";

  let base64Data: string;
  if (provider === "claude") {
    const prepared = await prepareImageForClaude(imageBuf, mimeType);
    base64Data = prepared.buffer.toString("base64");
    mimeType = prepared.mimeType;
    if (prepared.buffer.length < imageBuf.length) {
      console.log(
        "Image resized for Claude (under 5 MB):",
        `${(imageBuf.length / 1024 / 1024).toFixed(2)} MB → ${(prepared.buffer.length / 1024 / 1024).toFixed(2)} MB`,
      );
    }
  } else {
    base64Data = imageBuf.toString("base64");
  }

  fs.mkdirSync(runDir, { recursive: true });

  const runOne = async (i: number): Promise<void> => {
    const x = indices[i];
    const prefix = `${promptName}-${x}`;
    try {
      const rawText =
        provider === "google"
          ? await runGoogle(prompt, base64Data, mimeType, model, temp)
          : await runClaude(prompt, base64Data, mimeType, model, temp);

      if (!rawText) {
        console.error(`  [${prefix}] No response from model.`);
        return;
      }

      const svg = extractSvgFromResponse(rawText);
      const fabricationNotes = extractFabricationNotes(rawText);

      if (svg) {
        fs.writeFileSync(path.join(runDir, `${prefix}.svg`), svg, "utf8");
        console.log("  Wrote", `${prefix}.svg`);
      } else {
        console.error(`  [${prefix}] No valid SVG in response.`);
      }
      fs.writeFileSync(path.join(runDir, `${prefix}-raw.txt`), rawText, "utf8");
      if (fabricationNotes) {
        fs.writeFileSync(
          path.join(runDir, `${prefix}-notes.txt`),
          fabricationNotes,
          "utf8",
        );
      }
    } catch (err) {
      console.error(
        `  [${promptName}-${x}] Error:`,
        err instanceof Error ? err.message : err,
      );
    }
  };

  console.log(`\nRunning ${runs} generations in parallel...`);
  await Promise.all(Array.from({ length: runs }, (_, i) => runOne(i)));
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
